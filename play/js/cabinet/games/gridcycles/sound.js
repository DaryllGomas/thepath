// THE NODE · GRID CYCLES · pulse motors, the warning bus and derez noise.
import { floorSound } from '../../sound/palettes/floor.js';
export const SOUND = floorSound('gridcycles', 'GRID CYCLES', 220, {
    sounds: {
        boost: { label: 'Cycle overdrive', group: 'play', desc: 'a rising pulse motor', layers: [{ wave:'pulse', duty:0.25, f:110, sweep:{to:4,t:0.3}, env:{a:0.01,d:0.5,v:0.055}, lp:1800 }], gap:0.2 },
        crash: { label:'Derez', group:'play', desc:'digital debris falling through the grid', layers:[{wave:'noise',f:2600,sweep:{to:0.15,t:0.4},env:{a:0.001,d:0.5,v:0.09},lp:2400},{wave:'pulse',f:140,sweep:{to:0.2,t:0.35},env:{a:0.001,d:0.4,v:0.05}}],gap:0.2 },
    },
    events: {
        stageStart:s=>s.play('start'), stageClear:s=>s.play('bonus'), boss:s=>s.play('miss',{pitch:-5}),
        extraLife:s=>s.play('bonus',{pitch:12}), boost:s=>s.play('boost'), rivalBoost:s=>s.play('boost',{pitch:-7}),
        crash:s=>s.play('crash'), seal:s=>s.play('miss'), purge:s=>s.play('bonus',{pitch:-12}),
    },
    cues: { Start:null, Hit:null, Die:null },
});
