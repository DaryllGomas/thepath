// THE CABINET WITH NO NAME · the first coin's notice (canon, docs/THE_PLAN/CANON.md: "a photosensitivity notice on the
// cabinet's first coin"; the retired puzzle showed one too). A still card in the machine's gold: no motion, nothing
// flashes. SPACE continues to Hearth's ready card. Shown once a session.
import * as THREE from 'three';

export class NoticeCard {
  constructor(w = 1024, h = 768) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.texture = new THREE.CanvasTexture(this.c);
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.magFilter = THREE.LinearFilter;
    this.drawn = false;
  }
  draw() {
    const g = this.c.getContext('2d'), W = this.c.width, H = this.c.height, s = H / 768;
    g.fillStyle = '#040302'; g.fillRect(0, 0, W, H);
    // a thin gold frame, well inside the glass
    g.strokeStyle = 'rgba(214, 150, 52, 0.55)'; g.lineWidth = 2 * s;
    g.strokeRect(W * 0.12, H * 0.2, W * 0.76, H * 0.6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = (t, y, px, col) => { g.font = Math.round(px * s) + 'px VT323, "Lucida Console", monospace'; g.fillStyle = col; g.fillText(t, W / 2, y * s); };
    text('MOVING GEOMETRIC PATTERNS', 300, 58, '#f2c46a');
    text('IF YOU FEEL UNWELL, LOOK AWAY AND REST', 380, 32, '#c8964a');
    text('SPACE  CONTINUE', 500, 40, '#f6e6c0');
    this.texture.needsUpdate = true; this.drawn = true;
  }
  dispose() { this.texture.dispose(); }
}
