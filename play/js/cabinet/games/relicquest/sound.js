// THE NODE · RELIC QUEST · gold chimes, iron blades and the guardian's low call.
import { floorSound } from '../../sound/palettes/floor.js';
export const SOUND = floorSound('relicquest', 'RELIC QUEST', 330, {
    sounds: {
        sword: { label: 'Sword sweep', group: 'play', desc: 'A short iron hiss', layers: [{wave:'noise',f:3200,lp:2400,env:{a:0.002,d:0.12,v:0.06}}], gap:0.15 },
        guardian: { label: 'Guardian wakes', group: 'play', desc: 'A low trembling warning', layers: [{wave:'tri',f:82.5,sweep:{to:1.5,t:0.5},env:{a:0.05,d:0.7,v:0.12}}],gap:0.5 },
        gem: { label: 'Ruby collected', group: 'play', desc: 'A bright temple chime', layers: [{wave:'tri',f:990,sweep:{to:1.33,t:0.08},env:{a:0.001,d:0.16,v:0.07}}],gap:0.03 },
    },
    events: {
        sword:s=>s.play('sword'), torch:s=>s.play('bonus'), gem:s=>s.play('gem'),
        key:s=>s.play('bonus'), wake:s=>s.play('guardian'), bossWarn:s=>s.play('guardian'),
        bossHit:s=>s.play('hit'), bossDown:s=>s.play('bonus'), extraLife:s=>s.play('bonus'),
        stageStart:s=>s.play('start'), stageClear:s=>s.play('bonus'),
    },
    silent: {bite:'SDK Die cue',stun:'SDK Hit cue',questWon:'SDK Win cue'},
});
