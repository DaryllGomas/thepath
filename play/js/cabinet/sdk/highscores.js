// THE NODE · CABINET ENGINE (JS) · the high-score table, per cabinet, for the session (port of Core/HighScores.cs).
//
// Every cabinet boots with five INVENTED entries (initials from a fixed pool, picked by an FNV-1a hash
// of the cabinet id through SystemRandom, so the same machine shows the same names as in Unity) and
// the game's highScoreSeed scores. A round's score goes in when the round ends, won or lost.
//
// "AVR" is never invented: those initials belong to the cabinet at the back of Flynn's, where the
// blank top row fills in A-V-R on the win (WORLD_1 §6.5). Nothing else may show them first.
// Session only: nothing is saved.
import { SystemRandom } from './rng.js';

export class HighScoreEntry {
    constructor(initials, score, player = false) { this.initials = initials; this.score = score; this.player = player; }
}

export class HighScoreTable {
    constructor(cabinetId, seedScores) {
        this.cabinetId = cabinetId || '';
        this._rows = [];
        this.lastRank = -1;
        const names = HighScores.invent(this.cabinetId, HighScoreTable.Rows);
        const scores = [];
        for (let i = 0; i < HighScoreTable.Rows; i++)
            scores.push(seedScores && i < seedScores.length ? seedScores[i] : (HighScoreTable.Rows - i) * 1000);
        scores.sort((a, b) => b - a);
        for (let i = 0; i < HighScoreTable.Rows; i++) this._rows.push(new HighScoreEntry(names[i], scores[i]));
    }

    get entries() { return this._rows; }
    get top() { return this._rows.length > 0 ? this._rows[0].score : 0; }

    // returns the rank 0..4 the score took, or -1 if it did not make the table
    insert(score, initials) {
        if (!initials) initials = 'YOU';
        initials = initials.toUpperCase();
        if (initials.length > 3) initials = initials.substring(0, 3);
        let at = -1;
        for (let i = 0; i < this._rows.length; i++) if (score > this._rows[i].score) { at = i; break; }
        this.lastRank = at;
        if (at < 0) return -1;
        this._rows.splice(at, 0, new HighScoreEntry(initials, score, true));
        while (this._rows.length > HighScoreTable.Rows) this._rows.pop();
        return at;
    }
}

HighScoreTable.Rows = 5;

const tables = new Map();

export const HighScores = {
    Reserved: 'AVR',

    // plausible 1982 arcade initials. Never add AVR here (invent also filters it).
    Pool: Object.freeze([
        'JDL', 'KMS', 'RTW', 'ACE', 'MJB', 'TKO', 'DAN', 'LIZ', 'SAM', 'JAY',
        'PEZ', 'ROB', 'KEV', 'BOB', 'ZAP', 'MAX', 'JEN', 'TOM', 'ZED', 'RAD',
        'GUS', 'KAT', 'MEL', 'NED', 'OZZ', 'PAM', 'RIC', 'SUE', 'TED', 'VIC',
        'WES', 'CJB', 'DMG', 'EKL', 'FLO', 'JPR', 'BUD', 'TIM', 'LOU', 'SKY',
    ]),

    // the session table for a cabinet id (C# HighScores.For)
    for(cabinetId, spec) {
        const key = !cabinetId ? (spec ? spec.id : '') : cabinetId;
        let t = tables.get(key);
        if (!t) {
            t = new HighScoreTable(key, spec ? spec.highScoreSeed : null);
            tables.set(key, t);
        }
        return t;
    },

    resetSession() { tables.clear(); },

    // n distinct initials for this cabinet, stable across sessions (and across C#/JS), never AVR
    invent(cabinetId, n) {
        let h = 2166136261;                     // FNV-1a over UTF-16 code units, as C# foreach(char)
        const s = cabinetId || '';
        for (let i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
        const rng = new SystemRandom(h & 0x7FFFFFFF);
        const picked = [];
        let guard = 0;
        while (picked.length < n && guard++ < 1000) {
            const p = HighScores.Pool[rng.next(HighScores.Pool.length)];
            if (p === HighScores.Reserved || picked.includes(p)) continue;
            picked.push(p);
        }
        return picked;
    },
};
