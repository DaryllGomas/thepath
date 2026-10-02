// THE CABINET WITH NO NAME · the keys at its panel. The arcade's own key handling (js/main.js) keeps held keys and taps for the
// floor's cabinets; the seven games shape their input more finely (a fresh press vs a held key, the newest direction held, a
// tap between two frames), so the cabinet listens for itself, and only while you stand at it (enabled).
//
//   const k = new SevenKeys(window)
//   k.enabled = true / false          (false forgets everything held)
//   k.frame(read, st)                 -> read(view, st): one input frame; then this frame's presses are consumed
//     view.keys     codes held now                     view.since    codes that went down since the last frame (repeats too)
//     view.pressed  codes that went down since the last frame, in order, repeats excluded (fresh presses)
//     view.dirs     the direction keys held, oldest first (the Labyrinth: the newest one wins)
const DIR = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);

export class SevenKeys {
  constructor(target = globalThis.window) {
    this.keys = new Set(); this.since = new Set(); this.pressed = []; this.dirs = [];
    this._on = false;
    if (!target) return;
    target.addEventListener('keydown', (e) => {
      if (!this._on) return;
      const c = e.code;
      this.keys.add(c); this.since.add(c);
      if (e.repeat) return;
      this.pressed.push(c);
      if (DIR.has(c)) { const i = this.dirs.indexOf(c); if (i >= 0) this.dirs.splice(i, 1); this.dirs.push(c); }
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const i = this.dirs.indexOf(e.code); if (i >= 0) this.dirs.splice(i, 1);
    });
    target.addEventListener('blur', () => this.clear());
  }
  get enabled() { return this._on; }
  set enabled(v) { v = !!v; if (v !== this._on) { this._on = v; this.clear(); } }
  clear() { this.keys.clear(); this.since.clear(); this.pressed.length = 0; this.dirs.length = 0; }
  /** Nothing pressed carries into the next read (a new game, the notice closing). */
  consume() { this.since.clear(); this.pressed.length = 0; }
  frame(read, st) {
    const f = read(this, st);
    this.consume();
    return f;
  }
}
