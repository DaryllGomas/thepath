// THE NODE · the cabinet with no name · ITS SCORE TABLE: five rows, and the top row is BLANK.
//
// Nobody's initials, no score: the impossible row. Rows 2-5 are invented (HighScores.invent: never AVR). A lost
// round's score can take a place in rows 2-5, never the top. On the win the top row fills: the player's score,
// then A·V·R, one letter every 0.4 s (the renderer types it; `fillTop` records it for the session).
// Session only, like HighScores; one table per cabinet id.
import { HighScores } from '../../sdk/index.js';

export const AVR = 'AVR';
// the score A·V·R holds when the top row fills: 133700, LEET (the BBS era's elite-speak; the storyboard's "A·V·R 1,337,000"),
// in the table's six digits (renderer.js d6 keeps six): the impossible top score, far above rows 2-5 and any won run (~20-30k)
export const AVR_SCORE = 133700;

export class NamelessTable {
    constructor(cabinetId = 'nameless') {
        const names = HighScores.invent(cabinetId, 4);
        const scores = [18400, 15300, 12100, 9600];     // below a won run (~20-30k), above most lost ones
        this.rows = [{ initials: '', score: 0, blank: true, player: false }];
        for (let i = 0; i < 4; i++) this.rows.push({ initials: names[i], score: scores[i], blank: false, player: false });
        this.lastRank = -1;
    }

    get topBlank() { return this.rows[0].blank; }

    // a lost (or aborted-with-score) round: rows 2-5 only. Returns the rank 1..4 it took, or -1.
    insert(score, initials = 'YOU') {
        initials = String(initials || 'YOU').toUpperCase().slice(0, 3);
        if (initials === AVR) initials = 'YOU';               // nobody else writes those letters
        let at = -1;
        for (let i = 1; i < this.rows.length; i++) if (score > this.rows[i].score) { at = i; break; }
        this.lastRank = at;
        if (at < 0) return -1;
        this.rows.splice(at, 0, { initials, score, blank: false, player: true });
        this.rows.length = 5;
        return at;
    }

    // the win: the blank row becomes A·V·R, with the impossible score (the player's own is on the HUD)
    fillTop(score) {
        this.rows[0] = { initials: AVR, score: AVR_SCORE, blank: false, player: true, won: score };
        this.lastRank = 0;
        return 0;
    }
}

const tables = new Map();
export const NamelessScores = {
    for(cabinetId = 'nameless') {
        let t = tables.get(cabinetId);
        if (!t) { t = new NamelessTable(cabinetId); tables.set(cabinetId, t); }
        return t;
    },
    resetSession() { tables.clear(); },
};
