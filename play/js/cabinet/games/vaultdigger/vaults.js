// THE NODE · world 1 · VAULT DIGGER · THE FIVE VAULTS (hand-built, data only).
//
// A coin buys the whole heist: five vaults, each 18 x 12 tiles, each with one new idea, and the last
// one (BANK OF THE CROWN: the strongroom, the warden and the crown's alarm) is the finale: clear it and the
// game is won. (The sim also knows conveyor belts, '<' '>'; no vault uses them yet.)
//
//   #  brick (dig it)          =  stone (it will not dig)     X  cracked brick (it will not hold you)
//   H  ladder                  -  bar (hand over hand)        S  the exit ladder (rises when the vault is empty)
//   <  >  a conveyor belt (it carries whatever stands on it, that way)
//   D  strongroom bars (the key opens them)    K  the key    Q  the crown (take it and the alarm rings)
//   $  gold                    P  the runner
//   G  a guard    C  a guard with the payroll sack (trap him and he drops it)    W  the warden (never falls in)
//
// Each vault: the card's name and one-line hint, the featured new thing (the card's picture), the guards'
// pace (x the guardSpeed knob) and hunt (+ the guardPathing knob), and the bonus clock it starts with.
// The sim proves each vault fair when it loads it (VaultMap.proof): every piece of gold, the key and the
// crown can be reached (digging down through brick counts), and from every tile you can get into, the exit
// can still be reached, so nothing is a dead end.

export const VAULTS = Object.freeze([
    {
        name: 'THE COUNTING HOUSE',
        hint: 'DIG A HOLE AND A GUARD FALLS IN',
        feature: 'trap',
        pace: 0.92, hunt: -0.12, bonus: 2000,
        map: [
            '.........S........',
            '.$.......S..G...$.',
            '###H##########H###',
            '...H----------H...',
            '$..H....$.....H..$',
            'H######....H######',
            'H....------H......',
            'H..$...G.$.H..$...',
            '#####H##########H#',
            '.....H..........H.',
            '$....H...P...$..H$',
            '=####=##########==',
        ],
    },
    {
        name: 'THE PAYROLL',
        hint: 'TRAP A SACK MAN AND HE DROPS HIS GOLD',
        feature: 'sack',
        pace: 0.95, hunt: -0.06, bonus: 3000,
        map: [
            '..............S...',
            '.$...C........S.$.',
            '####H######H######',
            '....H......H......',
            '$...H..$...H...C.$',
            '#H######H#####H###',
            '.H......H.----H...',
            '.H.$....H.....H.$.',
            '####H####H####H###',
            '....H....H....H...',
            '$...H..P.H...GH..$',
            '##################',
        ],
    },
    {
        name: 'THE CRACKED FLOOR',
        hint: 'CRACKED BRICK WILL NOT HOLD YOU',
        feature: 'crack',
        pace: 0.97, hunt: -0.05, bonus: 3000,
        map: [
            '........S.........',
            '.$..-.$.S..$..G$..',
            'H###X######X#####H',
            'H................H',
            'H.$...$.G.$.....$H',
            'H#####X##H###X###H',
            'H........H.......H',
            'H$...G...H..$..$.H',
            'H##X#####H##X####H',
            'H........H.......H',
            'H.$...P..H...$...H',
            '##################',
        ],
    },
    {
        name: 'THE STONE CELLAR',
        hint: 'STONE WILL NOT DIG. DIG DOWN TO THE GOLD',
        feature: 'stone',
        pace: 0.92, hunt: -0.12, bonus: 2500,
        map: [
            '.......S..........',
            '.$.....S...G...$..',
            '##H=====###===H###',
            '..H...........H...',
            '$.H.......$.G.H..$',
            '==H===#####===H===',
            '..H..=.....=..H...',
            '$.H..=.$.$.=..H.$.',
            '##H##=====.=##H###',
            '..H...........H...',
            '$...P.....$...H..$',
            '#####=====########',
        ],
    },
    {
        name: 'BANK OF THE CROWN',
        hint: 'TAKE THE KEY, THEN THE CROWN, THEN RUN',
        feature: 'warden',
        pace: 0.92, hunt: -0.1, bonus: 4500,
        map: [
            '...............S..',
            '.$...G...K.....S.$',
            '###H#######H###=##',
            '...H.......H......',
            '$..H...W...H...$..',
            '#####H########H###',
            '.....H.====...H...',
            '.$...H.DQ$D.G.H.$.',
            '####H##====##H####',
            '....H........H....',
            '$...H..P...$.H...$',
            '##################',
        ],
    },
]);
