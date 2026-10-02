// THE NODE · the cabinet with no name · THE RUNNER: what a host plugs in. Browser only (it draws on a canvas).
//
// The same API as host.js CabinetRunner, so the 3D scene drives it like any cabinet, plus the showpiece canvas:
//
//   const run = await Cartridges.get('nameless').createRunner({ ledger, cabinetId, width: 640, height: 480 });
//   const tex = new THREE.CanvasTexture(run.canvas); tex.colorSpace = THREE.SRGBColorSpace;   (row 0 is the top:
//       a CanvasTexture needs no flip)
//   each frame:  run.step(dt, { x, y, a, b, start });  if (run.dirty) tex.needsUpdate = true;  play run.cues
//   run.insertCoin()          a credit: records it, then (first coin this session) the short photosensitivity
//                             notice on the tube (A continues, B toggles reduced motion), then the round
//   run.abort()               walked away: never a win, no loss recorded (CoinCabinet's rule)
//   run.onRoundOver = (result, summary, info) => {}     RoundResult.Won / Lost (None if aborted). WON IS REPORTED
//                             ONLY AFTER THE WHOLE ENDING: alignment, stillness, the vesica, THE GATE, A·V·R.
//   run.phase                 'attract' | 'playing' | 'over'   (the notice counts as 'playing'; run.inNotice)
//   run.cues                  'Coin' 'Start' 'Hit' 'Miss' 'Die' 'Win' 'Bonus' 'Tick' since the last step
//   run.stemGains             Float32Array(8): the music's eight stem gains now (stems.js StemPlayer.apply)
//   run.reducedMotion         get/set: the renderer calms down and the rings turn at 0.7 from now on
//   run.canvas / run.resize(w, h) / run.renderer.stats (draw cost, ms)
//   run.credit / run.knobs / run.sim / run.table / run.ledger / run.lastSummary   (read-only)
//   run.botDrives = true      the cartridge's bot plays (tests, demos)
//
// MERCY: credits and losses per cabinet id in the ledger (default: a SessionLedger); THE THIRD CREDIT CANNOT BE
// LOST (Mercy.fromLedger(ledger, id, 3)). resetMercy() clears this cabinet's count (the page's R key).
import { SessionLedger, Mercy, CabinetInput, InputFrame, CabinetState, RoundResult, SoundCueNames, CabinetBench, Pad } from '../../sdk/index.js';
import { NamelessCartridge } from './cartridge.js';
import { NamelessRenderer } from './renderer.js';
import { NamelessScores } from './scores.js';
import { UNLOSABLE_AT } from './round.js';
import { StemMixer } from './stems.js';

function makeCanvas(w, h) {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
}
function randomSeed() { return (((Date.now() ^ Math.floor(Math.random() * 0x7FFFFFFF)) & 0x7FFFFFFF) | 1) | 0; }

// a ledger that can forget one cabinet (SessionLedger keeps its maps private-ish; this wraps any ledger)
function forget(ledger, id) {
    if (ledger._credits && ledger._losses) { ledger._credits.delete(id); ledger._losses.delete(id); return true; }
    if (typeof ledger.reset === 'function') { ledger.reset(id); return true; }
    return false;
}

export class NamelessRunner {
    constructor(opts = {}) {
        this.cartridge = NamelessCartridge;
        this.spec = NamelessCartridge.spec;
        this.ledger = opts.ledger || new SessionLedger();
        this.seed = opts.seed | 0;
        this.cabinetId = opts.cabinetId || 'nameless';
        this.playerInitials = opts.playerInitials || 'YOU';
        this.overHoldSeconds = opts.overHoldSeconds !== undefined ? +opts.overHoldSeconds : 1.5;
        this.maxFps = opts.maxFps !== undefined ? +opts.maxFps : 60;
        this.notice = opts.notice !== false;
        this.botDrives = !!opts.botDrives;
        this.onRoundOver = null;
        this.table = NamelessScores.for(this.cabinetId);
        this.canvas = opts.canvas || makeCanvas(opts.width || 640, opts.height || 480);
        this.renderer = new NamelessRenderer(this.canvas, { reducedMotion: !!opts.reducedMotion, table: this.table, bloom: opts.bloom });
        this.stems = new StemMixer();
        this.phase = 'attract';
        this.inNotice = false;
        this.cues = [];
        this.dirty = false;
        this.sim = null; this.credit = null; this.knobs = null; this.lastSummary = ''; this.lastResult = null;
        this.attractT = 0; this.noticeT = 0;
        this._input = new CabinetInput();
        this._outbox = [];
        this._acc = 0; this._overTime = 0; this._reported = false; this._bot = null;
        this._render(1 / 60);
        this.dirty = true;
    }

    static get noticeSeen() { return NamelessRunner._noticeSeen === true; }
    static set noticeSeen(v) { NamelessRunner._noticeSeen = !!v; }

    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }
    get stemGains() { return this.stems.gains; }
    get reducedMotion() { return this.renderer.reducedMotion; }
    set reducedMotion(v) {
        this.renderer.reducedMotion = !!v;
        if (this.sim) this.sim.setMotion(v ? 0.7 : 1);
    }

    resize(w, h) { this.renderer.resize(w, h); this._render(1 / 60); this.dirty = true; }

    // ------------------------------------------------------------------ every frame
    step(dt, inputFrame) {
        this.cues = this._outbox; this._outbox = [];
        this.dirty = false;
        dt = +dt || 0;
        if (dt < 0) dt = 0;
        if (dt > 0.25) dt = 0.25;
        let draw = true;
        if (this.phase === 'playing') {
            if (this.inNotice) this._stepNotice(dt, inputFrame);
            else this._stepRound(dt, inputFrame);
        } else if (this.phase === 'over') {
            this._overTime += dt;
            draw = false;                                   // the final card stays on the glass
            if (this._overTime >= this.overHoldSeconds) { this._end(); draw = true; }
        } else {
            this.attractT += dt;
        }
        this.stems.update(this, dt);
        this._acc += dt;
        if (draw && (this.maxFps <= 0 || this._acc >= 1 / this.maxFps - 1e-4)) {
            this._render(this._acc);
            this._acc = 0;
            this.dirty = true;
        }
    }

    // ------------------------------------------------------------------ coin / abort / mercy
    insertCoin() {
        if (this.phase === 'playing') return false;
        if (this.phase === 'over') this._end();
        const id = this.cabinetId;
        this.ledger.recordCredit(id);
        this.credit = Mercy.fromLedger(this.ledger, id, UNLOSABLE_AT);       // THE THIRD CREDIT CANNOT BE LOST
        this.knobs = Mercy.resolve(this.spec.knobs, this.credit);
        this._outbox.push('Coin');
        this.phase = 'playing';
        this._input.clear();
        if (this.notice && !NamelessRunner.noticeSeen) { this.inNotice = true; this.noticeT = 0; }
        else this._beginRound();
        return true;
    }

    abort() {
        if (this.phase === 'over') { this._end(); return false; }
        if (this.phase !== 'playing') return false;
        const sim = this.sim;
        const info = { aborted: true, score: sim ? sim.score : 0, rank: -1, credit: this.credit, cabinetId: this.cabinetId };
        const summary = sim ? sim.summary : 'aborted at the notice';
        this.lastSummary = summary;
        this._end();
        if (this.onRoundOver) this.onRoundOver(RoundResult.None, summary, info);
        return true;
    }

    resetMercy() { return forget(this.ledger, this.cabinetId); }

    get credits() { return this.ledger.credits(this.cabinetId); }
    get losses() { return this.ledger.losses(this.cabinetId); }
    // the credit the NEXT coin will be
    get nextCredit() { return Mercy.fromLedger({ credits: () => this.credits + 1, losses: () => this.losses }, this.cabinetId, UNLOSABLE_AT); }

    // ------------------------------------------------------------------ internals
    _beginRound() {
        this.inNotice = false;
        const s = this.seed !== 0 ? this.seed : randomSeed();
        this.sim = this.cartridge.newSim();
        this.sim.reset(s, this.credit, this.knobs);
        this.sim.setMotion(this.renderer.reducedMotion ? 0.7 : 1);
        this.sim.motion = this.sim._motionTarget;
        this._bot = this.cartridge.newBot();
        this._bot.reset(CabinetBench.botSeed(s));
        this._input.clear();
        this._reported = false;
    }

    _stepNotice(dt, inputFrame) {
        this.noticeT += dt;
        this._input.latch(this.botDrives ? { a: this.noticeT > 0.6 } : inputFrame);
        if (this._input.pressed(Pad.B)) { this.reducedMotion = !this.reducedMotion; this._outbox.push('Tick'); }
        if (this._input.pressed(Pad.A)) { NamelessRunner.noticeSeen = true; this._beginRound(); }
    }

    _stepRound(dt, inputFrame) {
        const sim = this.sim;
        const f = this.botDrives && this._bot ? this._bot.drive(sim, dt) : InputFrame.from(inputFrame);
        this._input.latch(f);
        sim.step(Math.min(dt, 0.1), this._input);
        for (let i = 0; i < sim.cues.count; i++) this._outbox.push(SoundCueNames[sim.cues.at(i)]);
        sim.cues.clear();
        if (!this._reported && sim.state === CabinetState.Over) this._report();
    }

    _report() {
        const sim = this.sim, r = sim.result;
        this._reported = true;
        if (this.credit.unlosable && r !== RoundResult.Won)
            console.error('[nameless] MERCY VIOLATION: lost the unlosable credit. ' + sim.summary);
        const rank = r === RoundResult.Won ? this.table.fillTop(sim.score) : this.table.insert(sim.score, this.playerInitials);
        if (r === RoundResult.Lost) this.ledger.recordLoss(this.cabinetId);    // mercy: the next credit is easier
        this.lastSummary = sim.summary;
        this.lastResult = r;
        this.phase = 'over';
        this._overTime = 0;
        if (this.onRoundOver)
            this.onRoundOver(r, sim.summary, { aborted: false, score: sim.score, rank, credit: this.credit, cabinetId: this.cabinetId });
    }

    _end() {
        this.sim = null; this._bot = null; this.inNotice = false;
        this._input.clear();
        this.attractT = 0;
        this.phase = 'attract';
    }

    _render(dt) {
        if (this.phase === 'playing' && this.inNotice) this.renderer.render({ mode: 'notice', t: this.noticeT, reduced: this.renderer.reducedMotion }, dt);
        else if (this.sim && this.phase !== 'attract') this.renderer.render({ mode: 'round', sim: this.sim }, dt);
        else this.renderer.render({ mode: 'attract', t: this.attractT }, dt);
    }

    // ------------------------------------------------------------------ test hooks (the page's checks and screenshots)
    // run the round forward `seconds` at 60 Hz without drawing (the bot drives if botDrives), then draw
    fastForward(seconds, until) {
        if (this.phase !== 'playing' || this.inNotice || !this.sim) return false;
        const n = Math.round(seconds * 60);
        for (let i = 0; i < n; i++) {
            this._stepRound(1 / 60, null);
            this.stems.update(this, 1 / 60);
            if (this.phase !== 'playing') break;
            if (until && until(this.sim)) break;
        }
        this._outbox.length = 0;
        return true;
    }
}

NamelessRunner._noticeSeen = false;
