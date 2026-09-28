// THE NODE · CABINET ENGINE (JS) · the three things a cabinet game is: RULES, a PICTURE, a PILOT
// (port of Core/ICabinetSim.cs; the interfaces are duck-typed, the enums are ints like C#).
//
//   sim (ICabinetSim)            the whole ROUND, stepped by the host at whatever dt. Deterministic for a
//                                seed + input stream. No rendering, no audio, no DOM.
//     reset(seed, credit, knobs)   seed != 0 is deterministic; credit = CreditInfo; knobs = KnobValues
//     step(dt, input)              input = CabinetInput (already latched). Safe in any state.
//     state   result   score   lives   time   cues (CueBuffer)   summary (one log line)
//     collectStats(into)           optional per-round numbers the Lab averages: into[name] += value
//   renderer (ICabinetRenderer)  draw(sim, surface, t): reads the sim, never changes it
//   bot (ICabinetBot)            name, reset(seed), drive(sim, dt) -> InputFrame   (cabinetbot.js)
//
// THE ROUND'S LIFE (state): Intro -> Playing -> [Interlude -> Intro/Playing ...] -> Card -> Over
//   Card: the result card is up and result is already Won or Lost. Over: the host reports result now.
// THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.

export const RoundResult = Object.freeze({ None: 0, Lost: 1, Won: 2 });
export const RoundResultNames = Object.freeze(['None', 'Lost', 'Won']);

export const CabinetState = Object.freeze({ Idle: 0, Intro: 1, Playing: 2, Interlude: 3, Card: 4, Over: 5 });
export const CabinetStateNames = Object.freeze(['Idle', 'Intro', 'Playing', 'Interlude', 'Card', 'Over']);

// the interface a sim must satisfy (for porters and a quick self-check)
export function isCabinetSim(o) {
    return o != null && typeof o.reset === 'function' && typeof o.step === 'function' && 'state' in o && 'result' in o && 'cues' in o;
}
