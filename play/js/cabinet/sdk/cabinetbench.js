// THE NODE · CABINET ENGINE (JS) · the bench: play a cartridge with its bot, many rounds, no screen
// (port of Core/CabinetBench.cs; the report text has the C# CabinetLab's exact shape).
//
// Credit N is measured WORST CASE: every earlier credit on the cabinet was lost (losses = N-1), which
// is the mercy curve a struggling player actually walks. Credit 5 must read 100%.
import { f32, fmt, fmtOpt, F32, roundEven, cultureCompare } from './num.js';
import { CueBuffer, SoundCueNames } from './soundcue.js';
import { CabinetInput } from './cabinetinput.js';
import { CabinetState, RoundResult } from './cabinetsim.js';
import { Mercy } from './mercy.js';

export class RoundOutcome {
    constructor() {
        this.result = RoundResult.None;
        this.score = 0;
        this.seconds = 0;
        this.timedOut = false;
        this.overTransitions = 0;              // must be exactly 1: the host reports once
        this.summary = '';
        this.cues = new Array(CueBuffer.Kinds).fill(0);
        this.stats = {};
    }
}

export class BenchOptions {
    constructor(init = {}) {
        this.rounds = 200;
        this.seed = 1;
        this.credits = [1, 2, 3, 4, 5];
        this.dt = f32(1 / 60);
        this.maxRoundSeconds = f32(900);
        this.overrides = new Map();
        Object.assign(this, init);
    }
}

export class CreditStats {
    constructor() {
        this.credit = null; this.knobs = null;
        this.rounds = 0; this.wins = 0; this.timeouts = 0; this.mercyViolations = 0; this.reportFaults = 0;
        this.meanSeconds = 0; this.meanWinSeconds = 0; this.meanLossSeconds = 0;
        this.scores = [];                      // sorted ascending after run
        this.meanCues = new Array(CueBuffer.Kinds).fill(0);
        this.meanStats = {};                   // sorted by name when reported
    }

    get winRate() { return this.rounds > 0 ? this.wins / this.rounds : 0; }
    get meanScore() { let s = 0; for (const v of this.scores) s += v; return this.scores.length > 0 ? s / this.scores.length : 0; }

    percentile(p) {
        if (this.scores.length === 0) return 0;
        const i = roundEven(p * (this.scores.length - 1));
        return this.scores[Math.max(0, Math.min(this.scores.length - 1, i))];
    }
}

function pad(s, w) { return s.length >= w ? s + ' ' : s + ' '.repeat(w - s.length); }

export const CabinetBench = {
    roundSeed(baseSeed, credit, round) {
        const s = (Math.imul(baseSeed, 1000003) + Math.imul(credit, 7919) + Math.imul(round, 104729) + 1) | 0;
        return s === 0 ? 1 : s;
    },

    botSeed(roundSeed) {
        const s = roundSeed ^ 0x2545F491;
        return s === 0 ? 7 : s;
    },

    // one whole round, bot at the panel. afterStep sees the sim after every step (frame capture).
    playRound(cart, seed, credit, overrides = null, dt = f32(1 / 60), maxSeconds = f32(900), afterStep = null, bot = null) {
        dt = f32(dt); maxSeconds = f32(maxSeconds);
        const sim = cart.startRound(seed, credit, overrides);
        if (bot == null) bot = cart.newBot();
        bot.reset(CabinetBench.botSeed(seed));
        const input = new CabinetInput();
        sim.cues.resetTotals();
        const o = new RoundOutcome();
        let prev = sim.state;
        while (sim.state !== CabinetState.Over && sim.time < maxSeconds) {
            input.latch(bot.drive(sim, dt));
            sim.step(dt, input);
            sim.cues.clear();
            if (afterStep) afterStep(sim);
            if (sim.state === CabinetState.Over && prev !== CabinetState.Over) o.overTransitions++;
            prev = sim.state;
        }
        o.timedOut = sim.state !== CabinetState.Over;
        o.result = sim.result;
        o.score = sim.score;
        o.seconds = sim.time;
        o.summary = sim.summary;
        for (let i = 0; i < CueBuffer.Kinds; i++) o.cues[i] = sim.cues.total(i);
        if (typeof sim.collectStats === 'function') sim.collectStats(o.stats);
        return o;
    },

    runCredit(cart, creditNumber, opt) {
        const credit = Mercy.worstCase(creditNumber);
        const st = new CreditStats();
        st.credit = credit;
        st.knobs = Mercy.resolve(cart.spec.knobs, credit, opt.overrides);
        let tSum = 0, wSum = 0, lSum = 0, losses = 0;
        const statSums = {};
        for (let r = 0; r < opt.rounds; r++) {
            const o = CabinetBench.playRound(cart, CabinetBench.roundSeed(opt.seed, creditNumber, r), credit, opt.overrides, opt.dt, opt.maxRoundSeconds);
            st.rounds++;
            if (o.timedOut) st.timeouts++;
            if (o.overTransitions !== 1 && !o.timedOut) st.reportFaults++;
            if (o.result === RoundResult.Won) { st.wins++; wSum += o.seconds; }
            else { losses++; lSum += o.seconds; if (credit.unlosable) st.mercyViolations++; }
            tSum += o.seconds;
            st.scores.push(o.score);
            for (let i = 0; i < CueBuffer.Kinds; i++) st.meanCues[i] += o.cues[i];
            for (const k of Object.keys(o.stats)) statSums[k] = (statSums[k] || 0) + o.stats[k];
        }
        st.scores.sort((a, b) => a - b);
        const n = Math.max(1, st.rounds);
        st.meanSeconds = tSum / n;
        st.meanWinSeconds = st.wins > 0 ? wSum / st.wins : 0;
        st.meanLossSeconds = losses > 0 ? lSum / losses : 0;
        for (let i = 0; i < CueBuffer.Kinds; i++) st.meanCues[i] /= n;
        for (const k of Object.keys(statSums)) st.meanStats[k] = statSums[k] / n;
        return st;
    },

    run(cart, opt, progress = null) {
        const all = [];
        for (const c of opt.credits) {
            const st = CabinetBench.runCredit(cart, c, opt);
            all.push(st);
            if (progress) progress('credit ' + c + ': win ' + fmt(st.winRate * 100, 1) + '%');
        }
        return all;
    },

    // ------------------------------------------------------------------ the report
    report(cart, opt, all) {
        const L = [];
        const bot = cart.newBot();
        L.push(cart.spec.name + '  (bot ' + bot.name + ', ' + opt.rounds + ' rounds per credit, dt 1/' +
               roundEven(f32(1 / opt.dt)) + ' s, seed ' + opt.seed + ', credit N = worst case: N-1 earlier losses)');
        const ov = opt.overrides instanceof Map ? [...opt.overrides] : Object.entries(opt.overrides || {});
        if (ov.length > 0) L.push('base overrides:' + ov.map(([k, v]) => ' ' + k + '=' + fmtOpt(v, 3, F32)).join(''));
        L.push('');
        L.push('credit  losses   win%   round(s)  win(s)  loss(s) | score  min    p10    p25    med    p75    p90    max    mean | t/o');
        for (const st of all) {
            L.push(pad(String(st.credit.number) + (st.credit.unlosable ? '*' : ''), 6) +
                   pad(String(st.credit.lossesBefore), 8) +
                   pad(fmt(st.winRate * 100, 1), 7) +
                   pad(fmt(st.meanSeconds, 1), 10) +
                   pad(fmt(st.meanWinSeconds, 1), 8) +
                   pad(fmt(st.meanLossSeconds, 1), 8) + ' |      ' +
                   pad(String(st.percentile(0)), 7) + pad(String(st.percentile(0.10)), 7) +
                   pad(String(st.percentile(0.25)), 7) + pad(String(st.percentile(0.5)), 7) +
                   pad(String(st.percentile(0.75)), 7) + pad(String(st.percentile(0.90)), 7) +
                   pad(String(st.percentile(1)), 7) + pad(fmt(st.meanScore, 0), 7) +
                   '| ' + st.timeouts);
        }
        L.push('(* = the unlosable credit)');
        L.push('');
        L.push("score histogram (12 bins, 0 .. max score over all credits; ' .:-=+*#%@' = share of that credit's rounds)");
        let out = L.join('\n') + '\n' + CabinetBench.histogram(all);
        const M = [''];
        M.push('knobs per credit (after mercy):');
        for (const st of all) M.push('  ' + st.credit.number + ': ' + st.knobs.toString());
        if (all.some(st => Object.keys(st.meanStats).length > 0)) {
            M.push('');
            M.push('game stats (mean per round):');
            for (const st of all) {
                const keys = Object.keys(st.meanStats).sort(cultureCompare);
                M.push('  ' + st.credit.number + ':' + keys.map(k => '  ' + k + ' ' + fmt(st.meanStats[k], 2)).join(''));
            }
        }
        M.push('');
        M.push('sound cues (mean per round):');
        for (const st of all) {
            let line = '  ' + st.credit.number + ':';
            for (let i = 0; i < CueBuffer.Kinds; i++)
                if (st.meanCues[i] > 0) line += '  ' + SoundCueNames[i].toLowerCase() + ' ' + fmt(st.meanCues[i], 1);
            M.push(line);
        }
        for (const st of all) {
            if (st.mercyViolations > 0) M.push('!! MERCY VIOLATION: credit ' + st.credit.number + ' lost ' + st.mercyViolations + ' rounds');
            if (st.reportFaults > 0) M.push('!! REPORT FAULT: credit ' + st.credit.number + ' reached Over != once in ' + st.reportFaults + ' rounds');
            if (st.timeouts > 0) M.push('!! TIMEOUT: credit ' + st.credit.number + ' had ' + st.timeouts + ' rounds that never ended');
        }
        out += M.join('\n') + '\n';
        return out;
    },

    histogram(all, bins = 12) {
        const ramp = ' .:-=+*#%@';
        let max = 1;
        for (const st of all) if (st.scores.length > 0) max = Math.max(max, st.scores[st.scores.length - 1]);
        let sb = '';
        for (const st of all) {
            const counts = new Array(bins).fill(0);
            for (const v of st.scores) counts[Math.min(bins - 1, Math.trunc(v * bins / (max + 1)))]++;
            sb += '  credit ' + st.credit.number + ' |';
            for (let b = 0; b < bins; b++) {
                const share = st.scores.length > 0 ? counts[b] / st.scores.length : 0;
                const k = share <= 0 ? 0 : Math.min(ramp.length - 1, 1 + Math.trunc(share * 2.0 * (ramp.length - 2)));
                sb += ramp[k] + ramp[k];
            }
            sb += '|\n';
        }
        sb += '           0' + ' '.repeat(bins * 2 - 1 - String(max).length) + max + '\n';
        return sb;
    },
};
