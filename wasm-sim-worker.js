import init, { run_simulation_with_progress, run_spot_check, play_single_game } from './wasm/blackjack-core/pkg/blackjack_core.js';

let initPromise = null;

function ensureInitialized() {
    if (!initPromise) {
        initPromise = init();
    }
    return initPromise;
}

self.onmessage = async (event) => {
    const { jobId, payload, isSpotCheck } = event.data;
    if (!jobId) {
        return;
    }
    try {
        await ensureInitialized();
        let result;
        if (isSpotCheck) {
            result = run_spot_check(payload);
        } else {
            const progressCallback = (current, total) => {
                self.postMessage({
                    jobId,
                    type: 'progress',
                    current,
                    total
                });
            };
            result = run_simulation_with_progress(payload, progressCallback);
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

