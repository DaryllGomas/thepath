// THE NODE · the web game.
// THE HANDSHAKE (js/handshake.js: the terminal the site opens on) -> white -> the cold open on the couch
// (ColdOpen.cs timings) -> the basement's beats (HomeStory / BBSBoard / LightningCat / DoorSwing) -> out the
// areaway -> the ride down -> the Junction (Starvector on its floor: THE ARCADE ANSWERS, js/answer.js) -> the delivery -> the cabinet
// with no name (its seven games: js/cabinet/seven/) -> the ending (js/ending.js: the token, the pull, white). #basement skips the
// Handshake to the old title screen. The first flashes live in js/flashes.js.
import * as THREE from 'three';
import { Handshake } from './handshake.js';
import { loadOutside, OutdoorBody } from './outside.js';
import { Delivery, loadDeliveryModels } from './delivery.js';
import { FLOOR, dressCabinet, cabinetPose, addJunctionClock } from './arcade.js';
import { ArcadeAnswers, ANSWER } from './answer.js';
import { JunctionJukebox } from './jukebox.js';
import { StarvectorTrigger, SV_TRIGGER } from './starvector_answer.js';     // Starvector (the super-scaler) -> the room
import { loadBasement, bakeReflections } from './world.js';
import { Pipeline } from './post.js';
import { Player } from './player.js';
import { Slides, BBS, BBS_POSTS, Cabinet, loadCabinetRuntime } from './screens.js';
import { PITCH_HTML } from './pitch.js';
import { Ending } from './ending.js';        // (its NamelessScreen, the retired ring puzzle's tube, stays there archived, unused)
import { Flashes } from './flashes.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const canvas = $('view');

// ---------------------------------------------------------------- settings (per viewer, optional)
// v2: the default look is CLEAN (full resolution, anti-aliased); retro is one V away
const settings = { look: 'clean', sens: 1, invert: false, vol: 0.7 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('node.settings.v2') || '{}')); } catch (e) { /* private window */ }
const saveSettings = () => { try { localStorage.setItem('node.settings.v2', JSON.stringify(settings)); } catch (e) { /* fine */ } };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// the render's pixel ratio: the screen's own pixels, capped at 1.5, and at 1.25 once the window is big (a big or high-DPI window is
// the costly case: 4x multisampled HDR at full resolution). On top of that a slow machine steps it down on its own (adaptRes).
const DRS = { cap: 1, ratio: 1, slow: 0, fast: 0, min: 0.7, steps: 0 };
const basePR = () => { let r = Math.min(devicePixelRatio || 1, 1.5); if (innerWidth * innerHeight > 1.4e6) r = Math.min(r, 1.25); return r; };
DRS.cap = DRS.ratio = basePR();
renderer.setPixelRatio(DRS.ratio);
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const pipe = new Pipeline(renderer);
pipe.mode = settings.look;
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 80);
function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  DRS.cap = basePR(); DRS.ratio = Math.min(DRS.ratio, DRS.cap); if (!DRS.steps) DRS.ratio = DRS.cap; renderer.setPixelRatio(DRS.ratio);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pipe.resize(w, h);
  sevenScale();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- state
let fixedCam = null, ready = false, W = null, player = null, bbs = null, bbsScreen = null, tv = null, runtime = null;
const cabs = {};
const floorScr = {};                                                 // id -> the floor cabinet's screen (the full-screen glide)
let activeId = null;                                                 // the id of the cabinet being played
const cabAcc = {}, HOME_SCREEN = { homecab_starvector: 'M_CRT_Starvector', homecab_relicquest: 'M_CRT_RelicQuest', homecab_gridcycles: 'M_CRT_GridCycles' };
const _vp = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sp = new THREE.Sphere();
let state = 'loading';          // loading | title | intro | play | screen | waitOut | leaving | end
let paused = false, t0 = 0, clock = 0, introT = 0, releasedAt = 0, outFailed = false;
let hs = null, introWhite = false, loadError = null, markReady = null;
// outdoors (js/outside.js): loaded behind the basement; the areaway hands the controls to OutdoorBody
let OUT = null, outBody = null, basementGroup = null, region = 'in', leaveT = -1, leaveFrom = null, duskPlane = null;
let bikeRig = null, bikeParked = null, baseFog = null, baseBg = null, outFog = null, doorPivots = [], doorsT = -1;
const fillers = [], flynnView = {};
let delivery = null, seven = null, ending = null, SevenMod = null;   // seven: the cabinet with no name's tube (js/cabinet/seven/)
let polyScreen = null;                                               // its screen ({ mesh, material, center, normal }): the glide, the mouse
let jukebox = null;                                                  // the Junction's jukebox (js/jukebox.js): its song is the room's music for js/answer.js
let answer = null;                                                   // THE ARCADE ANSWERS, the room's side (js/answer.js): knocks, tables, the van
let svTrigger = null;                                                // today's Starvector calling it (js/starvector_answer.js)
const flashes = new Flashes(), floorWatch = [];
const POLY_SCREEN = 'Outside/Flynns/FlynnsInterior/PolybiusSpot/Visual/PolybiusCab/Screen';
const LEAVE_TO = new THREE.Vector3(3.78, 0, -7.75);
const basementReady = new Promise((r) => { markReady = r; });
let screenMode = null, activeCab = null;
const S = { quarters: 0, kept: false, beaten: new Set(), lastRead: 0, bowl: false, used: false, idleHint: false, nudge1: false, nudge2: false, firstWinAt: 0, tape: 0, sheenTick: 0 };
const keys = new Set(), taps = new Set();

// ---------------------------------------------------------------- HUD
let lineTimer = 0;
let lookShowing = false;    // the line on screen is one of the basement's looks (another look may replace it; a story line is never replaced by one)
function line(text, secs = 4, cls = null) { lookShowing = false; $('lineText').textContent = text; $('line').classList.toggle('faint', cls === 'faint'); $('line').classList.add('on'); lineTimer = secs; }
function setPrompt(text) {
  if (text) { $('promptText').textContent = text; $('prompt').classList.add('on'); } else $('prompt').classList.remove('on');
}
function pocket() {
  if (!S.kept) return;
  const spend = S.quarters - (S.kept ? 1 : 0);
  $('pocketText').innerHTML = 'QUARTERS ' + S.quarters + ' ' + '<span class="coin kept"></span>'.repeat(S.kept ? 1 : 0) + '<span class="coin"></span>'.repeat(Math.max(0, spend));
  $('pocket').classList.add('on');
}
function cabHint(mode) {
  const el = $('cabhint');
  // at the cabinet with no name the glass fills the view: the hint sits on a dark pill so it reads over the picture
  const pill = !!mode && mode !== 'bbs';
  el.style.background = pill ? 'rgba(8, 6, 4, 0.74)' : ''; el.style.padding = pill ? '6px 16px' : ''; el.style.borderRadius = pill ? '4px' : '';
  if (!mode || mode === 'seven:none') { el.classList.remove('on'); return; }   // (none: the seven's passage, nothing left to press)
  const k = (t) => '<span class="key">' + t + '</span>';
  const away = '<span>' + k('&#9003;') + ' WALK AWAY</span>';
  el.innerHTML = {
    bbs: '<span>' + k('E') + ' NEXT</span><span>' + k('&#9003;') + ' LOG OFF</span>',
    gridcycles: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' STEER</span>' + away,
    starvector: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' FLY</span><span>' + k('SPACE') + ' FIRE</span><span>' + k('X') + ' BARREL ROLL</span>' + away,
    relicquest: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' WALK</span><span>' + k('SPACE') + ' SWORD</span><span>' + k('X') + ' TORCH</span>' + away,
    sunsetdrive: '<span>' + k('&larr;') + k('&rarr;') + ' STEER</span><span>' + k('SPACE') + ' GAS</span><span>' + k('X') + ' BRAKE</span>' + away,
    afterglow: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' FLY</span><span>' + k('SPACE') + ' MISSILES</span><span>' + k('X') + ' BARREL ROLL</span>' + away,
    warlordsroad: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' MOVE</span><span>' + k('SPACE') + ' ATTACK</span><span>' + k('X') + ' JUMP</span>' + away,
    deepkeep: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' MOVE</span><span>' + k('SPACE') + ' FIRE</span><span>' + k('X') + ' POTION</span>' + away,
    svEntry: '<span>' + k('&uarr;') + k('&darr;') + ' LETTER</span><span>' + k('SPACE') + ' ENTER</span><span>' + k('X') + ' BACK</span>',   // Starvector's name entry (js/starvector_answer.js)
  }[mode] || sevenHint(mode, k, away) || ('<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' MOVE</span><span>' + k('SPACE') + ' A</span><span>' + k('X') + ' B</span>' + away);
  el.classList.add('on');
}
// the cabinet with no name: the controls of the game on its glass ('seven:<id>'), or its first coin's notice ('seven:notice')
function sevenHint(mode, k, away) {
  if (!SevenMod || !mode || !mode.startsWith('seven:')) return null;
  const id = mode.slice(6), G = id === 'notice' ? { controls: SevenMod.NOTICE_CONTROLS } : SevenMod.GAMES.find((g) => g.id === id);
  if (!G) return null;
  return G.controls.map(([ks, label]) => '<span>' + ks.map(k).join('') + ' ' + label + '</span>').join('') + (id === 'notice' ? '' : away);
}
let toastT = 0;
function toast(text) { line(text, 1.6); toastT = 1.6; }

// ---------------------------------------------------------------- audio (recordings only)
const listener = new THREE.AudioListener(); camera.add(listener);
const bed = new THREE.Audio(listener);
let tapeAudio = null; const buffers = {};
const audioLoader = new THREE.AudioLoader();
function loadAudio(name) { return new Promise((res) => audioLoader.load('assets/audio/' + name, (b) => { buffers[name] = b; res(b); }, undefined, () => res(null))); }
// THE CABINET WITH NO NAME's sound (js/cabinet/seven/sound.js): one chip, on this listener, out of a source at its glass. Made after
// the player's first gesture (startAudio) and once the tube exists, whichever comes last; the tube calls it (seven.snd).
let audioOn = false, sevenSnd = null, sevenSndMaking = false, sevenFullK = 0;
// STARVECTOR's sound at its own glass (the floor machine): the same chip and wiring as the cabinet with no name (seven/sound.js), its
// palette js/cabinet/sound/palettes/starvector.js. Made after the first gesture and once the floor's cabinets exist, whichever is last.
let svSnd = null, svSndMaking = false, svSndOn = false;
async function initSvSound() {
  if (svSnd || svSndMaking || !audioOn || !cabs.fcab_starvector || !flynnView.fcab_starvector) return;
  svSndMaking = true;
  try {
    const M = await import('./cabinet/seven/sound.js');
    const s = new M.SevenSound({ ctx: listener.context, out: listener.getInput() });
    const t = flynnView.fcab_starvector.target; s.place(t.x, t.y, t.z);
    if (paused) s.pause(true);
    svSnd = s;
  } catch (e) { console.error('[starvector] its sound could not start', e); }
  svSndMaking = false;
}
const svAdapter = {                                    // what the palette reads: the game's mode, its sim, the sim's own events
  get mode() { const c = cabs.fcab_starvector; return c && c.runner && c.runner.phase === 'playing' ? 'play' : 'attract'; },
  get sim() { const c = cabs.fcab_starvector; return c && c.runner ? c.runner.sim : null; },
  get events() { const s = this.sim; return s && s.recordEvents ? s.events.splice(0) : []; },
};
function svSoundFrame(dt) {
  const c = cabs.fcab_starvector, on = !!c && c === activeCab && !!c.runner;
  if (on) { svSnd.update(camera, 1); if (c.runner.sim) c.runner.sim.recordEvents = true; svSnd.game(svAdapter, 'starvector', dt); svSndOn = true; }
  else if (svSndOn) { svSnd.leave(); if (c && c.runner && c.runner.sim) c.runner.sim.recordEvents = false; svSndOn = false; }
}
async function initSevenSound() {
  if (sevenSnd || sevenSndMaking || !audioOn || !seven || !polyScreen) return;
  sevenSndMaking = true;
  try {
    const M = await import('./cabinet/seven/sound.js');
    const s = new M.SevenSound({ ctx: listener.context, out: listener.getInput() });
    s.place(polyScreen.center.x, polyScreen.center.y, polyScreen.center.z);
    if (paused) s.pause(true);
    sevenSnd = s; seven.snd = s;
  } catch (e) { console.error('[seven] its sound could not start', e); }
  sevenSndMaking = false;
}
function startAudio() {
  audioOn = true; initSevenSound(); initSvSound();
  try { if (listener.context.state !== 'running') listener.context.resume(); } catch (e) { /* no audio */ }
  listener.setMasterVolume(settings.vol);
  if (buffers['juke_06.mp3'] && !bed.isPlaying) { bed.setBuffer(buffers['juke_06.mp3']); bed.setLoop(true); bed.setVolume(0.35); bed.play(); }
}

// ---------------------------------------------------------------- interactables
const LABEL = { homecab_starvector: 'STARVECTOR', homecab_relicquest: 'RELIC QUEST', homecab_gridcycles: 'GRID CYCLES',
  fcab_starvector: 'STARVECTOR', fcab_relicquest: 'RELIC QUEST', fcab_gridcycles: 'GRID CYCLES' };
const SCREEN = { homecab_starvector: 'M_CRT_Starvector', homecab_relicquest: 'M_CRT_RelicQuest', homecab_gridcycles: 'M_CRT_GridCycles' };
const CART = { homecab_starvector: 'starvector', homecab_relicquest: 'relicquest', homecab_gridcycles: 'gridcycles',
  fcab_starvector: 'starvector', fcab_relicquest: 'relicquest', fcab_gridcycles: 'gridcycles' };
const spendable = () => Math.max(0, S.quarters - (S.kept ? 1 : 0));
const floorCabs = new Map();                                           // Flynn's floor: id -> { p, acc }
const paid = (id) => id.startsWith('fcab_') || id.startsWith('fc_');
let interactables = [];
// THINGS TO LOOK AT in the basement: walk up to a prop, the prompt says LOOK, one short thought in the kid's voice. Each is a quiet
// nudge downtown to the Junction. Built here from the named props' boxes (W.bounds, glTF node names with the slashes dropped);
// never a story beat, never blocking: a press while a story line shows waits for it (see lookPending).
const LOOKS = [
  { id: 'look_table', nodes: ['GameTable', 'DMScreen', 'DMNotes', 'CharSheet', 'DungeonMap'], radius: 1.4, lines: ["The guys aren't here yet. No game till they show up. Soon."] },
  { id: 'look_cork', nodes: ['Corkboard'], radius: 1.9, up: true,   // it hangs right above the BBS monitor: you have to be looking UP at it to get LOOK there
    lines: ['Me and the guys. Downtown, last summer.', "Every high score at the Junction, copied down. One's still blank: Starvector."] },
  { id: 'look_poster0', nodes: ['Poster0'], radius: 1.4, lines: ['Beat the game, get taken to the stars. Yeah, right.'] },
  { id: 'look_poster2', nodes: ['Poster2'], radius: 1.4, lines: ['They finally got Grid Cycles at the Junction.'] },
  { id: 'look_clock', nodes: ['WallClock'], radius: 1.4, lines: ['3:33. It said that last time I looked, too.'] },
  { id: 'look_console', nodes: ['GameConsole'], radius: 1.2, lines: ['The home version. Blocky. The real ones are downtown.'] },
];
const lookSeen = {};
let lookPending = null;      // { id, at }: pressed while a story line was showing
function buildInteractables() {
  interactables = W.meta.interactables.map((i) => ({ ...i, enabled: true, p: new THREE.Vector3(...i.pos) }));
  for (const L of LOOKS) {
    const box = new THREE.Box3();
    for (const k of Object.keys(W.bounds)) if (L.nodes.some((n) => k.startsWith(n))) box.union(W.bounds[k]);
    if (box.isEmpty()) { console.warn('[look] no prop found for', L.id); continue; }
    interactables.push({ id: L.id, kind: 'look', prompt: 'Look', radius: L.radius, maxRise: 0, region: 'in', enabled: true, up: !!L.up, p: box.getCenter(new THREE.Vector3()), lines: L.lines });
  }
}
function showLook(i) {
  const n = lookSeen[i.id] = (lookSeen[i.id] || 0) + 1;
  line(i.lines[Math.min(n - 1, i.lines.length - 1)], n === 1 ? 4.5 : 3);
  lookShowing = true;
}
function promptFor(i) {
  if (i.kind === 'look') return 'LOOK';
  switch (i.id) {
    case 'cushions': return 'DIG IN THE CUSHIONS';
    case 'bowl': return "FILL LIGHTNING'S BOWL";
    case 'bbs': return S.lastRead < BBS_POSTS.length ? 'READ THE BOARD · NEW POSTS' : 'READ THE BOARD';
    case 'stairs_door': return 'OPEN';
    case 'jukebox': return 'PICK A TAPE';
    case 'areaway': return 'GO OUTSIDE';
    case 'bike': return 'GET ON THE BIKE';
    case 'flynns_door': return "GO INTO THE JUNCTION";
    case 'change': return 'GET CHANGE';
    case 'junction_juke': return 'PICK A SONG';
    case 'polybius': return seven && !seven.needsCoin ? 'PLAY' : spendable() > 0 ? 'INSERT COIN' : 'NO QUARTERS';
    default:
      if (paid(i.id)) return spendable() > 0 ? 'INSERT COIN · ' + LABEL[i.id] : LABEL[i.id] + ' · NO QUARTERS';
      return LABEL[i.id] ? 'PLAY ' + LABEL[i.id] : (i.prompt || 'USE').toUpperCase();
  }
}
function pick() {
  const f = player.forward();
  let best = null, bestScore = 1e9;
  for (const i of interactables) {
    if (!i.enabled || (i.region || 'in') !== region) continue;
    const dx = i.p.x - player.pos.x, dz = i.p.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (i.kind === 'look') {
      // a look needs you close and squarely facing the prop, and it only ever outranks a real action if you are looking UP at it (the corkboard)
      if (d > i.radius + 0.2 || d < 0.05 || i.p.y > player.pos.y + 2.4 || i.p.y < player.pos.y - 0.8) continue;
      const ld = (dx * f.x + dz * f.z) / d;
      if (ld < 0.8) continue;
      if (i.up && player.pitch < 0.2) { const s = 50 + d - ld * 0.6; if (s < bestScore) { bestScore = s; best = i; } continue; }
      const s = (i.up ? -50 : 50) + d - ld * 0.6;      // (the looking-up corkboard beats anything; every other look yields to any real action)
      if (s < bestScore) { bestScore = s; best = i; }
      continue;
    }
    if (d > i.radius + 0.35) continue;
    if (i.p.y > player.pos.y + 2.4 + (i.maxRise || 0) || i.p.y < player.pos.y - 0.8) continue;
    // the couch you are sitting on counts as in front of you; everything else has to be faced
    const dot = d < (i.id === 'cushions' ? 1.0 : 0.45) ? 1 : (dx * f.x + dz * f.z) / d;
    if (dot < 0.3) continue;
    const s = d - dot * 0.6;
    if (s < bestScore) { bestScore = s; best = i; }
  }
  return best;
}
function use(i) {
  S.used = true;
  if (i.kind === 'look') {
    if (lineTimer > 0 && !lookShowing) lookPending = { id: i.id, at: clock };   // a story line is up: the thought waits its turn
    else showLook(i);
    return;
  }
  switch (i.id) {
    case 'cushions':
      S.quarters += 2; S.kept = true; i.enabled = false; pocket();
      line("Two quarters. One of them you'll never spend.", 4.5); break;
    case 'bowl':
      S.bowl = true; i.enabled = false; for (const m of W.kibble) m.visible = true;
      catRoute([1]); break;
    case 'bbs': openBoard(); break;
    case 'stairs_door': line("Mom's asleep. Not that way.", 3); break;
    case 'jukebox': pickTape(i); break;
    case 'areaway': goOutside(); break;
    case 'bike': mountBike(); break;
    case 'flynns_door': openFlynnsDoors(i); break;
    case 'change': getChange(); break;
    case 'junction_juke': if (jukebox) { jukebox.next(); line('The jukebox thunks. Next song.', 2.2); } break;
    case 'polybius':
      // the cabinet with no name takes a quarter like any other (the one you keep is never spent); a credit it already holds
      // (a game won, the next one waiting) plays without one
      if (!seven || !seven.canStart) break;                // its first game is still being made (a moment after the van)
      if (seven.needsCoin && !payCabinet()) break;
      openCabinet('polybius'); break;
    default:
      if (paid(i.id)) {
        if (spendable() <= 0) { line('Out of quarters. The change machine is by the door.', 3.5); break; }
        S.quarters--; pocket(); openCabinet(i.id); break;
      }
      if (CART[i.id]) openCabinet(i.id);
  }
}
function payCabinet() {
  if (spendable() <= 0) { line('Out of quarters. The change machine is by the door.', 3.5); return false; }
  S.quarters--; pocket(); seven.coin(); return true;
}
function pickTape(i) {
  const list = ['juke_02.mp3', 'juke_09.mp3', null];
  const name = list[S.tape % list.length]; S.tape++;
  if (tapeAudio) { if (tapeAudio.isPlaying) tapeAudio.stop(); }
  if (!name) { line('The jukebox clicks off.', 2.5); return; }
  if (!tapeAudio) { tapeAudio = new THREE.PositionalAudio(listener); tapeAudio.setRefDistance(1.5); tapeAudio.position.copy(i.p); W.scene.add(tapeAudio); }
  if (buffers[name]) { tapeAudio.setBuffer(buffers[name]); tapeAudio.setLoop(true); tapeAudio.setVolume(0.9); tapeAudio.play(); }
  line(S.tape === 1 ? 'Side A.' : 'Side B.', 2);
}

// ---------------------------------------------------------------- screens: the board and the cabinets
function screenOf(name) { return W.screens[name]; }
function faceRoom(s) {
  const toRoom = new THREE.Vector3(0, s.center.y, 0).sub(s.center);
  if (s.normal.dot(toRoom) < 0) s.normal.negate();
  return s;
}
function openBoard() {
  const s = faceRoom(screenOf('M_CRT_BBS'));
  state = 'screen'; screenMode = 'bbs';
  player.lookAt(s.center, s.normal, Math.max(s.size.y, 0.25) * 1.25 + 0.08);
  bbs.read(0); S.lastRead = Math.max(S.lastRead, 1);
  setPrompt(null); cabHint('bbs'); setBoost(true);
}
function openCabinet(id) {
  const cab = cabs[id]; if (!cab) return;
  state = 'screen'; screenMode = 'cab'; activeCab = cab; activeId = id;
  if (flynnView[id]) player.lookAtPose(flynnView[id].pos, flynnView[id].target);
  else { const s = faceRoom(screenOf(SCREEN[id])); player.lookAt(s.center, s.normal, Math.max(s.size.y, 0.3) * 0.98 + 0.06); }
  cab.onOver = (won) => {
    // the cabinet with no name: the Tunnel's passage has played on its own tube (the run is won); the ending takes it from here
    if (id === 'polybius' && won) { beginEnding(); return; }
    if (won) markBeaten(id);
    setTimeout(() => { if (state === 'screen' && activeCab === cab) closeScreen(); }, 900);
  };
  cab.start();
  if (id === 'fcab_starvector' && svTrigger) svTrigger.coin();
  setPrompt(null); cabHint(id === 'polybius' ? 'seven:' + seven.hint : CART[id]); setBoost(true);
  S.sevenHint = null; S.sevenPrompt = undefined;
  if (id === 'polybius') sevenScale();
  // a run starts or goes on: in, to full screen (every playable cabinet: the glass fills the view, 4:3 inside it)
  if (cabGeo(id)) { sevenCam.on = true; sevenCam.id = id; sevenCam.t = 0; sevenCam.out = null; }
}
// a won round. Only the floor's Starvector brings the van (js/starvector_answer.js takes its last wave before a win is ever
// reported, and THE ARCADE ANSWERS, js/answer.js, brings it); every other win, at home or on the floor, is just a win.
function markBeaten(id) {
  const game = CART[id] || id;
  S.beaten.add(game);
  if (!S.firstWinAt) S.firstWinAt = clock;
  setTimeout(() => line('You beat ' + (LABEL[id] || game) + '.', 3), 1200);
}
function closeScreen() {
  if (screenMode === 'cab' && activeCab && sevenCam.on) {        // walking away: glide back out
    sevenCam.on = false; sevenCam.out = { p: camera.position.clone(), q: camera.quaternion.clone(), t: 0, id: sevenCam.id };
    if (activeCab === seven) sevenMouseOff();
  }
  if (screenMode === 'cab' && activeCab && activeCab.playing) activeCab.abort();
  if (screenMode === 'bbs') bbs.close();
  screenMode = null; activeCab = null; activeId = null; state = 'play';
  player.release(); cabHint(null); setBoost(false); setPrompt(null);
}
function setBoost(on) { pipe.boost = on; pipe.resize(pipe.w, pipe.h, true); }
function screenKey(code) {
  if (((svTrigger && svTrigger.locked) || (answer && answer.locked)) && answerFromGlass()) return;   // the freeze, the name entry, the step back: the machine has you
  if (screenMode === 'bbs' && !bbs.typing && bbs.more && (code === 'KeyE' || code === 'Enter' || code === 'Space')) {
    bbs.read(bbs.index + 1); S.lastRead = Math.max(S.lastRead, bbs.index + 1); return;
  }
  if (code === 'Backspace' || (screenMode === 'bbs' && !bbs.typing && (code === 'KeyE' || code === 'Enter' || code === 'Space'))) { closeScreen(); return; }
  // at the cabinet with no name, after a lost game: E puts another quarter in and the run goes on, on that game
  if (code === 'KeyE' && screenMode === 'cab' && seven && activeCab === seven && seven.needsCoin) { if (payCabinet()) seven.start(); return; }
  if (screenMode === 'bbs' && bbs.typing && (code === 'KeyE' || code === 'Enter' || code === 'Space')) bbs.finish();
}
function cabInput() {
  // a tap shorter than a frame still counts for one frame
  const k = new Set([...keys, ...taps]); taps.clear();
  if (runtime && runtime.keyboardToInput) return runtime.keyboardToInput(k);
  const x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  const y = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
  return { x, y, a: keys.has('Space') || keys.has('KeyZ') || keys.has('Enter'), b: keys.has('KeyX') || keys.has('ShiftLeft'), start: keys.has('Enter') };
}

// ---------------------------------------------------------------- Lightning (LightningCat.cs path)
const CAT_NODES = [[2.05, 6.1, 250], [1.6, 6.15, 180], [2.35, 4.9, 0], [2.7, -4.7, 0], [2.8, -6.45, 160]];
const cat = { route: [], eatUntil: 0, stride: 0, where: 'stairs' };
function catShow(pose) { for (const [k, list] of Object.entries(W.poses)) for (const m of list) m.visible = k === pose; }
function catRoute(nodes) { cat.route = nodes.slice(); cat.where = 'walking'; }
function updateCat(dt) {
  if (cat.eatUntil) {
    if (clock < cat.eatUntil) return;
    cat.eatUntil = 0; catRoute([2, 3, 4]);
  }
  if (!cat.route.length) return;
  const [x, z, yaw] = CAT_NODES[cat.route[0]];
  const g = W.cat;
  const dx = x - g.position.x, dz = z - g.position.z, d = Math.hypot(dx, dz);
  const step = 0.7 * dt;
  if (d <= step) {
    g.position.set(x, 0, z);
    const arrived = cat.route.shift();
    if (!cat.route.length) {
      g.rotation.y = -yaw * DEG;
      if (arrived === 1) { cat.where = 'bowl'; catShow('Stand'); cat.eatUntil = clock + 3; }
      else if (arrived === 4) { cat.where = 'areaway'; catShow('Sit'); }
    }
    return;
  }
  g.position.x += (dx / d) * step; g.position.z += (dz / d) * step;
  g.rotation.y = -Math.atan2(dx, -dz);
  cat.stride += dt;
  catShow(Math.floor(cat.stride / 0.2) % 2 === 0 ? 'Walk_A' : 'Walk_B');
}

// ---------------------------------------------------------------- the areaway (DoorSwing: inward, 100 deg, 0.6 s)
let doorT = -1;
function goOutside() {
  // the yard, the hill and the Junction load behind the basement. Until they are attached and their shaders are warm, the
  // door waits with a small '...' and opens by itself when they are (updateWaitOut); there is no end card out here.
  if (!OUT || !S.outsideWarm) {
    if (state !== 'waitOut') { state = 'waitOut'; setPrompt(null); $('wait').classList.add('on'); }
    return;
  }
  $('wait').classList.remove('on');
  state = 'leaving'; leaveT = 0; doorT = 0; setPrompt(null);
  leaveFrom = player.pos.clone(); OUT.group.visible = true; if (duskPlane) duskPlane.visible = false;
}
function updateWaitOut() {
  if (OUT && S.outsideWarm) { goOutside(); return; }
  if (outFailed) { $('wait').classList.remove('on'); state = 'play'; line("The door's stuck.", 3); }
}

// ---------------------------------------------------------------- out the areaway: the door swings, you step through, the yard
function updateLeaving(dt) {
  leaveT += dt;
  if (doorT >= 0 && doorT < 1) { doorT = Math.min(1, doorT + dt / 0.6); const s = doorT * doorT * (3 - 2 * doorT); W.door.rotation.y = -100 * DEG * s; renderer.shadowMap.needsUpdate = true; }
  const k = Math.min(1, Math.max(0, (leaveT - 0.35) / 1.3)), s = k * k * (3 - 2 * k);
  player.pos.lerpVectors(leaveFrom, LEAVE_TO, s);
  const want = 0; let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  player.yaw += d * Math.min(1, dt * 5); player.pitch *= 0.9;
  if (leaveT >= 1.7) enterOutside();
}
function setRegion(r) {
  region = r;
  const out = r === 'out';
  basementGroup.visible = !out; OUT.group.visible = out;
  camera.far = out ? 900 : 80; camera.updateProjectionMatrix();
  W.scene.fog = out ? outFog : baseFog; W.scene.background = out ? null : baseBg;
  bed.setVolume(out ? 0 : 0.35);
}
function enterOutside() {
  setRegion('out');
  outBody.place(LEAVE_TO.x, LEAVE_TO.y, LEAVE_TO.z, 0);
  outBody.sens = settings.sens; outBody.invert = settings.invert; outBody.control = true;
  player = outBody; state = 'play'; S.outAt = clock;
  line('Up the steps. Your bike is in the yard.', 4.5);
  if (!document.pointerLockElement && !navigator.webdriver && !dragLook) setTimeout(() => { if (state === 'play' && !document.pointerLockElement) line('Click to look around.', 3); }, 4800);
}
function updateOutdoors(dt) {
  OUT.update(dt, camera, player.pos.y);
  if (OUT.fogColor) { outFog.color.copy(OUT.fogColor); outFog.density = OUT.fogDensity; }
  for (const s of Object.values(OUT.screens)) s.material.uniforms.time.value = clock;
  for (const f of fillers) f.update(dt);
  // the bike under you: it follows the body, handlebars just ahead of the eye
  if (bikeRig && outBody.bike.mounted) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), outBody.yaw);
    const hb = bikeRig.userData.hb.clone().applyQuaternion(q);
    bikeRig.quaternion.copy(q);
    // grips 0.6 m ahead and 0.3 m under the eye, so the bars sit at the bottom of the view like Unity's rig
    bikeRig.position.copy(outBody.pos).addScaledVector(outBody.forward(), 0.6).sub(new THREE.Vector3(hb.x, 0, hb.z));
    bikeRig.position.y = outBody.pos.y + outBody.eyeNow - 0.3 - hb.y;
  }
  if (doorsT >= 0 && doorsT < 1) {
    doorsT = Math.min(1, doorsT + dt / 0.6); const s = doorsT * doorsT * (3 - 2 * doorsT);
    for (const d of doorPivots) d.pivot.rotation.y = d.angle * s;
    if (doorsT >= 1) OUT.doorsOpen = true;
  }
  // THE DELIVERY: once the arcade has answered (js/answer.js), the van comes
  if (delivery && delivery.t < 0 && S.vanDue) {
    delivery.start(() => { const di = interactables.find((i) => i.id === 'flynns_door'); if (di && di.enabled) openFlynnsDoors(di); }, () => line('No name on it.', 4));
    if (seven) seven.warm();                          // its first games are made (and drawn once) while the van pulls up
  }
  if (delivery) delivery.update(dt);
  flashes.updateFloor(dt, camera, floorWatch, !!S.inFlynns && state !== 'ending' && !(answer && answer.busy) && !(svTrigger && svTrigger.locked));
  const inside = player.pos.x > 72 && player.pos.x < 92 && player.pos.z < -168 && player.pos.z > -182;
  if (inside && jukebox && !jukebox.on) jukebox.start();      // a song (random) starts when you walk in
  if (inside && !S.inFlynns) { S.inFlynns = true;  if (!S.flynnsSeen) { S.flynnsSeen = true; line("The Junction. Three of ours on the left. Change machine by the door.", 5); } }
  // the lino's reflection of the room (js/outside.js SHEEN): one small cube, the first time you are inside
  // (taken a face at a time: from the street, 20 m out, so none of the six draws land on the step through the door)
  if (OUT.captureSheen && !S.sheen && (inside || (player.pos.x > 60 && player.pos.x < 105 && player.pos.z > -200 && player.pos.z < -140 && (++S.sheenTick % 8 === 0)))) S.sheen = OUT.captureSheen(renderer, W.scene);
  if (!S.tubesWarm && (inside || player.pos.z < -140)) { S.tubesWarm = true; for (const id of Object.keys(floorScr)) { const m = floorScr[id].material, t = m && m.uniforms && m.uniforms.map && m.uniforms.map.value; if (t) renderer.initTexture(t); } }
  if (!inside) S.inFlynns = false;
}

// ---------------------------------------------------------------- the bike (BikeController: E on, E off)
function mountBike() {
  const B = outBody.bike; if (B.mounted) return;
  B.mounted = true; B.speed = 0;
  outBody.yaw = bikeParked.userData.yaw;
  bikeParked.visible = false; bikeRig.visible = true;
  const bi = interactables.find((i) => i.id === 'bike'); if (bi) bi.enabled = false;
  if (!S.rode) { S.rode = true; line('W pedals, S brakes, A and D steer. E gets off.', 6); }
}
function dismountBike() {
  const B = outBody.bike; if (!B.mounted) return;
  B.mounted = false; B.speed = 0;
  const right = new THREE.Vector3(Math.cos(outBody.yaw), 0, -Math.sin(outBody.yaw));
  const p = outBody.pos.clone().addScaledVector(right, 0.75);
  const hit = OUT.bvh.raycastFirst(new THREE.Ray(p.clone().setY(p.y + 2), new THREE.Vector3(0, -1, 0)), THREE.DoubleSide);
  if (hit) p.y = hit.point.y;
  bikeParked.position.copy(p);
  bikeParked.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), outBody.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 6 * DEG));
  bikeParked.userData.yaw = outBody.yaw;
  bikeParked.visible = true; bikeRig.visible = false;
  const bi = interactables.find((i) => i.id === 'bike'); if (bi) { bi.enabled = true; bi.p.set(p.x, p.y + 0.6, p.z); }
}

// ---------------------------------------------------------------- THE ARCADE ANSWERS: you step back from the machine
// answer() was called while you stand at Starvector's glass: the camera glides off it to where you stand a step back with the
// room in front of you (ANSWER.step in js/answer.js), and the controls are yours again there, just before the room answers.
function answerFromGlass() { return state === 'screen' && screenMode === 'cab' && !!activeCab && activeCab === cabs.fcab_starvector; }
function answerStepBack(secs, pose) {
  if (!answerFromGlass() || !outBody) return;
  outBody.lookAtPose(new THREE.Vector3(...pose.pos), new THREE.Vector3(...pose.target), secs);
}
function answerRelease(pose) {
  if (!answerFromGlass() || !outBody) return;
  closeScreen();                                      // (the round is already over: nothing is aborted)
  const P = new THREE.Vector3(...pose.pos), T = new THREE.Vector3(...pose.target), d = T.clone().sub(P);
  outBody.place(P.x, P.y - outBody.eyeNow, P.z, Math.atan2(-d.x, -d.z));
  outBody.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
}

// ---------------------------------------------------------------- Flynn's
function openFlynnsDoors(i) { i.enabled = false; doorsT = 0; }
function getChange() {
  const add = Math.max(0, Math.min(4, 12 - S.quarters));
  if (!add) { line('Your pockets are full.', 2.5); return; }
  S.quarters += add; pocket(); line(['', 'One quarter', 'Two quarters', 'Three quarters', 'Four quarters'][add] + '. On the house.', 3);
}
// ---------------------------------------------------------------- the ending (js/ending.js): the token, the lines, the pull, white
function beginEnding() {
  state = 'ending'; screenMode = null; activeCab = null;
  sevenCam.on = false; sevenCam.out = null; sevenMouseOff();       // (js/ending.js blends on from the full-screen pose)
  cabHint(null); setPrompt(null); $('pocket').classList.remove('on');
  const it = interactables.find((i) => i.id === 'polybius'); if (it) it.enabled = false;
  ending.begin();
}
// after the white: a near-white page, one small line, a way to play again. No title.
function showEnd() {
  state = 'end'; setPrompt(null); $('hud').style.opacity = 0;
  const el = $('end'); el.hidden = false; void el.offsetWidth; el.classList.add('on');
  unlock(); $('btnAgain').focus();
}

// ---------------------------------------------------------------- the walkie (the trailer: "I could hear my walkie-talkie squealing
// outside"). It hangs on the bike in the yard. About 6 s after you wake it squawks; then the friend's line; then it KEEPS CALLING
// (every 20-30 s, from the yard, louder toward the areaway door) until you go outside. At the bike, one more call (the Starvector
// clue); on the bike, HOLD T to key it and get a reply. Sounds are real recordings (assets/audio/walkie/, see its CREDITS.md);
// the VOICES are subtitles only until Daryll records real ones: change a line in WALKIE.say and it changes everywhere.
const WALKIE = {
  // ---- THE LINES (subtitles). Swap any of these for a recording later. ----
  say: {
    wake: '(A walkie-talkie squawks outside.)',
    friend: "...you there? Get downtown. Something weird's going on at the Junction.",
    repeat2: '(The walkie. Out in the yard.)',          // the 2nd repeating call
    repeat4: '...hello? Bring quarters.',                // the 4th repeating call
    bike: "...we're all at the Junction. Nobody's ever topped Starvector. Get down here.",
    hint: 'HOLD T · WALKIE',
    replies: ['Hurry up, man.', "Starvector's top slot is still blank. Nobody's ever topped it.", 'Bring quarters.'],   // T release, in turn
  },
  // ---- timing and where it sits ----
  firstAfter: 6, friendAfter: 4.1, gap: [60, 90],       // seconds: after waking; after the first call (the friend's line, subtitle only); between the quiet single chirps
  repeatGain: 0.4,                                      // the yard's occasional chirp is quiet
  bikeMix: 0.5,                                         // on the bike and outdoors: the squeal and static at half level
  yard: [3.8, 1.5, -8.1],                               // out past the areaway door
  ref: 4, rolloff: 0.5,                                 // inverse model: full level within 4 m, half at 12 m (the far wall)
  mix: 1,                                               // master level of everything the walkie plays
  // ---- the recordings (assets/audio/walkie/*): file, offset s, length s, gain ----
  clips: {
    keyup: { buf: 'walkie/walkie_squelch_01.mp3', off: 0, dur: 0.5, gain: 1.5 },      // key-up squelch + beep
    tail: { buf: 'walkie/walkie_squelch_01.mp3', off: 1.53, dur: 0.3, gain: 1.5 },    // release squelch
    sq3: { buf: 'walkie/walkie_squelch_01.mp3', off: 2.95, dur: 0.36, gain: 1.5 },
    sq4: { buf: 'walkie/walkie_squelch_01.mp3', off: 4.58, dur: 0.42, gain: 1.5 },
    rough: { buf: 'walkie/walkie_squelch_02.mp3', off: 1.0, dur: 0.8, gain: 1.2 },    // feedback squelch
    hiss: { buf: 'walkie/walkie_static_01.mp3', off: -1, dur: 0.6, gain: 20 },        // off -1 = a random place in the file; quiet file, big gain
    layer: { buf: 'handshake/static_burst.mp3', off: 0.05, dur: 0.5, gain: 0.9 },     // the Handshake's static, underneath
  },
  // ---- the calls: [delay s, clip, length override] ----
  calls: {
    first: [[0, 'sq3'], [0.55, 'sq4']],                // on waking: just two short chirps
    friend: [],                                        // (the friend's line is a subtitle only)
    repeat: [[[0, 'sq3']], [[0, 'sq4']], [[0, 'keyup', 0.3]]],     // later: a single quiet chirp
    bike: [[0, 'keyup'], [0.5, 'hiss', 1.4], [2.0, 'sq3'], [2.4, 'hiss', 1.3], [3.8, 'hiss', 1.0], [3.8, 'layer'], [4.9, 'hiss', 0.8], [5.8, 'tail']],
    reply: [[0, 'hiss', 0.7], [0.15, 'layer'], [0.85, 'tail']],
  },
  nearBike: 2.8,
};
const WK = { plays: 0, log: [], missed: 0, hold: null, replyN: 0, pending: null, bus: null, calls: 0 };
// the small-speaker chain: band-limited, a bump in the mids, through one gentle compressor so the squelch never clips
function wkBus() {
  if (WK.bus) return WK.bus;
  const ctx = listener.context, c = ctx.createDynamicsCompressor();
  c.threshold.value = -12; c.ratio.value = 6; c.attack.value = 0.003; c.release.value = 0.12;
  c.connect(listener.getInput()); return (WK.bus = c);
}
const wkAtten = (d) => { const r = WALKIE.ref, dd = Math.max(r, d); return r / (r + WALKIE.rolloff * (dd - r)); };     // Web Audio's inverse model
function wkDist() { const y = WALKIE.yard; return Math.hypot(camera.position.x - y[0], camera.position.y - y[1], camera.position.z - y[2]); }
// one sound: clip name, options { delay, pos: [x,y,z] | null, lp: cutoff Hz, dur, loop, gain } -> { stop() } or null
function wkPlay(name, o = {}) {
  const clip = WALKIE.clips[name]; if (!clip) return null;
  const buf = buffers[clip.buf]; if (!buf) { WK.missed++; return null; }
  try {
    const ctx = listener.context; if (ctx.state !== 'running') ctx.resume();
    const dur = Math.min(o.dur || clip.dur, buf.duration - 0.05);
    const off = clip.off < 0 ? 0.3 + Math.random() * Math.max(0, buf.duration - dur - 0.6) : clip.off;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = buf; if (o.loop) { src.loop = true; src.loopStart = off; src.loopEnd = Math.min(buf.duration, off + 2); }
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 550;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1800; pk.Q.value = 0.8; pk.gain.value = 5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 3400;
    const g = ctx.createGain(), peak = clip.gain * WALKIE.mix * (o.gain || 1) * (region === 'out' ? WALKIE.bikeMix : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.006);
    if (!o.loop) { g.gain.setValueAtTime(peak, t + Math.max(0.01, dur - 0.02)); g.gain.linearRampToValueAtTime(0, t + dur); }
    src.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(g);
    let pan = null;
    if (o.pos) {
      pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse';
      pan.refDistance = WALKIE.ref; pan.rolloffFactor = WALKIE.rolloff; pan.maxDistance = 10000;
      pan.positionX.value = o.pos[0]; pan.positionY.value = o.pos[1]; pan.positionZ.value = o.pos[2];
      g.connect(pan); pan.connect(wkBus());
    } else g.connect(wkBus());
    if (o.loop) src.start(t, off); else src.start(t, off, dur);
    WK.plays++; WK.log.push({ at: +clock.toFixed(2), clip: name, pos: !!o.pos, gain: +peak.toFixed(2), lp: Math.round(o.lp || 3400), loop: !!o.loop }); if (WK.log.length > 80) WK.log.shift();
    const stop = () => { try { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.03); src.stop(n + 0.04); } catch (e) { /* done */ } };
    src.onended = () => { try { src.disconnect(); hp.disconnect(); pk.disconnect(); lp.disconnect(); g.disconnect(); if (pan) pan.disconnect(); } catch (e) { /* gone */ } };
    return { stop };
  } catch (e) { return null; }
}
// a call: out of the yard (positional, and muffled more the farther you are from the door) or in your hand (on the bike)
function wkCall(table, where, gain) {
  const inYard = where === 'yard', lp = inYard ? 1300 + 2400 * wkAtten(wkDist()) : 3400;
  for (const [delay, name, dur] of table) wkPlay(name, { delay, dur, lp, gain: gain || 1, pos: inYard ? WALKIE.yard : null });
  WK.calls++;
}
// subtitles wait their turn behind a story line or a LOOK (the audio never does)
function wkSay(text, secs, wait = 9) { WK.pending = { text, secs, until: clock + wait }; wkFlush(); }
function wkFlush() {
  const p = WK.pending; if (!p) return;
  if (clock > p.until) { WK.pending = null; return; }
  if (lineTimer <= 0) { WK.pending = null; line(p.text, p.secs, 'faint'); }
}
function updateWalkie() {
  wkFlush();
  if (!releasedAt || region !== 'in' || state === 'leaving' || paused) return;
  const Wk = WALKIE, since = clock - releasedAt;
  if (!S.walkie && since > Wk.firstAfter) {
    S.walkie = 1; S.walkieAt = clock;
    wkCall(Wk.calls.first, 'yard'); wkSay(Wk.say.wake, 3.4);
  } else if (S.walkie === 1 && clock > S.walkieAt + Wk.friendAfter) {
    S.walkie = 2; S.walkieN = 0; S.walkieNext = clock + Wk.gap[0] + Math.random() * (Wk.gap[1] - Wk.gap[0]);
    wkSay(Wk.say.friend, 6.2);
  } else if (S.walkie === 2 && clock >= S.walkieNext) {
    const n = ++S.walkieN, v = Wk.calls.repeat;
    wkCall(v[Math.floor(Math.random() * v.length)], 'yard', Wk.repeatGain);
    if (n === 2) wkSay(Wk.say.repeat2, 3.2, 5); else if (n === 4) wkSay(Wk.say.repeat4, 3.4, 5);
    S.walkieNext = clock + Wk.gap[0] + Math.random() * (Wk.gap[1] - Wk.gap[0]);
  }
}
// outdoors: the bike call (once), the hint (once, on first mount), and HOLD T
function updateBikeWalkie() {
  wkFlush();
  if (region !== 'out' || !outBody || state !== 'play' || paused) { if (WK.hold) wkRelease(); return; }
  const B = outBody.bike, near = bikeParked && bikeParked.visible && Math.hypot(outBody.pos.x - bikeParked.position.x, outBody.pos.z - bikeParked.position.z) < WALKIE.nearBike;
  if (!S.walkieBike && (B.mounted || near)) { S.walkieBike = 1; wkCall(WALKIE.calls.bike, 'hand'); wkSay(WALKIE.say.bike, 6.4, 14); }
  if (B.mounted && !S.walkieHint) {
    S.walkieHint = clock;
    let h = document.getElementById('walkieHint');
    if (!h) { h = document.createElement('div'); h.id = 'walkieHint'; h.style.cssText = 'position:absolute;left:50%;bottom:6vh;transform:translateX(-50%);font-size:22px;letter-spacing:0.12em;color:#e8dcc0;background:rgba(10,7,5,0.6);padding:4px 14px;opacity:0;transition:opacity .4s;pointer-events:none'; $('hud').appendChild(h); }
    h.textContent = WALKIE.say.hint; requestAnimationFrame(() => { h.style.opacity = '1'; });
  }
  const h = document.getElementById('walkieHint'); if (h && S.walkieHint && h.style.opacity === '1' && (clock - S.walkieHint > 10 || S.walkieUsed)) h.style.opacity = '0';
  const down = B.mounted && keys.has('KeyT');
  if (down && !WK.hold) {
    S.walkieUsed = true;
    WK.hold = { keyup: wkPlay('keyup'), bed: wkPlay('hiss', { delay: 0.3, loop: true, gain: 0.8 }) };
  } else if (!down && WK.hold) wkRelease();
}
function wkRelease() {
  const h = WK.hold; WK.hold = null; if (!h) return;
  if (h.bed) h.bed.stop();
  wkPlay('tail', { delay: 0.02 });
  wkCall(WALKIE.calls.reply.map(([d, n, l]) => [d + 0.4, n, l]), 'hand');
  const R = WALKIE.say.replies, text = R[WK.replyN++ % R.length];
  WK.pending = { text, secs: 3.4, until: clock + 3 }; lineTimer = 0; wkFlush();     // a reply you asked for shows at once
}

// ---------------------------------------------------------------- the outdoors arrives (loaded behind the basement)
function attachOutside(O) {
  OUT = O;
  basementGroup = new THREE.Group(); basementGroup.name = 'basement';
  for (const c of [...W.scene.children]) if (c !== camera) basementGroup.add(c);
  W.scene.add(basementGroup); W.scene.add(O.group); O.group.visible = false;
  baseFog = W.scene.fog; baseBg = W.scene.background; outFog = new THREE.FogExp2(0x443333, 0.004);
  outBody = new OutdoorBody(camera, O);
  const at = (path) => { const o = O.obj(path); return o ? new THREE.Vector3(...o.pos) : null; };
  const comp = (type, pathEnd) => (O.comps[type] || []).find((c) => c.path.endsWith(pathEnd));
  // the parked bike and the one under you share the bike's meshes, re-framed upright along its travel direction
  const parts = Object.entries(O.byPath).filter(([p]) => /^Outside\/Bike\//.test(p)).flatMap(([, m]) => m);
  const centre = (name) => { const m = O.byPath['Outside/Bike/' + name]?.[0]; if (!m) return null; const g = m.geometry; g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrix); };
  const front = centre('WheelFront'), rear = centre('WheelRear'), root = new THREE.Vector3(...O.obj('Outside/Bike').pos);
  const dir = front && rear ? front.clone().sub(rear).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
  const yaw = Math.atan2(-dir.x, -dir.z);
  const frameM = new THREE.Matrix4().compose(root, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const rq = new THREE.Quaternion(...O.obj('Outside/Bike').rot), yawOnly = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, new THREE.Euler().setFromQuaternion(rq, 'YXZ').y, 0, 'YXZ'));
  const unlean = new THREE.Matrix4().compose(root, yawOnly, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().compose(root, rq, new THREE.Vector3(1, 1, 1)).invert());
  const toLocal = frameM.clone().invert().multiply(unlean);
  bikeParked = new THREE.Group(); bikeRig = new THREE.Group(); bikeRig.visible = false;
  for (const m of parts) {
    const local = toLocal.clone().multiply(m.matrix);
    for (const g of [bikeParked, bikeRig]) {
      const c = new THREE.Mesh(m.geometry, m.material); c.matrixAutoUpdate = true;
      local.decompose(c.position, c.quaternion, c.scale); g.add(c);
    }
    m.visible = false;
  }
  bikeParked.position.copy(root); bikeParked.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 6 * DEG));
  bikeParked.userData.yaw = yaw;
  const hbm = O.byPath['Outside/Bike/Handlebars']?.[0];
  bikeRig.userData.hb = hbm ? (() => { const g = hbm.geometry; g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(toLocal.clone().multiply(hbm.matrix)); })() : new THREE.Vector3(0, 0, -0.5);
  O.group.add(bikeParked); O.group.add(bikeRig);
  // Flynn's doors swing on their hinges (DoorSwing: Unity yaw +a is three -a)
  for (const c of O.comps.DoorSwing || []) {
    const hinge = new THREE.Vector3(...O.obj(c.path).pos);
    const pivot = new THREE.Group(); pivot.position.copy(hinge); O.group.add(pivot); pivot.updateMatrixWorld(true);
    for (const [p, ms] of Object.entries(O.byPath)) if (p.startsWith(c.path)) for (const m of ms) {
      m.matrix.decompose(m.position, m.quaternion, m.scale); m.matrixAutoUpdate = true; pivot.attach(m);
    }
    doorPivots.push({ pivot, angle: -(c.fields.openAngle * (c.fields.openOutward ? 1 : -1)) * DEG });
  }
  // the cabinets: our three run the real games; the rest cycle their attract frames
  const frames = (g) => [1, 2, 3, 4].map((i) => `assets/art/${g}_play_0${i}.jpg`);
  for (const [id, cart, title, g] of [['fcab_starvector', 'starvector', 'STARVECTOR', 'sv'], ['fcab_relicquest', 'relicquest', 'RELIC QUEST', 'rq'], ['fcab_gridcycles', 'gridcycles', 'GRID CYCLES', 'gc']]) {
    const unityName = { fcab_starvector: 'FCab_Starvector', fcab_relicquest: 'FCab_RelicQuest', fcab_gridcycles: 'FCab_GridCycles' }[id];
    const scr = O.screens['Outside/Flynns/FlynnsInterior/' + unityName + '/Screen'];
    if (!scr) continue;
    // the floor's Starvector keeps its own table (its #1 is blank: js/answer.js); the other two share the home cabinets'
    cabs[id] = new Cabinet(scr.material, cart, title, frames(g), runtime, id === 'fcab_starvector' ? { cabinetId: 'junction_starvector' } : {});
    floorScr[id] = scr;
    const pv = at('Outside/Flynns/FlynnsInterior/' + unityName + '/PlayView');
    flynnView[id] = { pos: pv, target: scr.center.clone() };
    const it = comp('Interactable', 'CabInteract_' + unityName.slice(5));
    if (it) interactables.push({ id, region: 'out', enabled: true, p: new THREE.Vector3(...it.pos), radius: it.fields.radius, maxRise: 0 });
  }
  // the floor: every other cabinet runs its own game (js/arcade.js); until a game's port lands, its old attract art shows
  const attractOf = (cab) => { const c = (O.comps.CRTScreen || []).find((x) => x.path.includes('/' + cab + '/')); return c ? (c.fields.frames || []).filter(Boolean).map((f) => 'assets/' + f) : []; };
  for (const [cab, game] of Object.entries(FLOOR)) {
    const pose = cabinetPose(O, cab); if (!pose) continue;
    dressCabinet(O, cab, game);
    const cart = runtime && runtime.get(game);
    const id = 'fc_' + cab, title = cart ? cart.spec.name : game.toUpperCase();
    const fr = attractOf(cab);
    cabs[id] = new Cabinet(pose.screen.material, game, title, fr.length ? fr : ['assets/art/sv_play_01.jpg'], runtime);
    floorScr[id] = pose.screen;
    LABEL[id] = title; CART[id] = game; flynnView[id] = { pos: pose.eye, target: pose.target };
    interactables.push({ id, region: 'out', enabled: true, p: pose.stand, radius: 1.05, maxRise: 0 });
    floorCabs.set(id, { p: pose.target, acc: 0 });
    floorWatch.push({ id, cab: cabs[id], center: pose.target, normal: pose.normal, game });
  }
  // THE ARCADE ANSWERS: the room's side (js/answer.js: the three knocks, every machine's table, the tone, the dip, the van),
  // and today's Starvector calling it (js/starvector_answer.js: its blank #1, the gold glow, its waves, the freeze and the
  // name entry). The Junction's wall clock reads 3:33 (CANON), over the arch at the back.
  addJunctionClock(O.group);
  answer = new ArcadeAnswers({ cabs, O, listener, buffers, renderer, flashes, hooks: {
    atGlass: () => answerFromGlass(),
    stepBack: (secs, pose) => answerStepBack(secs, pose),
    release: (pose) => answerRelease(pose),
    done: () => { S.vanDue = true; },
  } });
  // the jukebox against the back wall (the basement's own, cloned from its kept meshes); its song is the room's music
  if (W.jukeParts && W.jukeParts.length) {
    jukebox = new JunctionJukebox({ parts: W.jukeParts, listener, buffers, parent: O.group, at: [84.9, -37.0, 0], wallZ: -178.85, facing: [0, 1], volume: 0.55 });
    O.extraBvh = jukebox.bvh; answer.music = jukebox.audio;
    interactables.push({ id: 'junction_juke', region: 'out', enabled: true, p: jukebox.stand.clone(), radius: 1.3, maxRise: 0 });
  }
  svTrigger = new StarvectorTrigger({ cab: cabs.fcab_starvector, room: answer, hooks: { hint: (mode) => { if (answerFromGlass()) cabHint(mode); } } });
  initSvSound();
  for (const c of O.comps.CRTScreen || []) {
    if (/FCab_|PolybiusSpot|FFiller/.test(c.path)) continue;
    const scr = O.screens[c.fields.target?.comp || c.path]; const fr = (c.fields.frames || []).filter(Boolean).map((f) => 'assets/' + f);
    if (scr && fr.length) fillers.push(new Slides(scr.material, fr, c.fields.holdSeconds || 6, c.fields.fadeSeconds || 1.2));
  }
  // what you can use outdoors
  const bikeI = comp('Interactable', 'BikeInteract'), doorI = comp('Interactable', 'FlynnDoorInteract');
  if (bikeI) interactables.push({ id: 'bike', region: 'out', enabled: true, p: new THREE.Vector3(...bikeI.pos), radius: 1.6, maxRise: 0.5 });
  if (doorI) interactables.push({ id: 'flynns_door', region: 'out', enabled: true, p: new THREE.Vector3(...doorI.pos), radius: 2.0, maxRise: 0 });
  const change = at('Outside/Flynns/FlynnsInterior/FlynnsDressing/FlynnChangeMachine');
  if (change) interactables.push({ id: 'change', region: 'out', enabled: true, p: change, radius: 1.3, maxRise: 0 });
  // the cabinet with no name: the spot stays empty until the delivery; its glow waits with it. Its tube runs the SEVEN games
  // (js/cabinet/seven/: Hearth to the Tunnel, joined by THE REDRAW); the ending is built now so the precompile below warms
  // its materials. prepare() sets the glass's look first (the ending's tunnel copies it).
  const pg = O.byName.PolyGlow; if (pg) { pg.on = false; }
  const polyScr = O.screens[POLY_SCREEN];
  if (polyScr) {
    const n = polyScr.normal.clone().normalize();
    if (n.dot(new THREE.Vector3(82, polyScr.center.y, -172).sub(polyScr.center)) < 0) n.negate();      // toward the room
    polyScr.normal.copy(n);
    seven = SevenMod ? new SevenMod.SevenScreen(renderer) : null;
    if (seven) seven.prepare(polyScr, pipe);         // its own glass on the screen mesh (js/cabinet/seven/glass.js)
    polyScreen = polyScr; sevenScale(); initSevenSound();              // (its games draw at the glass's real pixels at full screen)
    ending = new Ending({ O, camera, renderer, pipe, screen: polyScr, tube: seven || { t: null }, listener, buffers, line, setPrompt, onEnd: showEnd });
    CART.polybius = SevenMod ? SevenMod.SEVEN : 'seven';
    flynnView.polybius = { pos: polyScr.center.clone().addScaledVector(n, 0.62), target: polyScr.center.clone() };
  }
  loadDeliveryModels().then((models) => {
    delivery = new Delivery({ O, models });
    delivery.onArrive = () => { if (S.inFlynns) line('Headlights outside.', 3.5); };
    delivery.onPlaced = () => {
      if (pg) pg.on = true;
      if (polyScr && seven) { seven.attach(polyScr.material); cabs.polybius = seven; }
      if (ending) ending.placed();
      const it = interactables.find((i) => i.id === 'polybius'); if (it) it.enabled = true;
    };
  }).catch((e) => console.error('[delivery]', e)).finally(() => precompileOutside());
  const poly = comp('Interactable', 'PolyInteract');
  if (poly) interactables.push({ id: 'polybius', region: 'out', enabled: false, p: new THREE.Vector3(...poly.pos), radius: 1.4, maxRise: 0 });
}

// compile the outdoor shaders now, in both lighting set-ups (door open: basement + outside; outside alone),
// so opening the areaway never stalls. Runs while you are still on the couch or at the cabinets.
async function precompileOutside() {
  // programs are keyed on the target they draw into (the pipeline's HDR target, not the canvas) and on the
  // light count, so this runs once every light exists (the van's beam included) and against pipe.rtScene
  const compile = async () => {
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(pipe.rtScene);
    try { if (renderer.compileAsync) await renderer.compileAsync(W.scene, camera); else renderer.compile(W.scene, camera); }
    finally { renderer.setRenderTarget(prev); }
  };
  // the ending's pieces (the coin door, the token, the tunnel on the tube) are drawn once too, then hidden again
  const unwarm = ending ? ending.warm() : null;
  try {
    OUT.group.visible = true; await compile();
    basementGroup.visible = false; await compile();
    // and upload every buffer and texture once (one hidden draw with nothing culled), so the first look down
    // the valley does not stall either
    const culled = []; OUT.group.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    const far = camera.far; camera.far = 900; camera.updateProjectionMatrix();
    renderer.setRenderTarget(pipe.rtScene); renderer.render(W.scene, camera); renderer.setRenderTarget(null);
    camera.far = far; camera.updateProjectionMatrix();
    for (const o of culled) o.frustumCulled = true;
  } catch (e) { console.warn('[outside] precompile', e); }
  if (unwarm) unwarm();
  basementGroup.visible = region === 'in'; OUT.group.visible = region === 'out' || state === 'leaving';
  S.outsideWarm = true;
}

// ---------------------------------------------------------------- the story clock: cold open, hints, nudges
function updateIntro(dt) {
  introT += dt;
  const u = pipe.mFinal.uniforms;
  // out of the Handshake the room resolves from the white it ended on; otherwise from black
  if (introWhite) u.fadeCol.value.set(1, 1, 1); else u.fadeCol.value.set(0, 0, 0);
  u.fade.value = introT < (introWhite ? 0.6 : 1.5) ? 1 : Math.max(0, 1 - (introT - (introWhite ? 0.6 : 1.5)) / 5);
  const lamp = W.lights.LampLight;
  const wake = introT < 7 ? 0 : Math.min(1, (introT - 7) / 3);
  const w = wake * wake * (3 - 2 * wake);
  player.eyeNow = 0.82 + (1.62 - 0.82) * w;
  player.pitch = -9 * DEG * (1 - w);
  player.roll = -9 * DEG * (1 - w);
  player.yaw = (4 * DEG) * (1 - w);
  if (lamp) lamp.intensity = lamp.userData.base * (introT > 7 && introT < 7.5 ? 0.5 + noise(introT * 60) * 0.7 : 1);
  if (introT >= 10) {
    state = 'play'; player.control = true; player.eyeNow = 1.62; player.roll = 0; releasedAt = clock;
    $('card').classList.add('on'); setTimeout(() => $('card').classList.remove('on'), 9000);
    if (!document.pointerLockElement && !dragLook) line('Click to look around.', 5);
  }
}
function updateStory() {
  const since = clock - releasedAt;
  if (!S.used && !S.idleHint && since > 35) { S.idleHint = true; line('The cabinets are on free play.', 4); }
  const nudgeBase = S.firstWinAt ? S.firstWinAt + 45 : releasedAt + 180;
  if (!S.nudge1 && clock > nudgeBase) { S.nudge1 = true; line('The areaway. Out the back.', 4.5); }
  if (S.nudge1 && !S.nudge2 && clock > nudgeBase + 75) { S.nudge2 = true; line('Out the back. The door next to the computer.', 4.5); }
}
function noise(x) { return 0.5 + 0.5 * Math.sin(x * 1.7) * Math.sin(x * 0.63 + 1.3); }

// ---------------------------------------------------------------- title drift (the room as its own attract mode)
function updateTitleCam(t) {
  const a = t * 0.045;
  camera.position.set(-1.2 + Math.sin(a) * 2.2, 1.45 + Math.sin(t * 0.21) * 0.08, -1.6 + Math.cos(a * 0.8) * 1.4);
  const look = new THREE.Vector3(-6.5 + Math.sin(a * 0.7) * 1.2, 1.0, -2.6 + Math.cos(a * 0.5) * 1.6);
  camera.lookAt(look);
}

// ---------------------------------------------------------------- the cabinet with no name: FULL SCREEN while you play
// A run starts (or goes on): the camera glides in, eased over 1.3 s, until the cabinet's glass fills the view (a sliver of its
// bezel left top and bottom); walking away glides back out (1 s). Its games draw at the glass's real pixels there (the look
// kit's renderScale: sevenScale). The glide rides on the standing view at the cabinet (flynnView, the player's lookOverride),
// so the ending (js/ending.js) simply blends on from wherever it is.
// fillH: the glass's share of the view's height; lift: the glass sits that much (of the view's height) above centre, so the
// controls hint sits on the bezel below it, not on the picture
const SEVEN_VIEW = { fillH: 0.92, fillW: 0.97, lift: 0.02, glideIn: 1.3, glideOut: 1.0, maxScale: 1.75 };
const sevenCam = { on: false, t: 0, out: null, geo: null, slow: 1, id: null };      // (slow: tests only, for pictures mid-glide)
// every other playable cabinet glides in the same way; its glass sits at the top of the view with the controls' strip below it
const CAB_VIEW = { fillH: 0.88, fillW: 0.97, lift: 0.07, glideIn: 1.1, glideOut: 0.9 };
const viewOf = (id) => (id === 'polybius' ? SEVEN_VIEW : CAB_VIEW);
const smoother = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
/** a glass's frame: centre, the way it faces (N, toward `toward` if given), its right (T) and up (B), half width and half height */
function geoOf(scr, toward) {
  const C = scr.center.clone(); let N = scr.normal.clone().normalize();
  if (toward && N.dot(toward.clone().sub(C)) < 0) N.negate();
  const T = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), N).normalize(), B = new THREE.Vector3().crossVectors(N, T).normalize();
  scr.mesh.updateMatrixWorld(true);
  const pos = scr.mesh.geometry.attributes.position, v = new THREE.Vector3(); let hw = 0, hh = 0;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(scr.mesh.matrixWorld).sub(C); hw = Math.max(hw, Math.abs(v.dot(T))); hh = Math.max(hh, Math.abs(v.dot(B))); }
  return { C, N, T, B, hw: hw || 0.24, hh: hh || 0.18 };
}
function sevenGeo() {
  if (sevenCam.geo || !polyScreen) return sevenCam.geo;
  return (sevenCam.geo = geoOf(polyScreen));
}
const camGeos = {}, _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** the glass of cabinet `id` (the floor's, the home ones, the cabinet with no name); null when it has none */
function cabGeo(id) {
  if (id === 'polybius') return sevenGeo();
  if (camGeos[id] !== undefined) return camGeos[id];
  let scr = null, toward = null;
  if (SCREEN[id]) { scr = faceRoom(screenOf(SCREEN[id])); toward = new THREE.Vector3(0, scr.center.y, 0); }
  else if (floorScr[id]) { scr = floorScr[id]; toward = flynnView[id] && flynnView[id].pos; }
  return (camGeos[id] = scr && scr.mesh ? geoOf(scr, toward) : null);
}
/** how far in front of the glass the camera stands at full screen, and the share of the view's height the glass fills there */
function sevenFull(G = sevenGeo(), V = SEVEN_VIEW) {
  if (!G) return null;
  const tv = Math.tan(camera.fov * DEG / 2);
  const d = Math.max(G.hh / (V.fillH * tv), G.hw / (V.fillW * tv * camera.aspect));
  const fill = G.hh / (d * tv), lift = Math.min(V.lift, Math.max(0, (1 - fill) / 2 - 0.004));
  return { d, fill, pos: G.C.clone().addScaledVector(G.N, d).addScaledVector(G.B, -2 * lift * d * tv) };
}
/** the games' render scale: the glass's height in the drawn pixels at full screen, over the games' 768 */
function sevenScale() {
  if (!seven || !polyScreen || !pipe.ih) return;
  const F = sevenFull(); if (!F) return;
  const s = Math.min(SEVEN_VIEW.maxScale, Math.max(1, Math.round(F.fill * pipe.ih / 768 * 16) / 16));
  seven.setFullScale(s);
}
function applySevenCam(dt) {
  let k = 0;
  if (sevenCam.on && state === 'screen' && activeCab && activeId === sevenCam.id) {
    const V = viewOf(sevenCam.id), D = V.glideIn;
    sevenCam.t = Math.min(D, sevenCam.t + dt / sevenCam.slow);
    k = smoother(sevenCam.t / D);
    const G = cabGeo(sevenCam.id), F = sevenFull(G, V);
    if (F) {
      camera.position.lerp(F.pos, k);
      // (the standing views were authored by eye; at full screen the lens looks straight into the glass, so the picture sits true)
      if (sevenCam.id !== 'polybius') { _m4.lookAt(F.pos, _v3.copy(F.pos).sub(G.N), _up); _q4.setFromRotationMatrix(_m4); camera.quaternion.slerp(_q4, k); }
    }
  } else if (sevenCam.out) {
    const O = sevenCam.out;
    if (state !== 'play') { sevenCam.out = null; sevenFullK = 0; return; }
    O.t += dt / sevenCam.slow;
    const u = smoother(O.t / viewOf(O.id).glideOut);
    k = 1 - u;
    const p = camera.position.clone(), q = camera.quaternion.clone();
    camera.position.lerpVectors(O.p, p, u); camera.quaternion.slerpQuaternions(O.q, q, u);
    if (u >= 1) sevenCam.out = null;
  }
  const gid = sevenCam.on ? sevenCam.id : sevenCam.out && sevenCam.out.id;
  sevenFullK = gid === 'polybius' ? k : 0;
  // Starvector's sharp picture (a second, bigger copy of its renderer) only while its glass fills the view
  { const want = gid && gid !== 'polybius' ? cabs[gid] : null; for (const c of [cabs.fcab_starvector, cabs.homecab_starvector]) if (c && c.setSharp) c.setSharp(c === want && (c.sharp ? k > 0.4 : k > 0.85)); }
  // the other cabinets' full screen: the glass is the picture, so the HUD's lines and the pocket count step aside (js: body.cabfull)
  document.body.classList.toggle('cabfull', k > 0.4 && gid !== 'polybius' && !!gid);
  if (sevenSnd) sevenSnd.update(camera, sevenFullK);
}
// THE MOUSE on the glass, while the game there takes it (the Constellation): the sight follows it and a click fires, as on the
// game's own page. With the pointer locked (the arcade's look), the mouse moves the sight like a trackball, one screen pixel for
// one pixel of the glass; without a lock (a refused lock, the tests), the cursor's place on the glass is the sight's.
function sevenAim() { return state === 'screen' && screenMode === 'cab' && !paused && !!seven && activeCab === seven && seven.wantsPointer; }
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(), _hit = new THREE.Vector3();
function sevenMouse(e) {
  const G = sevenGeo(); if (!G) return;
  const FW = 1266, FH = 952;                                      // the games' frame (js/cabinet/seven/games.js)
  if (document.pointerLockElement === canvas) {
    // frame px per screen px: the glass's height on screen now
    const a = G.C.clone().addScaledVector(G.B, G.hh).project(camera), b = G.C.clone().addScaledVector(G.B, -G.hh).project(camera);
    const px = Math.abs(a.y - b.y) / 2 * innerHeight;
    if (px > 1) seven.pointerMove(e.movementX * FH / px, e.movementY * FH / px);
    return;
  }
  const r = canvas.getBoundingClientRect();
  _ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  _plane.setFromNormalAndCoplanarPoint(G.N, G.C);
  if (!_ray.ray.intersectPlane(_plane, _hit)) return;
  _hit.sub(G.C);
  const u = (_hit.dot(G.T) / G.hw + 1) / 2, v = (1 - _hit.dot(G.B) / G.hh) / 2;
  seven.pointerAt(u * FW, v * FH);
}
function sevenMouseOff() { if (seven) seven.pointerButton(false); canvas.style.cursor = ''; }
// (an unlocked cursor over the glass hides: the sight is the cursor, as on the game's page)
// (and while you walk about, the cursor is hidden even when a lock is refused; at a cabinet, the sight's rule above; only a menu shows it)
function sevenCursor() { const want = (sevenAim() && document.pointerLockElement !== canvas) || (!paused && state !== 'screen' && PLAYING.has(state)) ? 'none' : ''; if (canvas.style.cursor !== want) canvas.style.cursor = want; }

// ---------------------------------------------------------------- input
let dragLook = false, dragging = false, lastX = 0, lastY = 0, lockRetry = 0;
const PLAYING = new Set(['intro', 'play', 'screen', 'ending', 'waitOut', 'leaving']);   // the states where the mouse is the view
function lock() {
  // automated browsers (the headless tests) never take the pointer: a real lock clips the owner's cursor to the hidden
  // window's box on Windows. They look by dragging instead, the same fallback as a refused lock.
  if (navigator.webdriver) { dragLook = true; return; }
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { dragLook = true; });
  } catch (e) { dragLook = true; }
}
function unlock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* fine */ } }
// A refused lock (Chrome refuses one asked for within about a second of an Esc exit, e.g. leaving a cabinet and clicking Resume
// fast) is only a stop-gap: drag-look keeps the view moving, ONE retry follows (the click is still a fresh gesture), and the next
// click on the game asks for the lock again, in every state. It never settles into drag-look for good.
document.addEventListener('pointerlockerror', () => {
  dragLook = true;
  if (!lockRetry && !navigator.webdriver) lockRetry = setTimeout(() => { lockRetry = 0; if (!document.pointerLockElement && !paused && PLAYING.has(state)) lock(); }, 1300);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { dragLook = false; return; }
  // (going out or the door's swing: no menu, the next click takes the view back)
  if (!paused && (state === 'play' || state === 'screen' || state === 'intro' || state === 'ending')) pause(true);
});
addEventListener('mousemove', (e) => {
  if (paused || !player) return;
  if (sevenAim()) { sevenMouse(e); return; }          // the Constellation at the cabinet: the mouse aims
  if (document.pointerLockElement === canvas) { if (state === 'play') player.look(e.movementX, e.movementY); return; }
  if (dragLook && dragging && state === 'play') { player.look((e.clientX - lastX) * 1.2, (e.clientY - lastY) * 1.2); lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('mousedown', (e) => {
  if (sevenAim() && e.button === 0) { if (document.pointerLockElement !== canvas) sevenMouse(e); seven.pointerButton(true); }
  if (!paused && PLAYING.has(state)) {
    if (!document.pointerLockElement) lock();
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  }
});
addEventListener('mouseup', (e) => { dragging = false; if (seven && e.button === 0) seven.pointerButton(false); });
addEventListener('keydown', (e) => {
  if (state === 'handshake' || state === 'loading') return;   // the terminal owns the keys (js/handshake.js)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code) && state !== 'title') e.preventDefault();
  if (e.code === 'Escape') { if (!$('pitch').hidden) { closePitch(); return; } if (paused) resume(); else if (state === 'play' || state === 'screen' || state === 'intro' || state === 'ending') pause(false); return; }
  if (paused) return;
  keys.add(e.code); taps.add(e.code);
  if (e.repeat) return;
  if (state === 'title' && e.code === 'Enter' && $('pitch').hidden) { begin(); return; }
  if (state === 'ending') { if (e.code === 'KeyE') ending.take(); return; }
  if (e.code === 'KeyV' && (state === 'play' || state === 'screen')) cycleLook();
  if (state === 'screen') { screenKey(e.code); return; }
  if (state === 'play' && e.code === 'KeyE') {
    if (region === 'out' && outBody && outBody.bike.mounted) { dismountBike(); return; }
    const i = pick(); if (i) use(i);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- menus
function show(id, on) { $(id).hidden = !on; }
function begin() {
  if (state !== 'title') return;
  show('title', false); state = 'intro'; introT = 0; paused = false;
  player.place(0.21, 0.02, -4.265, 0); player.control = false;
  lock(); startAudio();
  $('hud').style.opacity = 1;
}
// the Handshake ended on white (or was skipped): wait for the room, then wake on the couch
async function afterHandshake(how) {
  await basementReady;
  if (loadError) { show('hs', false); show('loading', true); return; }
  state = 'intro'; introT = 0; introWhite = how === 'done'; paused = false;
  player.place(0.21, 0.02, -4.265, 0); player.control = false;
  startAudio(); $('hud').style.opacity = 1;
  show('hs', false); canvas.focus();
}
function pause(fromLockLoss) {
  paused = true; if (sevenSnd) sevenSnd.pause(true); if (svSnd) svSnd.pause(true); show('pause', true); keys.clear(); if (seven) seven.keys.clear();
  sevenMouseOff();                                   // (the cursor back for the menu; the sight's button let go)
  syncSettingsUI(); $('btnResume').focus();
}
function resume() { paused = false; if (sevenSnd) sevenSnd.pause(false); if (svSnd) svSnd.pause(false); show('pause', false); lock(); canvas.focus(); }
function quitToTitle() {
  location.reload();
}
function openPitch() { $('pitchBody').innerHTML = PITCH_HTML(stats()); show('pitch', true); $('btnPitchClose').focus(); }
function closePitch() { show('pitch', false); }
function cycleLook() {
  const order = ['clean', 'soft', 'full'];
  settings.look = order[(order.indexOf(settings.look) + 1) % 3]; saveSettings();
  pipe.setMode(settings.look);
  toast('LOOK: ' + { clean: 'CLEAN', soft: 'RETRO', full: 'FULL RETRO' }[settings.look]);
}
function syncSettingsUI() {
  for (const b of $('setLook').children) b.classList.toggle('on', b.dataset.v === settings.look);
  for (const b of $('setInvert').children) b.classList.toggle('on', b.dataset.v === (settings.invert ? '1' : '0'));
  $('setSens').value = settings.sens; $('setVol').value = settings.vol;
}
$('btnBegin').onclick = begin;
$('btnPitch').onclick = openPitch; $('btnPausePitch').onclick = openPitch;
$('btnPitchClose').onclick = closePitch;
$('btnResume').onclick = resume;
$('btnQuit').onclick = quitToTitle;
$('btnAgain').onclick = () => location.reload();
$('btnFull').onclick = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* no fullscreen here */ } };
for (const b of $('setLook').children) b.onclick = () => { settings.look = b.dataset.v; saveSettings(); pipe.setMode(settings.look); syncSettingsUI(); };
for (const b of $('setInvert').children) b.onclick = () => { settings.invert = b.dataset.v === '1'; player.invert = settings.invert; saveSettings(); syncSettingsUI(); };
$('setSens').oninput = (e) => { settings.sens = +e.target.value; player.sens = settings.sens; saveSettings(); };
$('setVol').oninput = (e) => { settings.vol = +e.target.value; listener.setMasterVolume(settings.vol); saveSettings(); };

// ---------------------------------------------------------------- numbers for the pitch (measured live)
const perf = { frames: 0, acc: 0, fps: 0, loadMs: 0, raw: 0, rawN: 0, worst: 0, hitch: 0, last: 0 };
// F3: a small frame-time counter (off by default): fps, ms, the worst frame of the last second, the render scale, the scene's draw calls and triangles
let fpsEl = null;
function toggleFps() {
  if (!fpsEl) {
    fpsEl = document.createElement('div'); fpsEl.id = 'fpsCounter';
    fpsEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;font:12px/1.35 Consolas,monospace;color:#9df5e1;background:rgba(0,0,0,0.62);padding:4px 8px;border:1px solid rgba(157,245,225,0.35);pointer-events:none;white-space:pre;display:none';
    document.body.appendChild(fpsEl);
  }
  fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none';
}
addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); toggleFps(); } });
function fpsText() {
  const st = pipe.stats || { calls: 0, tris: 0 };
  return `${perf.fps} FPS  ${perf.ms ? perf.ms.toFixed(1) : '-'} ms  (worst ${perf.worstShown ? perf.worstShown.toFixed(0) : '-'} ms)
render ${DRS.ratio.toFixed(2)}x of ${DRS.cap.toFixed(2)}x  ${pipe.iw || 0}x${pipe.ih || 0}
${st.calls} draws  ${(st.tris / 1000).toFixed(0)}k tris`;
}
// a slow machine steps the render scale down (never below 0.7x); a very fast one (a 120 Hz screen) can step back up. Called once a second.
function adaptRes(avgMs, worst) {
  if (!ready || state === 'handshake' || state === 'ending' || paused || !S.outsideWarm || worst > 250) { DRS.slow = DRS.fast = 0; return; }
  if (avgMs > 21) { DRS.slow++; DRS.fast = 0; } else if (avgMs < 9.5 && DRS.ratio < DRS.cap) { DRS.fast++; DRS.slow = 0; } else DRS.slow = DRS.fast = 0;
  let r = DRS.ratio;
  if (DRS.slow >= 2 && r > DRS.min) r = Math.max(DRS.min, +(r * 0.85).toFixed(3));
  else if (DRS.fast >= 6) r = Math.min(DRS.cap, +(r * 1.1).toFixed(3));
  if (r !== DRS.ratio) { DRS.ratio = r; DRS.steps++; DRS.slow = DRS.fast = 0; renderer.setPixelRatio(r); pipe.resize(pipe.w, pipe.h, true); }
}
function stats() {
  return { fps: perf.fps, loadMs: perf.loadMs, drawCalls: W ? W.drawCalls : 0, tris: renderer.info.render.triangles, live: runtime ? runtime.ids().filter((i) => ['gridcycles', 'starvector', 'relicquest'].includes(i)) : [] };
}

// ---------------------------------------------------------------- main loop
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000; const dt = Math.min(0.05, t - (t0 || t)); t0 = t;
  if (!ready || state === 'handshake') return;
  const raw = perf.last ? now - perf.last : 0; perf.last = now; perf.raw += raw; perf.rawN++; perf.worst = Math.max(perf.worst, raw);
  perf.frames++; perf.acc += dt;
  if (perf.acc > 1) {
    perf.fps = Math.round(perf.frames / perf.acc); perf.ms = perf.raw / Math.max(1, perf.rawN); perf.worstShown = perf.worst;
    adaptRes(perf.ms, perf.worst); perf.frames = 0; perf.acc = 0; perf.raw = 0; perf.rawN = 0; perf.worst = 0;
    if (fpsEl && fpsEl.style.display !== 'none') fpsEl.textContent = fpsText();
  }
  if (!paused) {
    clock += dt;
    if (lineTimer > 0) { lineTimer -= dt; if (lineTimer <= 0) $('line').classList.remove('on'); }
    if (lookPending && lineTimer <= 0) { const lp = lookPending; lookPending = null; const li = interactables.find((x) => x.id === lp.id); if (li && clock - lp.at < 6 && state === 'play') showLook(li); }
    tv.update(dt); bbs.update(dt);
    const input = state === 'screen' && screenMode === 'cab' ? cabInput() : null;
    const tablesUp = !!(answer && answer.screensHeld);           // THE ARCADE ANSWERS: every tube holds its table
    // THE TUBES' BUDGET (the Junction's frame time): a running game steps and its 320x240 picture goes up to the GPU. Only the
    // one you play, and the ones in view within about 4 m, run every frame; a tube in view farther off runs at 12 Hz; one out of
    // view is frozen (the three floor games that carry the story keep ticking at 10 Hz). The home cabinets rest while you are
    // outdoors. (Measured: 21 filler tubes + the home cabinets cost ~16 ms a frame at the middle of the floor.)
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_vp);
    for (const [id, c] of Object.entries(cabs)) {
      if (tablesUp) break;
      // the cabinet with no name, not being played: like the floor, its attract runs only near you and at 30 Hz (its showpiece
      // canvas is GPU work every draw; at full rate it cost the busy doorway view a third of its frames)
      if (id === 'polybius' && c !== activeCab) {
        if (!(region === 'out' && S.inFlynns) || !flynnView.polybius || flynnView.polybius.target.distanceToSquared(camera.position) > 81) continue;
        S.polyAcc = (S.polyAcc || 0) + dt; if (S.polyAcc < 1 / 30) continue;
        c.update(S.polyAcc, null); S.polyAcc = 0; continue;
      }
      if (c === activeCab) { c.update(dt, input); continue; }
      const home = id.startsWith('homecab_'), filler = id.startsWith('fc_');
      if (home ? region !== 'in' : (region !== 'out' || !S.inFlynns)) continue;
      const ctr = home ? W.screens[HOME_SCREEN[id]].center : filler ? floorCabs.get(id).p : flynnView[id] && flynnView[id].target;
      if (!ctr) { c.update(dt, null); continue; }
      _sp.center.copy(ctr); _sp.radius = 0.7;
      const seen = _fr.intersectsSphere(_sp);
      let every = 0;
      if (!seen) { if (filler) continue; every = home ? 1 / 4 : 1 / 10; }
      else if (ctr.distanceToSquared(camera.position) > 16) every = 1 / 12;
      if (every) { const acc = (cabAcc[id] = (cabAcc[id] || 0) + dt); if (acc < every) continue; c.update(acc, null); cabAcc[id] = 0; }
      else c.update(dt, null);
    }
    if (svSnd) svSoundFrame(dt);
    if (svTrigger) svTrigger.update(dt, { inside: region === 'out' && !!S.inFlynns });    // (on the floor, at a cabinet or not)
    if (answer) answer.update(dt);
    sevenCursor();
    // at the cabinet with no name: the hint follows the game on its glass; after a lost game it asks for a quarter
    if (state === 'screen' && seven && activeCab === seven) {
      const h = 'seven:' + seven.hint; if (h !== S.sevenHint) { S.sevenHint = h; cabHint(h); }
      const p = seven.needsCoin ? (spendable() > 0 ? 'INSERT COIN' : 'NO QUARTERS') : null;
      if (p !== S.sevenPrompt) { S.sevenPrompt = p; setPrompt(p); }
    }
    for (const s of Object.values(W.screens)) s.material.uniforms.time.value = clock;
    if (region === 'in' && (state === 'play' || (state === 'screen' && screenMode === 'bbs'))) {
      flashes.updateBBS(dt, camera, bbsScreen, bbs, state === 'screen');
      updateWalkie();
    }
    const crtGlow = W.lights.CRTGlow; if (crtGlow) crtGlow.intensity = crtGlow.userData.base * (0.95 + 0.05 * noise(clock * 2));
    updateCat(dt);
    if (state === 'title') updateTitleCam(clock);
    else {
      if (state === 'intro') updateIntro(dt);
      if (state === 'play') { player.update(dt, keys); if (region === 'in') updateStory(); const i = (region === 'out' && outBody.bike.mounted) ? null : pick(); setPrompt(i ? promptFor(i) : (region === 'out' && outBody.bike.mounted && Math.abs(outBody.bike.speed) < 0.5 ? 'GET OFF' : null)); }
      if (state === 'waitOut') updateWaitOut();
      if (state === 'leaving') updateLeaving(dt);
      if (region === 'out') { updateOutdoors(dt); updateBikeWalkie(); }
      if (state === 'ending' || state === 'end') { if (ending) ending.update(dt); } else { player.apply(dt); applySevenCam(dt); }
      if (fixedCam) { camera.position.copy(fixedCam.p); camera.up.set(0, 1, 0); camera.lookAt(fixedCam.t); if (fixedCam.roll) camera.rotateZ(fixedCam.roll); }
    }
  }
  pipe.render(W.scene, camera, clock);
}

// ---------------------------------------------------------------- boot
async function boot() {
  const tStart = performance.now();
  resize();
  requestAnimationFrame(frame);
  const jump = location.hash.slice(1);
  if (jump !== 'basement' && jump !== 'cabinet' && jump !== 'reveal' && jump !== 'junction') {
    // the site opens on the terminal; the basement loads behind it
    state = 'handshake'; show('loading', false);
    let returning = false; try { returning = localStorage.getItem('node.handshake.v1') === '1'; } catch (e) { /* private window */ }
    hs = new Handshake($('hs'), { ctx: listener.context, volume: () => settings.vol, returning, jump });
    hs.run().then(afterHandshake);
  } else show('hs', false);
  try {
    const audioP = Promise.all(['juke_06.mp3', 'juke_02.mp3', 'juke_09.mp3', 'token_clunk.mp3', 'handshake/crt_hum.mp3', 'handshake/static_burst.mp3', 'walkie/walkie_squelch_01.mp3', 'walkie/walkie_squelch_02.mp3', 'walkie/walkie_static_01.mp3', 'handshake/key_return.mp3'].map(loadAudio));
    const runtimeP = loadCabinetRuntime();
    const sevenP = import('./cabinet/seven/index.js').catch((e) => { console.error('[seven] the cabinet with no name could not load', e); return null; });
    W = await loadBasement('', { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) }, (f) => { $('loadFill').style.width = Math.round(f * 100) + '%'; });
    runtime = await runtimeP;
    player = new Player(camera, W.colliders); player.sens = settings.sens; player.invert = settings.invert;
    W.scene.add(camera);
    buildInteractables();
    tv = new Slides(W.screens.M_CRT_TV.material, ['assets/art/tv_starvector_01.jpg', 'assets/art/tv_starvector_02.jpg'], 6, 2);
    bbs = new BBS(W.screens.M_CRT_BBS.material); bbsScreen = faceRoom(W.screens.M_CRT_BBS);
    const frames = (g) => [1, 2, 3, 4].map((i) => `assets/art/${g}_play_0${i}.jpg`);
    cabs.homecab_starvector = new Cabinet(W.screens.M_CRT_Starvector.material, 'starvector', 'STARVECTOR', frames('sv'), runtime);
    cabs.homecab_relicquest = new Cabinet(W.screens.M_CRT_RelicQuest.material, 'relicquest', 'RELIC QUEST', frames('rq'), runtime);
    cabs.homecab_gridcycles = new Cabinet(W.screens.M_CRT_GridCycles.material, 'gridcycles', 'GRID CYCLES', frames('gc'), runtime);
    // dusk past the areaway: the door opens onto evening, not onto nothing
    const dusk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.16, 0.34), fog: false }));
    dusk.material.color.multiplyScalar(2.2); dusk.position.set(3.8, 1.2, -7.35); W.scene.add(dusk); duskPlane = dusk;
    catShow('Curl');
    for (const m of W.kibble) m.visible = false;
    bakeReflections(renderer, W.scene, W.metals);
    renderer.shadowMap.needsUpdate = true;
    renderer.compile(W.scene, camera);
    await audioP;
    perf.loadMs = Math.round(performance.now() - tStart);
    ready = true; markReady();
    // the yard, the hill, the street and Flynn's load behind the basement; the areaway waits for them
    loadOutside({ anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()), lightmaps: W.lightmaps })
      .then(async (O) => { SevenMod = await sevenP; attachOutside(O); }).catch((e) => { outFailed = true; console.error('[outside]', e); });
    if (state === 'handshake') return;
    show('loading', false); show('title', true); state = 'title'; $('btnBegin').focus();
    if (jump === 'junction') devToCabinet('junction');    // #junction: the arcade floor with quarters, nothing won (to play the floor games)
    else if (jump === 'cabinet' || jump === 'reveal') devToCabinet(jump === 'reveal');   // #cabinet: straight to the cabinet with no name; #reveal: and on to the Tunnel's let-go, the passage, the reveal and the ending (playtests)
  } catch (e) {
    console.error(e);
    $('loadErr').hidden = false; $('loadErr').textContent = 'Could not open the basement: ' + (e && e.message || e);
    loadError = e; markReady();
  }
}
boot();

// #cabinet (dev shortcut for playtests): skip World 1 and stand at the delivered cabinet with four quarters. It uses the same
// hooks as tools/seven_lib.mjs: the intro skipped, out to the street, the arcade's answer skipped (N.answer.skip()), the van's
// delivery run to its end.
async function devToCabinet(reveal = false) {
  const N = window.__node, until = async (f, ms) => { const t0 = performance.now();
    while (performance.now() - t0 < ms) { try { if (f()) return true; } catch (e) { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }
    return false; };
  const st = () => N.state;
  N.begin(); N.skipIntro();
  if (!await until(() => st().state === 'play' && st().outside && st().delivery && st().warm, 120000)) return console.warn('[#cabinet] the world did not load');
  N.goOut();
  if (!await until(() => st().region === 'out', 15000)) return console.warn('[#cabinet] could not go outside');
  N.warp(81.2, -36.95, -169.2, Math.PI);
  await new Promise((r) => setTimeout(r, 600));
  if (reveal === 'junction') { N.coins(12); return; }     // #junction: on the floor with twelve quarters, nothing won yet
  N.answer.skip();
  if (!await until(() => st().delivery.t > 0, 15000)) return console.warn('[#cabinet] the van did not come');
  N.skipDelivery();
  if (!await until(() => st().delivery.done && st().cabinet && st().cabinet.placed, 60000)) return console.warn('[#cabinet] the cabinet was not placed');
  N.coins(4);
  N.warp(83.3, -36.95, -171.0, Math.PI);
  if (!reveal) return;
  // #reveal: coin up, then the Tunnel's let-go (the passage plays on the glass, then the reveal, then the ending)
  await new Promise((r) => setTimeout(r, 800));
  if (!N.cabinet.open()) return console.warn('[#reveal] could not open the cabinet');
  await new Promise((r) => setTimeout(r, 1500));
  N.winCabinet();
}

// ---------------------------------------------------------------- hooks for the headless playtest (tools/playtest.mjs)
window.__node = {
  get state() { return { state, paused, screenMode, hs: hs ? hs.stage : null, region, outside: !!OUT, warm: !!S.outsideWarm, delivery: delivery ? { t: +delivery.t.toFixed(1), placed: !!delivery.placed, done: delivery.done } : null, bike: outBody ? { mounted: outBody.bike.mounted, speed: +outBody.bike.speed.toFixed(2), slope: +outBody.bike.slope.toFixed(3) } : null, dusk: OUT ? +(OUT.k || 0).toFixed(2) : null, inFlynns: !!S.inFlynns, clock: +clock.toFixed(2), pos: player && player.pos.toArray().map((v) => +v.toFixed(3)), yaw: player && +player.yaw.toFixed(3), pitch: player && +player.pitch.toFixed(3),
    prompt: $('prompt').classList.contains('on') ? $('promptText').textContent : null, line: $('line').classList.contains('on') ? $('lineText').textContent : null,
    quarters: S.quarters, beaten: [...S.beaten], answer: answer ? { ...answer.info(), sv: svTrigger ? svTrigger.info() : null } : null, cat: cat.where, fps: perf.fps, walkie: S.walkie || 0, flashes: { ...flashes.count },
    ending: ending ? ending.state() : null, cabinet: seven ? { ...seven.info(), placed: !!cabs.polybius } : null, loadMs: perf.loadMs, drawCalls: W && W.drawCalls,
    live: runtime ? runtime.ids().filter((i) => ['gridcycles', 'starvector', 'relicquest'].includes(i)) : [], tris: renderer.info.render.triangles, calls: renderer.info.render.calls }; },
  begin, skipIntro() { introT = 9.99; },
  goOut() { goOutside(); },
  outside() { return OUT ? { drawCalls: OUT.drawCalls, lights: OUT.assigned ? OUT.assigned.map((l) => l.name) : [], env: !!OUT.env, inside: +(OUT.inside || 0).toFixed(2) } : null; },
  envTune(o) { return OUT && OUT.envTune ? OUT.envTune(o) : null; },
  warp(x, y, z, yaw, pitch) { player.place(x, y, z, yaw ?? player.yaw); if (pitch != null) player.pitch = pitch; },
  coins(n) { S.quarters = n; pocket(); },
  floor() { return [...floorCabs.keys()].map((id) => { const i = interactables.find((x) => x.id === id), c = cabs[id];
    return { id, game: CART[id], title: LABEL[id], live: !!(c && c.live), stand: i && i.p.toArray() }; }); },
  playing() { return activeCab ? { live: activeCab.live, playing: activeCab.playing, phase: activeCab.runner && activeCab.runner.phase } : null; },
  lens(near, fov) { camera.near = near ?? 0.05; camera.fov = fov ?? 60; camera.updateProjectionMatrix(); },
  debug() { return { views: Object.fromEntries(Object.entries(flynnView).map(([k, v]) => [k, { pos: v.pos && v.pos.toArray(), target: v.target.toArray() }])),
    cam: camera.position.toArray(), look: player.lookOverride ? { pos: player.lookOverride.pos.toArray() } : null }; },
  face(x, z) { if (player) player.yaw = Math.atan2(-(x - player.pos.x), -(z - player.pos.z)); },
  place(x, z, yaw) { player.place(x, 0.02, z, yaw ?? player.yaw); },
  setLook(m) { settings.look = m; pipe.setMode(m); },
  // for look passes and probes (tools/stage1shots.mjs): the live objects, read-only by convention
  internals() { return { THREE, W, OUT, camera, renderer, pipe, bbs, cabs, seven, ending, answer, svTrigger }; },
  // the glass of the cabinet being played, where it lands on screen (tools/fullscreen_test.mjs): [x0, y0, x1, y1] in window px
  camGlass() {
    const G = activeId && cabGeo(activeId); if (!G) return null;
    camera.updateMatrixWorld(); const v = new THREE.Vector3(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      v.copy(G.C).addScaledVector(G.T, sx * G.hw).addScaledVector(G.B, sy * G.hh).project(camera);
      const px = (v.x + 1) / 2 * innerWidth, py = (1 - v.y) / 2 * innerHeight; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { id: activeId, rect: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)] };
  },
  // a won round on that cabinet. The floor's Starvector, not yet answered: THE ARCADE ANSWERS (initials AAA), then the van
  win(id) { if (id === 'fcab_starvector' && answer && !answer.answered) { answer.answer('AAA'); return; } markBeaten(id); },
  // THE ARCADE ANSWERS, for tests and dev. The room (js/answer.js): knock(1 | 2 | 3), answer(initials, { score }), skip() (the
  // tables filled quietly, straight to the van), jukebox(on) (a stand-in jukebox where the real one will stand), cfg (its
  // numbers). Today's Starvector (js/starvector_answer.js): clearWave() bursts every rock on its glass, bot(on) its bot plays,
  // trigger (its numbers: trigger.wander is the gold glow's wait, in seconds)
  drs: DRS, toggleFps,
  jukebox: { get state() { return jukebox ? jukebox.info() : null; }, next() { return jukebox ? jukebox.next() : null; }, get stand() { return jukebox ? jukebox.stand.toArray() : null; } },
  answer: {
    get state() { return answer ? { ...answer.info(true), sv: svTrigger ? svTrigger.info() : null } : null; },
    cfg: ANSWER, trigger: SV_TRIGGER,
    knock(n) { return answer ? answer.knock(n) : false; },
    answer(initials, o) { return answer ? answer.answer(initials, o || {}) : false; },
    skip() { return answer ? answer.answer('AAA', { skip: true }) : false; },
    clearWave() { return svTrigger ? svTrigger.clearWave() : false; },
    jukebox(on) { return !!(answer && answer.devJukebox(on !== false)); },
    bot(on) { const c = cabs.fcab_starvector; if (c && c.runner) c.runner.botDrives = on !== false; return !!c; },
  },
  // the cabinet with no name: { now: true } reports the run's win at once; else level 7 (the Tunnel) and THE LET-GO, so its
  // passage plays on the tube and reports the win itself (stand at the cabinet first: __node.cabinet.open())
  winCabinet(opts) {
    if (!seven) return false;
    if (opts && opts.now) { seven._won(); return true; }
    return seven.jump(7).then(() => { const t0 = performance.now(); const go = () => { if (seven.win() || performance.now() - t0 > 8000) return; setTimeout(go, 100); }; go(); return true; });
  },
  // THE CABINET WITH NO NAME, for tests (tools/seven_*.mjs): its state and numbers, level n now, win / lose the round on the
  // glass, a quarter in when it wants one (a free one), walk up to it, the bots play the run, a time scale
  cabinet: {
    get state() { return seven ? seven.info() : null; },
    stats() { return seven ? JSON.parse(JSON.stringify(seven.stats)) : null; },
    jump(n) { return seven ? seven.jump(n) : null; },
    win() { return seven ? seven.win() : false; },
    lose() { return seven ? seven.lose() : false; },
    coin() {
      if (!seven || !seven.canStart || !seven.needsCoin) return false;
      S.quarters++; if (!payCabinet()) return false;
      if (activeCab !== seven) openCabinet('polybius'); else seven.start();
      return true;
    },
    open() {
      if (!seven || !seven.canStart || state !== 'play') return false;
      if (seven.needsCoin) { S.quarters++; if (!payCabinet()) return false; }
      openCabinet('polybius'); return true;
    },
    autoplay(o) {
      if (!seven) return false;
      seven.onCoinWanted = () => { S.quarters++; if (payCabinet()) seven.start(); };      // a quarter from the pocket (topped up)
      return seven.autoplay(o === undefined ? { kind: 'good' } : o);
    },
    speed(k) { if (seven) seven.timeScale = k ?? 1; return seven ? seven.timeScale : null; },
    // the full-screen glide: its state, and a slow-motion factor for pictures mid-glide (tests)
    glide(slow) { if (slow !== undefined) sevenCam.slow = Math.max(1, +slow || 1); const F = sevenFull(); return { on: sevenCam.on, t: +sevenCam.t.toFixed(3), out: !!sevenCam.out, slow: sevenCam.slow, full: F ? { d: +F.d.toFixed(3), fill: +F.fill.toFixed(3) } : null }; },
  },
  // tests only: the arcade's audio (tools/seven_sound*.mjs): the listener, the cabinet's sound, the arcade's own mix
  walkie: { cfg: WALKIE, stats: WK, atten: wkAtten, dist: wkDist, nextIn(sec) { S.walkieNext = clock + sec; }, call(k, w) { wkCall(WALKIE.calls[k], w || 'yard'); } },
  audio: { get listener() { return listener; }, get snd() { return sevenSnd; }, get bed() { return bed; }, get tape() { return tapeAudio; }, buffers },
  // tests only: run the delivery to its end at once (its own timeline, stepped fast)
  skipDelivery() { if (!delivery || delivery.t < 0) return false; let n = 0; while (!delivery.done && n++ < 2000) delivery.update(0.1); return delivery.done; },
  flashInfo() { return { count: { ...flashes.count }, attract: flashes.attractAt || null, avr: flashes.avrAt || null, gaze: flashes.gaze.bbs }; },
  cam(p, t, roll) { fixedCam = p ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t), roll: roll || 0 } : null; },
  tune(o) { if (o.lm !== undefined) W.scene.traverse((m) => { if (m.material && m.material.lightMap) m.material.lightMapIntensity = o.lm; });
    if (o.lights !== undefined) for (const l of Object.values(W.lights)) { l.intensity = l.userData.base * o.lights; }
    if (o.exposure !== undefined) pipe.mFinal.uniforms.exposure.value = Math.pow(2, o.exposure);
    if (o.bloom !== undefined) pipe.mFinal.uniforms.bloom.value = o.bloom; },
};
