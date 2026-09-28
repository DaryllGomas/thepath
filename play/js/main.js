// THE NODE · the web game.
// THE HANDSHAKE (js/handshake.js: the terminal the site opens on) -> white -> the cold open on the couch
// (ColdOpen.cs timings) -> the basement's beats (HomeStory / BBSBoard / LightningCat / DoorSwing) -> out the
// areaway -> the ride down -> the Junction -> the delivery -> the end card. #basement skips the Handshake to the old title screen.
import * as THREE from 'three';
import { Handshake } from './handshake.js';
import { loadOutside, OutdoorBody } from './outside.js';
import { Delivery, loadDeliveryModels } from './delivery.js';
import { FLOOR, dressCabinet, cabinetPose } from './arcade.js';
import { loadBasement, bakeReflections } from './world.js';
import { Pipeline } from './post.js';
import { Player } from './player.js';
import { Slides, BBS, Cabinet, loadCabinetRuntime } from './screens.js';
import { PITCH_HTML } from './pitch.js';

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
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));   // draw at the screen's own pixels (capped)
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const pipe = new Pipeline(renderer);
pipe.mode = settings.look;
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 80);
function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pipe.resize(w, h);
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- state
let fixedCam = null, ready = false, W = null, player = null, bbs = null, tv = null, runtime = null;
const cabs = {};
let state = 'loading';          // loading | title | intro | play | screen | waitOut | leaving | end
let paused = false, t0 = 0, clock = 0, introT = 0, releasedAt = 0, outFailed = false;
let hs = null, introWhite = false, loadError = null, markReady = null;
// outdoors (js/outside.js): loaded behind the basement; the areaway hands the controls to OutdoorBody
let OUT = null, outBody = null, basementGroup = null, region = 'in', leaveT = -1, leaveFrom = null, duskPlane = null;
let bikeRig = null, bikeParked = null, baseFog = null, baseBg = null, outFog = null, doorPivots = [], doorsT = -1;
const fillers = [], flynnView = {};
let delivery = null, polyScreen = null;
const LEAVE_TO = new THREE.Vector3(3.78, 0, -7.75);
const basementReady = new Promise((r) => { markReady = r; });
let screenMode = null, activeCab = null;
const S = { quarters: 0, kept: false, beaten: new Set(), lastRead: 0, bowl: false, used: false, idleHint: false, nudge1: false, nudge2: false, firstWinAt: 0, tape: 0 };
const keys = new Set(), taps = new Set();

// ---------------------------------------------------------------- HUD
let lineTimer = 0;
function line(text, secs = 4) { $('lineText').textContent = text; $('line').classList.add('on'); lineTimer = secs; }
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
  if (!mode) { el.classList.remove('on'); return; }
  const k = (t) => '<span class="key">' + t + '</span>';
  const away = '<span>' + k('&#9003;') + ' WALK AWAY</span>';
  el.innerHTML = {
    bbs: '<span>' + k('E') + ' NEXT</span><span>' + k('&#9003;') + ' LOG OFF</span>',
    gridcycles: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' STEER</span>' + away,
    starvector: '<span>' + k('&larr;') + k('&rarr;') + ' TURN</span><span>' + k('&uarr;') + ' THRUST</span><span>' + k('SPACE') + ' FIRE</span><span>' + k('X') + ' SHIELD</span>' + away,
    relicquest: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' WALK</span><span>' + k('SPACE') + ' SWORD</span><span>' + k('X') + ' TORCH</span>' + away,
    sunsetdrive: '<span>' + k('&larr;') + k('&rarr;') + ' STEER</span><span>' + k('SPACE') + ' GAS</span><span>' + k('X') + ' BRAKE</span>' + away,
    afterglow: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' FLY</span><span>' + k('SPACE') + ' MISSILES</span><span>' + k('X') + ' BARREL ROLL</span>' + away,
    warlordsroad: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' MOVE</span><span>' + k('SPACE') + ' ATTACK</span><span>' + k('X') + ' JUMP</span>' + away,
    deepkeep: '<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' MOVE</span><span>' + k('SPACE') + ' FIRE</span><span>' + k('X') + ' POTION</span>' + away,
  }[mode] || ('<span>' + k('&larr;') + k('&rarr;') + k('&uarr;') + k('&darr;') + ' MOVE</span><span>' + k('SPACE') + ' A</span><span>' + k('X') + ' B</span>' + away);
  el.classList.add('on');
}
let toastT = 0;
function toast(text) { line(text, 1.6); toastT = 1.6; }

// ---------------------------------------------------------------- audio (recordings only)
const listener = new THREE.AudioListener(); camera.add(listener);
const bed = new THREE.Audio(listener);
let tapeAudio = null; const buffers = {};
const audioLoader = new THREE.AudioLoader();
function loadAudio(name) { return new Promise((res) => audioLoader.load('assets/audio/' + name, (b) => { buffers[name] = b; res(b); }, undefined, () => res(null))); }
function startAudio() {
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
const OURS = new Set(['starvector', 'relicquest', 'gridcycles']);      // only our three bring the van
const floorCabs = new Map();                                           // Flynn's floor: id -> { p, acc }
const paid = (id) => id.startsWith('fcab_') || id.startsWith('fc_');
let interactables = [];
function buildInteractables() {
  interactables = W.meta.interactables.map((i) => ({ ...i, enabled: true, p: new THREE.Vector3(...i.pos) }));
}
function promptFor(i) {
  switch (i.id) {
    case 'cushions': return 'DIG IN THE CUSHIONS';
    case 'bowl': return "FILL LIGHTNING'S BOWL";
    case 'bbs': return Math.min(S.beaten.size, 3) > S.lastRead ? 'READ THE BOARD · NEW POST' : 'READ THE BOARD';
    case 'stairs_door': return 'OPEN';
    case 'jukebox': return 'PICK A TAPE';
    case 'areaway': return 'GO OUTSIDE';
    case 'bike': return 'GET ON THE BIKE';
    case 'flynns_door': return "GO INTO THE JUNCTION";
    case 'change': return 'GET CHANGE';
    case 'polybius': return 'INSERT COIN';
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
    case 'polybius': theEndForNow(); break;
    default:
      if (paid(i.id)) {
        if (spendable() <= 0) { line('Out of quarters. The change machine is by the door.', 3.5); break; }
        S.quarters--; pocket(); openCabinet(i.id); break;
      }
      if (CART[i.id]) openCabinet(i.id);
  }
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
  const idx = Math.min(S.beaten.size, 3);
  bbs.read(idx); S.lastRead = Math.max(S.lastRead, idx);
  setPrompt(null); cabHint('bbs'); setBoost(true);
}
function openCabinet(id) {
  const cab = cabs[id]; if (!cab) return;
  state = 'screen'; screenMode = 'cab'; activeCab = cab;
  if (flynnView[id]) player.lookAtPose(flynnView[id].pos, flynnView[id].target);
  else { const s = faceRoom(screenOf(SCREEN[id])); player.lookAt(s.center, s.normal, Math.max(s.size.y, 0.3) * 0.98 + 0.06); }
  cab.onOver = (won) => {
    if (won) markBeaten(id);
    setTimeout(() => { if (state === 'screen' && activeCab === cab) closeScreen(); }, 900);
  };
  cab.start();
  setPrompt(null); cabHint(CART[id]); setBoost(true);
}
function markBeaten(id) {
  const game = CART[id] || id;
  if (!OURS.has(game)) { if (!S.others) S.others = new Set(); S.others.add(game); setTimeout(() => line('You beat ' + (LABEL[id] || game) + '.', 3), 1200); return; }
  if (S.beaten.has(game)) return;
  S.beaten.add(game);
  if (!S.firstWinAt) S.firstWinAt = clock;
  const msg = S.beaten.size >= 3 ? (region === 'out' ? 'All three of ours.' : 'All three. The board will know.') : (region === 'out' ? S.beaten.size + ' of ours down.' : 'Check the board.');
  setTimeout(() => line(msg, 3.5), 1200);
}
function closeScreen() {
  if (screenMode === 'cab' && activeCab && activeCab.playing) activeCab.abort();
  if (screenMode === 'bbs') bbs.close();
  screenMode = null; activeCab = null; state = 'play';
  player.release(); cabHint(null); setBoost(false);
}
function setBoost(on) { pipe.boost = on; pipe.resize(pipe.w, pipe.h, true); }
function screenKey(code) {
  if (code === 'Backspace' || (screenMode === 'bbs' && !bbs.typing && (code === 'KeyE' || code === 'Enter' || code === 'Space'))) { closeScreen(); return; }
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
  // THE DELIVERY: three of ours beaten and you are at Flynn's (inside, or coming up the street)
  if (delivery && delivery.t < 0 && S.beaten.size >= 3 && state === 'play' && (S.inFlynns || Math.hypot(player.pos.x - 82, player.pos.z + 163) < 45)) {
    delivery.start(() => { const di = interactables.find((i) => i.id === 'flynns_door'); if (di && di.enabled) openFlynnsDoors(di); }, () => line('No name on it.', 4));
  }
  if (delivery) delivery.update(dt);
  if (polyScreen) polyScreen.update(dt);
  const inside = player.pos.x > 72 && player.pos.x < 92 && player.pos.z < -168 && player.pos.z > -182;
  if (inside && !S.inFlynns) { S.inFlynns = true; if (!S.flynnsSeen) { S.flynnsSeen = true; line("The Junction. Three of ours on the left. Change machine by the door.", 5); } }
  // the lino's reflection of the room (js/outside.js SHEEN): one small cube, the first time you are inside
  if (inside && OUT.captureSheen && !S.sheen) S.sheen = OUT.captureSheen(renderer, W.scene);
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

// ---------------------------------------------------------------- Flynn's
function openFlynnsDoors(i) { i.enabled = false; doorsT = 0; }
function getChange() {
  const add = Math.max(0, Math.min(4, 12 - S.quarters));
  if (!add) { line('Your pockets are full.', 2.5); return; }
  S.quarters += add; pocket(); line(['', 'One quarter', 'Two quarters', 'Three quarters', 'Four quarters'][add] + '. On the house.', 3);
}
function theEndForNow() {
  state = 'end'; setPrompt(null);
  const secs = Math.round(clock - releasedAt);
  $('endStats').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} IN 1982 · ${S.beaten.size} OF 3 BEATEN`;
  $('endTitle').textContent = 'THE CABINET WITH NO NAME';
  $('endText').textContent = "It's here. That's where the web game stops for now. Next time, you put a quarter in.";
  $('end').hidden = false; unlock(); $('btnAgain').focus(); $('hud').style.opacity = 0;
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
    cabs[id] = new Cabinet(scr.material, cart, title, frames(g), runtime);
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
    LABEL[id] = title; CART[id] = game; flynnView[id] = { pos: pose.eye, target: pose.target };
    interactables.push({ id, region: 'out', enabled: true, p: pose.stand, radius: 1.05, maxRise: 0 });
    floorCabs.set(id, { p: pose.target, acc: 0 });
  }
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
  // the cabinet with no name: the spot stays empty until the delivery; its glow waits with it
  const pg = O.byName.PolyGlow; if (pg) { pg.on = false; }
  loadDeliveryModels().then((models) => {
    delivery = new Delivery({ O, models });
    delivery.onArrive = () => { if (S.inFlynns) line('Headlights outside.', 3.5); };
    delivery.onPlaced = () => {
      if (pg) pg.on = true;
      const pc = (O.comps.PolybiusCabinet || [])[0];
      const scr = O.screens['Outside/Flynns/FlynnsInterior/PolybiusSpot/Visual/PolybiusCab/Screen'];
      const fr = pc ? (pc.fields.attractFrames || []).filter(Boolean).map((f) => 'assets/' + f) : [];
      if (scr && fr.length) polyScreen = new Slides(scr.material, fr, pc.fields.attractHoldSeconds || 8, pc.fields.attractFadeSeconds || 2);
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

// ---------------------------------------------------------------- input
let dragLook = false, dragging = false, lastX = 0, lastY = 0;
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
document.addEventListener('pointerlockerror', () => { dragLook = true; });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { dragLook = false; return; }
  if (!paused && (state === 'play' || state === 'screen' || state === 'intro')) pause(true);
});
addEventListener('mousemove', (e) => {
  if (paused || !player) return;
  if (document.pointerLockElement === canvas) { if (state === 'play') player.look(e.movementX, e.movementY); return; }
  if (dragLook && dragging && state === 'play') { player.look((e.clientX - lastX) * 1.2, (e.clientY - lastY) * 1.2); lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('mousedown', (e) => {
  if (state === 'play' || state === 'screen' || state === 'intro') {
    if (!document.pointerLockElement && !dragLook) lock();
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('keydown', (e) => {
  if (state === 'handshake' || state === 'loading') return;   // the terminal owns the keys (js/handshake.js)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code) && state !== 'title') e.preventDefault();
  if (e.code === 'Escape') { if (!$('pitch').hidden) { closePitch(); return; } if (paused) resume(); else if (state === 'play' || state === 'screen' || state === 'intro') pause(false); return; }
  if (paused) return;
  keys.add(e.code); taps.add(e.code);
  if (e.repeat) return;
  if (state === 'title' && e.code === 'Enter' && $('pitch').hidden) { begin(); return; }
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
  paused = true; show('pause', true); keys.clear();
  syncSettingsUI(); $('btnResume').focus();
}
function resume() { paused = false; show('pause', false); lock(); canvas.focus(); }
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
$('btnPitch').onclick = openPitch; $('btnPausePitch').onclick = openPitch; $('btnEndPitch').onclick = openPitch;
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
const perf = { frames: 0, acc: 0, fps: 0, loadMs: 0 };
function stats() {
  return { fps: perf.fps, loadMs: perf.loadMs, drawCalls: W ? W.drawCalls : 0, tris: renderer.info.render.triangles, live: runtime ? runtime.ids().filter((i) => ['gridcycles', 'starvector', 'relicquest'].includes(i)) : [] };
}

// ---------------------------------------------------------------- main loop
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000; const dt = Math.min(0.05, t - (t0 || t)); t0 = t;
  if (!ready || state === 'handshake') return;
  perf.frames++; perf.acc += dt; if (perf.acc > 1) { perf.fps = Math.round(perf.frames / perf.acc); perf.frames = 0; perf.acc = 0; }
  if (!paused) {
    clock += dt;
    if (lineTimer > 0) { lineTimer -= dt; if (lineTimer <= 0) $('line').classList.remove('on'); }
    tv.update(dt); bbs.update(dt);
    const input = state === 'screen' && screenMode === 'cab' ? cabInput() : null;
    for (const [id, c] of Object.entries(cabs)) {
      // the floor's attract loops run only near you, and at 20 Hz: 26 live screens stay cheap
      const fc = floorCabs.get(id);
      if (fc && c !== activeCab) {
        if (region !== 'out' || !S.inFlynns || fc.p.distanceToSquared(camera.position) > 81) continue;
        fc.acc += dt; if (fc.acc < 0.05) continue;
        c.update(fc.acc, null); fc.acc = 0; continue;
      }
      c.update(dt, c === activeCab ? input : null);
    }
    for (const s of Object.values(W.screens)) s.material.uniforms.time.value = clock;
    const crtGlow = W.lights.CRTGlow; if (crtGlow) crtGlow.intensity = crtGlow.userData.base * (0.95 + 0.05 * noise(clock * 2));
    updateCat(dt);
    if (state === 'title') updateTitleCam(clock);
    else {
      if (state === 'intro') updateIntro(dt);
      if (state === 'play') { player.update(dt, keys); if (region === 'in') updateStory(); const i = (region === 'out' && outBody.bike.mounted) ? null : pick(); setPrompt(i ? promptFor(i) : (region === 'out' && outBody.bike.mounted && Math.abs(outBody.bike.speed) < 0.5 ? 'GET OFF' : null)); }
      if (state === 'waitOut') updateWaitOut();
      if (state === 'leaving') updateLeaving(dt);
      if (region === 'out') updateOutdoors(dt);
      player.apply(dt);
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
  if (jump !== 'basement') {
    // the site opens on the terminal; the basement loads behind it
    state = 'handshake'; show('loading', false);
    let returning = false; try { returning = localStorage.getItem('node.handshake.v1') === '1'; } catch (e) { /* private window */ }
    hs = new Handshake($('hs'), { ctx: listener.context, volume: () => settings.vol, returning, jump });
    hs.run().then(afterHandshake);
  } else show('hs', false);
  try {
    const audioP = Promise.all(['juke_06.mp3', 'juke_02.mp3', 'juke_09.mp3'].map(loadAudio));
    const runtimeP = loadCabinetRuntime();
    W = await loadBasement('', { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) }, (f) => { $('loadFill').style.width = Math.round(f * 100) + '%'; });
    runtime = await runtimeP;
    player = new Player(camera, W.colliders); player.sens = settings.sens; player.invert = settings.invert;
    W.scene.add(camera);
    buildInteractables();
    tv = new Slides(W.screens.M_CRT_TV.material, ['assets/art/tv_walkers_01.jpg', 'assets/art/tv_walkers_02.jpg'], 6, 2);
    bbs = new BBS(W.screens.M_CRT_BBS.material);
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
      .then(attachOutside).catch((e) => { outFailed = true; console.error('[outside]', e); });
    if (state === 'handshake') return;
    show('loading', false); show('title', true); state = 'title'; $('btnBegin').focus();
  } catch (e) {
    console.error(e);
    $('loadErr').hidden = false; $('loadErr').textContent = 'Could not open the basement: ' + (e && e.message || e);
    loadError = e; markReady();
  }
}
boot();

// ---------------------------------------------------------------- hooks for the headless playtest (tools/playtest.mjs)
window.__node = {
  get state() { return { state, paused, screenMode, hs: hs ? hs.stage : null, region, outside: !!OUT, warm: !!S.outsideWarm, delivery: delivery ? { t: +delivery.t.toFixed(1), placed: !!delivery.placed, done: delivery.done } : null, bike: outBody ? { mounted: outBody.bike.mounted, speed: +outBody.bike.speed.toFixed(2), slope: +outBody.bike.slope.toFixed(3) } : null, dusk: OUT ? +(OUT.k || 0).toFixed(2) : null, inFlynns: !!S.inFlynns, clock: +clock.toFixed(2), pos: player && player.pos.toArray().map((v) => +v.toFixed(3)), yaw: player && +player.yaw.toFixed(3),
    prompt: $('prompt').classList.contains('on') ? $('promptText').textContent : null, line: $('line').classList.contains('on') ? $('lineText').textContent : null,
    quarters: S.quarters, beaten: [...S.beaten], cat: cat.where, fps: perf.fps, loadMs: perf.loadMs, drawCalls: W && W.drawCalls,
    live: runtime ? runtime.ids().filter((i) => ['gridcycles', 'starvector', 'relicquest'].includes(i)) : [], tris: renderer.info.render.triangles, calls: renderer.info.render.calls }; },
  begin, skipIntro() { introT = 9.99; },
  goOut() { goOutside(); },
  outside() { return OUT ? { drawCalls: OUT.drawCalls, lights: OUT.assigned ? OUT.assigned.map((l) => l.name) : [], env: !!OUT.env, inside: +(OUT.inside || 0).toFixed(2) } : null; },
  envTune(o) { return OUT && OUT.envTune ? OUT.envTune(o) : null; },
  warp(x, y, z, yaw) { player.place(x, y, z, yaw ?? player.yaw); },
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
  internals() { return { THREE, W, OUT, camera, renderer, pipe }; },
  win(id) { markBeaten(id); },
  cam(p, t, roll) { fixedCam = p ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t), roll: roll || 0 } : null; },
  tune(o) { if (o.lm !== undefined) W.scene.traverse((m) => { if (m.material && m.material.lightMap) m.material.lightMapIntensity = o.lm; });
    if (o.lights !== undefined) for (const l of Object.values(W.lights)) { l.intensity = l.userData.base * o.lights; }
    if (o.exposure !== undefined) pipe.mFinal.uniforms.exposure.value = Math.pow(2, o.exposure);
    if (o.bloom !== undefined) pipe.mFinal.uniforms.bloom.value = o.bloom; },
};
