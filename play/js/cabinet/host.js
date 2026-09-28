// THE NODE · CABINET ENGINE (JS) · host.js: the browser-facing runner. The JS equivalent of the Unity
// CabinetHost (UnityAdapter/CabinetHost.cs) plus the round bookkeeping CoinCabinet does, minus Unity
// (no camera slide, no player lock, no quarters: the 3D scene owns those).
//
//   import { CabinetRunner, KeyboardPanel } from './js/cabinet/host.js';
//   import { Cartridges } from './js/cabinet/cartridges.js';
//
//   const run = new CabinetRunner(Cartridges.get('gridcycles'), {
//       ledger,              // mercy ledger { credits, losses, recordCredit, recordLoss } (default: a new SessionLedger)
//       seed: 0,             // 0 = a new game every credit (default); any other int = the same round every credit
//       cabinetId,           // per-machine id for the ledger + high-score table (default: the cartridge id)
//       playerInitials,      // what the high-score table shows for the player (default 'YOU')
//       attractFps: 30,      // attract redraw rate (Unity uses 20); 0 = every step
//       overHoldSeconds: 1,  // how long 'over' holds the final card after the result, before attract resumes
//       freePlay: false,     // the attract credit line reads FREE PLAY (else CREDIT n: set run.attract.credits = n)
//   });
//   each frame:  run.step(dt, inputFrame);  if (run.dirty) texture.needsUpdate = true;  play run.cues
//   run.insertCoin()   starts a round with the ledger's credit (mercy); false if a round is already playing
//   run.abort()        the player walked away (see ABORT below); false if no round was playing
//   run.surface        the PixelSurface (320x240 RGBA, row 0 = TOP): new ImageData(run.surface.data, 320, 240)
//   run.phase          'attract' | 'playing' | 'over'
//   run.cues           the cue names emitted since the previous step(): 'Coin' 'Start' 'Hit' 'Miss' 'Die' 'Win' 'Bonus' 'Tick'
//   run.onRoundOver = (result, summary, info) => {}     result = RoundResult.Won / Lost (None if aborted);
//                      info = { aborted, score, rank (0-4 or -1), credit (CreditInfo), cabinetId }
//   run.sim / run.credit / run.knobs / run.attract / run.table / run.lastSummary   (read-only state)
//   run.botDrives = true   the cartridge's bot plays the round (tests, demos)
//
// inputFrame = { x, y, a, b, start }: x, y in {-1, 0, 1} (+y = stick UP), buttons as booleans. Build it with
// keyboardToInput(setOfKeys) or a KeyboardPanel (below).
//
// THE LEDGER (as CoinCabinet): insertCoin() records the credit first, then reads CreditInfo from the ledger;
// a round that ends Lost records a loss. The 5th credit on a cabinet cannot be lost (the game honours it).
// ABORT (CoinCabinet's exact rule, CoinCabinet.cs Run()): an aborted round is never a win and records NO
// loss (`if (!aborted && result == Lost) RecordLoss`); the credit was already counted at the coin, so
// walking away still moves the cabinet toward the unlosable 5th credit but does not ease the knobs.
// No high-score entry for an aborted round (CabinetHost only inserts at Over).
//
// THREE.JS: const tex = new THREE.DataTexture(run.surface.data, 320, 240, THREE.RGBAFormat);
//   tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
//   row 0 is the TOP, so flip once: tex.flipY = true, or robustly tex.repeat.set(1, -1); tex.offset.set(0, 1);
//   then each frame: if (run.dirty) tex.needsUpdate = true.   No DOM is touched at import time.
import {
    PixelSurface, InputFrame, CabinetInput, SessionLedger, Mercy, HighScores, AttractMode,
    CabinetBench, CabinetState, RoundResult, SoundCueNames,
} from './sdk/index.js';

export class CabinetRunner {
    constructor(cartridge, opts = {}) {
        if (!cartridge) throw new Error('CabinetRunner: no cartridge');
        this.cartridge = cartridge;
        this.spec = cartridge.spec;
        this.ledger = opts.ledger || new SessionLedger();
        this.seed = opts.seed | 0;
        this.cabinetId = opts.cabinetId || cartridge.id;
        this.playerInitials = opts.playerInitials || 'YOU';
        this.attractFps = opts.attractFps !== undefined ? +opts.attractFps : 30;
        this.overHoldSeconds = opts.overHoldSeconds !== undefined ? +opts.overHoldSeconds : 1;
        this.freePlay = !!opts.freePlay;
        this.botDrives = !!opts.botDrives;
        this.onRoundOver = null;

        this.surface = new PixelSurface();
        this.table = HighScores.for(this.cabinetId, this.spec);
        this.attract = new AttractMode(cartridge, this.table, this.seed !== 0 ? this.seed : stableSeed(this.cabinetId));
        this.phase = 'attract';
        this.cues = [];
        this.dirty = false;
        this.sim = null; this.credit = null; this.knobs = null; this.lastSummary = '';

        this._renderer = null; this._bot = null;
        this._input = new CabinetInput();
        this._reported = false;
        this._overTime = 0;
        this._attractAcc = 0;
        this._outbox = [];

        this.attract.freePlay = this.freePlay;
        this.attract.draw(this.surface);                  // never a black tube before the first step
        this.dirty = true;
    }

    // ------------------------------------------------------------------ every frame
    step(dt, inputFrame) {
        this.cues = this._outbox; this._outbox = [];
        this.dirty = false;
        dt = +dt || 0;
        if (dt < 0) dt = 0;
        if (this.phase === 'playing') { this._stepRound(Math.min(dt, 0.1), inputFrame); return; }
        if (this.phase === 'over') {
            this._overTime += dt;
            if (this._overTime < this.overHoldSeconds) return;   // the final card stays up
            this._end();
        }
        this._stepAttract(dt);
    }

    // ------------------------------------------------------------------ coin / abort
    insertCoin() {
        if (this.phase === 'playing') return false;
        const id = this.cabinetId;
        this.ledger.recordCredit(id);                       // CoinCabinet.Play: the credit is counted before Begin
        this.credit = Mercy.fromLedger(this.ledger, id);
        this.knobs = Mercy.resolve(this.spec.knobs, this.credit);
        const s = this.seed !== 0 ? this.seed : randomSeed();
        this.sim = this.cartridge.newSim();
        this._renderer = this.cartridge.newRenderer();
        this._bot = this.cartridge.newBot();
        this.sim.reset(s, this.credit, this.knobs);
        this._bot.reset(CabinetBench.botSeed(s));
        this._input.clear();
        this._reported = false;
        this._outbox.push('Coin');                          // CabinetHost plays Coin itself when the cabinet has no coin sfx
        this._renderer.draw(this.sim, this.surface, 0);
        this.dirty = true;
        this.phase = 'playing';
        return true;
    }

    abort() {
        if (this.phase === 'over') { this._end(); return false; }   // already reported: just skip the hold
        if (this.phase !== 'playing') return false;
        const sim = this.sim;
        const info = { aborted: true, score: sim.score, rank: -1, credit: this.credit, cabinetId: this.cabinetId };
        const summary = sim.summary;
        this.lastSummary = summary;
        this.attract.lastScore = sim.score;
        this._end();                                        // no loss recorded, no high score (CoinCabinet's rule)
        if (this.onRoundOver) this.onRoundOver(RoundResult.None, summary, info);
        return true;
    }

    // ------------------------------------------------------------------ internals
    _stepRound(dt, inputFrame) {
        const sim = this.sim;
        const f = this.botDrives && this._bot ? this._bot.drive(sim, dt) : InputFrame.from(inputFrame);
        this._input.latch(f);
        sim.step(dt, this._input);
        for (let i = 0; i < sim.cues.count; i++) this.cues.push(SoundCueNames[sim.cues.at(i)]);
        sim.cues.clear();
        this._renderer.draw(sim, this.surface, sim.time);
        this.dirty = true;

        if (!this._reported && sim.state === CabinetState.Over) {
            this._reported = true;
            const r = sim.result;
            if (this.credit.unlosable && r !== RoundResult.Won)
                console.error('[Cabinet] MERCY VIOLATION: ' + this.cartridge.id + ' lost an unlosable credit. ' + sim.summary);
            const rank = this.table.insert(sim.score, this.playerInitials);
            if (r === RoundResult.Lost) this.ledger.recordLoss(this.cabinetId);   // mercy: the next credit is easier
            this.lastSummary = sim.summary;
            this.attract.lastScore = sim.score;
            this.phase = 'over';
            this._overTime = 0;
            if (this.onRoundOver)
                this.onRoundOver(r, sim.summary, { aborted: false, score: sim.score, rank, credit: this.credit, cabinetId: this.cabinetId });
        }
    }

    _stepAttract(dt) {
        this._attractAcc += dt;
        if (this.attractFps > 0 && this._attractAcc < 1 / this.attractFps) return;
        const adv = Math.min(this._attractAcc, 0.25);
        this._attractAcc = 0;
        this.attract.freePlay = this.freePlay;
        this.attract.step(adv);
        this.attract.draw(this.surface);
        this.dirty = true;
    }

    _end() {
        this.sim = null; this._renderer = null; this._bot = null;
        this._input.clear();
        this.attract.reset();
        this._attractAcc = 1;                              // draw the attract straight away
        this.phase = 'attract';
    }
}

// FNV-1a of the cabinet id: each machine's demo differs, and is the same every session (as CabinetHost)
function stableSeed(s) {
    let h = 2166136261;
    s = s || '';
    for (let i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    return ((h & 0x7FFFFFFF) | 1) | 0;
}

function randomSeed() {
    return (((Date.now() ^ Math.floor(Math.random() * 0x7FFFFFFF)) & 0x7FFFFFFF) | 1) | 0;
}

// ------------------------------------------------------------------ keys
// KeyboardEvent.code values (preferred) and .key values are both accepted.
//   stick  arrows or WASD      A  Space, Z or Enter      B  X or Shift      START  Enter
// Backspace / Escape are left alone (the host's abort / menu keys, as in Unity).
export const KEYMAP = Object.freeze({
    up: ['ArrowUp', 'KeyW', 'w', 'W', 'Up'],
    down: ['ArrowDown', 'KeyS', 's', 'S', 'Down'],
    left: ['ArrowLeft', 'KeyA', 'a', 'A', 'Left'],
    right: ['ArrowRight', 'KeyD', 'd', 'D', 'Right'],
    a: ['Space', ' ', 'Spacebar', 'KeyZ', 'z', 'Z', 'Enter', 'NumpadEnter'],
    b: ['KeyX', 'x', 'X', 'ShiftLeft', 'ShiftRight', 'Shift'],
    start: ['Enter', 'NumpadEnter'],
});

const MAPPED = new Set(Object.values(KEYMAP).flat());

export function keyboardToInput(keysDown) {
    const has = list => { for (const k of list) if (keysDown.has(k)) return true; return false; };
    let x = 0, y = 0;
    if (has(KEYMAP.left)) x -= 1;
    if (has(KEYMAP.right)) x += 1;
    if (has(KEYMAP.up)) y += 1;
    if (has(KEYMAP.down)) y -= 1;
    return { x, y, a: has(KEYMAP.a), b: has(KEYMAP.b), start: has(KEYMAP.start) };
}

// Listens for keys on a target (default: window) and hands out one input frame per call. A key that
// goes down and up between two frames still counts for one frame (Unity's GetKey || GetKeyDown).
// Mapped keys have their default action prevented (no page scroll on arrows/space) while enabled.
export class KeyboardPanel {
    constructor(target = globalThis.window) {
        this.down = new Set();
        this.enabled = true;
        this._taps = new Set();
        this._target = target;
        this._onDown = e => {
            if (!this.enabled) return;
            this.down.add(e.code); this._taps.add(e.code);
            if (MAPPED.has(e.code)) e.preventDefault();
        };
        this._onUp = e => { this.down.delete(e.code); };
        this._onBlur = () => { this.down.clear(); };
        if (target && target.addEventListener) {
            target.addEventListener('keydown', this._onDown);
            target.addEventListener('keyup', this._onUp);
            target.addEventListener('blur', this._onBlur);
        }
    }

    frame() {
        const keys = new Set(this.down);
        for (const k of this._taps) keys.add(k);
        this._taps.clear();
        return this.enabled ? keyboardToInput(keys) : { x: 0, y: 0, a: false, b: false, start: false };
    }

    detach() {
        const t = this._target;
        if (t && t.removeEventListener) {
            t.removeEventListener('keydown', this._onDown);
            t.removeEventListener('keyup', this._onUp);
            t.removeEventListener('blur', this._onBlur);
        }
    }
}
