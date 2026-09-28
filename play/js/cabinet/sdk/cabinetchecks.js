// THE NODE · CABINET ENGINE (JS) · the checks every cartridge must pass before it goes in a cabinet
// (port of Core/CabinetChecks.cs).
//
//   round-won path   the bot wins a round; result stays None until the Card, is Won from the Card on,
//                    Over is reached exactly once, one Win cue, a score
//   round-lost path  a round is lost the same clean way (bot or RandomPilot)
//   mercy            credit 5 (worst case, 4 earlier losses) is won every time
//   determinism      the same seed plays the same round twice
//   stepping         a round survives 30 Hz and 144 Hz stepping
//   attract          the loop visits TITLE, DEMO, SCORES and comes round again; the demo plays
//   high scores      5 rows, sorted, never AVR; insert ranks correctly
//   palette          every pixel of every sampled frame (round + attract) is in the game's palette
//   safe area        the outer 8 px of every sampled frame is pure background (curved-CRT crop)
import { f32, fmt, F32, roundEven } from './num.js';
import { PixelSurface } from './pixelsurface.js';
import { Rgba } from './rgba.js';
import { CabinetState, CabinetStateNames, RoundResult, RoundResultNames } from './cabinetsim.js';
import { SoundCue } from './soundcue.js';
import { Mercy } from './mercy.js';
import { RandomPilot } from './cabinetbot.js';
import { AttractMode } from './attractmode.js';
import { HighScores, HighScoreTable } from './highscores.js';
import { CabinetBench } from './cabinetbench.js';

export class CheckResult {
    constructor(name, pass, detail) { this.name = name; this.pass = pass; this.detail = detail || ''; }
    toString() { return (this.pass ? 'PASS  ' : 'FAIL  ') + this.name + (this.detail ? '  -  ' + this.detail : ''); }
}

const DT60 = f32(1 / 60);

export const CabinetChecks = {
    findSeed(cart, credit, want, tries, bot = null) {
        for (let i = 1; i <= tries; i++) {
            const seed = CabinetBench.roundSeed(4242, credit.number, i);
            const o = CabinetBench.playRound(cart, seed, credit, null, DT60, f32(900), null, bot);
            if (!o.timedOut && o.result === want) return seed;
        }
        return 0;
    },

    run(cart, mercyRounds = 100) {
        const list = [];
        const spec = cart.spec;

        // ---- round-won path
        let wonSeed = 0, wonCredit = Mercy.worstCase(1);
        for (let c = 1; c <= 4 && wonSeed === 0; c++) { wonCredit = Mercy.worstCase(c); wonSeed = CabinetChecks.findSeed(cart, wonCredit, RoundResult.Won, 400); }
        if (wonSeed === 0) list.push(new CheckResult('round-won path', false, 'the bot never won a round on credits 1-4 (400 seeds each)'));
        else list.push(pathCheck(cart, 'round-won path', wonSeed, wonCredit, RoundResult.Won, null));

        // ---- round-lost path
        const lostCredit = Mercy.worstCase(1);
        let lostBot = null;
        let lostSeed = CabinetChecks.findSeed(cart, lostCredit, RoundResult.Lost, 200);
        if (lostSeed === 0) { lostBot = new RandomPilot(); lostSeed = CabinetChecks.findSeed(cart, lostCredit, RoundResult.Lost, 200, lostBot); }
        if (lostSeed === 0) list.push(new CheckResult('round-lost path', false, 'no bot (own or random) ever lost credit 1'));
        else list.push(pathCheck(cart, 'round-lost path', lostSeed, lostCredit, RoundResult.Lost, lostBot));

        // ---- mercy
        {
            const credit = Mercy.worstCase(Mercy.UnlosableCredit);
            let lost = 0, timeouts = 0, tSum = 0;
            for (let r = 0; r < mercyRounds; r++) {
                const o = CabinetBench.playRound(cart, CabinetBench.roundSeed(99, credit.number, r), credit);
                if (o.timedOut) timeouts++;
                else if (o.result !== RoundResult.Won) lost++;
                tSum += o.seconds;
            }
            list.push(new CheckResult('mercy: credit 5 cannot be lost', lost === 0 && timeouts === 0,
                (mercyRounds - lost - timeouts) + '/' + mercyRounds + ' won, ' + timeouts + ' timeouts, mean ' + fmt(tSum / Math.max(1, mercyRounds), 1) + 's'));
        }

        // ---- determinism
        {
            const seed = wonSeed !== 0 ? wonSeed : 12345;
            const a = CabinetBench.playRound(cart, seed, wonCredit);
            const b = CabinetBench.playRound(cart, seed, wonCredit);
            const same = a.score === b.score && a.result === b.result && Math.abs(a.seconds - b.seconds) < 1e-4 && a.summary === b.summary;
            list.push(new CheckResult('determinism', same, same ? 'seed ' + seed + ': ' + a.summary : a.summary + '  vs  ' + b.summary));
        }

        // ---- stepping
        {
            let detail = '', ok = true;
            for (const dt of [f32(1 / 30), f32(1 / 144)]) {
                const hz = roundEven(f32(1 / dt));
                try {
                    const o = CabinetBench.playRound(cart, 777, Mercy.worstCase(1), null, dt);
                    ok = ok && !o.timedOut && o.result !== RoundResult.None;
                    detail += '1/' + hz + ': ' + RoundResultNames[o.result] + ' ' + fmt(o.seconds, 1, F32) + 's  ';
                } catch (e) { ok = false; detail += '1/' + hz + ': ' + (e && e.name) + ' ' + (e && e.message) + '  '; }
            }
            list.push(new CheckResult('stepping (30 Hz, 144 Hz)', ok, detail.trim()));
        }

        // ---- attract
        const frames = [];
        {
            HighScores.resetSession();
            const table = HighScores.for(spec.id, spec);
            const am = new AttractMode(cart, table, 3);
            let title = false, demo = false, scores = false, played = false;
            let t = 0, next = 0;
            const P = AttractMode.Page, step = f32(0.05);
            while (am.loops < 2 && t < 300) {
                am.step(step); t = f32(t + step);
                if (am.current === P.Title) title = true;
                if (am.current === P.Demo) { demo = true; if (am.demo != null && am.demo.state === CabinetState.Playing) played = true; }
                if (am.current === P.Scores) scores = true;
                if (t >= next && am.loops === 0) {
                    const s = new PixelSurface(); am.draw(s);
                    frames.push(['attract ' + AttractMode.PageNames[am.current] + ' t' + fmt(t, 1, F32), s]);
                    next = f32(next + f32(0.5));
                }
            }
            list.push(new CheckResult('attract loop', title && demo && scores && played && am.loops >= 2,
                'title ' + tf(title) + ', demo ' + tf(demo) + ' (played ' + tf(played) + '), scores ' + tf(scores) + ', loops ' + am.loops + ' in ' + fmt(t, 0, F32) + 's'));
        }

        // ---- high scores
        {
            HighScores.resetSession();
            const table = HighScores.for(spec.id, spec);
            let ok = table.entries.length === HighScoreTable.Rows;
            let names = '';
            for (let i = 0; i < table.entries.length; i++) {
                const e = table.entries[i];
                names += e.initials + ' ' + e.score + '  ';
                ok = ok && e.initials !== HighScores.Reserved && e.initials.length === 3;
                if (i > 0) ok = ok && table.entries[i - 1].score >= e.score;
            }
            let avr = false;
            for (let i = 0; i < 2000; i++) for (const s of HighScores.invent('cab' + i, HighScoreTable.Rows)) if (s === HighScores.Reserved) avr = true;
            const r0 = table.insert(table.top + 1, 'YOU');
            const rNone = table.insert(0, 'YOU');
            ok = ok && !avr && r0 === 0 && rNone === -1 && table.entries.length === HighScoreTable.Rows;
            HighScores.resetSession();
            list.push(new CheckResult('high scores', ok, names.trim() + (avr ? '  AVR INVENTED!' : '')));
        }

        // ---- palette + safe area: sample a won round, a lost round and the attract loop
        {
            if (wonSeed !== 0) sampleRound(cart, wonSeed, wonCredit, null, frames);
            if (lostSeed !== 0) sampleRound(cart, lostSeed, lostCredit, lostBot, frames);
            sampleRound(cart, 31337, Mercy.worstCase(Mercy.UnlosableCredit), null, frames);
            let palBad = null, safeBad = null;
            for (const [label, s] of frames) {
                if (palBad === null) palBad = CabinetChecks.offPalette(s, spec.palette, label);
                if (safeBad === null) safeBad = CabinetChecks.outsideSafeArea(s, spec.palette.background, label);
            }
            list.push(new CheckResult('palette-limited', palBad === null, palBad ?? frames.length + ' frames, ' + spec.palette.count + ' colours, no off-palette pixel'));
            list.push(new CheckResult('8 px safe area', safeBad === null, safeBad ?? frames.length + ' frames, border is pure background'));
        }
        return list;
    },

    offPalette(s, pal, label) {
        const u = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height);
        for (let k = 0; k < u.length; k++) {
            if (!pal.containsPacked(u[k])) {
                return label + ': pixel (' + (k % s.width) + ',' + Math.trunc(k / s.width) + ') is ' + Rgba.fromPacked(u[k]) + ' (not in the palette)';
            }
        }
        return null;
    },

    outsideSafeArea(s, bg, label) {
        const m = PixelSurface.SafeMargin;
        for (let y = 0; y < s.height; y++)
            for (let x = 0; x < s.width; x++) {
                if (x >= m && x < s.width - m && y >= m && y < s.height - m) continue;
                if (s.getPacked(x, y) !== bg.packed) return label + ': pixel (' + x + ',' + y + ') = ' + s.getPixel(x, y) + ' inside the 8 px margin';
            }
        return null;
    },
};

function tf(b) { return b ? 'True' : 'False'; }       // C# bool.ToString(), so the text matches the C# report

function pathCheck(cart, name, seed, credit, want, bot) {
    const seen = [];
    let earlyResult = false, flipped = false, atCard = RoundResult.None;
    const o = CabinetBench.playRound(cart, seed, credit, null, DT60, f32(900), sim => {
        if (seen.length === 0 || seen[seen.length - 1] !== sim.state) seen.push(sim.state);
        const decided = sim.state === CabinetState.Card || sim.state === CabinetState.Over;
        if (!decided && sim.result !== RoundResult.None) earlyResult = true;
        if (sim.state === CabinetState.Card && atCard === RoundResult.None) atCard = sim.result;
        if (decided && atCard !== RoundResult.None && sim.result !== atCard) flipped = true;
    }, bot);
    const winCues = o.cues[SoundCue.Win];
    const ok = !o.timedOut && o.result === want && atCard === want && !earlyResult && !flipped && o.overTransitions === 1
        && seen.includes(CabinetState.Playing) && seen.includes(CabinetState.Card)
        && (want !== RoundResult.Won || (winCues === 1 && o.score > 0));
    const path = seen.map(s => CabinetStateNames[s]).join('>');
    const why = (earlyResult ? ' RESULT-BEFORE-CARD' : '') + (flipped ? ' RESULT-FLIPPED' : '') + (o.overTransitions !== 1 ? ' OVER x' + o.overTransitions : '') +
        (want === RoundResult.Won && winCues !== 1 ? ' WIN-CUES ' + winCues : '');
    return new CheckResult(name, ok,
        'credit ' + credit.number + ' seed ' + seed + (bot != null ? ' (' + bot.name + ')' : '') + ': ' + o.summary + '  path ' + compress(path) + why);
}

function compress(path) {
    // Intro>Playing>Interlude>Intro>Playing>... gets long; keep the first 5 and the tail
    const parts = path.split('>');
    if (parts.length <= 8) return path;
    return parts.slice(0, 5).join('>') + '>...>' + parts.slice(parts.length - 3).join('>');
}

function sampleRound(cart, seed, credit, bot, into) {
    const r = cart.newRenderer();
    let next = 0;
    CabinetBench.playRound(cart, seed, credit, null, DT60, f32(900), sim => {
        if (sim.time < next) return;
        next = f32(next + f32(0.25));
        const s = new PixelSurface();
        r.draw(sim, s, sim.time);
        into.push(['round seed ' + seed + ' ' + CabinetStateNames[sim.state] + ' t' + fmt(sim.time, 2, F32), s]);
    }, bot);
}
