// Load WASM module with GitHub Pages compatibility
// Use import.meta.url to construct paths relative to this worker file
// This works for both local development and GitHub Pages
let wasmModule = null;
let initPromise = null;

async function loadWasmModule() {
    if (!wasmModule) {
        try {
            // Construct path relative to this worker file using import.meta.url
            // This automatically handles GitHub Pages subdirectory paths
            const wasmPath = new URL('./wasm/blackjack-core/pkg/blackjack_core.js', import.meta.url);
            wasmModule = await import(wasmPath.href);
        } catch (e) {
            console.error('Failed to load WASM module:', e);
            // Fallback: try with explicit relative path
            try {
                wasmModule = await import('./wasm/blackjack-core/pkg/blackjack_core.js');
            } catch (e2) {
                console.error('Fallback WASM load also failed:', e2);
                throw new Error(`Failed to load WASM module: ${e.message}. Fallback also failed: ${e2.message}`);
            }
        }
    }
    return wasmModule;
}

const wasmModulePromise = loadWasmModule();

function ensureInitialized() {
    if (!initPromise) {
        initPromise = wasmModulePromise.then(async (module) => {
            await module.default();
            return module;
        });
    }
    return initPromise;
}

self.onmessage = async (event) => {
    const { jobId, payload, isSpotCheck } = event.data;
    if (!jobId) {
        return;
    }
    try {
        const module = await ensureInitialized();
        let result;
        if (isSpotCheck) {
            result = module.run_spot_check(payload);
        } else {
            const progressCallback = (current, total) => {
                self.postMessage({
                    jobId,
                    type: 'progress',
                    current,
                    total
                });
            };
            result = module.run_simulation_with_progress(payload, progressCallback);
        }
        const plainResult = convertToPlainObject(result);
        self.postMessage({
            jobId,
            type: 'done',
            result: plainResult
        });
    } catch (error) {
        self.postMessage({
            jobId,
            type: 'error',
            message: error?.message || String(error)
        });
    }
};

function convertToPlainObject(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (value instanceof Map) {
        const obj = {};
        for (const [key, val] of value.entries()) {
            obj[key] = convertToPlainObject(val);
        }
        return obj;
    }
    if (Array.isArray(value)) {
        return value.map(convertToPlainObject);
    }
    const obj = {};
    for (const key of Object.keys(value)) {
        obj[key] = convertToPlainObject(value[key]);
    }
    return obj;
}

