// THE REDRAW · buildPlanAsync(fromStrokes, toStrokes, opts) -> Promise<plan>: the pairing (plan.js), computed in a Web Worker so
// the arcade's frames never wait on it (it costs 70-300 ms). Same result as buildPlan. Where a worker can't be made (or dies)
// it falls back to building on the calling thread (the old behaviour: a hitch, but never a failure).
//   warmPlanWorker()   start the worker ahead of time (its first job then runs at speed)
import { buildPlan, finishPlan } from './plan.js';

let worker = null, dead = typeof Worker === 'undefined', nextId = 1;
const jobs = new Map();

function spawn() {
  if (worker || dead) return worker;
  try {
    worker = new Worker(new URL('./planworker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, data, error } = e.data, j = jobs.get(id);
      if (!j) return;
      jobs.delete(id);
      if (error) j.fallback(new Error(error)); else j.resolve(finishPlan(data));
    };
    worker.onerror = (e) => {
      console.warn('[redraw] plan worker failed, building on the main thread', e.message);
      dead = true; worker = null;
      for (const j of [...jobs.values()]) j.fallback();
      jobs.clear();
    };
  } catch (e) { dead = true; worker = null; }
  return worker;
}

export function warmPlanWorker() {
  const w = spawn();
  if (w) w.postMessage({ id: 0, from: [], to: [], opts: {} });
}

export function buildPlanAsync(from, to, opts) {
  const w = spawn();
  if (!w) return Promise.resolve(buildPlan(from, to, opts));
  return new Promise((resolve) => {
    const id = nextId++;
    jobs.set(id, { resolve, fallback: () => resolve(buildPlan(from, to, opts)) });
    try { w.postMessage({ id, from, to, opts }); } catch (e) { jobs.delete(id); resolve(buildPlan(from, to, opts)); }
  });
}
