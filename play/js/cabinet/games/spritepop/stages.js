// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) · THE TOWER: the seven stages (data only).
// Added in the 2026-10-18 build-out; the sim (round.js) plays them in order, the renderer draws their cards.
//
// The cub climbs the toy-shop tower one screen at a time. Every stage brings one new thing (the
// card names it) and the creatures wind up a little faster each floor:
//
//   1  SUGAR STEPS      wind-ups only: blow, trap, pop (the lesson)
//   2  THE CUPS         WHISTLERS fly through anything; the CANDY letters start rising
//   3  SPRING GARDEN    HOPPERS crouch and leap; FIZZ bubbles flood the shelves
//   4  CORK ALLEY       CORKERS stop, puff and spit a cork along the alley; a bubble stops a cork
//   5  THE ATTIC        WISPS drift straight at you through every rafter (and fade out now and then);
//                       SPARK bubbles shoot a bolt across the screen
//   6  RUBBER ROOM      BOUNCERS never stop; everything at once
//   7  THE TIN THRONE   THE TIN KING: sparks are drawn to tin, pop them and he takes the hit; he
//                       throws gears and winds out little wind-ups. Pop him in his bubble to win.
//
// A stage: the layout (tiles.js), its card (new, hint, the featured sprite), the roster (creature
// kinds, shuffled per seed, one of the featured kind among the first out), how many are out at the
// bell / at most / the drop-in gap, the pace (x the creatureSpeed knob), chase and dodge, the hurry
// clock (x the hurrySeconds knob), the special bubbles it sends up (first at s, then every s), and
// whether the letters rise.
export const Kind = Object.freeze({ WindUp: 0, Whistler: 1, Hopper: 2, Corker: 3, Wisp: 4, Bouncer: 5 });
export const KindNames = Object.freeze(['WIND-UP', 'WHISTLER', 'HOPPER', 'CORKER', 'WISP', 'BOUNCER']);

// the word the letter bubbles spell: all five is an extra life
export const Word = 'CANDY';

const W = Kind.WindUp, Wh = Kind.Whistler, H = Kind.Hopper, C = Kind.Corker, Wi = Kind.Wisp, B = Kind.Bouncer;

export const STAGES = Object.freeze([
    {
        layout: 0, feature: W, newText: 'MEET THE WIND-UPS', hint: 'BLOW A BUBBLE  TOUCH IT',
        roster: [W, W, W, W, W], start: 3, maxOn: 4, gap: 6, pace: 0.75, chase: 0.35, dodge: 0.25, hurry: 1.1,
        fizz: null, spark: null, letters: false, boss: false,
    },
    {
        layout: 1, feature: Wh, newText: 'WHISTLERS FLY', hint: 'POP LETTERS  SPELL CANDY',
        roster: [W, W, W, W, Wh, Wh], start: 3, maxOn: 4, gap: 6, pace: 0.78, chase: 0.42, dodge: 0.45, hurry: 1.0,
        fizz: null, spark: null, letters: true, boss: false,
    },
    {
        layout: 2, feature: H, newText: 'HOPPERS LEAP', hint: 'POP FIZZ TO FLOOD THEM',
        roster: [H, H, H, W, W, Wh], start: 3, maxOn: 4, gap: 6, pace: 0.8, chase: 0.45, dodge: 0.55, hurry: 1.0,
        fizz: { first: 6, every: 13 }, spark: null, letters: true, boss: false,
    },
    {
        layout: 3, feature: C, newText: 'CORKERS SPIT', hint: 'A BUBBLE STOPS A CORK',
        roster: [C, C, H, W, W, Wh], start: 3, maxOn: 4, gap: 6, pace: 0.82, chase: 0.48, dodge: 0.6, hurry: 1.0,
        fizz: { first: 8, every: 14 }, spark: null, letters: true, boss: false,
    },
    {
        layout: 4, feature: Wi, newText: 'WISPS PASS WALLS', hint: 'SPARKS ZAP A WHOLE ROW',
        roster: [Wi, Wi, C, Wh, W, W], start: 3, maxOn: 4, gap: 6, pace: 0.85, chase: 0.5, dodge: 0.65, hurry: 1.0,
        fizz: null, spark: { first: 5, every: 12, cap: 1 }, letters: true, boss: false,
    },
    {
        layout: 5, feature: B, newText: 'BOUNCERS NEVER STOP', hint: 'WATCH THE BOUNCE',
        roster: [B, B, Wi, H, C, W], start: 3, maxOn: 4, gap: 6, pace: 0.88, chase: 0.52, dodge: 0.7, hurry: 1.0,
        fizz: { first: 9, every: 15 }, spark: { first: 5, every: 13, cap: 1 }, letters: true, boss: false,
    },
    {
        layout: 6, feature: -1, newText: 'THE TIN KING', hint: 'SPARKS ARE DRAWN TO TIN',
        roster: [], start: 0, maxOn: 3, gap: 8, pace: 1.0, chase: 0.55, dodge: 0.6, hurry: 0,
        fizz: null, spark: { first: 2.5, every: 2.6, cap: 3 }, letters: false, boss: true,
    },
]);
