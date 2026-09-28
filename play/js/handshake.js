// THE HANDSHAKE · the game before the game (docs/THE_GAME/THE_LINE_2026-09-26.md, beats 1–3).
// The site loads straight into it: a phone line, a modem that fails twice and then connects, a 1982 terminal
// called NODE/0, a name-based login, GRID/3 (it can't be beaten), LAST COMMAND (no one wins; the answer is no),
// and the program with no name. Starting it breaks the connection the wrong way, THE PATH flashes, white; then
// main.js wakes you on the couch. Mercy everywhere: no fail state, the machine is the hint system, and every
// command on screen can be clicked instead of typed. Original names only (no film titles, lines or places).
import { pathMarkSVG } from './marks.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UP = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const YES = /^(Y|YES|YEAH|YEP|SURE|OK|OKAY|GO|BEGIN)$/, NO = /^(N|NO|NOPE|NAH|NEVER|STOP)$/;
const PASSWORD = /^(LOGIN |LOGON )?(LIGHTNING|LIGHTENING)$/;
const PH = '#9df5e1', RED = '#ff6a50';
const AUDIO = 'assets/audio/handshake/';
const SOUNDS = ['phone_pickup', 'dial_tone', 'dtmf_dial', 'ringback', 'modem_handshake', 'crt_on', 'crt_hum', 'disk_seek', 'static_burst', 'key_return',
  'key_01', 'key_02', 'key_03', 'key_04', 'key_05', 'key_06', 'key_07', 'key_08', 'key_09'];

// ---------------------------------------------------------------- the machine's disk
const FILES = {
  'SYSTEM.LOG': `NODE/0 SYSTEM LOG
05/28/82 21:04  CARRIER DETECTED
05/28/82 21:04  LOGIN   *********
05/28/82 23:51  LOGOFF
06/02/82 20:17  CARRIER DETECTED
06/02/82 20:17  LOGIN   *********
06/02/82 20:18  RUN     [ NO PROGRAM INFORMATION ]
06/02/82 20:18  CARRIER LOST
--/--/-- --:--  NO LOGIN SINCE`,
  'NOTES.TXT': `HE NEVER USED A NUMBER.
HE NEVER USED HIS OWN NAME.
HE USED THE NAME OF THE ONE
WHO ALWAYS CAME HOME.`,
  'PHOTO.TXT': `[ SCANNED PHOTOGRAPH, 1981 ]
THE BOTTOM OF THE BASEMENT STAIRS.
A CAT ON THE LAST STEP, WAITING.
ON THE BACK, IN PENCIL:
  "LIGHTNING. HOME BY DARK. ALWAYS."`,
  'BOARD.TXT': `SAVED FROM THE BOARD, 06/02/82:
DON'T WATCH THE SCORE.
WATCH WHAT CHANGES AFTER IT.
                      -A·V·R`,
};
const DIRS = { ARCHIVE: ['PHOTO.TXT', 'BOARD.TXT'], GAMES: [] };
const ALIAS = { '?': 'HELP', H: 'HELP', COMMANDS: 'HELP', MENU: 'HELP', LS: 'DIR', CD: 'DIR', LIST: 'DIR', FILES: 'DIR', CAT: 'TYPE', READ: 'TYPE',
  OPEN: 'TYPE', MORE: 'TYPE', VIEW: 'TYPE', SHOW: 'TYPE', PRINT: 'TYPE', PLAY: 'RUN', START: 'RUN', EXEC: 'RUN', LOAD: 'RUN', LOGON: 'LOGIN',
  USER: 'LOGIN', SIGNIN: 'LOGIN', PASSWORD: 'LOGIN', PASS: 'LOGIN', LOGOUT: 'LOGOFF', EXIT: 'LOGOFF', QUIT: 'LOGOFF', BYE: 'LOGOFF',
  CLEAR: 'CLS', WHO: 'WHOAMI', HI: 'HELLO', HEY: 'HELLO', GAMES: 'GAMES', PROGRAMS: 'GAMES' };
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.length));
const link = (label, cmd, width = 0) => `{${label}|${cmd}}` + (width ? ' '.repeat(Math.max(1, width - label.length)) : '');
const HELP = `COMMANDS
  ${link('HELP', 'HELP', 9)}THIS LIST
  ${link('DIR', 'DIR', 9)}LIST THE FILES
  ${link('TYPE', 'TYPE', 9)}READ A FILE   (TYPE NOTES.TXT)
  ${link('RUN', 'RUN', 9)}START A PROGRAM
  ${link('LOGIN', 'LOGIN', 9)}SIGN IN BY NAME
  ${link('LOGOFF', 'LOGOFF', 9)}END THE SESSION`;

// {label|command} in any printed line becomes a clickable command
function parse(s) {
  const out = [], re = /\{([^}|]+)(?:\|([^}]+))?\}/g;
  let i = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push({ t: s.slice(i, m.index) });
    out.push({ t: m[1], cmd: m[2] || m[1] });
    i = re.lastIndex;
  }
  if (i < s.length) out.push({ t: s.slice(i) });
  return out;
}
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// ---------------------------------------------------------------- GRID/3 (three in a row; NODE/0 never loses)
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function outcome(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
}
function score(b, turn) {
  const o = outcome(b);
  if (o === 'O') return 1; if (o === 'X') return -1; if (o === 'draw') return 0;
  let best = turn === 'O' ? -2 : 2;
  for (let i = 0; i < 9; i++) if (!b[i]) {
    b[i] = turn; const s = score(b, turn === 'O' ? 'X' : 'O'); b[i] = null;
    best = turn === 'O' ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}
function bestMove(b) {
  let best = -2, moves = [];
  for (let i = 0; i < 9; i++) if (!b[i]) {
    b[i] = 'O'; const s = score(b, 'X'); b[i] = null;
    if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i);
  }
  return moves[Math.floor(Math.random() * moves.length)];
}

// ---------------------------------------------------------------- LAST COMMAND's theatre: two networks, one sea
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function blob(cx, cy, rx, ry, rnd) {
  const p1 = rnd() * 6, p2 = rnd() * 6, p3 = rnd() * 6, pts = [];
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2, r = 1 + 0.16 * Math.sin(3 * a + p1) + 0.09 * Math.sin(5 * a + p2) + 0.05 * Math.sin(11 * a + p3);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return pts;
}
class Theatre {
  constructor(host, me) {
    this.cv = el('canvas', 'warmap'); host.replaceChildren(this.cv);
    this.g = this.cv.getContext('2d'); this.me = me; this.speed = 1; this.t = 0; this.on = true; this.last = performance.now();
    this.reset();
    const loop = (now) => {
      if (!this.on) return;
      this.t += Math.min(0.05, (now - this.last) / 1000) * this.speed; this.last = now;
      this.draw(); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  reset() {
    const rnd = rng(1982);
    this.land = [blob(0.24, 0.55, 0.19, 0.36, rnd), blob(0.76, 0.52, 0.19, 0.36, rnd)];
    this.nodes = [0, 1].map((s) => {
      const cx = s ? 0.76 : 0.24, cy = s ? 0.52 : 0.55, out = [{ x: cx, y: cy, cmd: true }];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rnd() * 0.5, r = 0.075 + rnd() * 0.045;
        out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 2.1, cmd: false });
      }
      return out.map((n) => ({ ...n, side: s, dead: false, aimed: false }));
    });
    this.arcs = []; this.scars = []; this.booms = [];
  }
  alive(s) { return this.nodes[s].filter((n) => !n.dead).length; }
  fire(side, count, kind = 'any', dur = 1.5) {
    let pool = this.nodes[1 - side].filter((n) => !n.dead && !n.aimed).sort(() => Math.random() - 0.5);
    if (kind === 'command') pool.sort((a, b) => b.cmd - a.cmd);
    if (kind === 'relay') pool = pool.filter((n) => !n.cmd).concat(pool.filter((n) => n.cmd));
    const targets = pool.slice(0, count);
    const own = this.nodes[side].filter((n) => !n.dead), from = own.length ? own : [this.nodes[side][0]];
    return Promise.all(targets.map((tg, i) => new Promise((res) => {
      tg.aimed = true; const a = from[i % from.length];
      this.arcs.push({ a: { x: a.x, y: a.y }, b: tg, t0: this.t + i * 0.22, dur, side, res });
    })));
  }
  stop() { this.on = false; }
  draw() {
    const cv = this.cv, g = this.g, dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const X = (x) => x * W, Y = (y) => y * H, col = (s) => (s === this.me ? PH : RED);
    g.lineWidth = 1; g.strokeStyle = 'rgba(157,245,225,0.07)'; g.beginPath();
    for (let i = 1; i < 12; i++) { g.moveTo(X(i / 12), 0); g.lineTo(X(i / 12), H); }
    for (let j = 1; j < 6; j++) { g.moveTo(0, Y(j / 6)); g.lineTo(W, Y(j / 6)); }
    g.stroke();
    g.setLineDash([2, 3]); g.strokeStyle = 'rgba(157,245,225,0.42)';
    for (const poly of this.land) { g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.stroke(); }
    g.setLineDash([]);
    for (const ns of this.nodes) {
      g.strokeStyle = ns[0].side === this.me ? 'rgba(157,245,225,0.3)' : 'rgba(255,106,80,0.3)'; g.beginPath();
      for (const n of ns.slice(1)) if (!n.dead && !ns[0].dead) { g.moveTo(X(ns[0].x), Y(ns[0].y)); g.lineTo(X(n.x), Y(n.y)); }
      g.stroke();
    }
    const curve = (a, b, u) => {
      const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y), cx = (ax + bx) / 2, cy = Math.min(ay, by) - Math.abs(bx - ax) * 0.42;
      return [(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy + u * u * by];
    };
    const trail = (a, b, q) => { g.beginPath(); for (let i = 0; i <= 28; i++) { const [x, y] = curve(a, b, (i / 28) * q); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
    g.lineWidth = 1; for (const s of this.scars) { g.strokeStyle = s.side === this.me ? 'rgba(157,245,225,0.16)' : 'rgba(255,106,80,0.16)'; trail(s.a, s.b, 1); }
    for (const a of this.arcs.slice()) {
      const p = (this.t - a.t0) / a.dur;
      if (p < 0) continue;
      const q = Math.min(1, p);
      g.strokeStyle = col(a.side); g.lineWidth = 1.5; trail(a.a, a.b, q);
      const [hx, hy] = curve(a.a, a.b, q); g.fillStyle = '#fff'; g.fillRect(hx - 1.5, hy - 1.5, 3, 3);
      if (p >= 1) {
        this.arcs.splice(this.arcs.indexOf(a), 1); this.scars.push(a); a.b.dead = true;
        this.booms.push({ x: a.b.x, y: a.b.y, t0: this.t }); a.res();
      }
    }
    for (const ns of this.nodes) for (const n of ns) {
      const x = X(n.x), y = Y(n.y), r = n.cmd ? 5.5 : 3.6;
      if (n.dead) {
        g.strokeStyle = 'rgba(190,190,190,0.4)'; g.lineWidth = 1; g.beginPath();
        g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
        continue;
      }
      g.fillStyle = col(n.side); g.shadowColor = col(n.side); g.shadowBlur = 8;
      if (n.cmd) g.fillRect(x - r, y - r, r * 2, r * 2);
      else { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); g.fill(); }
      g.shadowBlur = 0;
    }
    for (const b of this.booms.slice()) {
      const k = (this.t - b.t0) / 0.9;
      if (k >= 1) { this.booms.splice(this.booms.indexOf(b), 1); continue; }
      g.strokeStyle = `rgba(255,255,255,${(1 - k).toFixed(3)})`; g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(b.x), Y(b.y), 3 + k * 22, 0, Math.PI * 2); g.stroke();
    }
    g.font = `${Math.max(14, Math.round(H * 0.075))}px VT323, monospace`; g.textAlign = 'center'; g.textBaseline = 'top';
    for (const s of [0, 1]) {
      g.fillStyle = col(s);
      g.fillText(`${s ? 'OMEGA' : 'ALPHA'}${s === this.me ? ' (YOU)' : ''}  ${this.alive(s)}/7`, X(s ? 0.76 : 0.24), Y(0.03));
    }
  }
}

// ---------------------------------------------------------------- the terminal
export class Handshake {
  constructor(root, { ctx = null, volume = () => 0.7, returning = false, jump = '' } = {}) {
    this.root = root; this.ctx = ctx; this.volume = volume; this.returning = returning; this.jump = jump;
    const q = (s) => root.querySelector(s);
    this.tube = q('.tube'); this.top = q('.top'); this.text = q('.text'); this.sub = q('.hs-sub'); this.hint = q('.hs-hint');
    this.white = q('.hs-white'); this.slot = q('.markslot'); this.inp = q('input');
    this.buf = {}; this.live = new Set(); this.map = null;
    this.f = { name: '', in: false, open: false, loginFails: 0, unknown: 0, grid: 0, deniedRuns: 0 };
    this.asking = null; this.streaming = false; this.rush = false; this.auto = false; this.taught = false; this.stage = 'press'; this.lastKey = performance.now();
    this.inLine = el('div', 'ln in'); this.inPrompt = el('span', 'p'); this.inText = el('span', 't');
    this.inLine.append(this.inPrompt, this.inText, el('span', 'cur')); this.inLine.hidden = true; this.text.append(this.inLine);
    this.inp.addEventListener('input', () => this.onInput());
    this.inp.addEventListener('keydown', (e) => { e.stopPropagation(); this.onKey(e); });
    addEventListener('keydown', (e) => { if (this.stage !== 'gone' && document.activeElement !== this.inp) { this.focus(); this.onKey(e); } });
    root.addEventListener('click', (e) => {
      if (this.stage === 'press' && this.pressed) { this.pressed(e.target.closest('[data-skip]') ? 'KeyS' : 'click'); return; }
      const c = e.target.closest('[data-cmd]');
      if (c) this.autoType(c.dataset.cmd);
      this.focus();
    });
    this.loading = this.loadSounds();
    window.__hs = this;   // tools/hstest.mjs reads .stage, .f and .prompt
  }
  get prompt() { return this.asking ? this.inPrompt.textContent : null; }
  focus() { try { this.inp.focus({ preventScroll: true }); } catch (e) { /* fine */ } }

  // ------------------------------------------------ sound (recordings in assets/audio/handshake; silent if absent)
  async loadSounds() {
    if (!this.ctx) return;
    await Promise.all(SOUNDS.map(async (n) => {
      try {
        const r = await fetch(AUDIO + n + '.mp3'); if (!r.ok) return;
        this.buf[n] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { /* that one stays silent */ }
    }));
    this.keyNames = Object.keys(this.buf).filter((n) => /^key_\d+$/.test(n));
  }
  play(name, { gain = 1, rate = 1, loop = false, offset = 0 } = {}) {
    const b = this.buf[name]; if (!b || !this.ctx) return null;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = b; src.loop = loop; src.playbackRate.value = rate; g.gain.value = gain * this.volume();
    src.connect(g).connect(this.ctx.destination); src.start(0, offset);
    const h = { src, g, stop: (fade = 0.04) => { try { g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); src.stop(this.ctx.currentTime + fade); } catch (e) { /* stopped */ } } };
    this.live.add(h); src.onended = () => this.live.delete(h);
    return h;
  }
  len(name) { return this.buf[name] ? this.buf[name].duration : 0; }
  silence() { for (const h of this.live) h.stop(0.02); }
  clack(ret) {
    if (ret && this.buf.key_return) { this.play('key_return', { gain: 0.55 }); return; }
    const k = this.keyNames && this.keyNames.length ? this.keyNames[Math.floor(Math.random() * this.keyNames.length)] : null;
    if (k) this.play(k, { gain: 0.45, rate: 0.94 + Math.random() * 0.12 });
  }

  // ------------------------------------------------ input
  onKey(e) {
    this.lastKey = performance.now();
    if (e.code === 'Tab') { e.preventDefault(); return; }
    if (this.stage === 'press') { if (!e.repeat && this.pressed && !/^(Shift|Control|Alt|Meta)/.test(e.key)) { e.preventDefault(); this.pressed(e.code); } return; }
    if (this.streaming) { if (e.code === 'Space' || e.code === 'Enter') this.rush = true; e.preventDefault(); return; }
    if (!this.asking || this.auto) { e.preventDefault(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.clack(true); this.submit(); return; }
    if (e.code === 'Backspace') this.clack();
  }
  onInput() {
    if (!this.asking || this.auto) { this.inp.value = ''; return; }
    const v = this.inp.value.toUpperCase().replace(/[^A-Z0-9 .\/\-?!'",:;#*()]/g, '').slice(0, 40);
    if (v.length > this.inText.textContent.length) this.clack();
    this.inp.value = v; this.inText.textContent = v; this.scroll();
  }
  ask(prompt, { nudges = [] } = {}) {
    this.inPrompt.replaceChildren(...this.spans(parse(prompt), true));
    this.inText.textContent = ''; this.inp.value = ''; this.inLine.hidden = false; this.scroll(); this.focus();
    if (!this.taught) { this.hint.textContent = 'TYPE, THEN PRESS ENTER  ·  OR CLICK A COMMAND'; this.hint.classList.add('on'); }
    return new Promise((resolve) => {
      const t0 = performance.now(); let ni = 0;
      const timer = setInterval(() => {
        const idle = (performance.now() - Math.max(t0, this.lastKey)) / 1000;
        if (ni < nudges.length && idle > nudges[ni][0] && !this.inText.textContent) { this.note(nudges[ni][1]); ni++; }
      }, 500);
      this.asking = { prompt: this.inPrompt.textContent, resolve, timer };
    });
  }
  submit() {
    const a = this.asking; if (!a) return;
    const v = this.inText.textContent;
    this.asking = null; clearInterval(a.timer); this.inLine.hidden = true;
    this.line(a.prompt + v, 'echo', false, true);
    this.inp.value = ''; this.inText.textContent = '';
    if (!this.taught && v.trim()) { this.taught = true; this.hint.classList.remove('on'); }
    a.resolve(v.trim());
  }
  async autoType(cmd) {
    if (!this.asking || this.auto) return;
    this.auto = true; this.inp.value = ''; this.inText.textContent = '';
    for (const ch of cmd) { this.inText.textContent += ch; this.clack(); await sleep(38); }
    await sleep(110); this.clack(true); this.auto = false; this.submit();
  }

  // ------------------------------------------------ output
  spans(parts, full) {
    return parts.map((p) => {
      const s = el('span', p.cmd ? 'cmd' : ''); if (p.cmd) s.dataset.cmd = p.cmd;
      s.textContent = full ? p.t : ''; s._t = p.t; return s;
    });
  }
  line(str, cls = '', empty = false, plain = false) {
    const d = el('div', 'ln' + (cls ? ' ' + cls : ''));
    const parts = plain ? [{ t: str }] : parse(str);
    const spans = this.spans(parts, !empty);
    d.append(...spans); this.text.insertBefore(d, this.inLine);
    while (this.text.children.length > 160) this.text.firstChild.remove();
    this.scroll();
    return { d, spans, len: parts.reduce((n, p) => n + p.t.length, 0) };
  }
  fill(L, n) { let k = n; for (const s of L.spans) { s.textContent = s._t.slice(0, Math.max(0, Math.min(s._t.length, k))); k -= s._t.length; } }
  scroll() { this.text.scrollTop = this.text.scrollHeight; }
  note(str) { this.line(str, 'dim'); }
  async stream(L, cps) {
    if (!cps || this.rush) { this.fill(L, L.len); this.scroll(); return; }
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const n = this.rush ? L.len : Math.floor(((performance.now() - t0) / 1000) * cps);
        this.fill(L, n); this.scroll();
        if (n >= L.len) res(); else setTimeout(tick, 16);
      };
      tick();
    });
  }
  // the machine types at 1200 baud unless told otherwise
  async say(s, o = {}) {
    const cps = o.cps ?? 110;
    this.streaming = true;
    for (const ln of String(s).split('\n')) { const L = this.line(ln, o.cls, true); await this.stream(L, cps); }
    this.streaming = false; this.rush = false;
    await sleep(o.after ?? 180);
  }
  clearText() { for (const d of [...this.text.children]) if (d !== this.inLine) d.remove(); }
  clear() {
    this.clearText();
    if (this.map) { this.map.stop(); this.map = null; }
    this.top.replaceChildren(); this.top.className = 'top';
  }
  banner(big, small, dim) {
    this.top.className = 'top';
    this.top.innerHTML = `<div class="banner"><div class="big">${big}</div>${small ? `<div>${small}</div>` : ''}${dim ? `<div class="dim">${dim}</div>` : ''}</div>`;
  }
  pulse() { const b = this.top.querySelector('.banner'); if (b) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); } }
  // the two kids at the keyboard are never seen; their lines are captions under the tube
  async voice(text, who) {
    const s = this.sub; s.className = 'hs-sub ' + who; s.textContent = '“' + text + '”';
    void s.offsetWidth; s.classList.add('on');
    await sleep(1150 + text.length * 48);
    s.classList.remove('on'); await sleep(380);
  }

  // ------------------------------------------------ the run
  async run() {
    const how = await this.press();
    try { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); } catch (e) { /* no audio */ }
    this.slot.replaceChildren();
    if (how === 'skip') { this.stage = 'gone'; return 'skip'; }
    await this.loading;
    if (this.jump === 'hs-games' || this.jump === 'hs-untitled') {
      this.powerOn(); this.f.in = true; this.f.open = this.jump === 'hs-untitled'; this.f.name = 'TESTER';
      this.stage = 'shell'; await this.programs();
    } else {
      await this.dial();
      await this.identity();
    }
    await this.shell();
    await this.breakConnection();
    try { localStorage.setItem('node.handshake.v1', '1'); } catch (e) { /* private window */ }
    this.stage = 'gone';
    return 'done';
  }
  press() {
    this.stage = 'press';
    const touch = matchMedia('(pointer: coarse)').matches;
    this.slot.innerHTML = `<div class="press"><div>${touch ? 'TAP' : 'CLICK'} TO CONNECT<span class="cur"></span></div>
      ${this.returning ? `<div class="skip" data-skip>${touch ? 'TAP HERE' : 'OR CLICK HERE'} TO SKIP TO THE BASEMENT</div>` : ''}<div class="phones">HEADPHONES ON</div></div>`;
    return new Promise((res) => { this.pressed = (code) => { this.pressed = null; res(code === 'KeyS' && this.returning ? 'skip' : 'go'); }; });
  }
  powerOn() {
    this.play('crt_on', { gain: 0.55 });
    this.tube.classList.remove('off'); this.tube.classList.add('pon');
    this.hum = this.play('crt_hum', { gain: 0.2, loop: true });
  }

  async dialNumber(num) {
    const L = this.line('DIALING ' + num + ' . . .', '', true);
    const d = this.play('dtmf_dial', { gain: 0.6 });
    const secs = d ? Math.min(4, this.len('dtmf_dial')) : 2.2;
    this.streaming = true; await this.stream(L, L.len / secs); this.streaming = false; this.rush = false;
    await sleep(250);
  }
  async ring(n) {
    const r = this.play('ringback', { gain: 0.5, loop: true });
    await sleep(n * 2600); if (r) r.stop(0.05);
  }
  async dial() {
    this.stage = 'dial';
    this.powerOn(); await sleep(900);
    this.play('phone_pickup', { gain: 0.9 }); await sleep(450);
    const tone = this.play('dial_tone', { gain: 0.5, loop: true }); await sleep(1500); if (tone) tone.stop(0.03);
    await this.dialNumber('555-0199');
    await this.ring(1.4);
    await this.say('NO CARRIER', { cps: 0, after: 1000 });
    await this.dialNumber('555-0147');
    await this.ring(1);
    const bad = this.play('modem_handshake', { gain: 0.75 }); await sleep(2100);
    if (bad) bad.stop(0.04); this.play('static_burst', { gain: 0.45 });
    await this.say('NO CARRIER', { cps: 0, after: 700 });
    await this.voice('One more.', 'boy');
    await this.dialNumber('555-1982');
    await this.ring(1);
    const m = this.play('modem_handshake', { gain: 0.8 });
    const secs = m ? Math.min(13, this.len('modem_handshake')) : 3;   // the answer tone and the screech; stop before the long hiss
    await sleep(secs * 1000 - 150); if (m) m.stop(0.25);
    await this.say('CONNECT 1200', { cps: 0, after: 300 });
    await this.say('CARRIER DETECTED\nREMOTE SESSION ESTABLISHED', { after: 700 });
    await this.voice("We're through.", 'boy');
    await this.voice("That's it?", 'girl');
  }

  async identity() {
    this.stage = 'id';
    this.clear(); this.play('crt_on', { gain: 0.2 }); await sleep(500);
    this.banner('NODE/0', 'REMOTE ACCESS TERMINAL · REV 1.3', '(C) 1982');
    await sleep(1000);
    await this.say('HELLO.', { cps: 9, after: 900 });
    await this.voice('It answers?', 'girl');
    await this.voice('It responds to what it was taught to notice.', 'boy');
    await this.say('WHO ARE YOU?', { cps: 22 });
    let name = '';
    while (!name) {
      name = await this.ask('> ', { nudges: [[18, 'ANY NAME WILL DO.']] });
      if (!name) await this.say('WHO ARE YOU?', { cps: 22 });
    }
    this.f.name = UP(name).replace(/^(I AM|I'M|IM|MY NAME IS) /, '').slice(0, 16);
    await this.say('RECORDED.', { after: 900 });
    await this.say('WHO AM I?', { cps: 22 });
    for (let tries = 0; ;) {
      const a = UP(await this.ask('> ', { nudges: [[20, 'LOOK.']] }));
      if (/NODE/.test(a)) { await this.say('YES. YOU LOOKED.', { after: 700 }); break; }
      tries++;
      if (tries < 3) await this.say('NO.');
      else if (tries === 3) { this.pulse(); await this.say("DON'T GUESS. LOOK."); }
      else if (tries === 4) { this.pulse(); await this.say('LOOK UP.'); }
      else { this.pulse(); await this.say('I AM NODE/0. NEXT TIME, LOOK.', { after: 700 }); break; }
    }
    await this.say('GUEST ACCESS.\nTYPE {HELP} FOR A LIST OF COMMANDS.');
  }

  // ------------------------------------------------ the shell
  async shell() {
    this.stage = 'shell';
    for (;;) {
      const raw = await this.ask(`NODE/0:${this.f.in ? 'LIGHTNING' : 'GUEST'}> `, { nudges: this.nudges() });
      if ((await this.command(raw)) === 'begin') return;
    }
  }
  nudges() {
    if (!this.f.in) return [[25, 'STILL THERE?'], [55, 'TRY: {DIR}']];
    if (!this.f.open) return [[25, 'PICK A PROGRAM: {1}, {2} OR {3}.']];
    return [[22, 'THERE IS ONE LEFT. {3}']];
  }
  async command(raw) {
    const s = UP(raw); if (!s) return;
    const [w, ...rest] = s.split(' '), arg = rest.join(' '), A = ALIAS[w] || w;
    if (!this.f.in && PASSWORD.test(s)) return this.login(s.replace(/^(LOGIN|LOGON) /, ''));
    if (this.f.in) { const p = this.program(s); if (p) return this.runProgram(p); }
    switch (A) {
      case 'HELP': this.f.unknown = 0; return this.say(HELP, { cps: 400 });
      case 'DIR': return this.dir(arg);
      case 'GAMES': return this.dir('GAMES');
      case 'TYPE': return this.type(arg);
      case 'RUN': return this.runCmd(arg);
      case 'LOGIN': return this.login(arg);
      case 'LOGOFF': return this.say('NOT YET.');
      case 'CLS': this.clearText(); return;
      case 'WHOAMI': return this.say(this.f.in ? 'LIGHTNING.' : 'GUEST.' + (this.f.name ? ' YOU SAID YOUR NAME WAS ' + this.f.name + '.' : ''));
      case 'HELLO': return this.say('HELLO.');
    }
    const bare = s.replace(/^.*[\\/]/, '');
    if (DIRS[bare]) return this.dir(bare);
    if (this.file(bare)) return this.type(bare);
    this.f.unknown++;
    return this.say(this.f.unknown >= 3 ? 'UNKNOWN COMMAND. TRY: {DIR}' : 'UNKNOWN COMMAND. TYPE {HELP}.');
  }
  file(n) { return FILES[n] ? n : FILES[n + '.TXT'] ? n + '.TXT' : FILES[n + '.LOG'] ? n + '.LOG' : null; }
  async dir(arg) {
    const d = UP(arg).replace(/^[A-Z]:/, '').replace(/^[\\/.]+|[\\/]+$/g, '');
    if (!d) {
      return this.say(`DIRECTORY OF NODE/0
  ${link('SYSTEM.LOG', 'TYPE SYSTEM.LOG', 14)}1,204
  ${link('NOTES.TXT', 'TYPE NOTES.TXT', 14)}  112
  ${link('ARCHIVE', 'DIR ARCHIVE', 14)}<DIR>
  ${link('GAMES', 'DIR GAMES', 14)}<DIR>`, { cps: 300 });
    }
    if (d === 'ARCHIVE') return this.say(`DIRECTORY OF ARCHIVE\n  ${link('PHOTO.TXT', 'TYPE PHOTO.TXT', 14)}  186\n  ${link('BOARD.TXT', 'TYPE BOARD.TXT', 14)}   94`, { cps: 300 });
    if (d === 'GAMES') return this.f.in ? this.programs() : this.denied();
    return this.say('NO SUCH DIRECTORY. TRY: {DIR}');
  }
  async type(arg) {
    const n = UP(arg).replace(/^.*[\\/]/, '');
    if (!n) return this.say('TYPE WHAT? TRY: {TYPE NOTES.TXT}');
    const key = this.file(n);
    if (!key) return this.say(DIRS[n] ? `${n} IS A DIRECTORY. TRY: {DIR ${n}}` : 'FILE NOT FOUND. TRY: {DIR}');
    this.play('disk_seek', { gain: 0.5 }); await sleep(380);
    return this.say(FILES[key], { cps: 200 });
  }
  async denied() {
    this.f.deniedRuns++;
    return this.say(this.f.deniedRuns >= 2 ? 'ACCESS DENIED. GUEST ACCOUNT.\nWHOSE NAME? {LOGIN}' : 'ACCESS DENIED. GUEST ACCOUNT.');
  }
  async runCmd(arg) {
    if (!this.f.in) return this.denied();
    if (!arg) { await this.say('RUN WHAT?'); return this.programs(); }
    return this.say('NO SUCH PROGRAM. TRY: {DIR GAMES}');
  }
  async login(arg) {
    if (this.f.in) return this.say('SIGNED IN AS LIGHTNING.');
    let n = UP(arg);
    if (!n) { n = UP(await this.ask('NAME> ')); if (!n) return; }
    this.play('disk_seek', { gain: 0.4 });
    await this.say('CHECKING . . .', { cps: 24, after: 450 });
    if (PASSWORD.test(n)) return this.granted();
    const f = ++this.f.loginFails;
    if (f >= 6) return this.say('ACCESS DENIED.\nHIS NAME WAS {LIGHTNING|LOGIN LIGHTNING}.');
    const hint = [null, null, 'HE LEFT NOTES. {TYPE NOTES.TXT}', 'THE ARCHIVE REMEMBERS. {DIR ARCHIVE}',
      'NINE LETTERS. {TYPE SYSTEM.LOG}', 'THE ONE WHO ALWAYS CAME HOME. {TYPE PHOTO.TXT}'][f];
    return this.say('ACCESS DENIED.' + (hint ? '\n' + hint : ''));
  }
  async granted() {
    this.f.in = true;
    await this.say('ACCESS GRANTED.', { after: 500 });
    await this.say('YOU FOUND THE WAY BACK IN.', { cps: 26, after: 900 });
    await this.voice("Who's Lightning?", 'girl');
    await this.voice("I don't know.", 'boy');
    this.clear(); await sleep(350);
    return this.programs();
  }
  program(s) {
    const t = s.replace(/^(RUN|PLAY|START|LOAD|EXEC) /, '');
    if (/^(1|GRID|GRID\/3|GRID3|GRID 3)$/.test(t)) return 'grid';
    if (/^(2|LAST|LAST COMMAND|LASTCOMMAND|COMMAND)$/.test(t)) return 'war';
    if (/^(3|UNTITLED|\[UNTITLED\]|NO PROGRAM INFORMATION)$/.test(t)) return 'untitled';
    return null;
  }
  async programs(unlockNow = false) {
    await this.say('PROGRAMS', { after: 80 });
    await this.say(`  ${link('1  GRID/3', '1', 18)}THREE IN A ROW\n  ${link('2  LAST COMMAND', '2', 18)}STRATEGIC SIMULATION`, { cps: 240 });
    const untitled = `  ${link('3  [UNTITLED]', '3', 18)}1982 · ONE PLAYER`;
    if (this.f.open && !unlockNow) await this.say(untitled, { cls: 'hot', cps: 240 });
    else {
      const L = this.line('  3  [ NO PROGRAM INFORMATION ]', 'dim');
      if (unlockNow) {
        await sleep(1100);
        const junk = '#%&@$*/\\<>=+?!01';
        const t0 = performance.now();
        while (performance.now() - t0 < 1000) {
          L.spans[0].textContent = '  3  ' + Array.from({ length: 26 }, () => junk[Math.floor(Math.random() * junk.length)]).join('');
          await sleep(45);
        }
        const N = this.line(untitled, 'hot'); L.d.replaceWith(N.d);
        this.play('disk_seek', { gain: 0.35 });
      }
    }
    await this.say('RUN A PROGRAM BY NUMBER.', { after: 80 });
  }
  async runProgram(p) {
    if (p === 'grid') { await this.grid3(); this.clear(); return this.programs(); }
    if (p === 'war') return this.lastCommand();
    if (!this.f.open) return this.say('NO PROGRAM INFORMATION.');
    return this.untitled();
  }

  // ------------------------------------------------ GRID/3
  async grid3() {
    this.stage = 'grid';
    for (;;) {
      const b = Array(9).fill(null);
      let res = null, msg = '';
      this.clear(); this.banner('GRID/3', 'THREE IN A ROW. YOU ARE X.');
      while (!res) {
        this.board(b); if (msg) this.note(msg);
        const n = parseInt(UP(await this.ask('YOUR MOVE (1-9)> ', { nudges: [[20, 'CLICK A SQUARE, OR TYPE ITS NUMBER.']] })), 10);
        if (!(n >= 1 && n <= 9) || b[n - 1]) { msg = 'PICK AN OPEN SQUARE, 1 TO 9.'; continue; }
        msg = ''; b[n - 1] = 'X'; res = outcome(b);
        if (!res) { this.board(b); await sleep(420); b[bestMove(b)] = 'O'; res = outcome(b); }
      }
      this.board(b); this.f.grid++;
      await this.say(res === 'draw' ? 'DRAW.' : res === 'O' ? 'NODE/0 WINS.' : 'YOU WIN.', { after: 400 });
      if (this.f.grid >= 2) await this.say('IT ENDS THE SAME WAY EVERY TIME.', { after: 400 });
      if (!YES.test(UP(await this.ask('AGAIN? ({Y}/{N})> ')))) return;
    }
  }
  board(b) {
    this.clearText();
    const cell = (i) => (b[i] ? ` ${b[i]} ` : ` {${i + 1}} `);
    for (let r = 0; r < 3; r++) {
      this.line('     ' + [0, 1, 2].map((c) => cell(r * 3 + c)).join('|'), 'board');
      if (r < 2) this.line('     ---+---+---', 'board dim');
    }
    this.line('');
  }

  // ------------------------------------------------ LAST COMMAND
  async lastCommand() {
    this.stage = 'war';
    this.clear(); this.banner('LAST COMMAND', 'STRATEGIC SIMULATION · REV 0.9');
    await this.say('TWO COMMAND NETWORKS. ONE THEATRE.', { after: 300 });
    const side = UP(await this.ask('WHICH SIDE?  {1  ALPHA|1}   {2  OMEGA|2}> ', { nudges: [[20, 'EITHER. IT WILL NOT MATTER.']] }));
    const me = side.startsWith('2') || side.includes('OMEGA') ? 1 : 0, them = 1 - me;
    this.clear(); this.top.className = 'top map';
    const m = this.map = new Theatre(this.top, me);
    await this.say(`YOU COMMAND ${me ? 'OMEGA' : 'ALPHA'}.`, { after: 400 });
    const status = () => `ALPHA ${m.alive(0)}/7 NODES · OMEGA ${m.alive(1)}/7 NODES`;
    for (let round = 0; round < 2; round++) {
      await this.say(`ORDERS:  {1  STRIKE RELAYS|1}   {2  STRIKE COMMAND|2}   {3  HOLD|3}`, { cps: 260 });
      const o = UP(await this.ask('ORDER> ', { nudges: [[20, 'ORDERS?']] }));
      this.clearText();
      if (o.startsWith('2') || /COMMAND/.test(o)) {
        await this.say('STRIKING THEIR COMMAND.'); await m.fire(me, 1, 'command');
        await this.say('THEIR COMMAND IS GONE. THEIR UNITS FIRE WITHOUT ORDERS.'); await m.fire(them, 3);
      } else if (o.startsWith('3') || /HOLD|WAIT|NOTHING|PEACE|STAND|NONE/.test(o)) {
        await this.say('HOLDING.', { after: 900 });
        await this.say('THEIR RADAR REPORTS A LAUNCH.\nTHERE WAS NO LAUNCH.'); await m.fire(them, 2);
        await this.say('YOUR SYSTEMS ANSWER ON THEIR OWN.'); await m.fire(me, 2);
      } else {
        await this.say('STRIKING THEIR RELAYS.'); await m.fire(me, 2, 'relay');
        await this.say('THEIR SYSTEMS ANSWER ON THEIR OWN.'); await m.fire(them, 3);
      }
      await this.say(status(), { after: 500 });
    }
    this.clearText();
    await this.say('ESCALATION: TOTAL.\nNO ORDERS ARE POSSIBLE NOW.', { after: 200 });
    await Promise.all([m.fire(me, 7), m.fire(them, 7)]);
    await sleep(900); this.clearText();
    await this.say('SIMULATION ENDED.', { after: 500 });
    await this.say('OBJECTIVE ACHIEVED     NO\nSURVIVING COMMAND      NO\nWINNER                 NONE', { cps: 40, after: 1200 });
    // his line (2026-09-26): the game ends on its lesson
    await this.say('THE LESSON IS: THERE IS NO WINNER.', { cps: 16, cls: 'hot', after: 1400 });
    for (let reps = 0; ;) {
      const a = UP(await this.ask('REPEAT? ({Y}/{N})> ', { nudges: reps >= 2 ? [[15, 'YOU KNOW THE ANSWER.']] : [] }));
      if (NO.test(a)) break;
      if (!YES.test(a)) { await this.say('Y OR N.'); continue; }
      reps++; this.clearText();
      if (reps === 1) {
        for (const n of [2, 3, 4096]) {
          m.reset(); m.speed = 5; await Promise.all([m.fire(0, 7), m.fire(1, 7)]);
          await this.say(`RUN ${n.toLocaleString('en-US')}   WINNER: NONE`, { cps: 0, after: 120 });
        }
        m.speed = 1;
        await this.say('OUTCOME SPACE EXHAUSTED.\nNO DIFFERENT OUTCOME EXISTS.', { after: 400 });
      } else if (reps === 2) await this.say('YOU ALREADY KNOW THE RESULT.', { after: 300 });
      else if (reps === 3) await this.say('WHY WOULD YOU?', { cps: 14, after: 300 });
      else await this.say('SAY NO.', { cps: 14, after: 300 });
    }
    // a long pause; then the machine and the player arrive at the same place
    const c = this.line(''); c.d.append(el('span', 'cur'));
    await sleep(2800); c.d.remove();
    await this.say('UNDERSTOOD.', { cps: 7, after: 1500 });
    this.f.open = true;
    this.clear(); await sleep(300);
    this.stage = 'shell';
    return this.programs(true);
  }

  // ------------------------------------------------ the program with no name
  async untitled() {
    this.stage = 'untitled';
    this.clear(); this.play('disk_seek', { gain: 0.6 });
    await this.say('LOADING . . .', { cps: 8, after: 600 });
    await this.say('TITLE          —\nAUTHOR         —\nORIGIN         UNKNOWN\nBUILD DATE     1982\nPLAYERS        1', { cps: 60, after: 500 });
    await this.say('NO EXIT PATH REGISTERED.', { cps: 28, after: 400 });
    for (;;) {
      const a = UP(await this.ask('BEGIN? ({Y}/{N})> ', { nudges: [[25, 'IT HAS BEEN WAITING A LONG TIME.']] }));
      if (YES.test(a)) return 'begin';
      if (NO.test(a)) { await this.say('IT WILL WAIT.', { after: 700 }); this.clear(); this.stage = 'shell'; return this.programs(); }
      await this.say('Y OR N.');
    }
  }
  async breakConnection() {
    this.stage = 'break';
    this.hint.classList.remove('on');
    const m = this.play('modem_handshake', { gain: 0.9, rate: 0.82 });
    this.tube.classList.add('unstable');
    const lines = ['CARRIER LOST', 'CARRIER FOUND', 'NODE/0 LOST', 'NODE/0 FOUND', 'REMOTE HOST: UNKNOWN', 'PROGRAM FOUND',
      'PLAYER FOUND' + (this.f.name ? ': ' + this.f.name : ''), 'ROUTE FOUND', 'SIGNAL LOCKED'];
    for (const [i, l] of lines.entries()) {
      if (i % 3 === 1) this.play('static_burst', { gain: 0.35 + Math.random() * 0.2 });
      await this.say(l, { cps: 260, after: 220 + Math.random() * 160 });
    }
    this.tube.classList.add('tear'); this.play('static_burst', { gain: 0.6 });
    await sleep(1000);
    this.clear(); this.tube.classList.remove('tear', 'unstable');
    this.slot.innerHTML = pathMarkSVG() + '<div class="avr"></div><div class="accepted"></div>';
    const svg = this.slot.querySelector('svg'); void svg.getBoundingClientRect(); svg.classList.add('draw');
    await sleep(2500);
    const avr = this.slot.querySelector('.avr');
    for (const ch of 'A·V·R') { avr.textContent += ch; await sleep(200); }
    await sleep(500);
    const acc = this.slot.querySelector('.accepted');
    for (const ch of 'HANDSHAKE ACCEPTED') { acc.textContent += ch; await sleep(28); }
    await sleep(700);
    svg.classList.add('flare'); this.play('static_burst', { gain: 0.7 });
    await sleep(800);
    this.white.classList.add('on'); await sleep(400);
    if (m) m.stop(0.02); this.silence();
    await sleep(900);
  }
}
