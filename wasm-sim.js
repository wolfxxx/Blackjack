const wasmSimWorker = new Worker(new URL('./wasm-sim-worker.js', import.meta.url), { type: 'module' });
window.wasmSimWorker = wasmSimWorker; // Expose for optimization functions
let currentJobId = 0;
let activeJob = null;
let originalButtonText = 'Run WASM Simulation';
const pendingJobs = new Map();

const progressState = {
    startTime: 0,
    lastUpdateTime: 0,
    lastUpdateCount: 0
};

function readNumberValue(nodeId, fallback) {
    const node = document.getElementById(nodeId);
    if (!node) return fallback;
    const parsed = parseInt(node.value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function collectStrategyPayload() {
    const currentStrategy = typeof window.getCurrentStrategy === 'function'
        ? window.getCurrentStrategy()
        : window.strategy;
    if (!currentStrategy || typeof currentStrategy.exportData !== 'function') {
        return { hard: {}, soft: {}, pairs: {}, countBased: false, hardByCount: {}, softByCount: {}, pairsByCount: {} };
    }
    // Always get fresh data from the strategy object
    const exportData = currentStrategy.exportData() || {};
    const payload = {
        countBased: !!exportData.countBased,
        hard: exportData.hard || {},
        soft: exportData.soft || {},
        pairs: exportData.pairs || {},
        hardByCount: exportData.hardByCount || {},
        softByCount: exportData.softByCount || {},
        pairsByCount: exportData.pairsByCount || {}
    };
    // Debug: Log pairs data to verify it's being collected correctly
    if (Object.keys(payload.pairs).length > 0) {
        console.log('WASM Strategy Payload - Pairs sample:', JSON.stringify(Object.keys(payload.pairs).slice(0, 3).reduce((acc, key) => {
            acc[key] = payload.pairs[key];
            return acc;
        }, {})));
    }
    return payload;
}

function collectCountingPayload() {
    const enabled = document.getElementById('enableCounting')?.checked;
    if (!enabled) {
        return { enabled: false };
    }
    const system = document.getElementById('countingSystem')?.value || 'Hi-Lo';
    let customValues = null;
    if (system === 'Custom' && typeof window.getCustomCountingValues === 'function') {
        customValues = window.getCustomCountingValues();
    }
    return {
        enabled: true,
        system,
        customValues
    };
}

function generateSeed() {
    if (window?.crypto?.getRandomValues) {
        const array = new Uint32Array(2);
        window.crypto.getRandomValues(array);
        return (array[0] * 0x1_0000_0000 + array[1]) >>> 0;
    }
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function buildSimulationInput() {
    const dealerSelect = document.getElementById('dealerStandsOn');
    const dealerSetting = dealerSelect ? dealerSelect.value : '17';
    const iterations = readNumberValue('numSimulations', 10000);
    const interval = Math.max(1, Math.floor(iterations / 50));
    const penetration = readNumberValue('penetration', 75);
    const blackjackPays = document.getElementById('blackjackPays')?.value || '3:2';
    const doubleAfterSplit = document.getElementById('doubleAfterSplit')?.checked ?? true;
    const allowResplit = document.getElementById('allowResplit')?.checked ?? true;
    const resplitAces = document.getElementById('resplitAces')?.checked ?? false;

    return {
        num_decks: readNumberValue('numDecks', 6),
        iterations,
        bet_size: readNumberValue('betSize', 100),
        seed: generateSeed(),
        strategy: collectStrategyPayload(),
        rules: {
            dealer_hits_soft_17: dealerSetting === '17',
            dealer_stands_on: dealerSetting,
            double_after_split: doubleAfterSplit,
            allow_resplit: allowResplit,
            resplit_aces: resplitAces,
            blackjack_pays: blackjackPays,
            penetration_threshold: penetration
        },
        counting: collectCountingPayload(),
        progress_interval: interval
    };
}

function mountProgressUI() {
    const container = document.getElementById('simulationProgressContainer');
    if (!container) {
        return null;
    }
    container.innerHTML = `
        <div class="loading" style="padding: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div id="wasmProgressSpinner" style="width: 24px; height: 24px; border: 3px solid #f0f0f0; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                <div style="font-size: 1.1em; font-weight: 600; color: #333;">Running WASM simulation...</div>
            </div>
            <div style="width: 100%; background-color: #f0f0f0; border-radius: 8px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
                <div id="wasmProgressBar" style="width: 0%; height: 28px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; text-align: center; line-height: 28px; color: white; font-size: 0.95em; font-weight: 600; position: relative;">
                    <span id="wasmProgressPercent">0%</span>
                </div>
            </div>
            <div style="margin-top: 15px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #667eea;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Progress</div>
                    <div id="wasmProgressText" style="font-size: 1.1em; font-weight: 600; color: #333;">Starting...</div>
                </div>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #4caf50;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Throughput</div>
                    <div id="wasmSpeedText" style="font-size: 1.1em; font-weight: 600; color: #333;">-</div>
                </div>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #ff9800;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">ETA</div>
                    <div id="wasmEtaText" style="font-size: 1.1em; font-weight: 600; color: #333;">Calculating...</div>
                </div>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #2196f3;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Last Duration</div>
                    <div id="wasmDurationText" style="font-size: 1.1em; font-weight: 600; color: #333;">-</div>
                </div>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    return container;
}

function clearProgressUI() {
    const container = document.getElementById('simulationProgressContainer');
    if (container) {
        container.innerHTML = '';
    }
}

function updateProgressUI(current, total) {
    const progressBar = document.getElementById('wasmProgressBar');
    const progressPercent = document.getElementById('wasmProgressPercent');
    const progressText = document.getElementById('wasmProgressText');
    const speedText = document.getElementById('wasmSpeedText');
    const etaText = document.getElementById('wasmEtaText');

    const now = Date.now();
    const elapsed = (now - progressState.startTime) / 1000;
    const recentElapsed = (now - progressState.lastUpdateTime) / 1000;
    const recentCount = current - progressState.lastUpdateCount;

    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    if (progressBar && progressPercent) {
        progressBar.style.width = `${percentage}%`;
        progressPercent.textContent = `${percentage}%`;
    }
    if (progressText) {
        progressText.textContent = `${current.toLocaleString()} / ${total.toLocaleString()} hands`;
    }
    if (speedText && recentElapsed > 0) {
        const gamesPerSecond = Math.max(0, recentCount) / recentElapsed;
        if (gamesPerSecond >= 1000) {
            speedText.textContent = `${(gamesPerSecond / 1000).toFixed(1)}K hands/sec`;
        } else {
            speedText.textContent = `${gamesPerSecond.toFixed(0)} hands/sec`;
        }
    }
    if (etaText && elapsed > 0 && current > 0) {
        const avgSpeed = current / elapsed;
        const remaining = total - current;
        const etaSeconds = avgSpeed > 0 ? remaining / avgSpeed : 0;
        if (etaSeconds > 3600) {
            const hours = Math.floor(etaSeconds / 3600);
            const minutes = Math.floor((etaSeconds % 3600) / 60);
            etaText.textContent = `${hours}h ${minutes}m`;
        } else if (etaSeconds > 60) {
            const minutes = Math.floor(etaSeconds / 60);
            const seconds = Math.floor(etaSeconds % 60);
            etaText.textContent = `${minutes}m ${seconds}s`;
        } else if (etaSeconds > 0) {
            etaText.textContent = `${Math.ceil(etaSeconds)}s`;
        } else {
            etaText.textContent = 'Almost done...';
        }
    }

    progressState.lastUpdateTime = now;
    progressState.lastUpdateCount = current;
}

function disableButton(button) {
    if (!button) return;
    originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = 'Running...';
}

function enableButton(button) {
    if (!button) return;
    button.disabled = false;
    button.textContent = originalButtonText || 'Run WASM Simulation';
}

function showLastDuration(startTime) {
    if (typeof window.showSimulationDuration === 'function') {
        window.showSimulationDuration(startTime, 'wasmDurationText');
        return;
    }
    const node = document.getElementById('wasmDurationText');
    if (node && startTime) {
        const elapsed = Date.now() - startTime;
        node.textContent = `${elapsed.toFixed(0)}ms`;
    }
}

function startWasmSimulation() {
    const button = document.getElementById('runSimulationWasm');
    if (!button || activeJob) return;

    window.changeOptimizationSubview?.('simulation');
    disableButton(button);
    mountProgressUI();

    progressState.startTime = Date.now();
    progressState.lastUpdateTime = progressState.startTime;
    progressState.lastUpdateCount = 0;

    const jobId = `wasm-${++currentJobId}`;
    activeJob = jobId;

    // Always build fresh input to ensure we get the latest strategy
    const payload = buildSimulationInput();
    
    // Debug: Verify strategy is being collected (check pairs specifically)
    if (payload.strategy && payload.strategy.pairs) {
        const pairKeys = Object.keys(payload.strategy.pairs);
        if (pairKeys.length > 0) {
            console.log('WASM Simulation - Strategy pairs keys:', pairKeys.slice(0, 5));
            // Log a sample pair to verify data structure
            const sampleKey = pairKeys[0];
            console.log(`WASM Simulation - Sample pair[${sampleKey}]:`, payload.strategy.pairs[sampleKey]);
        }
    }
    
    pendingJobs.set(jobId, {
        button
    });

    wasmSimWorker.postMessage({
        jobId,
        payload
    });
}

wasmSimWorker.onmessage = (event) => {
    const { jobId, type, current, total, result, message } = event.data;
    const jobMeta = pendingJobs.get(jobId);
    
    if (type === 'progress') {
        if (jobId === activeJob && !jobMeta?.isSpotCheck) {
            updateProgressUI(current, total);
        }
        return;
    }

    if (type === 'done') {
        if (jobMeta?.isSpotCheck) {
            if (handleSpotCheckResult(jobId, result)) {
                return;
            }
        }
        
        if (!jobId || jobId !== activeJob) {
            return;
        }

        const durationMs = Date.now() - progressState.startTime;
        showLastDuration(progressState.startTime);
        const button = jobMeta?.button || document.getElementById('runSimulationWasm');
        enableButton(button);
        clearProgressUI();
        activeJob = null;
        pendingJobs.delete(jobId);
        if (typeof window.updateSimulationOutputs === 'function') {
            window.updateSimulationOutputs(result, { source: 'wasm', durationMs });
        }
        return;
    }

    if (type === 'error') {
        if (jobMeta?.isSpotCheck) {
            spotCheckCompletedActions++;
            pendingJobs.delete(jobId);
            if (spotCheckCompletedActions === spotCheckTotalActions) {
                if (spotCheckButton) {
                    spotCheckButton.disabled = false;
                    spotCheckButton.textContent = 'WASM Analyze';
                }
            }
            console.error('WASM spot check failed', message);
            return;
        }

        if (!jobId || jobId !== activeJob) {
            return;
        }

        const durationMs = Date.now() - progressState.startTime;
        showLastDuration(progressState.startTime);
        const button = jobMeta?.button || document.getElementById('runSimulationWasm');
        enableButton(button);
        clearProgressUI();
        activeJob = null;
        pendingJobs.delete(jobId);
        console.error('WASM simulation failed', message);
        alert(`WASM simulation failed: ${message}`);
    }
};

let spotCheckActionResults = {};
let spotCheckCompletedActions = 0;
let spotCheckTotalActions = 0;
let spotCheckButton = null;
let spotCheckResultsDiv = null;
let spotCheckPlayerCards = '';
let spotCheckPlayerTotal = '';
let spotCheckActionsOrder = [];

function startWasmSpotCheck() {
    const button = document.getElementById('analyzeSituationWasm');
    if (!button) return;

    const playerCards = document.getElementById('playerCards')?.value;
    const dealerCard = document.getElementById('dealerCard')?.value;
    const canDouble = document.getElementById('canDouble')?.checked ?? true;
    const canSplit = document.getElementById('canSplit')?.checked ?? false;
    const resultsDiv = document.getElementById('analysisResults');

    if (!playerCards || !dealerCard) {
        if (resultsDiv) {
            resultsDiv.innerHTML = '<div class="stat" style="color: #f44336;">Please enter both player cards and dealer card.</div>';
        }
        return;
    }

    if (resultsDiv) {
        resultsDiv.innerHTML = '<div class="loading">Running WASM spot check analysis... Please wait.</div>';
    }

    // Show progress bar
    const progressContainer = document.getElementById('spotCheckProgressContainer');
    if (progressContainer) {
        progressContainer.innerHTML = '<div class="progress-bar"><div class="progress-fill" style="width: 0%"><span style="position: absolute; left: 50%; transform: translateX(-50%);">0%</span></div></div><div class="progress-text">Starting analysis...</div>';
    }

    button.disabled = true;
    button.textContent = 'Analyzing...';

    spotCheckButton = button;
    spotCheckResultsDiv = resultsDiv;
    spotCheckPlayerCards = playerCards;
    spotCheckActionResults = {};
    spotCheckCompletedActions = 0;
    spotCheckActionsOrder = [];

    const parseCard = (cardStr) => {
        cardStr = cardStr.trim().toUpperCase();
        if (cardStr === 'A' || cardStr === 'ACE') return { rank: 'A', value: 11 };
        if (['J', 'Q', 'K'].includes(cardStr) || cardStr === '10') return { rank: cardStr === '10' ? '10' : cardStr, value: 10 };
        const num = parseInt(cardStr);
        if (num >= 2 && num <= 9) return { rank: num.toString(), value: num };
        return null;
    };

    const parsedPlayerCards = playerCards.split(',').map(parseCard).filter(c => c !== null);
    const parsedDealerCard = parseCard(dealerCard);

    if (parsedPlayerCards.length === 0 || !parsedDealerCard) {
        if (resultsDiv) {
            resultsDiv.innerHTML = '<div class="stat" style="color: #f44336;">Invalid card input.</div>';
        }
        button.disabled = false;
        button.textContent = 'WASM Analyze';
        return;
    }

    const gameRules = typeof getGameRules === 'function' ? getGameRules() : {
        dealerStandsOn: document.getElementById('dealerStandsOn')?.value || '17',
        doubleAfterSplit: document.getElementById('doubleAfterSplit')?.checked ?? true,
        resplitAces: document.getElementById('resplitAces')?.checked ?? false,
        blackjackPays: document.getElementById('blackjackPays')?.value || '3:2'
    };

    const tempGame = new BlackjackGame(new Deck(6), gameRules);
    const { value, isSoft } = tempGame.calculateHandValue(parsedPlayerCards);
    spotCheckPlayerTotal = isSoft ? `S${value}` : value.toString();
    const isPair = parsedPlayerCards.length === 2 && parsedPlayerCards[0].value === parsedPlayerCards[1].value;
    const pairLabel = isPair ? (parsedPlayerCards[0].rank === 'A' ? 'A,A' : `${parsedPlayerCards[0].value},${parsedPlayerCards[0].value}`) : null;
    const dealerLabel = parsedDealerCard.value === 11 ? 'A' : parsedDealerCard.value.toString();

    const actions = ['H', 'S'];
    if (canDouble) actions.push('D');
    if (canSplit && isPair) actions.push('P');

    spotCheckTotalActions = actions.length;
    spotCheckActionsOrder = [...actions];

    actions.forEach((action) => {
        const strategy = window.getCurrentStrategy ? window.getCurrentStrategy() : window.strategy;
        if (!strategy) {
            button.disabled = false;
            button.textContent = 'WASM Analyze';
            if (resultsDiv) {
                resultsDiv.innerHTML = '<div class="stat" style="color: #f44336;">Strategy not available.</div>';
            }
            return;
        }

        const strategyData = strategy.exportData();
        const baseStrategy = {
            countBased: strategyData.countBased || false,
            hard: JSON.parse(JSON.stringify(strategyData.hard || {})),
            soft: JSON.parse(JSON.stringify(strategyData.soft || {})),
            pairs: JSON.parse(JSON.stringify(strategyData.pairs || {})),
            hardByCount: JSON.parse(JSON.stringify(strategyData.hardByCount || {})),
            softByCount: JSON.parse(JSON.stringify(strategyData.softByCount || {})),
            pairsByCount: JSON.parse(JSON.stringify(strategyData.pairsByCount || {}))
        };

        const playerCardRanks = parsedPlayerCards.map(c => c.rank);
        const dealerCardRank = parsedDealerCard.rank;

        const spotCheckInput = {
            num_decks: readNumberValue('numDecks', 6),
            iterations: readNumberValue('spotCheckSimulations', 10000),
            bet_size: 100,
            seed: generateSeed(),
            strategy: baseStrategy,
            rules: {
                dealer_hits_soft_17: document.getElementById('dealerStandsOn')?.value === '17',
                dealer_stands_on: document.getElementById('dealerStandsOn')?.value || '17',
                double_after_split: document.getElementById('doubleAfterSplit')?.checked ?? true,
                allow_resplit: document.getElementById('allowResplit')?.checked ?? true,
                resplit_aces: document.getElementById('resplitAces')?.checked ?? false,
                blackjack_pays: document.getElementById('blackjackPays')?.value || '3:2',
                penetration_threshold: readNumberValue('penetration', 75)
            },
            counting: collectCountingPayload(),
            player_cards: playerCardRanks,
            dealer_card: dealerCardRank,
            forced_action: action
        };

        const jobId = `spotcheck-${action}-${++currentJobId}`;
        pendingJobs.set(jobId, { action, button, isSpotCheck: true });

        wasmSimWorker.postMessage({
            jobId,
            payload: spotCheckInput,
            isSpotCheck: true
        });
    });
}

function handleSpotCheckResult(jobId, result) {
    const jobMeta = pendingJobs.get(jobId);
    if (!jobMeta || !jobMeta.isSpotCheck) return false;

    const action = jobMeta.action;
    const ev = result.expectedValue || 0;
    const winRate = result.winRate || 0;
    const returnRate = result.returnRate || 0;
    const wins = result.wins || 0;
    const losses = result.losses || 0;
    const pushes = result.pushes || 0;

    spotCheckActionResults[action] = {
        action,
        expectedValue: ev,
        winRate,
        returnRate,
        wins,
        losses,
        pushes
    };

    spotCheckCompletedActions++;
    pendingJobs.delete(jobId);

    // Update progress bar
    const progressContainer = document.getElementById('spotCheckProgressContainer');
    const actionNames = { 'H': 'Hit', 'S': 'Stand', 'D': 'Double', 'P': 'Split' };
    if (progressContainer) {
        const percent = (spotCheckCompletedActions / spotCheckTotalActions) * 100;
        const percentRounded = Math.round(percent);
        const actionName = actionNames[action] || action;
        progressContainer.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"><span style="position: absolute; left: 50%; transform: translateX(-50%);">${percentRounded}%</span></div></div><div class="progress-text">Analyzing ${actionName}... (${spotCheckCompletedActions}/${spotCheckTotalActions})</div>`;
    }

    if (spotCheckCompletedActions === spotCheckTotalActions) {
        if (spotCheckButton) {
            spotCheckButton.disabled = false;
            spotCheckButton.textContent = 'WASM Analyze';
        }
        let bestAction = 'S';
        let bestEV = -Infinity;
        Object.keys(spotCheckActionResults).forEach(a => {
            if (spotCheckActionResults[a].expectedValue > bestEV) {
                bestEV = spotCheckActionResults[a].expectedValue;
                bestAction = a;
            }
        });

        const dealerCard = document.getElementById('dealerCard')?.value || '';
        const actions = spotCheckActionsOrder;

        let html = `
            <h3>Situation Analysis (WASM)</h3>
            <div class="stat">
                <strong>Your Cards:</strong> ${spotCheckPlayerCards} (Total: ${spotCheckPlayerTotal})
            </div>
            <div class="stat">
                <strong>Dealer Up Card:</strong> ${dealerCard}
            </div>
            <div class="stat">
                <strong>Best Action:</strong> 
                <span style="font-size: 1.2em; color: #4caf50; font-weight: bold;">
                    ${actionNames[bestAction]} (EV: $${bestEV.toFixed(2)})
                </span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Action</th>
                        <th>Expected Value</th>
                        <th>Win Rate</th>
                        <th>Return Rate</th>
                        <th>Wins</th>
                        <th>Losses</th>
                        <th>Pushes</th>
                    </tr>
                </thead>
                <tbody>
        `;

        actions.forEach(action => {
            if (spotCheckActionResults[action]) {
                const result = spotCheckActionResults[action];
                const evClass = result.expectedValue >= 0 ? 'positive' : 'negative';
                const isBest = action === bestAction;
                const rowStyle = isBest ? 'background-color: #e8f5e9; font-weight: bold;' : '';
                html += `
                    <tr style="${rowStyle}">
                        <td>${actionNames[action]}</td>
                        <td class="${evClass}">$${result.expectedValue.toFixed(2)}</td>
                        <td>${result.winRate.toFixed(2)}%</td>
                        <td class="${evClass}">${result.returnRate.toFixed(2)}%</td>
                        <td>${result.wins.toLocaleString()}</td>
                        <td>${result.losses.toLocaleString()}</td>
                        <td>${result.pushes.toLocaleString()}</td>
                    </tr>
                `;
            }
        });

        html += '</tbody></table>';
        if (spotCheckResultsDiv) spotCheckResultsDiv.innerHTML = html;
        
        // Clear progress bar
        if (progressContainer) {
            progressContainer.innerHTML = '';
        }
    }

    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    const simButton = document.getElementById('runSimulationWasm');
    if (simButton) {
        originalButtonText = simButton.textContent || 'Run WASM Simulation';
        simButton.addEventListener('click', startWasmSimulation);
    }

    const spotCheckButton = document.getElementById('analyzeSituationWasm');
    if (spotCheckButton) {
        spotCheckButton.addEventListener('click', startWasmSpotCheck);
    }
});
