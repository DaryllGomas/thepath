// THE CABINET'S SOUND · THE FLOOR: the machines on THE JUNCTION's floor (Castle Crush ... Route 9). Every one of them gets a
// voice from here until it has a palette of its own (js/cabinet/games/<id>/sound.js, which usually starts from this one):
// the shared cabinet family (coin, ready, a life lost, the round lost, INSERT COIN) in the game's own key, plus the eight SDK
// cues as plain 1981 board sounds. Chip synthesis only (js/cabinet/sound/chip.js), never recordings.
//
//   floorSound('castlecrush', 'CASTLE CRUSH', hz('G4'))                      the stock palette, rooted on G4
//   floorSound(id, title, R, { sounds: {...}, events: {...}, cues: {...}, frame, begin, end, silent, mix })   a game's own,
//                                                                            its sounds and handlers laid over the stock ones
// A sim that says more than the eight cues sets `recordEvents` and pushes { kind, ... } onto `sim.events` (Starvector's way:
// js/cabinet/games/starvector/sim.js _emit); the floor's hosts (main.js, play.html) hand them to the palette as game.events.
import { hz, JI } from '../music.js';
import { cabinetVoice } from './cabinet.js';

/** A stable root for a game with no palette of its own: one of the cabinet's twelve keys, picked by its id. */
export function floorRoot(id) {
  const keys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb3', 'C4', 'Eb4', 'F#4', 'G4', 'A3'];
  let h = 7; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return hz(keys[h % keys.length]);
}

/** The stock floor sounds, in the key of R (Hz). */
export function floorVoice(R) {
  return {
    ...cabinetVoice(R),
    hit: {
      label: 'A hit', group: 'play', desc: 'something of yours lands: a short bright blip over a soft noise tick',
      layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, sweep: { to: 1.5, t: 0.04 }, env: { a: 0.001, d: 0.07, v: 0.06 }, lp: 3400 },
        { wave: 'noise', f: 7000, env: { a: 0.001, d: 0.03, v: 0.03 }, lp: 2600 }],
      max: 3, gap: 0.03, vary: { pitch: 70, level: 0.12, time: 0.004 },
    },
    miss: {
      label: 'A miss', group: 'play', desc: 'a near thing or a shot gone wide: a low buzz falling away',
      layers: [{ wave: 'pulse', duty: 0.5, f: R / 2, sweep: { to: 0.6, t: 0.16, q: 1 / 60 }, env: { a: 0.002, d: 0.18, v: 0.05 }, lp: 1600 }],
      max: 2, gap: 0.08, vary: { pitch: 50, level: 0.1 },
    },
    bonus: {
      label: 'A bonus', group: 'play', desc: 'points, a pickup, a stage cleared: a quick climb up the major chord',
      layers: [{ wave: 'pulse', duty: 0.125, f: R * 2, arp: { n: [0, 4, 7, 12], step: 0.05 }, env: { a: 0.002, d: 0.06, s: 0.7, h: 0.16, r: 0.12, v: 0.06 }, lp: 3600 },
        { wave: 'tri', f: R, env: { a: 0.002, d: 0.22, v: 0.08 } }],
      max: 2, gap: 0.12,
    },
    tick: {
      label: 'A tick', group: 'play', desc: 'the game counting: a dry little click',
      layers: [{ wave: 'metal', f: 14000, env: { a: 0.001, d: 0.02, v: 0.03 }, lp: 3000 }],
      max: 2, gap: 0.05, vary: { pitch: 40, level: 0.15 },
    },
    win: {
      label: 'Round won', group: 'end', desc: 'the whole game beaten: root, third, fifth and the octave, held, with the bass under it',
      layers: [
        { wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.14, 4], [0.28, 7], [0.42, 12]], env: { a: 0.004, d: 0.1, s: 0.8, h: 0.9, r: 0.6, v: 0.09 },
          vib: { rate: 5.5, depth: 10, at: 0.6, fade: 0.3 }, lp: 3200 },
        { wave: 'pulse', duty: 0.125, f: R * JI.fifth, at: 0.42, env: { a: 0.01, d: 0.3, s: 0.6, h: 0.6, r: 0.6, v: 0.03 }, lp: 2800 },
        { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.4, s: 0.6, h: 0.9, r: 0.6, v: 0.18 } },
      ], max: 1, gap: 2,
    },
  };
}

/** The palette. Cue handlers: Coin chirps, Start is the ready call, Die a life (the round's loss is its own 'die' from the
 *  card's Win/Lost handling below), Hit / Miss / Bonus / Tick / Win their stock sounds. */
export function floorSound(id, title, R = floorRoot(id), own = {}) {
  return {
    id, title, root: R, mix: own.mix ?? 0,
    personality: own.personality || 'the floor\'s stock voice: the cabinet family in its own key and the eight cues as plain board sounds',
    sounds: { ...floorVoice(R), ...(own.sounds || {}) },
    cues: {
      Coin: (s) => s.play('coin'),
      Start: (s) => s.play('start'),
      Hit: (s) => s.play('hit'),
      Miss: (s) => s.play('miss'),
      Die: (s) => s.play('lifeLost'),
      Win: (s) => { s.lost = false; s.play('win'); },
      Bonus: (s) => s.play('bonus'),
      Tick: (s) => s.play('tick'),
      ...(own.cues || {}),
    },
    // 'out': the round ended LOST (the floor's adapter says so once, at the card): the slow fall, then INSERT COIN on the title
    // (a kind listed in `silent` is a known event with no sound: null, so GameSound doesn't count it as unmapped)
    events: { out: (s) => s.play('die'), ...Object.fromEntries(Object.keys(own.silent || {}).map((k) => [k, null])), ...(own.events || {}) },
    silent: { ...(own.silent || {}) },
    frame: own.frame, begin: own.begin, end: own.end,
  };
}
