// THE REDRAW · the pairing solver: a linear assignment (the Hungarian method, shortest augmenting paths, O(n^2 m)).
//
//   const colOf = assign(cost, n, m)   cost = Float64Array(n * m), row-major (row i, col j at i * m + j), n <= m.
//                                      Every row gets its own column, minimising the summed cost; returns Int32Array
//                                      row -> column (m - n columns stay unused).
// With cost = squared distance this is optimal transport between two point sets: the straight paths it picks never
// cross (a pair of crossing paths can always be swapped for a cheaper pair), which is why the pieces flow. With fewer
// rows than columns it also chooses WHICH columns are used: the ones the rows can reach most cheaply.
export function assign(cost, n, m = n) {
  if (n > m) throw new Error('assign: needs rows <= columns');
  const INF = 1e300;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), minv = new Float64Array(m + 1);
  const p = new Int32Array(m + 1), way = new Int32Array(m + 1), used = new Uint8Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(INF); used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0], row = (i0 - 1) * m, ui0 = u[i0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[row + j - 1] - ui0 - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const colOf = new Int32Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) colOf[p[j] - 1] = j - 1;
  return colOf;
}
