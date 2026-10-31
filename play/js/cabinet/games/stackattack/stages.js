// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE STAGES (data only; the sim reads them).
//
// A coin buys the climb: six stages, each its own well, its own goal and one new thing, the last a finale
// whose clearing wins the game. Every stage is laid fresh on its card (and laid again when a topped-out
// stack starts it over).
//   name, hint     the stage card's title and its one-line hint
//   goal, target   what clears the stage: Goal.Lines (rows cleared), Goal.Bombs (bombs set off, chains count),
//                  Goal.Gold (gold blocks dug out: their row cleared, or blasted)
//   speed, ramp    the fall rate x speed over stage 1 (the fallRate knob), then x ramp for every row cleared
//                  in the stage (the climb inside a stage)
//   flood          seconds between rising rows (x the floodPace knob; 0 = no flood); floodGaps holes in each;
//                  floodBomb: every Nth risen row carries a bomb; floodRamp: the seconds x this a row
//                  cleared, never under floodMin
//   bombEvery      every Nth piece carries a bomb in one of its four cells (0 = none)
//   junk           steel rows laid on the floor when the stage starts, junkGaps holes in each, junkBombs
//                  bombs set in them; shaft: the holes line up into a shaft that runs straight down for this
//                  many rows, then jumps to another column (a dig, not a scatter; 0 = scattered holes);
//                  gold: the depths (0 = the top junk row) that hold a gold block
//   squeeze        every N rows cleared, a wall steps in a column (left, then right ...) down to minWidth
//   well           the palette name of the well's tint;  icon: the block the card shows
export const Goal = Object.freeze({ Lines: 0, Bombs: 1, Gold: 2 });

const base = {
    goal: Goal.Lines, target: 10, speed: 1, ramp: 1,
    flood: 0, floodGaps: 1, floodBomb: 0, floodRamp: 1, floodMin: 1,
    bombEvery: 0, junk: 0, junkGaps: 2, junkBombs: 0, shaft: 0, gold: [],
    squeeze: 0, minWidth: 10, well: 'well', icon: 'piece', final: false,
};

export const STAGES = Object.freeze([
    { ...base, name: 'THE BASICS', hint: 'FILL A ROW AND IT CLEARS', target: 8, speed: 1.0, ramp: 1.03, well: 'well', icon: 'piece' },
    { ...base, name: 'GARBAGE', hint: 'ROWS RISE FROM BELOW', target: 10, speed: 1.25, ramp: 1.015,
        flood: 10, floodGaps: 2, junk: 2, junkGaps: 2, well: 'well2', icon: 'junk' },
    { ...base, name: 'BOMB BLOCKS', hint: 'CLEAR A BOMB AND IT BLASTS ROUND', goal: Goal.Bombs, target: 5, speed: 1.45, ramp: 1.015,
        bombEvery: 3, junk: 4, junkGaps: 2, junkBombs: 3, well: 'well3', icon: 'bomb' },
    { ...base, name: 'THE DIG', hint: 'CLEAR THE ROW THE GOLD SITS IN', goal: Goal.Gold, target: 3, speed: 1.6, ramp: 1.0,
        flood: 15, floodGaps: 1, junk: 5, junkGaps: 1, junkBombs: 2, shaft: 3, gold: [0, 2, 3], well: 'well4', icon: 'gold' },
    { ...base, name: 'THE SQUEEZE', hint: 'EVERY 3 LINES THE WALLS MOVE IN', target: 10, speed: 1.75, ramp: 1.015,
        squeeze: 3, minWidth: 7, well: 'well5', icon: 'iron' },
    { ...base, name: 'THE TOWER', hint: 'THE LAST CLIMB. THE FLOOD IS FAST', target: 16, speed: 1.9, ramp: 1.015,
        flood: 12, floodGaps: 1, floodBomb: 3, floodRamp: 0.97, floodMin: 7, bombEvery: 7, well: 'well6', icon: 'crown', final: true },
]);

/** the card's goal line: CLEAR 12 LINES / SET OFF 6 BOMBS / DIG OUT 3 GOLD */
export function goalText(st) {
    return st.goal === Goal.Bombs ? 'SET OFF ' + st.target + ' BOMBS' : st.goal === Goal.Gold ? 'DIG OUT ' + st.target + ' GOLD' : 'CLEAR ' + st.target + ' LINES';
}

/** the panel's word for the goal count */
export function goalWord(st) {
    return st.goal === Goal.Bombs ? 'BOMBS' : st.goal === Goal.Gold ? 'GOLD' : 'LINES';
}
