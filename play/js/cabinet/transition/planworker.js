// THE REDRAW · the pairing plan, built off the main thread (see planasync.js). Message in: { id, from, to, opts } (strokes as
// captured); out: { id, data } (plan.js buildPlanData: typed arrays and plain arrays; the pieces' buffer is transferred).
import { buildPlanData } from './plan.js';
self.onmessage = (e) => {
  const { id, from, to, opts } = e.data;
  try {
    const data = buildPlanData(from, to, opts);
    self.postMessage({ id, data }, [data.pieces.buffer]);
  } catch (err) { self.postMessage({ id, error: String((err && err.stack) || err) }); }
};
