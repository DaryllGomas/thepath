// THE NODE · world 1 · WARLORD'S ROAD · THE ROAD: three stages, their waves and bosses (data only).
//
// A stage is a strip `len` px long. The camera scrolls right with the hero and LOCKS at each wave's `at`
// (camera x) until the wave is beaten, then GO. The last wave is the boss, at the end of the strip.
// A wave is a list of groups; a group comes in when the wave has `when` or fewer foes standing
// (the first group at once). Spawn sides: 'L' / 'R' walk in from that edge, 'rise' climbs out of the
// ground on screen (skeletons), 'ride' comes in mounted on a beaked lizard.
// `thief` sends a little thief across during the wave: 'blue' carries MAGIC POTS, 'green' carries MEAT.
export const Stages = Object.freeze([
    {
        name: 'THE BURNED VILLAGE', short: 'VILLAGE', len: 1320,
        waves: [
            { at: 0, groups: [{ when: 9, foes: [['raider', 'R'], ['raider2', 'R']] }], thief: 'blue' },
            { at: 290, groups: [{ when: 9, foes: [['raider', 'L'], ['axeman', 'R']] }] },
            { at: 620, groups: [{ when: 9, foes: [['rider', 'R'], ['raider', 'L']] }], thief: 'green' },
            { at: 1016, boss: 'THE HEADSMAN', groups: [{ when: 9, foes: [['headsman', 'R'], ['raider2', 'L']] }] },
        ],
    },
    {
        name: 'THE BLACKWOOD ROAD', short: 'FOREST', len: 1340,
        waves: [
            { at: 0, groups: [{ when: 9, foes: [['skeleton', 'rise'], ['skeleton', 'rise']] }], thief: 'blue' },
            { at: 290, groups: [{ when: 9, foes: [['soldier', 'R'], ['raider', 'L']] }, { when: 1, foes: [['raider2', 'R']] }] },
            { at: 620, groups: [{ when: 9, foes: [['rider', 'R'], ['skeleton', 'rise']] }], thief: 'green' },
            { at: 1036, boss: 'THE TWIN GIANTS', groups: [{ when: 9, foes: [['giant', 'R'], ['giantB', 'L']] }] },
        ],
    },
    {
        name: 'THE CLIFF CASTLE', short: 'CASTLE', len: 1320,
        waves: [
            { at: 0, groups: [{ when: 9, foes: [['soldier', 'R'], ['raider2', 'L']] }], thief: 'blue' },
            { at: 290, groups: [{ when: 9, foes: [['skeleton', 'rise'], ['rider', 'L']] }] },
            { at: 620, groups: [{ when: 9, foes: [['soldier2', 'R'], ['axeman', 'L']] }], thief: 'blue' },
            { at: 1016, boss: 'THE WARLORD', groups: [{ when: 9, foes: [['warlord', 'R']] }] },
        ],
    },
]);
