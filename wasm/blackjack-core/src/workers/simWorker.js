import init, { run_simulation } from '../wasm/blackjack/blackjack_core.js';

let wasmReady = false;
let wasmInitPromise = null;

function ensureInit() {
  if (!wasmInitPromise) {
    wasmInitPromise = init().then(() => {
      wasmReady = true;
    });
  }
  return wasmInitPromise;
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  if (type === 'run-simulation') {
    try {
      await ensureInit();
      const result = run_simulation(payload);
      self.postMessage({ id, status: 'done', result });
    } catch (error) {
      self.postMessage({ id, status: 'error', error: error.message ?? String(error) });
    }
  }
};