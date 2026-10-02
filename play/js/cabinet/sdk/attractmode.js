// THE NODE · CABINET ENGINE (JS) · the attract loop every cabinet gets for free (port of Core/AttractMode.cs).
//
//   TITLE   the marquee name in the display font (two-tone, drop shadow), title art, tagline, controls
//           card, INSERT COIN blinking, the copyright line, the credit line
//   DEMO    the game itself, played by the game's own bot at credit 1, INSERT COIN over it, silent
//           (demo cues are dropped); ends when the demo round is over or demoSeconds pass
//   SCORES  the HIGH SCORES table: five rows, big display-font digits, INSERT COIN
//   ...and round again.
//
// Everything is drawn from the game's spec and palette. Blinks run at 1 Hz. The host calls step(dt)
// then draw(surface) whenever the cabinet is idle; dt may be large (a throttled attract), the demo is
// sub-stepped at 60 Hz internally.
import { f32, idiv, d6 } from './num.js';
import { PixelFont } from './pixelfont.js';
import { SurfaceDraw } from './pixelsurface.js';
import { CabinetInput } from './cabinetinput.js';
import { CabinetState } from './cabinetsim.js';
import { CreditInfo, Mercy } from './mercy.js';
import { HighScores, HighScoreTable } from './highscores.js';

export class AttractMode {
    constructor(cartridge, scores, seed = 1) {
        this.titleSeconds = f32(7); this.demoSeconds = f32(25); this.scoresSeconds = f32(7);
        this.freePlay = false;                 // the credit line reads FREE PLAY instead of CREDIT n
        this.credits = 0;                      // shown on the credit line
        this.lastScore = 0;                    // the 1UP score in the header (the last round played here)
        this.coinText = 'INSERT COIN';

        this._cart = cartridge; this._spec = cartridge.spec; this._pal = this._spec.palette;
        this._table = scores || HighScores.for(this._spec.id, this._spec);
        this._input = new CabinetInput();
        this._seed = seed === 0 ? 1 : seed | 0;
        this._demo = null; this._renderer = null; this._bot = null; this._demoRuns = 0;
        this.reset();
    }

    get demo() { return this._demo; }
    get table() { return this._table; }

    reset() {
        this.current = AttractMode.Page.Title; this.pageTime = 0; this.time = 0; this.loops = 0; this._demo = null;
    }

    _go(p) { this.current = p; this.pageTime = 0; }

    step(dt) {
        dt = f32(dt);
        if (dt <= 0) return;
        this.time = f32(this.time + dt); this.pageTime = f32(this.pageTime + dt);
        const P = AttractMode.Page;
        switch (this.current) {
            case P.Title:
                if (this.pageTime >= this.titleSeconds) this._startDemo();
                break;
            case P.Demo: {
                let left = dt;
                const step60 = f32(1 / 60);
                while (left > f32(1e-6) && this._demo != null) {
                    const h = Math.min(left, step60);
                    left = f32(left - h);
                    this._input.latch(this._bot.drive(this._demo, h));
                    this._demo.step(h, this._input);
                    this._demo.cues.clear();   // the demo is silent
                    if (this._demo.state === CabinetState.Over) break;
                }
                if (this._demo == null || this.pageTime >= this.demoSeconds || this._demo.state === CabinetState.Over) this._go(P.Scores);
                break;
            }
            case P.Scores:
                if (this.pageTime >= this.scoresSeconds) { this.loops++; this._go(P.Title); }
                break;
        }
    }

    _startDemo() {
        let s = (Math.imul(this._seed, 7919) + Math.imul(this._demoRuns++, 104729) + 17) | 0;
        if (s === 0) s = 1;
        const credit = CreditInfo.make(1, 0);
        this._demo = this._cart.newSim(); this._demo.isDemo = true;      // a demo never moves a game's saved progress
        if (this._renderer == null) this._renderer = this._cart.newRenderer();
        this._bot = this._cart.newBot();
        this._demo.reset(s, credit, Mercy.resolve(this._spec.knobs, credit));
        this._bot.reset(s ^ 0x5F3759DF);
        this._input.clear();
        this._go(AttractMode.Page.Demo);
    }

    // ------------------------------------------------------------------ drawing
    draw(s) {
        s.noClip();
        switch (this.current) {
            case AttractMode.Page.Title: this._drawTitle(s); break;
            case AttractMode.Page.Demo: this._drawDemo(s); break;
            default: this._drawScores(s); break;
        }
    }

    _drawHeader(s) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, pal = this._pal;
        s.text('1UP', 16, 8, arc, pal.accent);
        s.text(d6(this.lastScore), 16, 18, dsp, pal.text);
        s.textCentered('HI-SCORE', 160, 8, arc, pal.accent);
        s.textCentered(this._table.topBlank ? '------' : d6(this._table.top), 160, 18, dsp, pal.text);   // a blank top: no high score yet
    }

    _drawCredit(s) {
        const c = this.freePlay ? 'FREE PLAY' : 'CREDIT ' + this.credits;
        s.textRight(c, 312, 222, PixelFont.Small, this._pal.text);
    }

    static fitScale(f, text, maxWidth, maxScale) {
        for (let k = maxScale; k > 1; k--) if (f.measure(text, k) <= maxWidth) return k;
        return 1;
    }

    _drawTitleName(s, name, y, maxScale) {
        const dsp = PixelFont.Display, pal = this._pal;
        const k = AttractMode.fitScale(dsp, name, 288, maxScale);
        const x = 160 - idiv(dsp.measure(name, k), 2);
        s.text(name, x + k, y + k, dsp, pal.dim, k);                          // hard shadow
        s.textTwoTone(name, x, y, dsp, pal.highlight, pal.accent, 4, k);      // chrome: light top, accent base
    }

    _drawTitle(s) {
        const arc = PixelFont.Arcade, spec = this._spec, pal = this._pal;
        if (spec.drawTitle) { spec.drawTitle(s, this.time, this); this._drawCredit(s); return; }      // a cartridge with its own title screen
        s.clear(pal.background);
        this._drawHeader(s);
        this._drawTitleName(s, spec.name, 42, 4);
        let y = 42 + 7 * AttractMode.fitScale(PixelFont.Display, spec.name, 288, 4) + 10;
        s.dottedRule(40, 280, y, 3, pal.accent);
        y += 8;
        if (spec.titleArt != null) {
            const k = Math.max(1, spec.titleArtScale);
            s.blit(spec.titleArt, 160 - idiv(spec.titleArt.width * k, 2), y, pal, k);
            y += spec.titleArt.height * k + 8;
        }
        if (spec.tagline) { s.textCentered(spec.tagline, 160, y, arc, pal.highlight); y += 14; }
        for (let i = 0; i < spec.controls.length && y < 168; i++, y += 10)
            s.textCentered(spec.controls[i], 160, y, arc, pal.text);
        if (SurfaceDraw.blink(this.time)) s.textCentered(this.coinText, 160, 180, arc, pal.accent, 2);
        s.textCentered(spec.copyright, 160, 206, arc, pal.text);
        this._drawCredit(s);
    }

    _drawDemo(s) {
        if (this._demo == null) { this._drawTitle(s); return; }
        this._renderer.draw(this._demo, s, this.time);
        s.noClip();
        const arc = PixelFont.Arcade, pal = this._pal;
        if (!SurfaceDraw.blink(this.time)) return;           // the whole plate blinks, as on the real boards
        const w = arc.measure(this.coinText) + 20;
        s.plate(160 - idiv(w, 2), 208, w, 17, pal.background, pal.accent);
        s.textCentered(this.coinText, 160, 213, arc, pal.highlight);
    }

    _drawScores(s) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, pal = this._pal;
        s.clear(pal.background);
        this._drawHeader(s);
        this._drawTitleName(s, 'HIGH SCORES', 40, 2);
        s.dottedRule(40, 280, 60, 3, pal.accent);
        s.text('RANK', 48, 68, arc, pal.dim);
        s.text('SCORE', 108, 68, arc, pal.dim);
        s.text('NAME', 224, 68, arc, pal.dim);
        const rows = this._table.entries;
        for (let i = 0; i < rows.length && i < HighScoreTable.Rows; i++) {
            const y = 84 + i * 22;
            if (rows[i].blank) { this._drawBlankRow(s, i, y); continue; }
            const c = rows[i].player ? pal.accent : (i === 0 ? pal.highlight : pal.text);
            s.text(AttractMode.Ranks[i], 48, y, arc, c, 2);
            s.text(d6(rows[i].score), 108, y, dsp, c, 2);
            s.text(rows[i].initials, 224, y, dsp, c, 2);
        }
        if (SurfaceDraw.blink(this.time)) s.textCentered(this.coinText, 160, 198, arc, pal.accent, 2);
        this._drawCredit(s);
    }
}

// a held-empty row (HighScoreTable.holdTop): its rank, and nothing where the score and the name go
AttractMode.prototype._drawBlankRow = function (s, i, y) {
    s.text(AttractMode.Ranks[i], 48, y, PixelFont.Arcade, this._pal.highlight, 2);
};

AttractMode.Page = Object.freeze({ Title: 0, Demo: 1, Scores: 2 });
AttractMode.PageNames = Object.freeze(['Title', 'Demo', 'Scores']);
AttractMode.Ranks = Object.freeze(['1ST', '2ND', '3RD', '4TH', '5TH']);
