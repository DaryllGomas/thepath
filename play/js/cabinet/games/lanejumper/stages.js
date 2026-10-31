// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · THE SIX STAGES (data only).
//
// A coin buys the whole route: six stages, five MAIL SLOTS each. Every stage keeps the field (13 x 14 tiles:
// the slots, five river rows, the median, six road rows, the kerb) and changes the town on it:
//   1 MAIN STREET       teaches: slow cars and vans, long logs, turtles that never dive
//   2 RUSH HOUR         two-tile trucks and the bus, dual carriageways, THE WEAVER (a sports car that changes lanes,
//                       its blinker going first); turtles start to dive; the PARCEL rides a log
//   3 THE RIVER RISES   short logs, wide water, divers, THE MUDJAW (a log-long river beast whose jaws open on a
//                       beat) and a SNAKE on the median
//   4 NIGHT RUN         after dark: the road shows only in the lamps and headlights; MOTORBIKES
//   5 THE RAILWAY       a double track across the road (a bell and flashing rails before every train) and THE
//                       FERRY, the only ride on its row, shuttling bank to bank
//   6 DELIVERY DAY      the finale: a train, the weaver, the mudjaw, divers, THE DOG loose on the median, and the
//                       slots' FLAPS shutting in turn. Clearing it wins the game.
//
// A lane: { row, kind (ThingKind), dir (+1 right), speed (px/s, before the knobs), gap (tiles, the narrowest
// traffic gap), spread (tiles, random extra), size (a log's px, a turtle group's count), water (tiles, the
// widest water gap; at least 1), beast (the loop's first thing is the mudjaw) }.
// Specials: weaver { rows, speed, cruise }, train { speed, len, every (s), spread (s) } on lanes of kind Train,
// ferry { row, len, speed, dwell }, snake { len, speed }, dog { trot, chase }, flaps { every, warn, shut }.
// dive = the share of turtle groups that dive (x the turtleDive knob); time = seconds a courier; par = the time
// bonus counts the stage's seconds under it.
import { ThingKind as K } from './field.js';

export const STAGES = Object.freeze([
    {
        name: 'MAIN STREET',
        hint: ['HOP THE TRAFFIC. RIDE THE LOGS', 'AND TURTLES HOME TO A MAIL SLOT.'],
        feature: 'car', theme: 'day', time: 60, par: 140, dive: 0, parcel: false,
        lanes: [
            { row: 1, kind: K.Log, dir: -1, speed: 22, size: 80, water: 2.2 },
            { row: 2, kind: K.Turtles, dir: +1, speed: 24, size: 3, water: 2.0 },
            { row: 3, kind: K.Log, dir: -1, speed: 28, size: 96, water: 2.4 },
            { row: 4, kind: K.Log, dir: +1, speed: 20, size: 64, water: 2.0 },
            { row: 5, kind: K.Turtles, dir: -1, speed: 24, size: 3, water: 2.0 },
            { row: 7, kind: K.Car, dir: +1, speed: 30, gap: 5.0, spread: 3 },
            { row: 8, kind: K.Van, dir: -1, speed: 24, gap: 5.0, spread: 3 },
            { row: 9, kind: K.Car, dir: +1, speed: 38, gap: 5.5, spread: 3 },
            { row: 10, kind: K.Van, dir: -1, speed: 20, gap: 4.5, spread: 3 },
            { row: 11, kind: K.Car, dir: +1, speed: 28, gap: 4.5, spread: 3 },
            { row: 12, kind: K.Car, dir: -1, speed: 20, gap: 4.5, spread: 3 },
        ],
    },
    {
        name: 'RUSH HOUR',
        hint: ['BIG RIGS TAKE TWO TILES. WATCH', 'THE WEAVER: HE SIGNALS, THEN GOES.'],
        feature: 'weaver', theme: 'day', time: 60, par: 140, dive: 0.3, parcel: true,
        weaver: { rows: [9, 10], speed: 84, cruise: 2.6 },
        lanes: [
            { row: 1, kind: K.Log, dir: -1, speed: 26, size: 64, water: 2.6 },
            { row: 2, kind: K.Turtles, dir: +1, speed: 30, size: 2, water: 2.4 },
            { row: 3, kind: K.Log, dir: -1, speed: 34, size: 80, water: 2.6 },
            { row: 4, kind: K.Log, dir: +1, speed: 22, size: 48, water: 2.2 },
            { row: 5, kind: K.Turtles, dir: -1, speed: 28, size: 3, water: 2.4 },
            { row: 7, kind: K.Car, dir: +1, speed: 40, gap: 4.0, spread: 3 },
            { row: 8, kind: K.Bus, dir: -1, speed: 26, gap: 4.0, spread: 2 },
            { row: 9, kind: K.Sports, dir: +1, speed: 52, gap: 4.5, spread: 4 },
            { row: 10, kind: K.Truck, dir: +1, speed: 30, gap: 3.5, spread: 2 },
            { row: 11, kind: K.Van, dir: -1, speed: 32, gap: 3.5, spread: 3 },
            { row: 12, kind: K.Car, dir: -1, speed: 24, gap: 3.5, spread: 3 },
        ],
    },
    {
        name: 'THE RIVER RISES',
        hint: ['DIVERS SINK. THE MUDJAW SNAPS ON', 'A BEAT. A SNAKE IS ON THE GRASS.'],
        feature: 'mudjaw', theme: 'storm', time: 60, par: 150, dive: 0.55, parcel: true,
        snake: { len: 32, speed: 18 },
        lanes: [
            { row: 1, kind: K.Log, dir: -1, speed: 28, size: 64, water: 2.8 },
            { row: 2, kind: K.Turtles, dir: +1, speed: 32, size: 2, water: 2.6 },
            { row: 3, kind: K.Log, dir: -1, speed: 36, size: 64, water: 3.0, beast: true },
            { row: 4, kind: K.Log, dir: +1, speed: 24, size: 48, water: 2.6 },
            { row: 5, kind: K.Turtles, dir: -1, speed: 30, size: 3, water: 2.6 },
            { row: 7, kind: K.Car, dir: +1, speed: 42, gap: 3.5, spread: 3 },
            { row: 8, kind: K.Bus, dir: -1, speed: 28, gap: 3.5, spread: 2 },
            { row: 9, kind: K.Sports, dir: +1, speed: 56, gap: 4.0, spread: 4 },
            { row: 10, kind: K.Truck, dir: -1, speed: 26, gap: 3.2, spread: 2 },
            { row: 11, kind: K.Van, dir: +1, speed: 34, gap: 3.2, spread: 3 },
            { row: 12, kind: K.Car, dir: -1, speed: 24, gap: 3.2, spread: 3 },
        ],
    },
    {
        name: 'NIGHT RUN',
        hint: ['AFTER DARK THE ROAD SHOWS ONLY', 'IN THE LAMPS. MOTORBIKES ARE QUICK.'],
        feature: 'moto', theme: 'night', time: 60, par: 150, dive: 0.5, parcel: true,
        lanes: [
            { row: 1, kind: K.Log, dir: -1, speed: 28, size: 64, water: 2.8 },
            { row: 2, kind: K.Turtles, dir: +1, speed: 32, size: 3, water: 2.6 },
            { row: 3, kind: K.Log, dir: -1, speed: 38, size: 80, water: 3.0 },
            { row: 4, kind: K.Turtles, dir: +1, speed: 28, size: 2, water: 2.6 },
            { row: 5, kind: K.Log, dir: -1, speed: 26, size: 48, water: 2.6 },
            { row: 7, kind: K.Car, dir: +1, speed: 44, gap: 3.5, spread: 3 },
            { row: 8, kind: K.Van, dir: -1, speed: 34, gap: 3.5, spread: 3 },
            { row: 9, kind: K.Sports, dir: +1, speed: 58, gap: 4.0, spread: 4 },
            { row: 10, kind: K.Truck, dir: -1, speed: 28, gap: 3.2, spread: 2 },
            { row: 11, kind: K.Moto, dir: +1, speed: 70, gap: 4.5, spread: 4 },
            { row: 12, kind: K.Car, dir: -1, speed: 26, gap: 3.2, spread: 3 },
        ],
    },
    {
        name: 'THE RAILWAY',
        hint: ['WHEN THE BELL RINGS A TRAIN IS', 'COMING. THE FERRY RUNS BANK TO BANK.'],
        feature: 'train', theme: 'day', time: 60, par: 150, dive: 0.55, parcel: true,
        train: { speed: 150, len: 176, every: 7.5, spread: 3 },
        ferry: { row: 3, len: 80, speed: 34, dwell: 1.0 },
        lanes: [
            { row: 1, kind: K.Log, dir: -1, speed: 30, size: 64, water: 2.8 },
            { row: 2, kind: K.Turtles, dir: +1, speed: 34, size: 2, water: 2.6 },
            { row: 4, kind: K.Log, dir: +1, speed: 26, size: 48, water: 2.6 },
            { row: 5, kind: K.Turtles, dir: -1, speed: 30, size: 3, water: 2.6 },
            { row: 7, kind: K.Sports, dir: +1, speed: 58, gap: 4.0, spread: 4 },
            { row: 8, kind: K.Bus, dir: -1, speed: 30, gap: 3.5, spread: 2 },
            { row: 9, kind: K.Train, dir: +1 },
            { row: 10, kind: K.Train, dir: -1 },
            { row: 11, kind: K.Van, dir: +1, speed: 36, gap: 3.2, spread: 3 },
            { row: 12, kind: K.Car, dir: -1, speed: 26, gap: 3.2, spread: 3 },
        ],
    },
    {
        name: 'DELIVERY DAY',
        hint: ['THE LAST ROUND. THE DOG IS LOOSE', 'AND THE SLOTS SHUT IN TURN.'],
        feature: 'dog', theme: 'gala', time: 60, par: 160, dive: 0.6, parcel: true,
        weaver: { rows: [8, 9], speed: 88, cruise: 2.4 },
        train: { speed: 150, len: 176, every: 8, spread: 3 },
        dog: { trot: 16, chase: 30 },
        flaps: { every: 5, warn: 1.0, shut: 3.0 },
        lanes: [
            { row: 1, kind: K.Log, dir: -1, speed: 30, size: 64, water: 2.8 },
            { row: 2, kind: K.Turtles, dir: +1, speed: 34, size: 2, water: 2.6 },
            { row: 3, kind: K.Log, dir: -1, speed: 38, size: 64, water: 3.0, beast: true },
            { row: 4, kind: K.Log, dir: +1, speed: 26, size: 48, water: 2.6 },
            { row: 5, kind: K.Turtles, dir: -1, speed: 32, size: 3, water: 2.6 },
            { row: 7, kind: K.Bus, dir: -1, speed: 30, gap: 3.5, spread: 2 },
            { row: 8, kind: K.Van, dir: +1, speed: 38, gap: 3.5, spread: 3 },
            { row: 9, kind: K.Sports, dir: +1, speed: 58, gap: 4.0, spread: 4 },
            { row: 10, kind: K.Train, dir: -1 },
            { row: 11, kind: K.Truck, dir: +1, speed: 30, gap: 3.2, spread: 2 },
            { row: 12, kind: K.Car, dir: -1, speed: 28, gap: 3.2, spread: 3 },
        ],
    },
]);
