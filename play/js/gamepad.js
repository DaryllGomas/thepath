// THE PATH · gamepad.js: native controller support (Gamepad API, "standard" mapping: Xbox, PlayStation, 8BitDo, Switch pads).
//
//   import { PadBridge } from './gamepad.js';
//   const pad = new PadBridge({ context: () => 'walk', onActive: (on) => {...} });
//
// It does nothing at all until a pad is present (browsers only show a pad after its first button press).
// It works by being a second keyboard: a pad button is turned into the same KeyboardEvent the game already listens
// for (E, Backspace, Escape, Space, X, Enter, the arrows) on `window`, so main.js, the cabinet host's KeyboardPanel,
// the cabinet with no name's SevenKeys and the Handshake all take the pad without knowing it exists. The analog parts
// (walking speed, the right stick's look, the bike's steering and pedal) are read from `pad.move` / `pad.look`.
//
// context() says what the pad is for right now:
//   'walk'       on foot (also the BBS at its screen, the ending): stick walks, right stick looks, A use, B step away
//   'bike'       on the bike: A on/off, RT (or stick up) pedals, stick steers, LT (or stick down) brakes, hold RB for the walkie
//   'cab'        at a cabinet: stick / d-pad = the cabinet's stick, A fire, B its B (roll), Start its START (the coin goes in with A at INSERT COIN, as E does), Select walk away
//   'menu'       title / pause / end / pitch: d-pad or stick moves the focus, A presses, B backs out
//   'handshake'  the opening terminal: A advances, d-pad picks a command link, Start or B skips
//   anything else: the pad is quiet
//
//   MAPPING (W3C standard): A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Select=8 Start=9 L3=10 R3=11 d-pad=12..15
export const DEADZONE = 0.2;
const PRESS = 0.5, RELEASE = 0.35;                 // the stick as arrow keys (hysteresis, so a flick is a clean edge)
const LOOK_YAW = 1180, LOOK_PITCH = 760;           // px/s at full tilt (player.look's units: x 0.0022 rad per px, so ~2.6 and ~1.7 rad/s)

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const KEY = { // code -> key (what KeyboardEvent.key would be)
  KeyE: 'e', Backspace: 'Backspace', Escape: 'Escape', KeyV: 'v', Space: ' ', KeyX: 'x', Enter: 'Enter',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
};

// a stick axis with the dead zone taken out and rescaled so it eases in from 0
export function dead(v, dz = DEADZONE) { const a = Math.abs(v); return a < dz ? 0 : Math.sign(v) * (a - dz) / (1 - dz); }
// the look curve: gentle near the centre, full speed at the rim
const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
// a pad with a button down or a stick pushed past halfway (no arrays made: this runs every frame)
function inUse(p) {
  const b = p.buttons, a = p.axes;
  for (let i = 0; i < b.length; i++) if (b[i].pressed) return true;
  for (let i = 0; i < 4 && i < a.length; i++) if (Math.abs(a[i]) > 0.5) return true;
  return false;
}

export class PadBridge {
  constructor({ context = () => 'none', onActive = null, target = globalThis.window } = {}) {
    this.context = context; this.onActive = onActive; this.target = target;
    this.connected = false; this.active = false; this.id = '';
    this.move = { x: 0, y: 0, hurry: false, rt: 0, lt: 0 };    // analog, already dead-zoned; zero outside 'walk' / 'bike'
    this.look = { x: 0, y: 0 };                                 // the right stick after the curve (-1..1); zero outside 'walk' / 'bike'
    this.held = new Set();          // key codes this pad is holding down right now
    this.prev = null;               // last frame's button states
    this.block = new Set();         // buttons that were down when the context changed: ignored until let go
    this.ctx = 'none';
    this.dir = { up: false, down: false, left: false, right: false };   // the stick as four digital directions
    this.menuDir = { v: 0, h: 0, t: 0 };
    this.sel = null;                // handshake: the command link the pad has picked
    this._raf = 0; this._t = 0; this._ext = -1e9; this._padT = -1e9; this._goneT = 0;
    this._down = new Array(17).fill(false); this.prev = null; this._want = new Set(); this._none = new Set();
    const T = target;
    if (!T || !T.addEventListener) return;
    T.addEventListener('gamepadconnected', () => { this.connected = true; });
    T.addEventListener('gamepaddisconnected', () => { this.poll(); });
    // the keyboard or mouse taking over: only real (trusted) events count, never the pad's own synthetic ones
    const kb = (e) => { if (e.isTrusted) this.setActive(false); };
    T.addEventListener('keydown', kb, true); T.addEventListener('mousedown', kb, true);
    // (a real mouse move hands the hints back to the keyboard, but not a twitch of a mouse resting on the desk while the pad is in use)
    T.addEventListener('mousemove', (e) => { if (e.isTrusted && (Math.abs(e.movementX) + Math.abs(e.movementY) > 8) && performance.now() - this._padT > 600) this.setActive(false); }, true);
    T.addEventListener('blur', () => this.releaseAll());
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    if (globalThis.document && document.body) document.body.classList.toggle('padmode', on);
    if (this.onActive) this.onActive(on);
  }

  loop(t) {
    const dt = Math.min(0.1, Math.max(0, (t - (this._t || t)) / 1000)); this._t = t;
    // the game's frame drives the pad (tick) so the stick is read on the same clock as the camera; this loop only covers
    // the moments the game's loop isn't running
    if (performance.now() - this._ext > 120) { try { this.step(dt); } catch (e) { console.error('[gamepad]', e); } }
    this._raf = requestAnimationFrame((t2) => this.loop(t2));
  }
  /** called by the game's own frame, before it reads pad.move / pad.look */
  tick(dt) { this._ext = performance.now(); try { this.step(dt); } catch (e) { console.error('[gamepad]', e); } }

  pick() {
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    let best = null, busy = null;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]; if (!p || !p.connected) continue;
      if (!best || (p.mapping === 'standard' && best.mapping !== 'standard')) best = p;
      // 2026-10-16 (TV): a pad that's being used wins over an idle one (a second pad on the couch, or the TV's test pad)
      if (!busy && inUse(p)) busy = p;
    }
    return busy || best;
  }
  poll() { return this.pick(); }

  // ---- the synthetic keyboard
  fire(type, code) {
    // (to the focused element when there is one, so the terminal's own input hears it; it bubbles up to window either way)
    const f = globalThis.document && document.activeElement, T = f && f !== document.body && f !== document.documentElement ? f : this.target;
    if (!T) return;
    T.dispatchEvent(new KeyboardEvent(type, { code, key: KEY[code] || code, bubbles: true, cancelable: true }));
  }
  tap(code) { this.fire('keydown', code); this.fire('keyup', code); }
  syncHeld(want) {
    for (const c of this.held) if (!want.has(c)) { this.held.delete(c); this.fire('keyup', c); }
    for (const c of want) if (!this.held.has(c)) { this.held.add(c); this.fire('keydown', c); }
  }
  releaseAll() { this.syncHeld(this._none); }

  // ---- one frame
  step(dt) {
    const gp = this.pick();
    if (!gp) {
      this.releaseAll(); this.move.x = this.move.y = this.move.rt = this.move.lt = 0; this.move.hurry = false; this.look.x = this.look.y = 0;
      if (this.connected) {
        // a pad that drops off the bus for a moment (a worn cable or socket: Daryll's first pad came and went every second,
        // kernel error -71) keeps the pad hints; only one gone for 2 s hands them back to the keyboard
        const now = performance.now(); if (!this._goneT) this._goneT = now;
        if (now - this._goneT > 2000) { this.connected = false; this.id = ''; this.prev = null; this._goneT = 0; this.setActive(false); }
      }
      return;
    }
    if (this._goneT) { this._goneT = 0; this.prev = null; }     // (back after a blip: buttons already down wait to be let go)
    if (!this.connected) this.connected = true;
    this.id = gp.id;
    const b = (i) => { const o = gp.buttons[i]; return !!o && (o.pressed || o.value > 0.5); };
    const down = this._down; for (let i = 0; i < 17; i++) down[i] = b(i);
    const trig = (i) => { const o = gp.buttons[i]; return o ? Math.max(o.value || 0, o.pressed ? 1 : 0) : 0; };
    const ax = (i) => (gp.axes[i] || 0);
    const lx = dead(ax(0)), ly = dead(ax(1)), rx = dead(ax(2)), ry = dead(ax(3));
    const rawL = Math.max(Math.abs(ax(0)), Math.abs(ax(1)));

    // a pad button held while the thing it belonged to changed does not fire in the new one until it is let go
    const ctx = this.context() || 'none';
    if (!this.prev) { this.prev = down.slice(); for (let i = 0; i < 17; i++) if (down[i]) this.block.add(i); }   // (once per connect: a pad already held down when it appears)
    if (ctx !== this.ctx) { this.ctx = ctx; this.sel = null; for (let i = 0; i < 17; i++) if (down[i]) this.block.add(i); this.releaseAll(); }
    for (const i of this.block) if (!down[i]) this.block.delete(i);
    const edge = (i) => down[i] && !this.prev[i] && !this.block.has(i);
    const held = (i) => down[i] && !this.block.has(i);

    // the pad becoming the active device
    if (down.some((d, i) => d && i !== 16) || rawL > 0.6 || Math.max(Math.abs(ax(2)), Math.abs(ax(3))) > 0.6 || trig(6) > 0.3 || trig(7) > 0.3) { this._padT = performance.now(); this.setActive(true); }

    // the stick as four digital directions (hysteresis)
    const d = this.dir, sx = ax(0), sy = ax(1);
    const upd = (k, v) => { d[k] = d[k] ? v > RELEASE : v > PRESS; };
    upd('left', -sx); upd('right', sx); upd('up', -sy); upd('down', sy);
    const L = held(BTN.LEFT) || d.left, R = held(BTN.RIGHT) || d.right, U = held(BTN.UP) || d.up, D = held(BTN.DOWN) || d.down;

    this.move.x = this.move.y = this.move.rt = this.move.lt = 0; this.move.hurry = false; this.look.x = this.look.y = 0;
    const want = this._want; want.clear();

    if (ctx === 'walk' || ctx === 'bike') {
      this.move.x = lx; this.move.y = -ly;
      if (held(BTN.UP) || held(BTN.DOWN) || held(BTN.LEFT) || held(BTN.RIGHT)) {     // the d-pad also walks
        this.move.x = Math.max(-1, Math.min(1, this.move.x + (held(BTN.RIGHT) ? 1 : 0) - (held(BTN.LEFT) ? 1 : 0)));
        this.move.y = Math.max(-1, Math.min(1, this.move.y + (held(BTN.UP) ? 1 : 0) - (held(BTN.DOWN) ? 1 : 0)));
      }
      this.move.hurry = held(BTN.LB) || held(BTN.L3);
      this.move.rt = this.block.has(BTN.RT) ? 0 : trig(BTN.RT); this.move.lt = this.block.has(BTN.LT) ? 0 : trig(BTN.LT);
      const m = Math.hypot(lx, ly); if (m > 1) { this.move.x /= m; this.move.y /= m; }
      this.look.x = curve(rx); this.look.y = curve(ry);
      if (edge(BTN.A)) this.tap('KeyE');
      if (edge(BTN.B)) this.tap('Backspace');
      if (edge(BTN.START)) this.tap('Escape');
      if (edge(BTN.SELECT)) this.tap('KeyV');
      if (edge(BTN.Y)) this.tap('KeyE');          // (a second hand for "use")
      if (ctx === 'bike' && (held(BTN.RB) || held(BTN.Y))) want.add('KeyT');   // hold to key the walkie
    } else if (ctx === 'cab') {
      if (L) want.add('ArrowLeft'); if (R) want.add('ArrowRight'); if (U) want.add('ArrowUp'); if (D) want.add('ArrowDown');
      if (held(BTN.A) || trig(BTN.RT) > 0.5 && !this.block.has(BTN.RT)) want.add('Space');
      if (held(BTN.B) || held(BTN.X) || trig(BTN.LT) > 0.5 && !this.block.has(BTN.LT)) want.add('KeyX');
      if (held(BTN.START)) want.add('Enter');
      if (edge(BTN.SELECT)) this.tap('Backspace');       // walk away (B stays the cabinet's B)
      if (edge(BTN.A)) this.tap('KeyE');                  // (a lost game at the cabinet with no name asks for a quarter on E; Space also fires)
    } else if (ctx === 'menu') {
      this.menu(dt, edge, U, D, L, R);
    } else if (ctx === 'handshake') {
      this.terminal(dt, edge, U, D, L, R);
    }
    this.syncHeld(want);
    for (let i = 0; i < 17; i++) this.prev[i] = down[i];
  }

  // ---- menus: rows of buttons; up/down changes row, left/right moves along a row or nudges a slider
  layer() {
    for (const id of ['pitch', 'pause', 'title', 'end']) { const e = document.getElementById(id); if (e && !e.hidden) return e; }
    return null;
  }
  menu(dt, edge, U, D, L, R) {
    const layer = this.layer(); if (!layer) return;
    // repeat while held: first after 0.4 s, then every 0.14 s
    const v = (D ? 1 : 0) - (U ? 1 : 0), h = (R ? 1 : 0) - (L ? 1 : 0), md = this.menuDir;
    let stepV = 0, stepH = 0;
    if (v !== md.v || h !== md.h) { md.v = v; md.h = h; md.t = 0.4; stepV = v; stepH = h; }
    else if (v || h) { md.t -= dt; if (md.t <= 0) { md.t = 0.14; stepV = v; stepH = h; } }
    const a = edge(BTN.A), bk = edge(BTN.B), st = edge(BTN.START);
    // nothing pressed and the focus already on one of this menu's controls: nothing to do (the item scan below reads
    // layout, offsetParent, so it only runs when the pad asks for something, never every frame)
    const act = document.activeElement;
    if (!stepV && !stepH && !a && !bk && !st && act && act !== layer && layer.contains(act)) return;
    const items = [...layer.querySelectorAll('button, input[type=range]')].filter((e) => !e.disabled && e.offsetParent !== null);
    if (!items.length) return;
    const rows = []; for (const e of items) { const p = e.parentElement; let r = rows.find((x) => x.p === p); if (!r) rows.push(r = { p, items: [] }); r.items.push(e); }
    let cur = items.includes(act) ? act : (layer.querySelector('button.on') || items[0]);
    if (cur !== act) { cur.focus(); return; }
    const ri = rows.findIndex((r) => r.items.includes(cur)), row = rows[ri], ci = row.items.indexOf(cur);
    if (stepV) { const nr = rows[Math.max(0, Math.min(rows.length - 1, ri + stepV))]; nr.items[Math.min(ci, nr.items.length - 1)].focus(); }
    else if (stepH) {
      if (cur.type === 'range') {
        const sp = +cur.step || 0.05, nv = Math.max(+cur.min, Math.min(+cur.max, +cur.value + stepH * sp));
        cur.value = nv; cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (row.items.length > 1) row.items[Math.max(0, Math.min(row.items.length - 1, ci + stepH))].focus();
    }
    const id = layer.id;
    if (a && cur.tagName === 'BUTTON') cur.click();
    else if (bk) {
      if (id === 'pitch') document.getElementById('btnPitchClose').click();
      else if (id === 'pause') this.tap('Escape');
    } else if (st) {
      if (id === 'pause') this.tap('Escape');
      else if (id === 'title') document.getElementById('btnBegin').click();
      else if (id === 'end') document.getElementById('btnAgain').click();
      else if (id === 'pitch') document.getElementById('btnPitchClose').click();
    }
  }

  // ---- the Handshake: A moves it on (any key does at "press any key"; Enter rushes the text and sends the line),
  // up/down picks one of the command links on the screen, Start or B skips (Esc, once the skip is offered).
  // Typing on a pad, the arcade way (a high-score table's initials): right starts a new letter, up/down change it,
  // left erases, A sends the line. With no command links on the screen, up/down start a letter too.
  terminal(dt, edge, U, D, L, R) {
    const root = document.getElementById('hs'); if (!root) return;
    const hs = globalThis.__hs, asking = !!(hs && hs.asking && !hs.auto && !hs.streaming && hs.inp);
    const text = asking ? hs.inp.value : '';
    if (asking && this.active && hs.hint && hs.hint.classList.contains('on') && hs.hint.textContent !== PAD_TYPE_HINT) hs.hint.textContent = PAD_TYPE_HINT;
    // (directions on their first press, then repeating while held, as in the menus)
    const v = (D ? 1 : 0) - (U ? 1 : 0), h = (R ? 1 : 0) - (L ? 1 : 0), md = this.menuDir;
    let stepV = 0, stepH = 0;
    if (v !== md.v || h !== md.h) { md.v = v; md.h = h; md.t = 0.4; stepV = v; stepH = h; }
    else if (v || h) { md.t -= dt; if (md.t <= 0) { md.t = 0.12; stepV = v; stepH = h; } }
    if (this.sel && !this.sel.isConnected) this.sel = null;
    const typing = asking && text.length > 0;
    if (asking && (stepH || (typing && stepV))) {
      if (this.sel) { this.sel.classList.remove('padsel'); this.sel = null; }
      let t = text;
      if (stepH > 0) t += 'A';
      else if (stepH < 0) t = t.slice(0, -1);
      else if (stepV) { const i = LETTERS.indexOf(t.slice(-1)); t = t.slice(0, -1) + LETTERS[(Math.max(0, i) + (stepV < 0 ? 1 : -1) + LETTERS.length) % LETTERS.length]; }
      hs.inp.value = t; hs.inp.dispatchEvent(new Event('input'));
    } else if (stepV && (v !== 0) && md.t === 0.4) {
      // up/down on its first press: pick a command link (the newest menu's links; older ones scroll away). The scan
      // reads layout, so it runs on the press, not every frame.
      const pr = root.getBoundingClientRect();
      const last = [...root.querySelectorAll('[data-cmd]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= pr.top && r.bottom <= pr.bottom; }).slice(-6);
      if (last.length) {
        const i = this.sel ? last.indexOf(this.sel) : -1, j = i < 0 ? (v > 0 ? 0 : last.length - 1) : Math.max(0, Math.min(last.length - 1, i + v));
        if (this.sel) this.sel.classList.remove('padsel'); this.sel = last[j]; this.sel.classList.add('padsel');
      } else if (asking) { hs.inp.value = 'A'; hs.inp.dispatchEvent(new Event('input')); }
    }
    if (edge(BTN.A)) {
      if (this.sel) { this.sel.classList.remove('padsel'); const s = this.sel; this.sel = null; s.click(); }
      else this.tap('Enter');
    }
    if (edge(BTN.START) || edge(BTN.B)) this.tap('Escape');
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const PAD_TYPE_HINT = '→ NEW LETTER · ↑↓ CHANGE IT · ← ERASE · A ENTER';   // (the terminal's "type, then press enter" line, for a pad)

// ---- the on-screen hint row, in pad glyphs: keycaps become A / B / START / SELECT / a stick
// html is the controls row cabHint built (spans of `<span class="key">..</span>` caps); returns the same row for a pad.
export function padHint(html) {
  const cap = (t, cls = '') => '<span class="key pad ' + cls + '">' + t + '</span>';
  const ARROW = '(?:&larr;|&rarr;|&uarr;|&darr;)', KEYC = (inner) => '<span class="key">' + inner + '</span>';
  let s = html;
  // walking away from a cabinet is Select; at the board it is B
  s = s.replace(new RegExp(KEYC('&#9003;') + '( WALK AWAY)', 'g'), cap('SELECT', 'pill') + '$1');
  s = s.replace(new RegExp(KEYC('&#9003;'), 'g'), cap('B'));
  // the barrel roll: B (or flick the stick twice)
  s = s.replace(new RegExp(KEYC('&larr;&larr;') + '/' + KEYC('&rarr;&rarr;'), 'g'), cap('B'));
  // a run of arrows is the stick
  s = s.replace(new RegExp('(?:' + KEYC(ARROW) + ')+', 'g'), cap('', 'stick'));
  s = s.replace(new RegExp(KEYC('&larr;&rarr;&uarr;&darr;'), 'g'), cap('', 'stick'));
  const map = { SPACE: 'A', Z: 'A', E: 'A', X: 'B', SHIFT: 'B', ENTER: 'START' };
  s = s.replace(/<span class="key">([A-Z]+)<\/span>/g, (m, t) => (map[t] ? cap(map[t], map[t] === 'START' ? 'pill' : '') : m));
  return s;
}
