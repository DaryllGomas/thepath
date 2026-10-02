// THE NODE · the cabinet with no name · THE MUSIC: eight recorded stems at 108 BPM, uncovered as resonance rises.
// (Sound is recordings, never synthesis: nothing here makes a sound. See STEMS.md for what to source.)
//
//   StemMixer   pure state, no audio: from the runner's state it sets a target gain per stem and eases every gain
//               toward its target over one bar (2.22 s at 108 BPM), never a hard switch. The runner owns one and
//               exposes `runner.stemGains` (Float32Array(8)) every step.
//   StemPlayer  the Web Audio side (browser only): loads the eight files named in STEM_FILES, starts them all
//               looping at the SAME audio-clock instant (so they stay locked to one transport forever), and each
//               frame applies the mixer's gains. A stem whose file is missing is silence: the placeholders ship
//               empty, so today the cabinet is silent until the recordings exist.
//
// resonance (this level's idx / its symbols, x8)  0 DRONE  1 +PULSE  2 +BASS  3 +KICK  4 +SEQ1  5 +SEQ2  6 +HARMONY
// 7 +HIGH ARP  8 all locked. The core opens: kick and arp fall away, harmony holds. The descent: the sequencers sink
// to half, drone and pulse carry into the next level, which builds again. The ending strips it layer by layer to
// drone + harmony under THE GATE, then silence as A·V·R fills in. Attract: the drone alone, low.
import { Phase } from './round.js';

export const STEM_NAMES = Object.freeze(['drone', 'pulse', 'bass', 'kick', 'seq1', 'seq2', 'harmony', 'arp']);
export const BPM = 108;
export const BAR_SECONDS = 4 * 60 / BPM;                 // 2.222 s
export const LOOP_BARS = 16;                             // each stem is 16 bars: 35.56 s

// where the recordings go (web/thenode/assets/audio/nameless/). Empty until sourced: see STEMS.md
export const STEM_FILES = Object.freeze(STEM_NAMES.map((n, i) => 'assets/audio/nameless/stem_' + (i + 1) + '_' + n + '.wav'));

// what full level means per stem (the mix; the files come in un-normalised, peaks -12..-6 dBFS)
const LEVEL = [0.9, 0.7, 0.75, 0.7, 0.65, 0.6, 0.7, 0.5];

export class StemMixer {
    constructor() {
        this.gains = new Float32Array(8);
        this.targets = new Float32Array(8);
        this.fadeSeconds = BAR_SECONDS;
    }

    // targets from what the cabinet is doing now
    aim(runner) {
        const T = this.targets;
        T.fill(0);
        const sim = runner.sim;
        if (runner.phase === 'attract' || !sim || runner.inNotice) { T[0] = 0.5; return T; }
        const P = Phase, p = sim.p;
        const n = sim.seq.length || 8, steps = Math.floor(8 * sim.idx / n + 1e-9);
        const on = (k, g = 1) => { T[k] = LEVEL[k] * g; };
        on(0);
        if (p === P.Ready || p === P.Play) {
            on(1);                                     // the pulse carries across levels
            for (let k = 2; k < 8; k++) if (steps >= k) on(k);
            if (steps >= 1) on(1);
        } else if (p === P.Open) {
            for (let k = 1; k < 8; k++) on(k);
            T[3] = 0; T[7] = 0;                        // kick and high arp fall away, harmony holds
        } else if (p === P.Descend) {
            on(1); on(4, 0.5); on(5, 0.5); on(6, 0.8);
        } else if (p === P.Dying || (p === P.Card && !sim.won)) {
            T[0] = 0.35;
        } else if (p === P.Align || p === P.Still) {
            for (let k = 1; k < 8; k++) on(k);         // FULL RESONANCE: all eight locked
        } else if (p === P.Vesica) {
            const u = sim.phaseTime / 2.8;             // strip: kick, bass, seq2, seq1, arp, pulse
            if (u < 0.15) on(3); if (u < 0.3) on(2); if (u < 0.45) on(5); if (u < 0.6) on(4); if (u < 0.75) on(7); if (u < 0.9) on(1);
            on(6);
        } else if (p === P.Vanish || p === P.Gate || p === P.Hold) {
            on(6);                                     // drone + one sustained harmony under THE GATE
        } else {
            T[0] = 0;                                  // then silence
        }
        return T;
    }

    update(runner, dt) {
        const T = this.aim(runner), G = this.gains, step = dt / this.fadeSeconds;
        for (let k = 0; k < 8; k++) {
            const d = T[k] - G[k];
            G[k] = Math.abs(d) <= step ? T[k] : G[k] + Math.sign(d) * step;
        }
        return G;
    }
}

// the Web Audio player. new StemPlayer(audioContext, { files, destination }) ; await load() ; start() ; apply(gains)
export class StemPlayer {
    constructor(ctx, opts = {}) {
        this.ctx = ctx;
        this.files = opts.files || STEM_FILES;
        this.out = ctx.createGain();
        this.out.gain.value = opts.volume !== undefined ? opts.volume : 0.8;
        this.out.connect(opts.destination || ctx.destination);
        this.buffers = new Array(8).fill(null);
        this.nodes = new Array(8).fill(null);
        this.started = false;
        this.loaded = 0;
    }

    async load() {
        await Promise.all(this.files.map(async (url, i) => {
            if (!url) return;
            try {
                const r = await fetch(url);
                if (!r.ok) return;                                   // not sourced yet: this stem stays silent
                this.buffers[i] = await this.ctx.decodeAudioData(await r.arrayBuffer());
                this.loaded++;
            } catch (e) { /* missing or undecodable: silent */ }
        }));
        return this.loaded;
    }

    // every stem starts at the same instant and loops forever: the transport is the audio clock itself
    start(at) {
        if (this.started) return;
        this.started = true;
        const t = at !== undefined ? at : this.ctx.currentTime + 0.1;
        for (let i = 0; i < 8; i++) {
            const g = this.ctx.createGain();
            g.gain.value = 0;
            g.connect(this.out);
            let src = null;
            if (this.buffers[i]) {
                src = this.ctx.createBufferSource();
                src.buffer = this.buffers[i];
                src.loop = true;
                src.connect(g);
                src.start(t);
            }
            this.nodes[i] = { src, g };
        }
    }

    apply(gains) {
        if (!this.started) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 8; i++) {
            const n = this.nodes[i];
            if (n) n.g.gain.setTargetAtTime(gains[i], now, 0.05);
        }
    }

    stop() {
        for (const n of this.nodes) if (n && n.src) try { n.src.stop(); } catch (e) { /* already stopped */ }
        this.started = false;
    }
}

// cue sounds: the SDK cue names -> recordings (none shipped yet; the host plays nothing for a null)
export const CUE_FILES = Object.freeze({ Coin: null, Start: null, Hit: null, Miss: null, Die: null, Win: null, Bonus: null, Tick: null });
