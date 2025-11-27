// Main application logic
let deck, game, strategy, simulator, counter;
let optimizationCancelRequested = false;
let optimizationInProgress = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeGame();
    setupEventListeners();
    renderStrategyTable('hard');
    
    // Initialize counting system UI
    setTimeout(() => {
        const system = document.getElementById('countingSystem').value;
        updateCountingSystemUI(system);
        updateStrategyInfo();
    }, 50);
});

function initializeGame() {
    const numDecks = parseInt(document.getElementById('numDecks').value);
    const penetration = parseInt(document.getElementById('penetration').value);
    
    deck = new Deck(numDecks);
    deck.setPenetration(penetration);
    
    // Initialize counter if counting is enabled
    const enableCounting = document.getElementById('enableCounting').checked;
    if (enableCounting) {
        const countingSystem = document.getElementById('countingSystem').value;
        let customValues = null;
        
        if (countingSystem === 'Custom') {
            // Get custom values from inputs
            customValues = getCustomCountingValues();
            if (!customValues) {
                // If no custom values set, use Hi-Lo as default
                const counter = new CardCounter('Hi-Lo');
                customValues = counter.getCardValues('Hi-Lo');
            }
        }
        
        counter = new CardCounter(countingSystem);
        if (customValues) {
            counter.setCustomValues(customValues);
        }
    } else {
        counter = null;
    }
    
    const rules = getGameRules();
    game = new BlackjackGame(deck, rules, counter);
    
    // Only create new strategy if it doesn't exist, otherwise preserve user's changes
    if (!strategy) {
        strategy = new Strategy();
        strategy.loadBasicStrategy();
    }

    // Expose the live strategy instance for other modules (e.g., WASM bridge)
    window.strategy = strategy;
    window.getCurrentStrategy = () => strategy;
    
    // Enable count-based strategy based on mode
    const strategyMode = document.getElementById('strategyMode').value;
    const useCountBased = strategyMode === 'countBased' && enableCounting;
    strategy.enableCountBased(useCountBased);
    
    simulator = new Simulator(game, strategy);
}

function getGameRules() {
    return {
        dealerStandsOn: document.getElementById('dealerStandsOn').value,
        doubleAfterSplit: document.getElementById('doubleAfterSplit').checked,
        allowResplit: document.getElementById('allowResplit').checked,
        resplitAces: document.getElementById('resplitAces').checked,
        blackjackPays: document.getElementById('blackjackPays').value
    };
}

function setupEventListeners() {
    const views = document.querySelectorAll('.view');
    const navItems = document.querySelectorAll('.nav-item');
    const setActiveView = (targetView) => {
        views.forEach(view => {
            view.classList.toggle('active', view.dataset.view === targetView);
        });
        document.body.setAttribute('data-current-view', targetView);
        navItems.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === targetView);
        });
        if (targetView === 'strategy') {
            renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
        }
    };
    window.changeView = setActiveView;

    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveView(btn.dataset.view);
        });
    });

    setActiveView('optimization');

    const optSubTabs = document.querySelectorAll('.optiview-tab');
    const optSubPanels = document.querySelectorAll('.optiview-panel');
    const optResultSections = document.querySelectorAll('.optiview-result');
    const setOptimizationSubview = (targetSubview) => {
        optSubTabs.forEach(tab => {
            const isActive = tab.dataset.subview === targetSubview;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        optSubPanels.forEach(panel => {
            panel.classList.toggle('active', panel.dataset.subview === targetSubview);
        });
        optResultSections.forEach(section => {
            section.classList.toggle('active', section.dataset.subview === targetSubview);
        });
    };
    if (optSubTabs.length > 0 && optSubPanels.length > 0) {
        window.changeOptimizationSubview = setOptimizationSubview;
        setOptimizationSubview('simulation');
        optSubTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                setOptimizationSubview(tab.dataset.subview);
            });
        });
    }

    // Settings changes
    document.getElementById('numDecks').addEventListener('change', () => {
        initializeGame();
    });
    document.getElementById('penetration').addEventListener('change', () => {
        initializeGame();
    });
    ['dealerStandsOn', 'doubleAfterSplit', 'allowResplit', 'resplitAces', 'blackjackPays', 'enableCounting'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            initializeGame();
        });
    });
    
    // Counting system change handler
    document.getElementById('countingSystem').addEventListener('change', (e) => {
        updateCountingSystemUI(e.target.value);
        initializeGame();
    });
    
    // Show system info button
    document.getElementById('showSystemInfo').addEventListener('click', () => {
        const panel = document.getElementById('systemInfoPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') {
            updateSystemInfoDisplay();
        }
    });
    
    // Custom counting inputs
    setupCustomCountingInputs();
    document.getElementById('resetCustomCount').addEventListener('click', () => {
        resetCustomCountingToHiLo();
    });

    // Strategy controls
    const strategyStatusNode = document.getElementById('strategyActionStatus');
    const setStrategyStatus = (message, tone = 'info') => {
        if (!strategyStatusNode) return;
        strategyStatusNode.classList.remove('is-success', 'is-info', 'is-warning');
        const className = tone === 'success' ? 'is-success' : tone === 'warning' ? 'is-warning' : 'is-info';
        strategyStatusNode.classList.add(className);
        strategyStatusNode.textContent = message;
    };
    const formatCountLabel = (countValue) => {
        if (countValue === null || countValue === undefined || countValue === 'base') return 'Base';
        const numeric = parseInt(countValue, 10);
        if (Number.isNaN(numeric)) return 'Base';
        return `TC ${numeric >= 0 ? '+' : ''}${numeric}`;
    };
    const STORAGE_KEY = 'bjSavedStrategies';
    const readSavedStrategies = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            return [];
        } catch (error) {
            console.error('Failed to read saved strategies', error);
            return [];
        }
    };
    const writeSavedStrategies = (list) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (error) {
            console.error('Failed to persist saved strategies', error);
        }
    };
    const savedStrategySelect = document.getElementById('savedStrategySelect');
    const loadStrategyBrowserBtn = document.getElementById('loadStrategyBrowser');
    const deleteStrategyBrowserBtn = document.getElementById('deleteStrategyBrowser');
    const refreshSavedStrategyUI = () => {
        if (!savedStrategySelect) return;
        const saved = readSavedStrategies();
        const previouslySelected = savedStrategySelect.value;
        savedStrategySelect.innerHTML = '<option value="">Saved strategies…</option>';
        saved.forEach((entry) => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = `${entry.name} (${new Date(entry.savedAt).toLocaleString()})`;
            savedStrategySelect.appendChild(option);
        });
        if (saved.some(entry => entry.id === previouslySelected)) {
            savedStrategySelect.value = previouslySelected;
        } else {
            savedStrategySelect.value = '';
        }
        const hasSelection = savedStrategySelect.value !== '';
        if (loadStrategyBrowserBtn) loadStrategyBrowserBtn.disabled = !hasSelection;
        if (deleteStrategyBrowserBtn) deleteStrategyBrowserBtn.disabled = !hasSelection;
    };

    document.getElementById('loadBasicStrategy').addEventListener('click', () => {
        const mode = document.getElementById('strategyMode').value;
        const countLevel = mode === 'countBased' ? parseInt(document.getElementById('countLevelSelect').value) : null;
        if (countLevel !== null && !isNaN(countLevel)) {
            // Load into specific count level
            loadStrategyForCount(strategy, 'basic', countLevel);
        } else {
            strategy.loadBasicStrategy();
        }
        updateStrategyInfo();
        renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
        setStrategyStatus(`Loaded Basic Strategy — ${formatCountLabel(countLevel)}`, 'success');
    });
    document.getElementById('loadOptimalStrategy').addEventListener('click', () => {
        const mode = document.getElementById('strategyMode').value;
        const countLevel = mode === 'countBased' ? parseInt(document.getElementById('countLevelSelect').value) : null;
        if (countLevel !== null && !isNaN(countLevel)) {
            loadStrategyForCount(strategy, 'optimal', countLevel);
        } else {
            strategy.loadOptimalStrategy();
        }
        updateStrategyInfo();
        renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
        setStrategyStatus(`Loaded Optimal Strategy — ${formatCountLabel(countLevel)}`, 'success');
    });
    document.getElementById('clearStrategy').addEventListener('click', () => {
        const mode = document.getElementById('strategyMode').value;
        const countLevel = mode === 'countBased' ? parseInt(document.getElementById('countLevelSelect').value) : null;
        if (countLevel !== null && !isNaN(countLevel)) {
            clearStrategyForCount(strategy, countLevel);
        } else {
            strategy.initializeEmpty();
        }
        updateStrategyInfo();
        renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
        setStrategyStatus(`Cleared strategy grid — ${formatCountLabel(countLevel)}`, 'warning');
    });

    const saveStrategyBrowserBtn = document.getElementById('saveStrategyBrowser');
    if (saveStrategyBrowserBtn) {
        saveStrategyBrowserBtn.addEventListener('click', () => {
            const nameInput = window.prompt('Save current strategy as (letters, numbers, spaces, dashes):', 'My Strategy');
            if (nameInput === null) {
                setStrategyStatus('Save cancelled.', 'info');
                return;
            }
            const cleanName = (nameInput || '').trim().replace(/[^a-zA-Z0-9-_ ]/g, '');
            if (!cleanName) {
                setStrategyStatus('Please enter a valid strategy name.', 'warning');
                return;
            }
            const saved = readSavedStrategies();
            const id = cleanName.toLowerCase().replace(/\s+/g, '-');
            const existingIndex = saved.findIndex(entry => entry.id === id);
            const payload = {
                id,
                name: cleanName,
                savedAt: new Date().toISOString(),
                data: strategy.exportData(),
            };
            if (existingIndex >= 0) {
                if (!window.confirm(`Replace existing saved strategy "${cleanName}"?`)) {
                    setStrategyStatus('Save cancelled.', 'info');
                    return;
                }
                saved[existingIndex] = payload;
            } else {
                saved.push(payload);
            }
            writeSavedStrategies(saved);
            refreshSavedStrategyUI();
            savedStrategySelect.value = payload.id;
            if (loadStrategyBrowserBtn) loadStrategyBrowserBtn.disabled = false;
            if (deleteStrategyBrowserBtn) deleteStrategyBrowserBtn.disabled = false;
            setStrategyStatus(`Strategy saved to browser as "${cleanName}".`, 'success');
        });
    }
    if (savedStrategySelect) {
        savedStrategySelect.addEventListener('change', () => {
            const hasSelection = savedStrategySelect.value !== '';
            if (loadStrategyBrowserBtn) loadStrategyBrowserBtn.disabled = !hasSelection;
            if (deleteStrategyBrowserBtn) deleteStrategyBrowserBtn.disabled = !hasSelection;
        });
    }
    if (loadStrategyBrowserBtn) {
        loadStrategyBrowserBtn.addEventListener('click', () => {
            const selectedId = savedStrategySelect ? savedStrategySelect.value : '';
            if (!selectedId) {
                setStrategyStatus('Select a saved strategy to load.', 'warning');
                return;
            }
            const saved = readSavedStrategies();
            const entry = saved.find(item => item.id === selectedId);
            if (!entry) {
                setStrategyStatus('Saved strategy not found.', 'warning');
                refreshSavedStrategyUI();
                return;
            }
            try {
                strategy.importData(entry.data);
                const modeSelect = document.getElementById('strategyMode');
                if (modeSelect) {
                    modeSelect.value = strategy.countBased ? 'countBased' : 'base';
                }
                document.getElementById('countStrategySelector').style.display = strategy.countBased ? 'block' : 'none';
                updateStrategyInfo();
                renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
                const label = strategy.countBased
                    ? `count-based strategy overrides (${formatCountLabel(document.getElementById('countLevelSelect').value)})`
                    : 'base strategy';
                setStrategyStatus(`Loaded "${entry.name}" from browser storage. Now viewing ${label}.`, 'success');
            } catch (error) {
                console.error('Failed to load saved strategy', error);
                setStrategyStatus('Failed to load saved strategy.', 'warning');
            }
        });
    }
    if (deleteStrategyBrowserBtn) {
        deleteStrategyBrowserBtn.addEventListener('click', () => {
            const selectedId = savedStrategySelect ? savedStrategySelect.value : '';
            if (!selectedId) {
                setStrategyStatus('Select a saved strategy to delete.', 'warning');
                return;
            }
            const saved = readSavedStrategies();
            const entry = saved.find(item => item.id === selectedId);
            if (!entry) {
                refreshSavedStrategyUI();
                setStrategyStatus('Saved strategy not found.', 'warning');
                return;
            }
            if (!window.confirm(`Delete saved strategy "${entry.name}"?`)) {
                setStrategyStatus('Delete cancelled.', 'info');
                return;
            }
            const updated = saved.filter(item => item.id !== selectedId);
            writeSavedStrategies(updated);
            refreshSavedStrategyUI();
            setStrategyStatus(`Deleted saved strategy "${entry.name}".`, 'warning');
        });
    }
    
    // Strategy mode change
    document.getElementById('strategyMode').addEventListener('change', (e) => {
        const isCountBased = e.target.value === 'countBased';
        document.getElementById('countStrategySelector').style.display = isCountBased ? 'block' : 'none';
        strategy.enableCountBased(isCountBased && document.getElementById('enableCounting').checked);
        updateStrategyInfo();
        renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
        setStrategyStatus(`Switched strategy mode to ${isCountBased ? 'Count-Based View' : 'Base View'}.`, 'info');
    });
    
    // Count level selector
    document.getElementById('countLevelSelect').addEventListener('change', () => {
        updateStrategyInfo();
        renderStrategyTable(document.querySelector('.tab-btn.active').dataset.tab);
        const selected = document.getElementById('countLevelSelect').value;
        setStrategyStatus(`Viewing strategy overrides for ${formatCountLabel(selected)}.`, 'info');
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderStrategyTable(btn.dataset.tab);
        });
    });

    // Simulation
    const primaryAnalyzeButton = document.getElementById('analyzeSituation');
    if (primaryAnalyzeButton) {
        primaryAnalyzeButton.addEventListener('click', () => {
            analyzeSituation();
            window.changeOptimizationSubview?.('spotcheck');
        });
    }
    
    // Sim Hand button
    const simHandButton = document.getElementById('simHandButton');
    if (simHandButton) {
        simHandButton.addEventListener('click', () => {
            simulateHand();
        });
    }
    
    const simHandButtonWasm = document.getElementById('simHandButtonWasm');
    if (simHandButtonWasm) {
        simHandButtonWasm.addEventListener('click', () => {
            simulateHandWasm();
        });
    }
    
    // Strategy statistics
    document.getElementById('statsType').addEventListener('change', () => {
        if (window.lastSimulationResults && window.lastSimulationResults.cellStats) {
            renderStrategyStatistics(window.lastSimulationResults.cellStats);
        }
    });
    document.getElementById('statsMetric').addEventListener('change', () => {
        if (window.lastSimulationResults && window.lastSimulationResults.cellStats) {
            renderStrategyStatistics(window.lastSimulationResults.cellStats);
        }
    });
    document.getElementById('statsCountFilter').addEventListener('change', () => {
        if (window.lastSimulationResults && window.lastSimulationResults.cellStats) {
            renderStrategyStatistics(window.lastSimulationResults.cellStats);
        }
        updateOptimizationInfo();
    });

    const initialLabel = strategy.countBased
        ? `count-based strategy overrides (${formatCountLabel(document.getElementById('countLevelSelect').value)})`
        : 'base strategy';
    setStrategyStatus(`Ready. Viewing ${initialLabel}.`, 'info');
    refreshSavedStrategyUI();
    
    const runSimulationSecondaryBtn = document.getElementById('runSimulationSecondary');
    if (runSimulationSecondaryBtn) {
        runSimulationSecondaryBtn.addEventListener('click', () => {
            runSimulation();
        });
    }

    // Strategy optimization (JS)
    document.getElementById('optimizeStrategy').addEventListener('click', async () => {
        if (optimizationInProgress) {
            return;
        }
        if (window.changeView) {
            window.changeView('optimization');
        }
        window.changeOptimizationSubview?.('optimization');
        
        const optimizeButton = document.getElementById('optimizeStrategy');
        const optimizeButtonWasm = document.getElementById('optimizeStrategyWasm');
        const originalButtonText = optimizeButton.textContent;
        optimizeButton.disabled = true;
        if (optimizeButtonWasm) optimizeButtonWasm.disabled = true;
        optimizeButton.textContent = 'Optimizing...';
        
        const numSims = parseInt(document.getElementById('optSimulations').value);
        const betSize = parseInt(document.getElementById('optBetSize').value);
        const countScope = document.getElementById('optCountScope').value;
        const countFilter = document.getElementById('statsCountFilter').value;
        
        optimizationInProgress = true;
        
        try {
            if (countScope === 'all') {
                await optimizeAllCountLevels(numSims, betSize);
            } else {
                const countLevel = countFilter !== 'all' && !isNaN(parseInt(countFilter)) ? parseInt(countFilter) : null;
                await optimizeStrategy(countLevel, numSims, betSize);
            }
        } finally {
            optimizationInProgress = false;
            optimizeButton.disabled = false;
            if (optimizeButtonWasm) optimizeButtonWasm.disabled = false;
            optimizeButton.textContent = originalButtonText;
        }
    });

    // Strategy optimization (WASM)
    const optimizeStrategyWasmBtn = document.getElementById('optimizeStrategyWasm');
    if (optimizeStrategyWasmBtn) {
        optimizeStrategyWasmBtn.addEventListener('click', async () => {
            if (optimizationInProgress) {
                return;
            }
            if (window.changeView) {
                window.changeView('optimization');
            }
            window.changeOptimizationSubview?.('optimization');
            
            const optimizeButton = document.getElementById('optimizeStrategy');
            const optimizeButtonWasm = document.getElementById('optimizeStrategyWasm');
            const originalButtonText = optimizeButtonWasm.textContent;
            optimizeButtonWasm.disabled = true;
            if (optimizeButton) optimizeButton.disabled = true;
            optimizeButtonWasm.textContent = 'Optimizing...';
            
            const numSims = parseInt(document.getElementById('optSimulations').value);
            const betSize = parseInt(document.getElementById('optBetSize').value);
            const countScope = document.getElementById('optCountScope').value;
            const countFilter = document.getElementById('statsCountFilter').value;
            
            optimizationInProgress = true;
            
            try {
                if (countScope === 'all') {
                    await optimizeAllCountLevelsWasm(numSims, betSize);
                } else {
                    const countLevel = countFilter !== 'all' && !isNaN(parseInt(countFilter)) ? parseInt(countFilter) : null;
                    await optimizeStrategyWasm(countLevel, numSims, betSize);
                }
            } finally {
                optimizationInProgress = false;
                optimizeButtonWasm.disabled = false;
                if (optimizeButton) optimizeButton.disabled = false;
                optimizeButtonWasm.textContent = originalButtonText;
            }
        });
    }
    
    // Update optimization info when simulations change
    document.getElementById('optSimulations').addEventListener('input', updateOptimizationInfo);
    
    function updateOptimizationInfo() {
        const numSims = parseInt(document.getElementById('optSimulations').value) || 10000000;
        const totalCells = 102; // Hard (17×10×3) + Soft (9×10×3) + Pairs (10×10×4) ≈ 102
        const totalSims = totalCells * numSims;
        document.getElementById('optTotalSims').textContent = totalCells;
    }
    
    updateOptimizationInfo();
}

function formatDuration(seconds) {
    if (!isFinite(seconds)) {
        return 'Calculating...';
    }
    if (seconds <= 0) {
        return '0s';
    }
    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}

function cancelOptimization() {
    if (!optimizationInProgress || optimizationCancelRequested) {
        return;
    }
    
    optimizationCancelRequested = true;
    
    const cancelButton = document.getElementById('optimizationCancelButton');
    if (cancelButton) {
        cancelButton.disabled = true;
        cancelButton.textContent = 'Cancelling...';
    }
    
    const statusLabel = document.getElementById('optStatus');
    if (statusLabel) {
        statusLabel.textContent = 'Cancelling optimization...';
    }
    
    const etaElement = document.getElementById('optEta');
    if (etaElement) {
        etaElement.textContent = 'ETA Remaining: Cancelling...';
    }
}

function renderStrategyTable(type) {
    const container = document.getElementById('strategyTable');
    const dealers = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
    const mode = document.getElementById('strategyMode').value;
    const countLevel = mode === 'countBased' ? document.getElementById('countLevelSelect').value : null;
    const countValue = countLevel && countLevel !== 'base' ? parseInt(countLevel) : null;
    
    let html = '<table><thead><tr><th>Player</th>';
    dealers.forEach(d => {
        html += `<th>${d}</th>`;
    });
    html += '</tr></thead><tbody>';

    if (type === 'hard') {
        for (let total = 21; total >= 5; total--) {
            html += `<tr><td><strong>${total}</strong></td>`;
            dealers.forEach(dealer => {
                let action = 'S';
                if (countValue !== null && mode === 'countBased') {
                    // Check count-specific strategy first
                    const countKey = countValue.toString();
                    if (strategy.hardByCount[countKey] && strategy.hardByCount[countKey][total] && 
                        strategy.hardByCount[countKey][total][dealer]) {
                        action = strategy.hardByCount[countKey][total][dealer];
                    } else if (strategy.hard[total] && strategy.hard[total][dealer]) {
                        action = strategy.hard[total][dealer];
                    }
                } else {
                    // Base strategy
                    if (strategy.hard[total] && strategy.hard[total][dealer]) {
                        action = strategy.hard[total][dealer];
                    }
                }
                html += `<td class="action-${action}" data-player="${total}" data-dealer="${dealer}" data-type="hard" data-count="${countValue || ''}">${action}</td>`;
            });
            html += '</tr>';
        }
    } else if (type === 'soft') {
        for (let total = 21; total >= 13; total--) {
            html += `<tr><td><strong>A,${total - 11}</strong></td>`;
            dealers.forEach(dealer => {
                let action = 'S';
                if (countValue !== null && mode === 'countBased') {
                    const countKey = countValue.toString();
                    if (strategy.softByCount[countKey] && strategy.softByCount[countKey][total] && 
                        strategy.softByCount[countKey][total][dealer]) {
                        action = strategy.softByCount[countKey][total][dealer];
                    } else if (strategy.soft[total] && strategy.soft[total][dealer]) {
                        action = strategy.soft[total][dealer];
                    }
                } else {
                    if (strategy.soft[total] && strategy.soft[total][dealer]) {
                        action = strategy.soft[total][dealer];
                    }
                }
                html += `<td class="action-${action}" data-player="S${total}" data-dealer="${dealer}" data-type="soft" data-count="${countValue || ''}">${action}</td>`;
            });
            html += '</tr>';
        }
    } else if (type === 'pairs') {
        const pairs = [
            { label: 'A,A', value: 11 },
            { label: '10,10', value: 10 },
            { label: '9,9', value: 9 },
            { label: '8,8', value: 8 },
            { label: '7,7', value: 7 },
            { label: '6,6', value: 6 },
            { label: '5,5', value: 5 },
            { label: '4,4', value: 4 },
            { label: '3,3', value: 3 },
            { label: '2,2', value: 2 }
        ];
        pairs.forEach(pair => {
            html += `<tr><td><strong>${pair.label}</strong></td>`;
            dealers.forEach(dealer => {
                let action = 'H';
                if (countValue !== null && mode === 'countBased') {
                    const countKey = countValue.toString();
                    if (strategy.pairsByCount[countKey] && strategy.pairsByCount[countKey][pair.value] && 
                        strategy.pairsByCount[countKey][pair.value][dealer]) {
                        action = strategy.pairsByCount[countKey][pair.value][dealer];
                    } else if (strategy.pairs[pair.value] && strategy.pairs[pair.value][dealer]) {
                        action = strategy.pairs[pair.value][dealer];
                    }
                } else {
                    if (strategy.pairs[pair.value] && strategy.pairs[pair.value][dealer]) {
                        action = strategy.pairs[pair.value][dealer];
                    }
                }
                html += `<td class="action-${action}" data-player="${pair.value}" data-dealer="${dealer}" data-type="pairs" data-count="${countValue || ''}">${action}</td>`;
            });
            html += '</tr>';
        });
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    // Add click handlers for strategy cells
    container.querySelectorAll('td[data-player]').forEach(cell => {
        cell.addEventListener('click', () => {
            const actions = ['H', 'S', 'D', 'P'];
            const currentAction = cell.textContent;
            const currentIndex = actions.indexOf(currentAction);
            const nextAction = actions[(currentIndex + 1) % actions.length];
            
            cell.textContent = nextAction;
            cell.className = `action-${nextAction}`;
            
            const player = cell.dataset.player;
            const dealer = cell.dataset.dealer;
            const cellType = cell.dataset.type;
            const countVal = cell.dataset.count ? parseInt(cell.dataset.count) : null;
            
            if (countVal !== null && mode === 'countBased') {
                // Set count-specific strategy
                const playerTotal = cellType === 'soft' ? `S${parseInt(player.substring(1))}` : 
                                  cellType === 'pairs' ? player : player;
                strategy.setCountAction(countVal, playerTotal, dealer, nextAction);
            } else {
                // Set base strategy
                if (cellType === 'hard') {
                    strategy.hard[parseInt(player)][dealer] = nextAction;
                } else if (cellType === 'soft') {
                    strategy.soft[parseInt(player.substring(1))][dealer] = nextAction;
                } else if (cellType === 'pairs') {
                    strategy.pairs[parseInt(player)][dealer] = nextAction;
                }
            }
        });
    });
}

function updateStrategyInfo() {
    const mode = document.getElementById('strategyMode').value;
    const infoDiv = document.getElementById('currentStrategyInfo');
    
    if (mode === 'countBased') {
        const countLevel = document.getElementById('countLevelSelect').value;
        if (countLevel === 'base') {
            infoDiv.textContent = 'Base Strategy (used when no count-specific override exists)';
        } else {
            const count = parseInt(countLevel);
            const countLabel = count >= 4 ? 'Very High (+4+)' : 
                            count >= 1 ? `High (+${count})` :
                            count <= -4 ? 'Very Low (-4-)' :
                            `Low (${count})`;
            infoDiv.textContent = `Count-Based Strategy for ${countLabel}`;
        }
    } else {
        infoDiv.textContent = 'Base Strategy (applies to all counts)';
    }
}

function loadStrategyForCount(strategyObj, strategyType, count) {
    // Create a temporary strategy to load the base strategy
    const tempStrategy = new Strategy();
    if (strategyType === 'basic') {
        tempStrategy.loadBasicStrategy();
    } else {
        tempStrategy.loadOptimalStrategy();
    }
    
    // Copy to count-specific strategy
    const countKey = count.toString();
    
    // Hard totals
    for (let total = 5; total <= 21; total++) {
        if (!strategyObj.hardByCount[countKey]) strategyObj.hardByCount[countKey] = {};
        if (!strategyObj.hardByCount[countKey][total]) strategyObj.hardByCount[countKey][total] = {};
        for (let dealer = 2; dealer <= 11; dealer++) {
            const dealerCard = dealer === 11 ? 'A' : dealer.toString();
            if (tempStrategy.hard[total] && tempStrategy.hard[total][dealerCard]) {
                strategyObj.hardByCount[countKey][total][dealerCard] = tempStrategy.hard[total][dealerCard];
            }
        }
    }
    
    // Soft totals
    for (let total = 13; total <= 21; total++) {
        if (!strategyObj.softByCount[countKey]) strategyObj.softByCount[countKey] = {};
        if (!strategyObj.softByCount[countKey][total]) strategyObj.softByCount[countKey][total] = {};
        for (let dealer = 2; dealer <= 11; dealer++) {
            const dealerCard = dealer === 11 ? 'A' : dealer.toString();
            if (tempStrategy.soft[total] && tempStrategy.soft[total][dealerCard]) {
                strategyObj.softByCount[countKey][total][dealerCard] = tempStrategy.soft[total][dealerCard];
            }
        }
    }
    
    // Pairs
    for (let value = 2; value <= 11; value++) {
        if (!strategyObj.pairsByCount[countKey]) strategyObj.pairsByCount[countKey] = {};
        if (!strategyObj.pairsByCount[countKey][value]) strategyObj.pairsByCount[countKey][value] = {};
        for (let dealer = 2; dealer <= 11; dealer++) {
            const dealerCard = dealer === 11 ? 'A' : dealer.toString();
            if (tempStrategy.pairs[value] && tempStrategy.pairs[value][dealerCard]) {
                strategyObj.pairsByCount[countKey][value][dealerCard] = tempStrategy.pairs[value][dealerCard];
            }
        }
    }
    
    strategyObj.enableCountBased(true);
}

function clearStrategyForCount(strategyObj, count) {
    const countKey = count.toString();
    delete strategyObj.hardByCount[countKey];
    delete strategyObj.softByCount[countKey];
    delete strategyObj.pairsByCount[countKey];
}

function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '-';
    const seconds = Math.floor(milliseconds / 1000);
    const msPart = milliseconds % 1000;
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${minutes}m ${secs}s`;
    }
    if (seconds >= 60) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}m ${secs}s`;
    }
    if (seconds >= 1) {
        return `${seconds}.${Math.floor(msPart / 100)}s`;
    }
    return `${milliseconds.toFixed(0)}ms`;
}

function showSimulationDuration(startTime, elementId) {
    if (!startTime) return;
    const node = document.getElementById(elementId);
    if (!node) return;
    const elapsed = Date.now() - startTime;
    node.textContent = formatDuration(elapsed);
}

window.showSimulationDuration = showSimulationDuration;

function updateSimulationOutputs(results, options = {}) {
    const { progressMount, durationMs } = options;
    if (!results) return;
    const resultsDiv = document.getElementById('simulationResults');
    if (!resultsDiv) return;

    if (typeof durationMs === 'number' && durationMs >= 0) {
        window.lastSimulationDuration = durationMs;
    }
    const lastDurationText = typeof window.lastSimulationDuration === 'number'
        ? formatDuration(window.lastSimulationDuration)
        : null;

    const evClass = results.expectedValue >= 0 ? 'positive' : 'negative';
    const returnClass = results.returnRate >= 0 ? 'positive' : 'negative';

    let html = `
        <h3>Simulation Results (${(results.totalGames || 0).toLocaleString()} games)</h3>
        <div class="stat">
            <strong>Expected Value per Hand:</strong> 
            <span class="${evClass}">$${(results.expectedValue || 0).toFixed(2)}</span>
        </div>
        <div class="stat">
            <strong>Total Winnings:</strong> 
            <span class="${evClass}">$${(results.totalWinnings || 0).toFixed(2)}</span>
        </div>
        <div class="stat">
            <strong>Total Bet:</strong> $${(results.totalBet || 0).toFixed(2)}
        </div>
        <div class="stat">
            <strong>Return Rate:</strong> 
            <span class="${returnClass}">${(results.returnRate || 0).toFixed(2)}%</span>
        </div>
        <div class="stat">
            <strong>Win Rate:</strong> ${(results.winRate || 0).toFixed(2)}%
        </div>
        ${lastDurationText ? `<div class="stat">
            <strong>Last Run Duration:</strong> ${lastDurationText}
        </div>` : ''}
        <table>
            <thead>
                <tr>
                    <th>Outcome</th>
                    <th>Count</th>
                    <th>Percentage</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Wins</td>
                    <td>${(results.wins || 0).toLocaleString()}</td>
                    <td>${((results.wins || 0) / (results.totalGames || 1) * 100).toFixed(2)}%</td>
                </tr>
                <tr>
                    <td>Losses</td>
                    <td>${(results.losses || 0).toLocaleString()}</td>
                    <td>${((results.losses || 0) / (results.totalGames || 1) * 100).toFixed(2)}%</td>
                </tr>
                <tr>
                    <td>Pushes</td>
                    <td>${(results.pushes || 0).toLocaleString()}</td>
                    <td>${((results.pushes || 0) / (results.totalGames || 1) * 100).toFixed(2)}%</td>
                </tr>
                <tr>
                    <td>Blackjacks</td>
                    <td>${(results.blackjacks || 0).toLocaleString()}</td>
                    <td>${((results.blackjacks || 0) / (results.totalGames || 1) * 100).toFixed(2)}%</td>
                </tr>
            </tbody>
        </table>
    `;

    if (progressMount) {
        progressMount.innerHTML = '';
    }
    resultsDiv.innerHTML = html;

    // Count stats
    const countDisplay = document.getElementById('countDisplay');
    if (results.countStats && results.countStats.countDistribution) {
        const countStatsDiv = document.getElementById('countStats');
        if (countDisplay) {
            countDisplay.style.display = 'block';
        }
        if (countStatsDiv) {
            let countHtml = '<table style="width: 100%; margin-top: 10px;"><thead><tr><th>True Count</th><th>Hands</th><th>Avg EV</th><th>% of Total</th></tr></thead><tbody>';
            const sortedCounts = Object.keys(results.countStats.countDistribution)
                .map(k => parseInt(k, 10))
                .sort((a, b) => a - b);
            for (let count of sortedCounts) {
                const countKey = count.toString();
                const hands = results.countStats.handsByCount?.[countKey] || 0;
                const ev = results.countStats.evByCount?.[countKey] || 0;
                const totalHands = results.countStats.totalHands || results.totalGames || 1;
                const percentage = totalHands > 0 ? ((hands / totalHands) * 100).toFixed(1) : '0.0';
                const evClass = ev >= 0 ? 'positive' : 'negative';
                countHtml += `
                    <tr>
                        <td>${count >= 0 ? '+' : ''}${count}</td>
                        <td>${hands.toLocaleString()}</td>
                        <td class="${evClass}">$${ev.toFixed(2)}</td>
                        <td>${percentage}%</td>
                    </tr>
                `;
            }
            countHtml += '</tbody></table>';
            countStatsDiv.innerHTML = countHtml;
        }
    } else if (countDisplay) {
        countDisplay.style.display = 'none';
    }

    window.lastSimulationResults = results;
    if (results.cellStats && Object.keys(results.cellStats).length > 0) {
        renderStrategyStatistics(results.cellStats);
    }
}

window.updateSimulationOutputs = updateSimulationOutputs;

function runSimulation() {
    window.changeOptimizationSubview?.('simulation');
    const numSimulations = parseInt(document.getElementById('numSimulations').value);
    const betSize = parseInt(document.getElementById('betSize').value);
    const resultsDiv = document.getElementById('simulationResults');
    
    // Disable the button during simulation
    const runButton = document.getElementById('runSimulation');
    const originalButtonText = runButton ? runButton.textContent : null;
    if (runButton) {
        runButton.disabled = true;
        runButton.textContent = 'Running...';
    }
    const runButtonSecondary = document.getElementById('runSimulationSecondary');
    const originalSecondaryText = runButtonSecondary ? runButtonSecondary.textContent : null;
    if (runButtonSecondary) {
        runButtonSecondary.disabled = true;
        runButtonSecondary.textContent = 'Running...';
    }
    
    // Initialize progress display with enhanced indicator
    let progressHtml = `
        <div class="loading" style="padding: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div id="spinner" style="width: 24px; height: 24px; border: 3px solid #f0f0f0; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                <div style="font-size: 1.1em; font-weight: 600; color: #333;">Running simulation...</div>
            </div>
            <div style="width: 100%; background-color: #f0f0f0; border-radius: 8px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
                <div id="progressBar" style="width: 0%; height: 28px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; text-align: center; line-height: 28px; color: white; font-size: 0.95em; font-weight: 600; position: relative;">
                    <span id="progressPercent">0%</span>
                </div>
            </div>
            <div style="margin-top: 15px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #667eea;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Progress</div>
                    <div id="progressText" style="font-size: 1.1em; font-weight: 600; color: #333;">Starting...</div>
                </div>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #4caf50;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Processing Speed</div>
                    <div id="speedText" style="font-size: 1.1em; font-weight: 600; color: #333;">-</div>
                </div>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #ff9800;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Estimated Time Remaining</div>
                    <div id="etaText" style="font-size: 1.1em; font-weight: 600; color: #333;">Calculating...</div>
                </div>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #2196f3;">
                    <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">Last Duration</div>
                    <div id="simulationDurationText" style="font-size: 1.1em; font-weight: 600; color: #333;">-</div>
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
    const progressMount = document.getElementById('simulationProgressContainer');
    if (progressMount) {
        progressMount.innerHTML = progressHtml;
    } else {
        resultsDiv.innerHTML = progressHtml;
    }
    
    const cancelButton = document.getElementById('optimizationCancelButton');
    if (cancelButton) {
        cancelButton.disabled = false;
        cancelButton.textContent = 'Cancel Optimization';
        cancelButton.onclick = cancelOptimization;
    }
    
    // Allow UI to update
    setTimeout(() => {
        // Reinitialize game/deck but preserve strategy
        const numDecks = parseInt(document.getElementById('numDecks').value);
        const penetration = parseInt(document.getElementById('penetration').value);
        
        deck = new Deck(numDecks);
        deck.setPenetration(penetration);
        
        // Initialize counter if counting is enabled
        const enableCounting = document.getElementById('enableCounting').checked;
        if (enableCounting) {
            const countingSystem = document.getElementById('countingSystem').value;
            let customValues = null;
            
            if (countingSystem === 'Custom') {
                customValues = getCustomCountingValues();
                if (!customValues) {
                    const counter = new CardCounter('Hi-Lo');
                    customValues = counter.getCardValues('Hi-Lo');
                }
            }
            
            counter = new CardCounter(countingSystem);
            if (customValues) {
                counter.setCustomValues(customValues);
            }
        } else {
            counter = null;
        }
        
        const rules = getGameRules();
        game = new BlackjackGame(deck, rules, counter);
        
        // Preserve existing strategy - don't recreate it!
        // Strategy is already set and should keep user's modifications
        
        const strategyMode = document.getElementById('strategyMode').value;
        const useCountBased = strategyMode === 'countBased' && enableCounting;
        strategy.enableCountBased(useCountBased);
        
        simulator = new Simulator(game, strategy);
        
        // Track timing for ETA calculation
        const startTime = Date.now();
        let lastUpdateTime = Date.now();
        let lastUpdateCount = 0;
        
        // Progress callback
        const progressCallback = (current, total) => {
            const now = Date.now();
            const percentage = Math.round((current / total) * 100);
            const elapsed = (now - startTime) / 1000; // seconds
            const recentElapsed = (now - lastUpdateTime) / 1000;
            const recentCount = current - lastUpdateCount;
            
            // Update progress bar
            const progressBar = document.getElementById('progressBar');
            const progressPercent = document.getElementById('progressPercent');
            const progressText = document.getElementById('progressText');
            const speedText = document.getElementById('speedText');
            const etaText = document.getElementById('etaText');
            
            if (progressBar && progressPercent) {
                progressBar.style.width = percentage + '%';
                progressPercent.textContent = percentage + '%';
            }
            
            if (progressText) {
                progressText.textContent = `${current.toLocaleString()} / ${total.toLocaleString()} games`;
            }
            
            // Calculate and display processing speed
            if (speedText && recentElapsed > 0) {
                const gamesPerSecond = Math.round(recentCount / recentElapsed);
                const gamesPerMinute = Math.round(gamesPerSecond * 60);
                
                if (gamesPerSecond >= 1000) {
                    speedText.textContent = `${(gamesPerSecond / 1000).toFixed(1)}K games/sec`;
                } else {
                    speedText.textContent = `${gamesPerSecond.toLocaleString()} games/sec`;
                }
            }
            
            // Calculate and display ETA
            if (etaText && current > 0 && elapsed > 0) {
                const avgSpeed = current / elapsed; // games per second
                const remaining = total - current;
                const etaSeconds = remaining / avgSpeed;
                
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
            
            // Update tracking variables
            lastUpdateTime = now;
            lastUpdateCount = current;
        };
        
        // Run async simulation
        simulator.runSimulations(numSimulations, betSize, progressCallback).then(results => {
            // Stop spinner
            if (spinner) {
                spinner.style.display = 'none';
            }
            
            // Re-enable button
            if (runButton) {
                runButton.disabled = false;
                runButton.textContent = originalButtonText || 'Run Simulation';
            }
            if (runButtonSecondary) {
                runButtonSecondary.disabled = false;
                runButtonSecondary.textContent = originalSecondaryText || 'Run Simulation';
            }
            
            
            const durationMs = Date.now() - startTime;
            showSimulationDuration(startTime, 'simulationDurationText');
            updateSimulationOutputs(results, { progressMount, durationMs });
        });
    }, 100);
}

function analyzeSituation() {
    const resultsDiv = document.getElementById('analysisResults');
    const recapPanel = document.getElementById('spotcheckRecapResults') || resultsDiv;
    const playerCards = document.getElementById('playerCards').value;
    const dealerCard = document.getElementById('dealerCard').value;
    const canDouble = document.getElementById('canDouble').checked;
    const canSplit = document.getElementById('canSplit').checked;
    if (recapPanel) {
        recapPanel.innerHTML = '';
    }
    
    if (!playerCards || !dealerCard) {
        const errorHtml = '<div class="stat" style="color: #f44336;">Please enter both player cards and dealer card.</div>';
        if (resultsDiv) resultsDiv.innerHTML = errorHtml;
        if (recapPanel) recapPanel.innerHTML = errorHtml;
        return;
    }
    
    if (resultsDiv) resultsDiv.innerHTML = '<div class="loading">Analyzing situation... Please wait.</div>';
    if (recapPanel && recapPanel !== resultsDiv) {
        recapPanel.innerHTML = '<div class="loading">Analyzing situation... Please wait.</div>';
    }
    
    // Show progress bar immediately
    const progressContainer = document.getElementById('spotCheckProgressContainer');
    if (progressContainer) {
        progressContainer.innerHTML = '<div class="progress-bar"><div class="progress-fill" style="width: 0%"><span style="position: absolute; left: 50%; transform: translateX(-50%);">0%</span></div></div><div class="progress-text">Starting analysis...</div>';
    }
    
    // Use setTimeout to allow UI to update before starting analysis
    setTimeout(async () => {
        const gameRules = getGameRules();
        const numSimulations = parseInt(document.getElementById('spotCheckSimulations')?.value || '10000', 10) || 10000;
        const betSize = parseFloat(document.getElementById('betSize')?.value || '100');
        
        // Determine which actions will be analyzed
        const actionsToAnalyze = ['H', 'S'];
        if (canDouble) actionsToAnalyze.push('D');
        if (canSplit) actionsToAnalyze.push('P');
        const actionNames = { 'H': 'Hit', 'S': 'Stand', 'D': 'Double', 'P': 'Split' };
        
        // Update progress as each action starts
        let actionIndex = 0;
        const updateProgress = (action) => {
            if (progressContainer) {
                const percent = ((actionIndex + 1) / actionsToAnalyze.length) * 100;
                const percentRounded = Math.round(percent);
                progressContainer.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"><span style="position: absolute; left: 50%; transform: translateX(-50%);">${percentRounded}%</span></div></div><div class="progress-text">Analyzing ${actionNames[action]}... (${actionIndex + 1}/${actionsToAnalyze.length})</div>`;
            }
            actionIndex++;
        };
        
        const analysis = await simulator.analyzeSituation(playerCards, dealerCard, gameRules, numSimulations, updateProgress, betSize);
        
        if (analysis.error) {
            const errorHtml = `<div class="stat" style="color: #f44336;">${analysis.error}</div>`;
            if (resultsDiv) resultsDiv.innerHTML = errorHtml;
            if (recapPanel && recapPanel !== resultsDiv) recapPanel.innerHTML = errorHtml;
            return;
        }
        
        let html = `
            <h3>Situation Analysis</h3>
            <div class="stat">
                <strong>Your Cards:</strong> ${analysis.situation.playerCards} (Total: ${analysis.situation.playerTotal})
            </div>
            <div class="stat">
                <strong>Dealer Up Card:</strong> ${analysis.situation.dealerCard}
            </div>
            <div class="stat">
                <strong>Best Action:</strong> 
                <span style="font-size: 1.2em; color: #4caf50; font-weight: bold;">
                    ${actionNames[analysis.bestAction]} (EV: $${analysis.bestExpectedValue.toFixed(2)})
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
        
        const actions = ['H', 'S'];
        if (canDouble) actions.push('D');
        if (canSplit) actions.push('P');
        
        actions.forEach(action => {
            if (analysis.actions[action]) {
                const result = analysis.actions[action];
                const evClass = result.expectedValue >= 0 ? 'positive' : 'negative';
                const isBest = action === analysis.bestAction;
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
        
        html += `
                </tbody>
            </table>
        `;
        
        if (resultsDiv) resultsDiv.innerHTML = html;
        if (recapPanel && recapPanel !== resultsDiv) recapPanel.innerHTML = html;
        
        // Clear progress bar
        if (progressContainer) {
            progressContainer.innerHTML = '';
        }
    }, 100);
}

function simulateHand() {
    // Clear console for fresh logs
    console.clear();
    if (!game || !strategy) {
        alert('Please initialize the game first by going to the Simulation tab.');
        return;
    }

    const resultsDiv = document.getElementById('simHandResults');
    const progressContainer = document.getElementById('simHandProgressContainer');
    const button = document.getElementById('simHandButton');
    
    if (!resultsDiv || !button) return;
    
    // Disable button and show loading
    button.disabled = true;
    button.textContent = '🎲 Simulating...';
    if (progressContainer) {
        progressContainer.style.display = 'block';
        progressContainer.innerHTML = '<div class="loading">Dealing cards...</div>';
    }
    resultsDiv.innerHTML = '<div class="loading">Simulating hand...</div>';
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
        try {
            // Ensure game and strategy are initialized
            if (!game || !strategy) {
                throw new Error('Game or strategy not initialized');
            }
            
            // Play one hand
            const result = game.playGame(strategy, 100);
            
            // Use shared display function
            displaySimHandResult(result, game);
            return;
            
            // Format cards for display (old code - kept for reference)
            const formatCard = (card) => {
                const suitSymbols = {
                    '♠': '♠',
                    '♥': '♥',
                    '♦': '♦',
                    '♣': '♣'
                };
                const suit = suitSymbols[card.suit] || '♠';
                const rank = card.rank;
                const color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
                return `<span class="card-display" style="color: ${color}; font-weight: bold;">${rank}${suit}</span>`;
            };
            
            const formatCards = (cards) => {
                return cards.map(formatCard).join(' ');
            };
            
            // Calculate dealer value
            const dealerValue = game.calculateHandValue(result.dealerCards);
            
            // Get final player hands (use hands array if available, otherwise use initial cards)
            const finalHands = result.hands && result.hands.length > 0 ? result.hands : 
                              [{ cards: result.playerCards, bet: 1, result: null }];
            
            // Determine result color and message
            let resultColor = '#666';
            let resultMessage = '';
            let resultIcon = '';
            
            if (result.result === 'blackjack') {
                resultColor = '#4caf50';
                resultMessage = 'Blackjack!';
                resultIcon = '🎉';
            } else if (result.result === 'win') {
                resultColor = '#4caf50';
                resultMessage = 'Win';
                resultIcon = '✅';
            } else if (result.result === 'lose') {
                resultColor = '#f44336';
                resultMessage = 'Loss';
                resultIcon = '❌';
            } else {
                resultColor = '#ff9800';
                resultMessage = 'Push';
                resultIcon = '➖';
            }
            
            // Build HTML
            let html = `
                <div style="padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div style="font-size: 2.5em; margin-bottom: 10px;">${resultIcon}</div>
                        <div style="font-size: 1.8em; font-weight: bold; color: ${resultColor}; margin-bottom: 5px;">
                            ${resultMessage}
                        </div>
                        <div style="font-size: 1.2em; color: #666;">
                            ${result.winnings > 0 ? '+' : ''}$${result.winnings.toFixed(2)}
                        </div>
                    </div>
            `;
            
            // Show initial cards
            html += `
                    <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
                        <div style="font-weight: bold; margin-bottom: 10px; font-size: 1.1em;">Initial Cards</div>
                        <div style="margin-bottom: 8px;">
                            <span style="color: #666; font-size: 0.9em;">You: </span>
                            <span style="font-size: 1.2em; line-height: 1.8;">${formatCards(result.playerCards)}</span>
                        </div>
                        <div>
                            <span style="color: #666; font-size: 0.9em;">Dealer: </span>
                            <span style="font-size: 1.2em; line-height: 1.8;">${formatCards([result.dealerCards[0]])} <span style="color: #999;">[?]</span></span>
                        </div>
                    </div>
            `;
            
            // Show final hands (all cards after all actions)
            if (finalHands.length === 1) {
                const hand = finalHands[0];
                const handValue = game.calculateHandValue(hand.cards);
                const isBust = handValue.value > 21;
                
                html += `
                    <div style="margin-bottom: 30px;">
                        <div style="font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">Your Final Hand</div>
                        <div style="font-size: 1.3em; margin-bottom: 10px; line-height: 1.8;">
                            ${formatCards(hand.cards)}
                        </div>
                        <div style="color: ${isBust ? '#f44336' : '#666'}; font-size: 0.95em;">
                            Value: <strong>${isBust ? 'BUST' : handValue.value}</strong>${handValue.isSoft && !isBust ? ' (Soft)' : ''}
                        </div>
                    </div>
                `;
            } else {
                // Multiple hands (split)
                html += `
                    <div style="margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Final Hands (${finalHands.length})</div>
                `;
                finalHands.forEach((hand, index) => {
                    const handValue = game.calculateHandValue(hand.cards);
                    const isBust = handValue.value > 21;
                    html += `
                        <div style="margin-bottom: 15px; padding-bottom: 15px; ${index < finalHands.length - 1 ? 'border-bottom: 1px solid #ddd;' : ''}">
                            <div style="font-weight: bold; margin-bottom: 5px; font-size: 1.05em;">Hand ${index + 1}</div>
                            <div style="font-size: 1.2em; margin-bottom: 5px; line-height: 1.8;">
                                ${formatCards(hand.cards)}
                            </div>
                            <div style="color: ${isBust ? '#f44336' : '#666'}; font-size: 0.9em;">
                                Value: <strong>${isBust ? 'BUST' : handValue.value}</strong>${handValue.isSoft && !isBust ? ' (Soft)' : ''}
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }
            
            // Show dealer final hand
            html += `
                    <div style="margin-bottom: 30px;">
                        <div style="font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">Dealer Final Hand</div>
                        <div style="font-size: 1.3em; margin-bottom: 10px; line-height: 1.8;">
                            ${formatCards(result.dealerCards)}
                        </div>
                        <div style="color: #666; font-size: 0.95em;">
                            Value: <strong>${dealerValue.value}</strong>${dealerValue.isSoft ? ' (Soft)' : ''}${dealerValue.value > 21 ? ' (BUST)' : ''}
                        </div>
                    </div>
            `;
            
            // Show action sequence
            if (result.initialDecision) {
                const actionNames = { 'H': 'Hit', 'S': 'Stand', 'D': 'Double', 'P': 'Split' };
                const action = result.initialDecision.action;
                const playerTotal = result.initialDecision.playerTotal;
                const dealerCard = result.initialDecision.dealerCard;
                const playerTotalStr = playerTotal.isSoft ? `S${playerTotal.value}` : playerTotal.value.toString();
                const dealerCardStr = dealerCard.value === 11 ? 'A' : dealerCard.value.toString();
                
                // Debug: Log what strategy would say for this situation
                const strategyAction = strategy.getAction(
                    playerTotalStr, 
                    dealerCardStr, 
                    true, // canDouble
                    false, // canSplit
                    0 // count
                );
                console.log('Strategy lookup for initial decision:', {
                    playerTotal: playerTotalStr,
                    dealerCard: dealerCardStr,
                    strategyAction,
                    actualAction: action,
                    countBased: strategy.countBased,
                    hardStrategy: !isNaN(parseInt(playerTotalStr)) ? (strategy.hard[parseInt(playerTotalStr)] ? strategy.hard[parseInt(playerTotalStr)][dealerCardStr] : 'not found') : 'N/A'
                });
                
                // Build action sequence
                let actionSequence = [];
                if (finalHands.length === 1) {
                    const hand = finalHands[0];
                    const initialCards = result.playerCards;
                    
                    if (action === 'P') {
                        actionSequence.push('Split');
                    } else if (action === 'D') {
                        actionSequence.push('Double');
                    } else if (action === 'H') {
                        actionSequence.push('Hit');
                        // Show what card was received
                        if (hand.cards.length > initialCards.length) {
                            const newCards = hand.cards.slice(initialCards.length);
                            newCards.forEach((card, idx) => {
                                const cardValue = game.calculateHandValue(hand.cards.slice(0, initialCards.length + idx + 1));
                                actionSequence.push(`→ Got ${formatCard(card)} (${cardValue.value}${cardValue.isSoft ? ' soft' : ''})`);
                            });
                        }
                    } else {
                        actionSequence.push('Stand');
                    }
                } else {
                    // Split hands
                    actionSequence.push('Split');
                    finalHands.forEach((hand, idx) => {
                        const handValue = game.calculateHandValue(hand.cards);
                        actionSequence.push(`Hand ${idx + 1}: ${formatCards(hand.cards)} (${handValue.value}${handValue.isSoft ? ' soft' : ''})`);
                    });
                }
                
                html += `
                    <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                        <div style="font-weight: bold; margin-bottom: 8px;">Action Sequence</div>
                        <div style="color: #666; margin-bottom: 5px; font-size: 0.95em;">
                            Initial: ${playerTotalStr} vs ${dealerCardStr} → ${actionNames[action] || action}
                        </div>
                        <div style="color: #333; font-size: 0.9em; line-height: 1.6;">
                            ${actionSequence.join('<br>')}
                        </div>
                    </div>
                `;
            }
            
            // Show result explanation
            let resultExplanation = '';
            if (finalHands.length === 1) {
                const hand = finalHands[0];
                const handValue = game.calculateHandValue(hand.cards);
                if (handValue.value > 21) {
                    resultExplanation = 'You busted';
                } else if (dealerValue.value > 21) {
                    resultExplanation = 'Dealer busted';
                } else if (handValue.value > dealerValue.value) {
                    resultExplanation = `Your ${handValue.value} beats dealer's ${dealerValue.value}`;
                } else if (handValue.value < dealerValue.value) {
                    resultExplanation = `Dealer's ${dealerValue.value} beats your ${handValue.value}`;
                } else {
                    resultExplanation = `Both have ${handValue.value} (push)`;
                }
            } else {
                // Multiple hands - show summary
                const handResults = finalHands.map(hand => {
                    const handValue = game.calculateHandValue(hand.cards);
                    if (handValue.value > 21) return 'Bust';
                    if (dealerValue.value > 21) return 'Win';
                    if (handValue.value > dealerValue.value) return 'Win';
                    if (handValue.value < dealerValue.value) return 'Loss';
                    return 'Push';
                });
                resultExplanation = `Hand results: ${handResults.join(', ')}`;
            }
            
            html += `
                    <div style="margin-top: 15px; padding: 12px; background: #f0f0f0; border-radius: 6px; font-size: 0.9em; color: #555;">
                        <strong>Result:</strong> ${resultExplanation}
                    </div>
            `;
            
            // Check if hand was doubled
            const wasDoubled = finalHands.length === 1 && finalHands[0].bet > 1;
            const baseBet = wasDoubled ? result.bet / 2 : result.bet;
            
            // Debug: Log bet information
            console.log('Bet calculation:', {
                resultBet: result.bet,
                resultWinnings: result.winnings,
                finalHands: finalHands.map(h => ({ bet: h.bet, cards: h.cards.length })),
                wasDoubled
            });
            
            html += `
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 0.9em;">
                        ${wasDoubled ? `<div style="margin-bottom: 5px;"><strong>Doubled Down</strong> - Bet: $${baseBet.toFixed(2)} → $${result.bet.toFixed(2)}</div>` : ''}
                        <div>Total Bet: $${result.bet.toFixed(2)} | Net: ${result.winnings > 0 ? '+' : ''}$${result.winnings.toFixed(2)}</div>
                    </div>
                </div>
            `;
            
            resultsDiv.innerHTML = html;
            
        } catch (error) {
            console.error('Error simulating hand:', error);
            resultsDiv.innerHTML = `<div class="stat" style="color: #f44336;">Error: ${error.message}</div>`;
        } finally {
            // Re-enable button
            button.disabled = false;
            button.textContent = '🎲 SIM (JS)';
            // Mark this button as active
            button.classList.add('active');
            // Remove active from WASM button
            const wasmButton = document.getElementById('simHandButtonWasm');
            if (wasmButton) {
                wasmButton.classList.remove('active');
            }
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
        }
    }, 50);
}

async function simulateHandWasm() {
    // Clear console for fresh logs
    console.clear();
    
    if (!strategy) {
        alert('Please initialize the strategy first by going to the Simulation tab.');
        return;
    }

    const resultsDiv = document.getElementById('simHandResults');
    const progressContainer = document.getElementById('simHandProgressContainer');
    const button = document.getElementById('simHandButtonWasm');
    
    if (!resultsDiv || !button) return;
    
    // Disable button and show loading
    button.disabled = true;
    button.textContent = '🎲 Simulating...';
    if (progressContainer) {
        progressContainer.style.display = 'block';
        progressContainer.innerHTML = '<div class="loading">Dealing cards...</div>';
    }
    resultsDiv.innerHTML = '<div class="loading">Simulating hand...</div>';
    
    try {
        // Try to use the new play_single_game function, fallback to worker if not available
        let wasmResult;
        
        try {
            // Import WASM module - use the wasm path where the new build is
            let wasmModule;
            try {
                wasmModule = await import('./wasm/blackjack-core/pkg/blackjack_core.js');
            } catch (e) {
                // If that fails, try with cache busting
                console.warn('Wasm path failed, trying with cache bust:', e);
                wasmModule = await import('./wasm/blackjack-core/pkg/blackjack_core.js?t=' + Date.now());
            }
            
            // Initialize the module
            await wasmModule.default();
            
            // Debug: Log available functions
            const availableFunctions = Object.keys(wasmModule).filter(k => typeof wasmModule[k] === 'function');
            const allKeys = Object.keys(wasmModule);
            console.log('Available WASM functions:', availableFunctions);
            console.log('All WASM module keys:', allKeys);
            console.log('Function names:', availableFunctions.map(f => f.toString()));
            console.log('play_single_game check:', typeof wasmModule.play_single_game, wasmModule.play_single_game);
            console.log('Direct check:', 'play_single_game' in wasmModule);
            console.log('Module object:', wasmModule);
            
            // Check if play_single_game is available (try multiple ways)
            const playSingleGame = wasmModule.play_single_game || wasmModule['play_single_game'];
            if (typeof playSingleGame === 'function') {
                // Build simulation input (same as WASM simulation)
                const dealerSelect = document.getElementById('dealerStandsOn');
                const dealerSetting = dealerSelect ? dealerSelect.value : '17';
                const penetration = parseInt(document.getElementById('penetration')?.value || '75', 10);
                const blackjackPays = document.getElementById('blackjackPays')?.value || '3:2';
                const doubleAfterSplit = document.getElementById('doubleAfterSplit')?.checked ?? true;
                const allowResplit = document.getElementById('allowResplit')?.checked ?? true;
                const resplitAces = document.getElementById('resplitAces')?.checked ?? false;
                const numDecks = parseInt(document.getElementById('numDecks')?.value || '6', 10);
                const betSize = parseFloat(document.getElementById('betSize')?.value || '100');
                
                // Collect strategy and counting
                const currentStrategy = typeof window.getCurrentStrategy === 'function'
                    ? window.getCurrentStrategy()
                    : window.strategy;
                const exportData = currentStrategy?.exportData() || {};
                const strategyPayload = {
                    countBased: !!exportData.countBased,
                    hard: exportData.hard || {},
                    soft: exportData.soft || {},
                    pairs: exportData.pairs || {},
                    hardByCount: exportData.hardByCount || {},
                    softByCount: exportData.softByCount || {},
                    pairsByCount: exportData.pairsByCount || {}
                };
                
                const countingEnabled = document.getElementById('enableCounting')?.checked;
                const countingSystem = document.getElementById('countingSystem')?.value || 'Hi-Lo';
                let customValues = null;
                if (countingSystem === 'Custom' && typeof window.getCustomCountingValues === 'function') {
                    customValues = window.getCustomCountingValues();
                }
                const countingPayload = countingEnabled ? {
                    enabled: true,
                    system: countingSystem,
                    customValues
                } : { enabled: false };
                
                // Generate seed
                let seed;
                if (window?.crypto?.getRandomValues) {
                    const array = new Uint32Array(2);
                    window.crypto.getRandomValues(array);
                    seed = (array[0] * 0x1_0000_0000 + array[1]) >>> 0;
                } else {
                    seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                }
                
                    const input = {
                        num_decks: numDecks,
                        iterations: 1, // Not used for single game
                        bet_size: betSize,
                        seed: seed,
                        strategy: strategyPayload,
                        rules: {
                            dealer_hits_soft_17: dealerSetting === '17',
                            dealer_stands_on: dealerSetting,
                            double_after_split: doubleAfterSplit,
                            allow_resplit: allowResplit,
                            resplit_aces: resplitAces,
                            blackjack_pays: blackjackPays,
                            penetration_threshold: penetration
                        },
                        counting: countingPayload,
                        progress_interval: 1
                    };
                    
                    // Debug: Log the exact input being sent to WASM
                    console.log('WASM input strategy.hard["14"]:', JSON.stringify(input.strategy.hard['14'] || input.strategy.hard[14], null, 2));
                    console.log('WASM input strategy.hard["14"]["7"]:', input.strategy.hard['14'] ? (input.strategy.hard['14']['7'] || input.strategy.hard['14'][7]) : 
                                 (input.strategy.hard[14] ? (input.strategy.hard[14]['7'] || input.strategy.hard[14][7]) : 'not found'));
                    console.log('WASM input strategy.hard["8"]:', JSON.stringify(input.strategy.hard['8'] || input.strategy.hard[8], null, 2));
                    console.log('WASM input strategy.hard["8"]["A"]:', input.strategy.hard['8'] ? (input.strategy.hard['8']['A'] || input.strategy.hard['8']['11']) : 
                                 (input.strategy.hard[8] ? (input.strategy.hard[8]['A'] || input.strategy.hard[8]['11']) : 'not found'));
                    console.log('WASM input strategy.hard["15"]:', JSON.stringify(input.strategy.hard['15'] || input.strategy.hard[15], null, 2));
                    console.log('WASM input strategy.hard["15"]["8"]:', input.strategy.hard['15'] ? (input.strategy.hard['15']['8'] || input.strategy.hard['15'][8]) : 
                                 (input.strategy.hard[15] ? (input.strategy.hard[15]['8'] || input.strategy.hard[15][8]) : 'not found'));
                
                // Debug: Log strategy being sent to WASM
                const hard14 = strategyPayload.hard['14'] || strategyPayload.hard[14];
                const hard14vsA = hard14 ? (hard14['A'] || hard14['11']) : 'not found';
                const hard15 = strategyPayload.hard['15'] || strategyPayload.hard[15];
                const hard15vs10 = hard15 ? (hard15['10'] || hard15['10']) : 'not found';
                const hard14Row = hard14 ? Object.keys(hard14) : [];
                console.log('Strategy payload for WASM:', JSON.stringify({
                    countBased: strategyPayload.countBased,
                    hard9: strategyPayload.hard['9'] || strategyPayload.hard[9],
                    hard9vs2: strategyPayload.hard['9'] ? strategyPayload.hard['9']['2'] : 
                             (strategyPayload.hard[9] ? strategyPayload.hard[9]['2'] : 'not found'),
                    hard12: strategyPayload.hard['12'] || strategyPayload.hard[12],
                    hard12vs2: strategyPayload.hard['12'] ? strategyPayload.hard['12']['2'] : 
                              (strategyPayload.hard[12] ? strategyPayload.hard[12]['2'] : 'not found'),
                    hard14: hard14,
                    hard14vsA: hard14vsA,
                    hard15: hard15,
                    hard15vs10: hard15vs10,
                    hard15FullRow: hard15,
                    hardKeys: Object.keys(strategyPayload.hard).slice(0, 15),
                    hasHardByCount: Object.keys(strategyPayload.hardByCount || {}).length > 0,
                    hardByCountKeys: Object.keys(strategyPayload.hardByCount || {}).slice(0, 5)
                }, null, 2));
                
                // Call WASM function directly
                wasmResult = playSingleGame(input);
            } else {
                console.error('play_single_game not found. Available functions:', availableFunctions);
                console.error('Module contents:', wasmModule);
                throw new Error('play_single_game not available. The WASM module may need to be rebuilt, or your browser is caching an old version. Try a hard refresh (Ctrl+Shift+R).');
            }
        } catch (directError) {
            // Fallback: Use simulation with 1 iteration via worker
            console.warn('Direct WASM call failed, using worker fallback:', directError);
            wasmResult = await playSingleGameViaWorker();
        }
        
        // Calculate initial player total correctly
        const initialPlayerCards = wasmResult.player_cards;
        const initialTotal = game ? game.calculateHandValue(initialPlayerCards.map(c => ({
            rank: c.rank,
            value: c.value,
            suit: '♠'
        }))) : { 
            value: initialPlayerCards.reduce((sum, c) => {
                const val = c.value > 10 ? 10 : c.value;
                return sum + val;
            }, 0), 
            isSoft: false 
        };
        
        // Convert WASM result to JS format
        const result = {
            result: wasmResult.outcome,
            winnings: wasmResult.winnings,
            bet: wasmResult.bet,
            playerCards: wasmResult.player_cards.map(c => ({
                rank: c.rank,
                value: c.value,
                suit: '♠' // WASM doesn't track suit, use default
            })),
            dealerCards: wasmResult.dealer_cards.map(c => ({
                rank: c.rank,
                value: c.value,
                suit: '♠'
            })),
            hands: wasmResult.hands.map(h => ({
                cards: h.cards.map(c => ({
                    rank: c.rank,
                    value: c.value,
                    suit: '♠'
                })),
                bet: h.bet,
                result: h.result
            })),
            initialDecision: {
                playerTotal: initialTotal,
                dealerCard: { value: wasmResult.dealer_up_card.value, isSoft: false },
                action: wasmResult.initial_action ? (
                    wasmResult.initial_action === 'Hit' || wasmResult.initial_action === 'hit' ? 'H' : 
                    wasmResult.initial_action === 'Stand' || wasmResult.initial_action === 'stand' ? 'S' :
                    wasmResult.initial_action === 'Double' || wasmResult.initial_action === 'double' ? 'D' : 'P'
                ) : null // No strategy decision made (e.g., dealer blackjack)
            }
        };
        
        // Debug: Log strategy lookup for WASM
        const dealerCardStr = result.initialDecision.dealerCard.value === 11 ? 'A' : result.initialDecision.dealerCard.value.toString();
        const playerTotalStr = initialTotal.isSoft ? `S${initialTotal.value}` : initialTotal.value.toString();
        const jsStrategyAction = strategy ? strategy.getAction(
            playerTotalStr,
            dealerCardStr,
            true,
            false,
            0
        ) : 'N/A';
        console.log('WASM simulation result:', JSON.stringify({
            initialCards: result.playerCards.map(c => c.rank),
            initialTotal: initialTotal.value,
            isSoft: initialTotal.isSoft,
            playerTotalStr: playerTotalStr,
            dealerCardValue: result.initialDecision.dealerCard.value,
            dealerCardStr: dealerCardStr,
            wasmAction: result.initialDecision.action || 'N/A (no strategy decision)',
            jsStrategyAction: jsStrategyAction,
            actionMatch: result.initialDecision.action ? (result.initialDecision.action === jsStrategyAction) : false,
            wasmBet: wasmResult.bet,
            wasmWinnings: wasmResult.winnings,
            hands: wasmResult.hands.map(h => ({ bet: h.bet, cardsCount: h.cards.length, cards: h.cards.map(c => c.rank) }))
        }, null, 2));
        
        // Use the same display logic as simulateHand
        displaySimHandResult(result, game);
        
    } catch (error) {
        console.error('Error simulating hand with WASM:', error);
        console.error('Error details:', error);
        resultsDiv.innerHTML = `
            <div class="stat" style="color: #f44336; padding: 20px;">
                <div style="font-weight: bold; margin-bottom: 10px;">Error: ${error.message}</div>
                <div style="font-size: 0.9em; color: #666;">
                    <p>If you just rebuilt the WASM module, try:</p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Hard refresh the page (Ctrl+Shift+R or Ctrl+F5)</li>
                        <li>Clear your browser cache</li>
                        <li>Check the browser console for more details</li>
                    </ul>
                </div>
            </div>
        `;
    } finally {
        // Re-enable button
        button.disabled = false;
        button.textContent = '🎲 SIM (WASM)';
        // Mark this button as active
        button.classList.add('active');
        // Remove active from JS button
        const jsButton = document.getElementById('simHandButton');
        if (jsButton) {
            jsButton.classList.remove('active');
        }
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }
}

// Helper function to play single game via worker (fallback)
async function playSingleGameViaWorker() {
    return new Promise((resolve, reject) => {
        // Use the same input building logic as wasm-sim.js
        const dealerSelect = document.getElementById('dealerStandsOn');
        const dealerSetting = dealerSelect ? dealerSelect.value : '17';
        const penetration = parseInt(document.getElementById('penetration')?.value || '75', 10);
        const blackjackPays = document.getElementById('blackjackPays')?.value || '3:2';
        const doubleAfterSplit = document.getElementById('doubleAfterSplit')?.checked ?? true;
        const allowResplit = document.getElementById('allowResplit')?.checked ?? true;
        const resplitAces = document.getElementById('resplitAces')?.checked ?? false;
        const numDecks = parseInt(document.getElementById('numDecks')?.value || '6', 10);
        const betSize = parseFloat(document.getElementById('betSize')?.value || '100');
        
        // Get strategy and counting (reuse from wasm-sim.js functions if available)
        const currentStrategy = typeof window.getCurrentStrategy === 'function'
            ? window.getCurrentStrategy()
            : window.strategy;
        const exportData = currentStrategy?.exportData() || {};
        const strategyPayload = {
            countBased: !!exportData.countBased,
            hard: exportData.hard || {},
            soft: exportData.soft || {},
            pairs: exportData.pairs || {},
            hardByCount: exportData.hardByCount || {},
            softByCount: exportData.softByCount || {},
            pairsByCount: exportData.pairsByCount || {}
        };
        
        const countingEnabled = document.getElementById('enableCounting')?.checked;
        const countingSystem = document.getElementById('countingSystem')?.value || 'Hi-Lo';
        let customValues = null;
        if (countingSystem === 'Custom' && typeof window.getCustomCountingValues === 'function') {
            customValues = window.getCustomCountingValues();
        }
        const countingPayload = countingEnabled ? {
            enabled: true,
            system: countingSystem,
            customValues
        } : { enabled: false };
        
        // Generate seed
        let seed;
        if (window?.crypto?.getRandomValues) {
            const array = new Uint32Array(2);
            window.crypto.getRandomValues(array);
            seed = (array[0] * 0x1_0000_0000 + array[1]) >>> 0;
        } else {
            seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        }
        
        const input = {
            num_decks: numDecks,
            iterations: 1, // Single game
            bet_size: betSize,
            seed: seed,
            strategy: strategyPayload,
            rules: {
                dealer_hits_soft_17: dealerSetting === '17',
                dealer_stands_on: dealerSetting,
                double_after_split: doubleAfterSplit,
                allow_resplit: allowResplit,
                resplit_aces: resplitAces,
                blackjack_pays: blackjackPays,
                penetration_threshold: penetration
            },
            counting: countingPayload,
            progress_interval: 1
        };
        
        // For now, we can't easily extract a single game from simulation results
        // So we'll show an error message asking to rebuild WASM
        reject(new Error('WASM module needs to be rebuilt. Please run: cd wasm/blackjack-core && wasm-pack build --target web'));
    });
}

function displaySimHandResult(result, game) {
    const resultsDiv = document.getElementById('simHandResults');
    if (!resultsDiv) return;
    
    // Format cards for display (same as simulateHand)
    const formatCard = (card) => {
        const suitSymbols = {
            '♠': '♠',
            '♥': '♥',
            '♦': '♦',
            '♣': '♣'
        };
        const suit = suitSymbols[card.suit] || '♠';
        const rank = card.rank;
        const color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
        return `<span class="card-display" style="color: ${color}; font-weight: bold;">${rank}${suit}</span>`;
    };
    
    const formatCards = (cards) => {
        return cards.map(formatCard).join(' ');
    };
    
    // Calculate dealer value
    const dealerValue = game ? game.calculateHandValue(result.dealerCards) : { value: result.dealerCards.reduce((sum, c) => sum + (c.value > 10 ? 10 : c.value), 0), isSoft: false };
    
    // Get final player hands
    const finalHands = result.hands && result.hands.length > 0 ? result.hands : 
                      [{ cards: result.playerCards, bet: 1, result: null }];
    
    // Determine result color and message
    let resultColor = '#666';
    let resultMessage = '';
    let resultIcon = '';
    
    if (result.result === 'blackjack') {
        resultColor = '#4caf50';
        resultMessage = 'Blackjack!';
        resultIcon = '🎉';
    } else if (result.result === 'win') {
        resultColor = '#4caf50';
        resultMessage = 'Win';
        resultIcon = '✅';
    } else if (result.result === 'lose') {
        resultColor = '#f44336';
        resultMessage = 'Loss';
        resultIcon = '❌';
    } else {
        resultColor = '#ff9800';
        resultMessage = 'Push';
        resultIcon = '➖';
    }
    
    // Build HTML (same as simulateHand)
    let html = `
        <div style="padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 2.5em; margin-bottom: 10px;">${resultIcon}</div>
                <div style="font-size: 1.8em; font-weight: bold; color: ${resultColor}; margin-bottom: 5px;">
                    ${resultMessage}
                </div>
                <div style="font-size: 1.2em; color: #666;">
                    ${result.winnings > 0 ? '+' : ''}$${result.winnings.toFixed(2)}
                </div>
            </div>
    `;
    
    // Show initial cards
    html += `
            <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
                <div style="font-weight: bold; margin-bottom: 10px; font-size: 1.1em;">Initial Cards</div>
                <div style="margin-bottom: 8px;">
                    <span style="color: #666; font-size: 0.9em;">You: </span>
                    <span style="font-size: 1.2em; line-height: 1.8;">${formatCards(result.playerCards)}</span>
                </div>
                <div>
                    <span style="color: #666; font-size: 0.9em;">Dealer: </span>
                    <span style="font-size: 1.2em; line-height: 1.8;">${formatCards([result.dealerCards[0]])} <span style="color: #999;">[?]</span></span>
                </div>
            </div>
    `;
    
    // Show final hands (same logic as simulateHand)
    if (finalHands.length === 1) {
        const hand = finalHands[0];
        const handValue = game ? game.calculateHandValue(hand.cards) : { value: hand.cards.reduce((sum, c) => sum + (c.value > 10 ? 10 : c.value), 0), isSoft: false };
        const isBust = handValue.value > 21;
        
        html += `
            <div style="margin-bottom: 30px;">
                <div style="font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">Your Final Hand</div>
                <div style="font-size: 1.3em; margin-bottom: 10px; line-height: 1.8;">
                    ${formatCards(hand.cards)}
                </div>
                <div style="color: ${isBust ? '#f44336' : '#666'}; font-size: 0.95em;">
                    Value: <strong>${isBust ? 'BUST' : handValue.value}</strong>${handValue.isSoft && !isBust ? ' (Soft)' : ''}
                </div>
            </div>
        `;
    } else {
        // Multiple hands (split)
        html += `
            <div style="margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                <div style="font-weight: bold; margin-bottom: 10px;">Final Hands (${finalHands.length})</div>
        `;
        finalHands.forEach((hand, index) => {
            const handValue = game ? game.calculateHandValue(hand.cards) : { value: hand.cards.reduce((sum, c) => sum + (c.value > 10 ? 10 : c.value), 0), isSoft: false };
            const isBust = handValue.value > 21;
            html += `
                <div style="margin-bottom: 15px; padding-bottom: 15px; ${index < finalHands.length - 1 ? 'border-bottom: 1px solid #ddd;' : ''}">
                    <div style="font-weight: bold; margin-bottom: 5px; font-size: 1.05em;">Hand ${index + 1}</div>
                    <div style="font-size: 1.2em; margin-bottom: 5px; line-height: 1.8;">
                        ${formatCards(hand.cards)}
                    </div>
                    <div style="color: ${isBust ? '#f44336' : '#666'}; font-size: 0.9em;">
                        Value: <strong>${isBust ? 'BUST' : handValue.value}</strong>${handValue.isSoft && !isBust ? ' (Soft)' : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    // Show dealer final hand
    html += `
            <div style="margin-bottom: 30px;">
                <div style="font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">Dealer Final Hand</div>
                <div style="font-size: 1.3em; margin-bottom: 10px; line-height: 1.8;">
                    ${formatCards(result.dealerCards)}
                </div>
                <div style="color: #666; font-size: 0.95em;">
                    Value: <strong>${dealerValue.value}</strong>${dealerValue.isSoft ? ' (Soft)' : ''}${dealerValue.value > 21 ? ' (BUST)' : ''}
                </div>
            </div>
    `;
    
    // Show initial decision if available
    if (result.initialDecision) {
        const actionNames = { 'H': 'Hit', 'S': 'Stand', 'D': 'Double', 'P': 'Split' };
        const action = result.initialDecision.action;
        const playerTotal = result.initialDecision.playerTotal;
        const dealerCard = result.initialDecision.dealerCard;
        const playerTotalStr = playerTotal.isSoft ? `S${playerTotal.value}` : playerTotal.value.toString();
        const dealerCardStr = dealerCard.value === 11 ? 'A' : dealerCard.value.toString();
        
        if (!action) {
            // Shouldn't happen anymore (blackjack is now counted as Stand)
            // But handle gracefully just in case
            html += `
                <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                    <div style="font-weight: bold; margin-bottom: 5px; color: #856404;">Initial Decision</div>
                    <div style="color: #856404;">
                        ${playerTotalStr} vs ${dealerCardStr}: <strong>No strategy decision</strong> (game ended early)
                    </div>
                </div>
            `;
        } else {
            html += `
                <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                    <div style="font-weight: bold; margin-bottom: 5px;">Initial Decision</div>
                    <div style="color: #666;">
                        ${actionNames[action] || action} (${playerTotalStr} vs ${dealerCardStr})
                    </div>
                </div>
            `;
        }
    }
    
    // Check if hand was doubled
    const wasDoubled = finalHands.length === 1 && finalHands[0].bet > 1;
    // For WASM, the bet in result.bet is already the total bet (bet_size * total_bet_units)
    // The hand.bet is the multiplier (1.0 or 2.0)
    const baseBet = wasDoubled ? result.bet / finalHands[0].bet : result.bet;
    
    // Debug: Log bet information
    console.log('Bet display info:', JSON.stringify({
        resultBet: result.bet,
        resultWinnings: result.winnings,
        finalHands: finalHands.map(h => ({ bet: h.bet, cardsCount: h.cards.length })),
        wasDoubled,
        baseBet,
        expectedWinnings: wasDoubled ? (result.winnings < 0 ? -result.bet : result.winnings) : result.winnings
    }, null, 2));
    
    html += `
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 0.9em;">
                ${wasDoubled ? `<div style="margin-bottom: 5px;"><strong>Doubled Down</strong> - Bet: $${baseBet.toFixed(2)} → $${result.bet.toFixed(2)}</div>` : ''}
                <div>Total Bet: $${result.bet.toFixed(2)} | Net: ${result.winnings > 0 ? '+' : ''}$${result.winnings.toFixed(2)}</div>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML = html;
}

function setupCustomCountingInputs() {
    const container = document.getElementById('customCountingInputs');
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    ranks.forEach(rank => {
        const label = document.createElement('label');
        label.style.fontSize = '0.9em';
        label.style.fontWeight = '600';
        label.textContent = rank + ':';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `customCount_${rank}`;
        input.value = '0';
        input.step = '1';
        input.style.width = '100%';
        input.style.padding = '5px';
        input.style.border = '1px solid #ddd';
        input.style.borderRadius = '3px';
        input.addEventListener('change', () => {
            if (document.getElementById('countingSystem').value === 'Custom') {
                initializeGame();
            }
        });
        
        const div = document.createElement('div');
        div.appendChild(label);
        div.appendChild(input);
        container.appendChild(div);
    });
}

function getCustomCountingValues() {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const values = {};
    
    ranks.forEach(rank => {
        const input = document.getElementById(`customCount_${rank}`);
        if (input) {
            values[rank] = parseInt(input.value) || 0;
        }
    });
    
    return values;
}

function resetCustomCountingToHiLo() {
    const hiLoValues = {
        '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
        '7': 0, '8': 0, '9': 0,
        '10': -1, 'J': -1, 'Q': -1, 'K': -1,
        'A': -1
    };
    
    Object.keys(hiLoValues).forEach(rank => {
        const input = document.getElementById(`customCount_${rank}`);
        if (input) {
            input.value = hiLoValues[rank];
        }
    });
    
    if (document.getElementById('countingSystem').value === 'Custom') {
        initializeGame();
    }
}

function updateCountingSystemUI(system) {
    const customPanel = document.getElementById('customCountingPanel');
    const description = document.getElementById('systemDescription');
    const counter = new CardCounter(system);
    
    if (system === 'Custom') {
        customPanel.style.display = 'block';
        description.textContent = 'Set your own point values for each card rank.';
    } else {
        customPanel.style.display = 'none';
        const info = counter.getSystemInfo(system);
        description.textContent = info.description;
        description.style.display = 'block';
    }
    
    // Update system info panel if it's open
    if (document.getElementById('systemInfoPanel').style.display === 'block') {
        updateSystemInfoDisplay();
    }
}

function updateSystemInfoDisplay() {
    const system = document.getElementById('countingSystem').value;
    const content = document.getElementById('systemInfoContent');
    const counter = new CardCounter(system);
    
    if (system === 'Custom') {
        const customValues = getCustomCountingValues();
        let html = '<table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0;">Card</th><th style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0;">Value</th></tr></thead><tbody>';
        
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        ranks.forEach(rank => {
            const value = customValues[rank] || 0;
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${rank}</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${value > 0 ? '#4caf50' : value < 0 ? '#f44336' : '#666'}">${value >= 0 ? '+' : ''}${value}</td></tr>`;
        });
        
        html += '</tbody></table>';
        content.innerHTML = html;
    } else {
        const info = counter.getSystemInfo(system);
        let html = `<p style="margin-bottom: 10px;"><strong>Description:</strong> ${info.description}</p>`;
        html += `<p style="margin-bottom: 10px;"><strong>Type:</strong> ${info.balanced ? 'Balanced (requires true count conversion)' : 'Unbalanced (no conversion needed)'}</p>`;
        html += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;"><thead><tr><th style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0;">Card</th><th style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0;">Value</th></tr></thead><tbody>';
        
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        ranks.forEach(rank => {
            const value = info.values[rank];
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${rank}</td><td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${value > 0 ? '#4caf50' : value < 0 ? '#f44336' : '#666'}">${value >= 0 ? '+' : ''}${value}</td></tr>`;
        });
        
        html += '</tbody></table>';
        content.innerHTML = html;
    }
}

function renderStrategyStatistics(cellStats) {
    const type = document.getElementById('statsType').value;
    const metric = document.getElementById('statsMetric').value;
    const countFilter = document.getElementById('statsCountFilter').value;
    const container = document.getElementById('strategyStatsTable');
    
    if (!cellStats || Object.keys(cellStats).length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No cell statistics available. Run a simulation first.</p>';
        return;
    }
    
    const dealers = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
    
    // Filter cells by type and count
    const filteredCells = {};
    Object.keys(cellStats).forEach(key => {
        const cell = cellStats[key];
        const matchesType = (type === 'hard' && !cell.playerTotal.startsWith('S') && !cell.playerTotal.includes(',')) ||
                           (type === 'soft' && cell.playerTotal.startsWith('S')) ||
                           (type === 'pairs' && cell.playerTotal.includes(','));
        const matchesCount = countFilter === 'all' || 
                           (countFilter === '-4' && cell.count <= -4) ||
                           (countFilter === '4' && cell.count >= 4) ||
                           parseInt(countFilter) === cell.count;
        
        if (matchesType && matchesCount) {
            filteredCells[key] = cell;
        }
    });
    
    // Build grid data structure with cells organized by row/column
    const gridData = {};
    const rowTotals = {}; // Aggregate data per row
    const colTotals = {}; // Aggregate data per column
    let grandTotal = { hands: 0, wins: 0, losses: 0, pushes: 0, totalWinnings: 0, totalBet: 0 };
    
    // Initialize row and column totals
    const getRowKey = (playerTotal) => {
        if (type === 'hard') return playerTotal;
        if (type === 'soft') return playerTotal;
        if (type === 'pairs') {
            if (!playerTotal.includes(',')) return null;
            
            // Handle pair format - could be "8,8" or "A,A" or "10,10" or "10,J"
            const parts = playerTotal.split(',');
            if (parts.length !== 2) return null;
            
            // Try to get numeric value
            let pairValue = null;
            if (parts[0] === 'A' || parts[1] === 'A') {
                pairValue = 11;
            } else if (parts[0] === parts[1]) {
                // Same rank (e.g., "8,8")
                const num = parseInt(parts[0]);
                if (!isNaN(num)) {
                    pairValue = num;
                } else if (['J', 'Q', 'K'].includes(parts[0])) {
                    pairValue = 10;
                }
            } else {
                // Different ranks but same value (e.g., "10,J" or "10,10")
                const val1 = parts[0] === 'A' ? 11 : (['J', 'Q', 'K'].includes(parts[0]) ? 10 : parseInt(parts[0]));
                const val2 = parts[1] === 'A' ? 11 : (['J', 'Q', 'K'].includes(parts[1]) ? 10 : parseInt(parts[1]));
                if (val1 === val2 && !isNaN(val1)) {
                    pairValue = val1 === 11 ? 11 : val1;
                }
            }
            
            return pairValue ? `pair_${pairValue}` : null;
        }
        return null;
    };
    
    // Organize cells into grid
    Object.values(filteredCells).forEach(cell => {
        const rowKey = getRowKey(cell.playerTotal);
        if (!rowKey) return;
        
        if (!gridData[rowKey]) {
            gridData[rowKey] = {};
        }
        
        // Store cell data (may have multiple for same cell if different actions)
        if (!gridData[rowKey][cell.dealerCard]) {
            gridData[rowKey][cell.dealerCard] = [];
        }
        gridData[rowKey][cell.dealerCard].push(cell);
        
        // Aggregate row totals
        if (!rowTotals[rowKey]) {
            rowTotals[rowKey] = { hands: 0, wins: 0, losses: 0, pushes: 0, totalWinnings: 0, totalBet: 0 };
        }
        rowTotals[rowKey].hands += cell.hands;
        rowTotals[rowKey].wins += cell.wins;
        rowTotals[rowKey].losses += cell.losses;
        rowTotals[rowKey].pushes += cell.pushes;
        rowTotals[rowKey].totalWinnings += cell.totalWinnings;
        rowTotals[rowKey].totalBet += cell.totalBet;
        
        // Aggregate column totals
        if (!colTotals[cell.dealerCard]) {
            colTotals[cell.dealerCard] = { hands: 0, wins: 0, losses: 0, pushes: 0, totalWinnings: 0, totalBet: 0 };
        }
        colTotals[cell.dealerCard].hands += cell.hands;
        colTotals[cell.dealerCard].wins += cell.wins;
        colTotals[cell.dealerCard].losses += cell.losses;
        colTotals[cell.dealerCard].pushes += cell.pushes;
        colTotals[cell.dealerCard].totalWinnings += cell.totalWinnings;
        colTotals[cell.dealerCard].totalBet += cell.totalBet;
        
        // Grand total
        grandTotal.hands += cell.hands;
        grandTotal.wins += cell.wins;
        grandTotal.losses += cell.losses;
        grandTotal.pushes += cell.pushes;
        grandTotal.totalWinnings += cell.totalWinnings;
        grandTotal.totalBet += cell.totalBet;
    });
    
    // Build table
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.85em;"><thead><tr><th style="padding: 8px; border: 1px solid #ddd; background: #667eea; color: white; position: sticky; top: 0; z-index: 10;">Player</th>';
    dealers.forEach(d => {
        html += `<th style="padding: 8px; border: 1px solid #ddd; background: #667eea; color: white; position: sticky; top: 0; z-index: 10;">${d}</th>`;
    });
    html += '<th style="padding: 8px; border: 1px solid #ddd; background: #667eea; color: white; position: sticky; top: 0; z-index: 10;">Total</th>';
    html += '</tr></thead><tbody>';
    
    const getRowLabel = (rowKey) => {
        if (type === 'hard') return rowKey;
        if (type === 'soft') return `A,${parseInt(rowKey.substring(1)) - 11}`;
        if (type === 'pairs') {
            const pairValue = parseInt(rowKey.split('_')[1]);
            if (pairValue === 11) return 'A,A';
            if (pairValue === 10) return '10,10';
            return `${pairValue},${pairValue}`;
        }
        return rowKey;
    };
    
    const getCellForDisplay = (cells) => {
        if (!cells || cells.length === 0) return null;
        // If multiple cells (different actions), prefer the one closest to count 0
        // For pairs, prefer split action if available
        if (type === 'pairs') {
            const splitCell = cells.find(c => c.action === 'P');
            if (splitCell) return splitCell;
        }
        return cells.reduce((best, current) => {
            if (!best) return current;
            return Math.abs(current.count) < Math.abs(best.count) ? current : best;
        });
    };
    
    if (type === 'hard') {
        for (let total = 21; total >= 5; total--) {
            const rowKey = total.toString();
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0; font-weight: bold;">${total}</td>`;
            dealers.forEach(dealer => {
                const cells = gridData[rowKey] && gridData[rowKey][dealer] ? gridData[rowKey][dealer] : null;
                const cell = getCellForDisplay(cells);
                
                if (cell) {
                    const value = getCellMetric(cell, metric);
                    const color = getMetricColor(value, metric);
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; background: ${color}; cursor: pointer;" title="Hands: ${cell.hands}, Wins: ${cell.wins}, Losses: ${cell.losses}, Net: $${cell.totalWinnings.toFixed(2)}, Mean: $${(cell.totalWinnings/cell.hands).toFixed(2)}">${value}</td>`;
                } else {
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
                }
            });
            // Row total
            const rowTotal = rowTotals[rowKey];
            if (rowTotal) {
                const totalValue = getAggregateMetric(rowTotal, metric);
                const totalColor = getMetricColor(totalValue, metric);
                html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: ${totalColor}; font-weight: bold;">${totalValue}</td>`;
            } else {
                html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
            }
            html += '</tr>';
        }
    } else if (type === 'soft') {
        for (let total = 21; total >= 13; total--) {
            const rowKey = `S${total}`;
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0; font-weight: bold;">A,${total - 11}</td>`;
            dealers.forEach(dealer => {
                const cells = gridData[rowKey] && gridData[rowKey][dealer] ? gridData[rowKey][dealer] : null;
                const cell = getCellForDisplay(cells);
                
                if (cell) {
                    const value = getCellMetric(cell, metric);
                    const color = getMetricColor(value, metric);
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; background: ${color}; cursor: pointer;" title="Hands: ${cell.hands}, Wins: ${cell.wins}, Losses: ${cell.losses}, Net: $${cell.totalWinnings.toFixed(2)}, Mean: $${(cell.totalWinnings/cell.hands).toFixed(2)}">${value}</td>`;
                } else {
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
                }
            });
            // Row total
            const rowTotal = rowTotals[rowKey];
            if (rowTotal) {
                const totalValue = getAggregateMetric(rowTotal, metric);
                const totalColor = getMetricColor(totalValue, metric);
                html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: ${totalColor}; font-weight: bold;">${totalValue}</td>`;
            } else {
                html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
            }
            html += '</tr>';
        }
    } else if (type === 'pairs') {
        const pairs = [
            { label: 'A,A', value: 11 },
            { label: '10,10', value: 10 },
            { label: '9,9', value: 9 },
            { label: '8,8', value: 8 },
            { label: '7,7', value: 7 },
            { label: '6,6', value: 6 },
            { label: '5,5', value: 5 },
            { label: '4,4', value: 4 },
            { label: '3,3', value: 3 },
            { label: '2,2', value: 2 }
        ];
        pairs.forEach(pair => {
            const rowKey = `pair_${pair.value}`;
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0; font-weight: bold;">${pair.label}</td>`;
            dealers.forEach(dealer => {
                const cells = gridData[rowKey] && gridData[rowKey][dealer] ? gridData[rowKey][dealer] : null;
                const cell = getCellForDisplay(cells);
                
                if (cell) {
                    const value = getCellMetric(cell, metric);
                    const color = getMetricColor(value, metric);
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; background: ${color}; cursor: pointer;" title="Hands: ${cell.hands}, Wins: ${cell.wins}, Losses: ${cell.losses}, Net: $${cell.totalWinnings.toFixed(2)}, Mean: $${(cell.totalWinnings/cell.hands).toFixed(2)}">${value}</td>`;
                } else {
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
                }
            });
            // Row total
            const rowTotal = rowTotals[rowKey];
            if (rowTotal) {
                const totalValue = getAggregateMetric(rowTotal, metric);
                const totalColor = getMetricColor(totalValue, metric);
                html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: ${totalColor}; font-weight: bold;">${totalValue}</td>`;
            } else {
                html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
            }
            html += '</tr>';
        });
    }
    
    // Column totals row
    html += '<tr><td style="padding: 8px; border: 2px solid #667eea; background: #e3f2fd; font-weight: bold;">Total</td>';
    dealers.forEach(dealer => {
        const colTotal = colTotals[dealer];
        if (colTotal) {
            const totalValue = getAggregateMetric(colTotal, metric);
            const totalColor = getMetricColor(totalValue, metric);
            html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: ${totalColor}; font-weight: bold;">${totalValue}</td>`;
        } else {
            html += `<td style="padding: 8px; border: 2px solid #667eea; text-align: center; background: #f9f9f9; color: #999;">-</td>`;
        }
    });
    // Grand total
    const grandTotalValue = getAggregateMetric(grandTotal, metric);
    const grandTotalColor = getMetricColor(grandTotalValue, metric);
    html += `<td style="padding: 8px; border: 3px solid #667eea; text-align: center; background: ${grandTotalColor}; font-weight: bold; font-size: 1.05em;">${grandTotalValue}</td>`;
    html += '</tr>';
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function getAggregateMetric(aggregateData, metric) {
    // Calculate metric from aggregate data (hands, wins, losses, totalWinnings, etc.)
    switch(metric) {
        case 'hands':
            return aggregateData.hands.toLocaleString();
        case 'net':
            return `$${aggregateData.totalWinnings.toFixed(2)}`;
        case 'mean':
            return aggregateData.hands > 0 ? `$${(aggregateData.totalWinnings / aggregateData.hands).toFixed(2)}` : '$0.00';
        case 'winRate':
            return aggregateData.hands > 0 ? `${((aggregateData.wins / aggregateData.hands) * 100).toFixed(1)}%` : '0%';
        case 'totalWinnings':
            return `$${aggregateData.totalWinnings.toFixed(2)}`;
        case 'ev':
            return aggregateData.hands > 0 ? `$${(aggregateData.totalWinnings / aggregateData.hands).toFixed(2)}` : '$0.00';
        default:
            return '-';
    }
}

function getCellMetric(cell, metric) {
    switch(metric) {
        case 'hands':
            return cell.hands.toLocaleString();
        case 'net':
            return `$${cell.totalWinnings.toFixed(2)}`;
        case 'mean':
            return cell.hands > 0 ? `$${(cell.totalWinnings / cell.hands).toFixed(2)}` : '$0.00';
        case 'winRate':
            return cell.hands > 0 ? `${((cell.wins / cell.hands) * 100).toFixed(1)}%` : '0%';
        case 'totalWinnings':
            return `$${cell.totalWinnings.toFixed(2)}`;
        case 'ev':
            return cell.hands > 0 ? `$${(cell.totalWinnings / cell.hands).toFixed(2)}` : '$0.00';
        default:
            return '-';
    }
}

function getMetricColor(value, metric) {
    if (metric === 'hands' || metric === 'winRate') {
        return '#fff';
    }
    
    // Extract numeric value for color calculation
    let numValue = 0;
    if (typeof value === 'string') {
        const match = value.match(/[\d.-]+/);
        if (match) {
            numValue = parseFloat(match[0]);
        }
    }
    
    if (numValue > 0) {
        // Green scale for positive
        const intensity = Math.min(Math.abs(numValue) / 50, 1);
        return `rgba(76, 175, 80, ${0.3 + intensity * 0.4})`;
    } else if (numValue < 0) {
        // Red scale for negative
        const intensity = Math.min(Math.abs(numValue) / 50, 1);
        return `rgba(244, 67, 54, ${0.3 + intensity * 0.4})`;
    } else {
        return '#fff';
    }
}

// Strategy optimization function
async function optimizeStrategy(countLevel, numSimulations, betSize, progressOverride = null) {
    const dealers = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
    const mode = document.getElementById('strategyMode').value;
    const isCountBased = mode === 'countBased' && countLevel !== null;
    
    // Get current count filter to determine if we're optimizing for a specific count
    const countFilter = document.getElementById('statsCountFilter').value;
    let targetCount = null;
    if (countFilter !== 'all' && !isNaN(parseInt(countFilter))) {
        targetCount = parseInt(countFilter);
    } else if (countLevel !== null) {
        targetCount = parseInt(countLevel);
    }
    
    const isNestedCall = typeof progressOverride === 'function';
    if (!isNestedCall) {
        optimizationCancelRequested = false;
        optimizationInProgress = true;
    }
    
    const resultsDiv = document.getElementById('optimizationResults');
    if (!resultsDiv) {
        console.warn('Optimization results container not found.');
        return;
    }
    
    if (!isNestedCall) {
        const progressHtml = `
            <div style="margin-bottom: 15px;">
                <h3 style="color: #667eea; margin-bottom: 10px;">Strategy Optimization</h3>
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                    <div id="optSpinner" style="width: 20px; height: 20px; border: 3px solid #f0f0f0; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                    <div id="optStatus" style="font-weight: 600; color: #333;">Starting optimization...</div>
                </div>
                <div style="width: 100%; background-color: #f0f0f0; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                    <div id="optProgressBar" style="width: 0%; height: 24px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; text-align: center; line-height: 24px; color: white; font-size: 0.9em; font-weight: 600;">
                        <span id="optProgressPercent">0%</span>
                    </div>
                </div>
                <div id="optDetails" style="font-size: 0.9em; color: #666;">Preparing...</div>
                <div id="optEta" style="font-size: 0.85em; color: #444; margin-top: 6px;">ETA Remaining: Calculating...</div>
                <div id="optChangeLog" style="margin-top: 12px; max-height: 200px; overflow-y: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; font-size: 0.85em; color: #333;">
                    <div class="opt-log-placeholder" style="color: #888;">No strategy changes yet.</div>
                </div>
                <div style="margin-top: 12px; text-align: right;">
                    <button id="optimizationCancelButton" style="padding: 8px 14px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Cancel Optimization
                    </button>
                </div>
            </div>
        `;
        resultsDiv.innerHTML = progressHtml;
        
        const logContainer = resultsDiv.querySelector('#optChangeLog');
        if (logContainer) {
            delete logContainer.dataset.hasEntries;
            logContainer.dataset.entryCount = '0';
            logContainer.scrollTop = 0;
        }
        const etaElement = resultsDiv.querySelector('#optEta');
        if (etaElement) {
            etaElement.textContent = 'ETA Remaining: Calculating...';
        }
        
        const cancelButton = resultsDiv.querySelector('#optimizationCancelButton');
        if (cancelButton) {
            cancelButton.disabled = false;
            cancelButton.textContent = 'Cancel Optimization';
            cancelButton.onclick = cancelOptimization;
        }
    }
    
    const totalCells = (17 * 10) + (9 * 10) + (10 * 10);
    const startTime = Date.now();
    let currentCell = 0;
    let changesMade = 0;
    let wasCancelled = false;
    
    const ACTION_LABELS = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split' };
    const formatActionLabel = (code) => ACTION_LABELS[code] || code;
    const formatEv = (value) => {
        if (!isFinite(value)) return 'n/a';
        const rounded = value.toFixed(4);
        return `${value >= 0 ? '+' : ''}${rounded}`;
    };
    const resolveScopeLabel = () => {
        const scopeValue = (!isNaN(targetCount) && targetCount !== null) ? targetCount :
            (countLevel !== null && !isNaN(countLevel) ? parseInt(countLevel) : null);
        if (scopeValue === null || isNaN(scopeValue)) {
            return 'Base';
        }
        return `TC ${scopeValue >= 0 ? '+' : ''}${scopeValue}`;
    };
    const appendChangeLog = (message) => {
        const logContainer = document.getElementById('optChangeLog');
        if (!logContainer) return;
        
        if (!logContainer.dataset.hasEntries) {
            logContainer.innerHTML = '';
            logContainer.dataset.hasEntries = 'true';
            logContainer.dataset.entryCount = '0';
        }
        
        const nextIndex = parseInt(logContainer.dataset.entryCount || '0', 10) + 1;
        logContainer.dataset.entryCount = nextIndex.toString();
        
        const entry = document.createElement('div');
        entry.className = 'opt-log-entry';
        entry.textContent = `${nextIndex}. ${message}`;
        logContainer.appendChild(entry);
        
        const maxEntries = 200;
        while (logContainer.childElementCount > maxEntries) {
            logContainer.removeChild(logContainer.firstElementChild);
        }
        logContainer.scrollTop = logContainer.scrollHeight;
    };
    const updateEta = (overrideText = null) => {
        if (progressOverride) return;
        const etaElement = document.getElementById('optEta');
        if (!etaElement) return;
        if (overrideText !== null) {
            etaElement.textContent = `ETA Remaining: ${overrideText}`;
            return;
        }
        if (currentCell <= 0) {
            etaElement.textContent = 'ETA Remaining: Calculating...';
            return;
        }
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const remainingCells = Math.max(0, totalCells - currentCell);
        const timePerCell = elapsedSeconds / currentCell;
        const etaSeconds = remainingCells * timePerCell;
        etaElement.textContent = `ETA Remaining: ${formatDuration(etaSeconds)}`;
    };
    
    const shouldCancel = () => optimizationCancelRequested;
    
    const updateProgress = (cellInfo, overallProgress) => {
        if (progressOverride) {
            progressOverride(cellInfo, overallProgress);
            return;
        }
        
        const optStatus = document.getElementById('optStatus');
        const optProgressBar = document.getElementById('optProgressBar');
        const optProgressPercent = document.getElementById('optProgressPercent');
        const optDetails = document.getElementById('optDetails');
        
        if (optStatus) optStatus.textContent = cellInfo;
        if (optProgressBar && optProgressPercent) {
            const progressValue = Math.min(overallProgress, 100);
            optProgressBar.style.width = `${progressValue}%`;
            optProgressPercent.textContent = `${Math.round(progressValue)}%`;
        }
        if (optDetails) {
            optDetails.textContent = `Optimized ${currentCell} of ${totalCells} cells | ${changesMade} changes made`;
        }
        updateEta();
    };
    
    // Optimize hard totals (21 down to 5) - ROW BY ROW for efficiency!
    updateProgress('Optimizing hard totals...', 0);
    for (let total = 21; total >= 5; total--) {
        if (shouldCancel()) {
            wasCancelled = true;
            break;
        }

        const playerTotal = total.toString();
        updateProgress(`Testing row: ${total} vs all dealers...`, ((21 - total) * 10 / totalCells) * 100);
        
        // Test entire row at once - much more efficient!
        const rowResults = await simulator.testRowActions(playerTotal, dealers, targetCount, numSimulations, betSize, (current, totalSims) => {
            updateProgress(`Testing row: ${total} vs all dealers... (${Math.round((current/totalSims)*100)}%)`, ((21 - total) * 10 / totalCells) * 100);
        }, shouldCancel);

        if (rowResults.cancelled) {
            wasCancelled = true;
            break;
        }
        
        // For each dealer, find best action
        for (let dealer of dealers) {
            if (shouldCancel()) {
                wasCancelled = true;
                break;
            }

            const summary = rowResults.summary && rowResults.summary[dealer] ? rowResults.summary[dealer] : null;
            if (!summary) {
                wasCancelled = true;
                break;
            }

            currentCell++;
            
            let bestAction = 'S';
            let bestEV = -Infinity;
            
            for (let action in summary) {
                if (summary[action] > bestEV) {
                    bestEV = summary[action];
                    bestAction = action;
                }
            }
            
            // Update strategy if best action is different
            const currentAction = isCountBased && targetCount !== null ? 
                (strategy.hardByCount[targetCount.toString()] && strategy.hardByCount[targetCount.toString()][total] && 
                 strategy.hardByCount[targetCount.toString()][total][dealer] ? 
                 strategy.hardByCount[targetCount.toString()][total][dealer] : 
                 (strategy.hard[total] && strategy.hard[total][dealer] ? strategy.hard[total][dealer] : 'S')) :
                (strategy.hard[total] && strategy.hard[total][dealer] ? strategy.hard[total][dealer] : 'S');
            
            if (bestAction !== currentAction) {
                const scopeLabel = resolveScopeLabel();
                const message = `Hard ${playerTotal} vs ${dealer}: ${formatActionLabel(currentAction)} → ${formatActionLabel(bestAction)} (${scopeLabel}, EV ${formatEv(bestEV)})`;
                appendChangeLog(message);
                if (isCountBased && targetCount !== null) {
                    strategy.setCountAction(targetCount, playerTotal, dealer, bestAction);
                } else {
                    strategy.setAction(playerTotal, dealer, bestAction);
                }
                changesMade++;
            }
        }

        if (wasCancelled) {
            break;
        }
    }
    
    // Optimize soft totals (21 down to 13) - ROW BY ROW
    if (!wasCancelled) {
        updateProgress('Optimizing soft totals...', (17 * 10 / totalCells) * 100);
    }
    for (let total = 21; total >= 13; total--) {
        if (wasCancelled || shouldCancel()) {
            wasCancelled = true;
            break;
        }

        const playerTotal = `S${total}`;
        updateProgress(`Testing row: A,${total - 11} vs all dealers...`, ((17 * 10 + (21 - total) * 10) / totalCells) * 100);
        
        // Test entire row at once
        const rowResults = await simulator.testRowActions(playerTotal, dealers, targetCount, numSimulations, betSize, (current, totalSims) => {
            updateProgress(`Testing row: A,${total - 11} vs all dealers... (${Math.round((current/totalSims)*100)}%)`, ((17 * 10 + (21 - total) * 10) / totalCells) * 100);
        }, shouldCancel);

        if (rowResults.cancelled) {
            wasCancelled = true;
            break;
        }
        
        // For each dealer, find best action
        for (let dealer of dealers) {
            if (shouldCancel()) {
                wasCancelled = true;
                break;
            }

            const summary = rowResults.summary && rowResults.summary[dealer] ? rowResults.summary[dealer] : null;
            if (!summary) {
                wasCancelled = true;
                break;
            }

            currentCell++;
            
            let bestAction = 'S';
            let bestEV = -Infinity;
            
            for (let action in summary) {
                if (summary[action] > bestEV) {
                    bestEV = summary[action];
                    bestAction = action;
                }
            }
            
            const currentAction = isCountBased && targetCount !== null ?
                (strategy.softByCount[targetCount.toString()] && strategy.softByCount[targetCount.toString()][total] &&
                 strategy.softByCount[targetCount.toString()][total][dealer] ?
                 strategy.softByCount[targetCount.toString()][total][dealer] :
                 (strategy.soft[total] && strategy.soft[total][dealer] ? strategy.soft[total][dealer] : 'S')) :
                (strategy.soft[total] && strategy.soft[total][dealer] ? strategy.soft[total][dealer] : 'S');
            
            if (bestAction !== currentAction) {
                const scopeLabel = resolveScopeLabel();
                const softValue = total;
                const message = `Soft ${softValue} vs ${dealer}: ${formatActionLabel(currentAction)} → ${formatActionLabel(bestAction)} (${scopeLabel}, EV ${formatEv(bestEV)})`;
                appendChangeLog(message);
                if (isCountBased && targetCount !== null) {
                    strategy.setCountAction(targetCount, playerTotal, dealer, bestAction);
                } else {
                    strategy.setAction(playerTotal, dealer, bestAction);
                }
                changesMade++;
            }
        }

        if (wasCancelled) {
            break;
        }
    }
    
    // Optimize pairs - ROW BY ROW
    if (!wasCancelled) {
        updateProgress('Optimizing pairs...', ((17 * 10 + 9 * 10) / totalCells) * 100);
    }
    const pairs = [
        { label: 'A,A', value: 11, total: 'A,A' },
        { label: '10,10', value: 10, total: '10,10' },
        { label: '9,9', value: 9, total: '9,9' },
        { label: '8,8', value: 8, total: '8,8' },
        { label: '7,7', value: 7, total: '7,7' },
        { label: '6,6', value: 6, total: '6,6' },
        { label: '5,5', value: 5, total: '5,5' },
        { label: '4,4', value: 4, total: '4,4' },
        { label: '3,3', value: 3, total: '3,3' },
        { label: '2,2', value: 2, total: '2,2' }
    ];
    
    for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        const pair = pairs[pairIdx];
        if (wasCancelled || shouldCancel()) {
            wasCancelled = true;
            break;
        }

        updateProgress(`Testing row: ${pair.label} vs all dealers...`, ((17 * 10 + 9 * 10 + pairIdx * 10) / totalCells) * 100);
        
        // Test entire row at once
        const rowResults = await simulator.testRowActions(pair.total, dealers, targetCount, numSimulations, betSize, (current, totalSims) => {
            updateProgress(`Testing row: ${pair.label} vs all dealers... (${Math.round((current/totalSims)*100)}%)`, ((17 * 10 + 9 * 10 + pairIdx * 10) / totalCells) * 100);
        }, shouldCancel);

        if (rowResults.cancelled) {
            wasCancelled = true;
            break;
        }
        
        // For each dealer, find best action
        for (let dealer of dealers) {
            if (shouldCancel()) {
                wasCancelled = true;
                break;
            }

            const summary = rowResults.summary && rowResults.summary[dealer] ? rowResults.summary[dealer] : null;
            if (!summary) {
                wasCancelled = true;
                break;
            }

            currentCell++;
            
            let bestAction = 'H';
            let bestEV = -Infinity;
            
            for (let action in summary) {
                if (summary[action] > bestEV) {
                    bestEV = summary[action];
                    bestAction = action;
                }
            }
            
            const currentAction = isCountBased && targetCount !== null ?
                (strategy.pairsByCount[targetCount.toString()] && strategy.pairsByCount[targetCount.toString()][pair.value] &&
                 strategy.pairsByCount[targetCount.toString()][pair.value][dealer] ?
                 strategy.pairsByCount[targetCount.toString()][pair.value][dealer] :
                 (strategy.pairs[pair.value] && strategy.pairs[pair.value][dealer] ? strategy.pairs[pair.value][dealer] : 'H')) :
                (strategy.pairs[pair.value] && strategy.pairs[pair.value][dealer] ? strategy.pairs[pair.value][dealer] : 'H');
            
            if (bestAction !== currentAction) {
                const scopeLabel = resolveScopeLabel();
                const message = `Pair ${pair.label} vs ${dealer}: ${formatActionLabel(currentAction)} → ${formatActionLabel(bestAction)} (${scopeLabel}, EV ${formatEv(bestEV)})`;
                appendChangeLog(message);
                if (isCountBased && targetCount !== null) {
                    strategy.setCountAction(targetCount, pair.total, dealer, bestAction);
                } else {
                    strategy.setAction(pair.total, dealer, bestAction);
                }
                changesMade++;
            }
        }

        if (wasCancelled) {
            break;
        }
    }
    
    if (!isNestedCall) {
        const cancelButton = document.getElementById('optimizationCancelButton');
        if (cancelButton) {
            cancelButton.disabled = true;
            cancelButton.style.cursor = 'default';
            cancelButton.textContent = wasCancelled ? 'Cancelled' : 'Done';
        }
    }
    
    const completionProgress = totalCells > 0 ? (currentCell / totalCells) * 100 : 0;
    if (wasCancelled) {
        updateProgress('Optimization cancelled.', completionProgress);
        updateEta('Cancelled');
    } else {
        updateProgress('Optimization complete!', 100);
        updateEta('Complete');
        const activeTabElement = document.querySelector('.tab-btn.active');
        if (activeTabElement && activeTabElement.dataset.tab) {
            renderStrategyTable(activeTabElement.dataset.tab);
        }
    }
    
    if (!isNestedCall) {
        const optSpinner = document.getElementById('optSpinner');
        if (optSpinner) optSpinner.style.display = 'none';
        
        if (resultsDiv) {
            if (wasCancelled) {
                const cancelledHtml = `
                    <div style="background: #fff3e0; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ff9800;">
                        <strong style="color: #ef6c00;">Optimization Cancelled</strong>
                        <div style="margin-top: 10px;">
                            <div>Optimized ${currentCell} of ${totalCells} cells before cancellation.</div>
                            <div>Strategy changes applied: ${changesMade}</div>
                        </div>
                    </div>
                `;
                resultsDiv.insertAdjacentHTML('beforeend', cancelledHtml);
            } else {
                const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'hard';
                const summaryHtml = `
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #4caf50;">
                        <strong style="color: #2e7d32;">Optimization Complete!</strong>
                        <div style="margin-top: 10px;">
                            <div>Total cells optimized: ${totalCells}</div>
                            <div>Strategy changes made: ${changesMade}</div>
                            <div style="margin-top: 10px;">
                                <button onclick="renderStrategyTable('${currentTab}')" style="padding: 8px 15px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                                    View Updated Strategy
                                </button>
                                <button onclick="runSimulation()" style="padding: 8px 15px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                    Test Optimized Strategy
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                resultsDiv.insertAdjacentHTML('beforeend', summaryHtml);
            }
        }
        
        optimizationInProgress = false;
        optimizationCancelRequested = false;
    }
    
    return { totalCells, changesMade, cancelled: wasCancelled };
}

// Optimize strategy for all count levels
async function optimizeAllCountLevels(numSimulations, betSize) {
    const mode = document.getElementById('strategyMode').value;
    
    if (mode !== 'countBased') {
        alert('Count-based strategy mode must be enabled to optimize all count levels. Please enable "Count-Based Strategy" mode first.');
        return;
    }
    
    optimizationCancelRequested = false;
    optimizationInProgress = true;

    // Define all count levels to optimize
    const countLevels = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    const totalCountLevels = countLevels.length;
    
    // Create optimization results container
    const resultsDiv = document.getElementById('optimizationResults') || document.createElement('div');
    resultsDiv.id = 'optimizationResults';
    resultsDiv.style.cssText = 'padding: 20px; background: #f8f9fa; border-radius: 8px; margin-top: 20px;';
    
    const progressHtml = `
        <div style="margin-bottom: 15px;">
            <h3 style="color: #667eea; margin-bottom: 10px;">Strategy Optimization - All Count Levels</h3>
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div id="optSpinner" style="width: 20px; height: 20px; border: 3px solid #f0f0f0; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                <div id="optStatus" style="font-weight: 600; color: #333;">Starting optimization...</div>
            </div>
            <div style="width: 100%; background-color: #f0f0f0; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                <div id="optProgressBar" style="width: 0%; height: 24px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; text-align: center; line-height: 24px; color: white; font-size: 0.9em; font-weight: 600;">
                    <span id="optProgressPercent">0%</span>
                </div>
            </div>
            <div id="optDetails" style="font-size: 0.9em; color: #666;">Preparing...</div>
            <div id="optCountLevel" style="font-size: 0.9em; color: #667eea; margin-top: 5px; font-weight: 600;"></div>
            <div id="optEta" style="font-size: 0.85em; color: #444; margin-top: 6px;">ETA Remaining: Calculating...</div>
            <div id="optChangeLog" style="margin-top: 12px; max-height: 200px; overflow-y: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; font-size: 0.85em; color: #333;">
                <div class="opt-log-placeholder" style="color: #888;">No strategy changes yet.</div>
            </div>
            <div style="margin-top: 12px; text-align: right;">
                <button id="optimizationCancelButton" style="padding: 8px 14px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Cancel Optimization
                </button>
            </div>
        </div>
    `;
    resultsDiv.innerHTML = progressHtml;
    
    const logContainer = resultsDiv.querySelector('#optChangeLog');
    if (logContainer) {
        delete logContainer.dataset.hasEntries;
        logContainer.dataset.entryCount = '0';
        logContainer.scrollTop = 0;
    }
    const etaElement = resultsDiv.querySelector('#optEta');
    if (etaElement) {
        etaElement.textContent = 'ETA Remaining: Calculating...';
    }
    const cancelButtonInit = resultsDiv.querySelector('#optimizationCancelButton');
    if (cancelButtonInit) {
        cancelButtonInit.disabled = false;
        cancelButtonInit.textContent = 'Cancel Optimization';
        cancelButtonInit.onclick = cancelOptimization;
    }
    
    // Insert results container if it doesn't exist
    const statsPanel = document.querySelector('.stats-panel');
    if (!document.getElementById('optimizationResults')) {
        statsPanel.appendChild(resultsDiv);
    }
    
    const updateEta = (progressPercent, overrideText = null) => {
        const etaElement = document.getElementById('optEta');
        if (!etaElement) return;
        if (overrideText !== null) {
        etaElement.textContent = `ETA Remaining: ${overrideText}`;
            return;
        }
        if (!progressPercent || progressPercent <= 0) {
            etaElement.textContent = 'ETA Remaining: Calculating...';
            return;
        }
        const fraction = Math.min(Math.max(progressPercent / 100, 0.0001), 0.9999);
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const etaSeconds = elapsedSeconds * ((1 / fraction) - 1);
        etaElement.textContent = `ETA Remaining: ${formatDuration(etaSeconds)}`;
    };
    
    const updateProgress = (countLevel, countLevelIndex, cellInfo, overallProgress) => {
        const optStatus = document.getElementById('optStatus');
        const optProgressBar = document.getElementById('optProgressBar');
        const optProgressPercent = document.getElementById('optProgressPercent');
        const optDetails = document.getElementById('optDetails');
        const optCountLevel = document.getElementById('optCountLevel');
        
        if (optStatus) optStatus.textContent = cellInfo;
        if (optProgressBar && optProgressPercent) {
            optProgressBar.style.width = overallProgress + '%';
            optProgressPercent.textContent = Math.round(overallProgress) + '%';
        }
        if (optDetails) {
            optDetails.textContent = `Optimizing count level ${countLevel >= 0 ? '+' : ''}${countLevel} (${countLevelIndex + 1} of ${totalCountLevels})`;
        }
        if (optCountLevel) {
            optCountLevel.textContent = `Current Count Level: ${countLevel >= 0 ? '+' : ''}${countLevel}`;
        }
        updateEta(overallProgress);
    };
    
    const startTime = Date.now();
    
    let totalChanges = 0;
    const changesByLevel = {};
    let wasCancelled = false;
    let partialLevel = null;
    
    // Optimize each count level
    for (let i = 0; i < countLevels.length; i++) {
        const countLevel = countLevels[i];
        const overallProgress = (i / totalCountLevels) * 100;
        
        updateProgress(countLevel, i, `Starting optimization for count level ${countLevel >= 0 ? '+' : ''}${countLevel}...`, overallProgress);
        
        if (optimizationCancelRequested) {
            wasCancelled = true;
            break;
        }

        const result = await optimizeStrategy(countLevel, numSimulations, betSize, (cellInfo, progress) => {
            // Update with count level info
            const countLevelProgress = (i / totalCountLevels) * 100 + (progress / totalCountLevels);
            updateProgress(countLevel, i, `Count ${countLevel >= 0 ? '+' : ''}${countLevel}: ${cellInfo}`, countLevelProgress);
        });
        
        changesByLevel[countLevel] = result.changesMade;
        totalChanges += result.changesMade;

        if (result.cancelled || optimizationCancelRequested) {
            wasCancelled = true;
            if (result.cancelled) {
                partialLevel = countLevel;
            }
            break;
        }
    }
    
    const cancelButton = document.getElementById('optimizationCancelButton');
    if (cancelButton) {
        cancelButton.disabled = true;
        cancelButton.style.cursor = 'default';
        cancelButton.textContent = wasCancelled ? 'Cancelled' : 'Done';
    }
    
    const optSpinner = document.getElementById('optSpinner');
    if (optSpinner) optSpinner.style.display = 'none';
    
    const processedLevels = Object.keys(changesByLevel).length;
    const completedLevels = partialLevel !== null ? Math.max(0, processedLevels - 1) : processedLevels;
    const completionProgress = totalCountLevels > 0 ? (processedLevels / totalCountLevels) * 100 : 0;
    
    if (wasCancelled) {
        const progressValue = Math.min(completionProgress, 100);
        const optStatus = document.getElementById('optStatus');
        const optProgressBar = document.getElementById('optProgressBar');
        const optProgressPercent = document.getElementById('optProgressPercent');
        const optDetails = document.getElementById('optDetails');
        const optCountLevel = document.getElementById('optCountLevel');
        
        if (optStatus) optStatus.textContent = 'Optimization cancelled.';
        if (optProgressBar && optProgressPercent) {
            optProgressBar.style.width = `${progressValue}%`;
            optProgressPercent.textContent = `${Math.round(progressValue)}%`;
        }
        if (optDetails) {
            optDetails.textContent = `Completed ${completedLevels} of ${totalCountLevels} count levels`;
        }
        if (optCountLevel) {
            optCountLevel.textContent = 'Optimization cancelled';
        }
        updateEta(progressValue, 'Cancelled');
    } else {
        const finalLevel = countLevels[countLevels.length - 1];
        updateProgress(finalLevel, totalCountLevels - 1, 'Optimization complete!', 100);
        updateEta(100, 'Complete');
        const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (currentTab) {
            renderStrategyTable(currentTab);
        }
    }
    
    if (resultsDiv) {
        if (wasCancelled) {
            const cancelledHtml = `
                <div style="background: #fff3e0; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ff9800;">
                    <strong style="color: #ef6c00;">Optimization Cancelled</strong>
                    <div style="margin-top: 10px;">
                        <div><strong>Count levels completed:</strong> ${completedLevels} of ${totalCountLevels}</div>
                            ${partialLevel !== null ? `<div><strong>Partially processed level:</strong> ${partialLevel >= 0 ? '+' : ''}${partialLevel}</div>` : ''}
                        <div><strong>Strategy changes applied:</strong> ${totalChanges}</div>
                    </div>
                </div>
            `;
            resultsDiv.insertAdjacentHTML('beforeend', cancelledHtml);
        } else {
            const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'hard';
            let summaryHtml = `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #4caf50;">
                    <strong style="color: #2e7d32;">Optimization Complete for All Count Levels!</strong>
                    <div style="margin-top: 10px;">
                        <div><strong>Total count levels optimized:</strong> ${totalCountLevels}</div>
                        <div><strong>Total strategy changes made:</strong> ${totalChanges}</div>
                        <div style="margin-top: 10px; font-size: 0.9em;">
                            <strong>Changes by count level:</strong>
                            <ul style="margin: 5px 0; padding-left: 20px;">
            `;
            
            countLevels.forEach(count => {
                const changes = changesByLevel[count] || 0;
                summaryHtml += `<li>${count >= 0 ? '+' : ''}${count}: ${changes} changes</li>`;
            });
            
            summaryHtml += `
                            </ul>
                        </div>
                        <div style="margin-top: 10px;">
                            <button onclick="renderStrategyTable('${currentTab}')" style="padding: 8px 15px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                                View Updated Strategy
                            </button>
                            <button onclick="runSimulation()" style="padding: 8px 15px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                Test Optimized Strategy
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            resultsDiv.insertAdjacentHTML('beforeend', summaryHtml);
        }
    }
    
    optimizationInProgress = false;
    optimizationCancelRequested = false;
    
    return { totalCountLevels, totalChanges, changesByLevel, cancelled: wasCancelled };
}

// Helper function to run a WASM spot check for optimization
async function runWasmSpotCheckForOptimization(playerCards, dealerCard, action, numSimulations, betSize, countLevel) {
    return new Promise((resolve, reject) => {
        // Access WASM worker from wasm-sim.js module
        const wasmSimWorker = window.wasmSimWorker;
        if (!wasmSimWorker) {
            reject(new Error('WASM worker not available'));
            return;
        }

        const strategy = window.getCurrentStrategy ? window.getCurrentStrategy() : window.strategy;
        if (!strategy) {
            reject(new Error('Strategy not available'));
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
            reject(new Error('Invalid card input'));
            return;
        }

        const playerCardRanks = parsedPlayerCards.map(c => c.rank);
        const dealerCardRank = parsedDealerCard.rank;

        const readNumberValue = (nodeId, fallback) => {
            const node = document.getElementById(nodeId);
            if (!node) return fallback;
            const parsed = parseInt(node.value, 10);
            return Number.isNaN(parsed) ? fallback : parsed;
        };

        const generateSeed = () => {
            if (window?.crypto?.getRandomValues) {
                const array = new Uint32Array(2);
                window.crypto.getRandomValues(array);
                return (array[0] * 0x1_0000_0000 + array[1]) >>> 0;
            }
            return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        };

        const collectCountingPayload = () => {
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
        };

        const spotCheckInput = {
            num_decks: readNumberValue('numDecks', 6),
            iterations: numSimulations,
            bet_size: betSize,
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

        const jobId = `opt-spotcheck-${action}-${Date.now()}-${Math.random()}`;
        let resolved = false;

        const handler = (event) => {
            const { jobId: msgJobId, type, result, message } = event.data;
            if (msgJobId !== jobId) return;

            if (type === 'done') {
                if (!resolved) {
                    resolved = true;
                    wasmSimWorker.removeEventListener('message', handler);
                    resolve(result);
                }
            } else if (type === 'error') {
                if (!resolved) {
                    resolved = true;
                    wasmSimWorker.removeEventListener('message', handler);
                    reject(new Error(message || 'WASM spot check failed'));
                }
            }
        };

        wasmSimWorker.addEventListener('message', handler);

        wasmSimWorker.postMessage({
            jobId,
            payload: spotCheckInput,
            isSpotCheck: true
        });
    });
}

// WASM Strategy optimization function
async function optimizeStrategyWasm(countLevel, numSimulations, betSize, progressOverride = null) {
    const dealers = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
    const mode = document.getElementById('strategyMode').value;
    const isCountBased = mode === 'countBased' && countLevel !== null;
    
    const countFilter = document.getElementById('statsCountFilter').value;
    let targetCount = null;
    if (countFilter !== 'all' && !isNaN(parseInt(countFilter))) {
        targetCount = parseInt(countFilter);
    } else if (countLevel !== null) {
        targetCount = parseInt(countLevel);
    }
    
    const isNestedCall = typeof progressOverride === 'function';
    if (!isNestedCall) {
        optimizationCancelRequested = false;
        optimizationInProgress = true;
    }
    
    const resultsDiv = document.getElementById('optimizationResults');
    if (!resultsDiv) {
        console.warn('Optimization results container not found.');
        return;
    }
    
    if (!isNestedCall) {
        const progressHtml = `
            <div style="margin-bottom: 15px;">
                <h3 style="color: #667eea; margin-bottom: 10px;">Strategy Optimization (WASM)</h3>
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                    <div id="optSpinner" style="width: 20px; height: 20px; border: 3px solid #f0f0f0; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                    <div id="optStatus" style="font-weight: 600; color: #333;">Starting optimization...</div>
                </div>
                <div style="width: 100%; background-color: #f0f0f0; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                    <div id="optProgressBar" style="width: 0%; height: 24px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; text-align: center; line-height: 24px; color: white; font-size: 0.9em; font-weight: 600;">
                        <span id="optProgressPercent">0%</span>
                    </div>
                </div>
                <div id="optDetails" style="font-size: 0.9em; color: #666;">Preparing...</div>
                <div id="optEta" style="font-size: 0.85em; color: #444; margin-top: 6px;">ETA Remaining: Calculating...</div>
                <div id="optChangeLog" style="margin-top: 12px; max-height: 200px; overflow-y: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; font-size: 0.85em; color: #333;">
                    <div class="opt-log-placeholder" style="color: #888;">No strategy changes yet.</div>
                </div>
                <div style="margin-top: 12px; text-align: right;">
                    <button id="optimizationCancelButton" style="padding: 8px 14px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Cancel Optimization
                    </button>
                </div>
            </div>
        `;
        resultsDiv.innerHTML = progressHtml;
        
        const logContainer = resultsDiv.querySelector('#optChangeLog');
        if (logContainer) {
            delete logContainer.dataset.hasEntries;
            logContainer.dataset.entryCount = '0';
            logContainer.scrollTop = 0;
        }
        const etaElement = resultsDiv.querySelector('#optEta');
        if (etaElement) {
            etaElement.textContent = 'ETA Remaining: Calculating...';
        }
        
        const cancelButton = resultsDiv.querySelector('#optimizationCancelButton');
        if (cancelButton) {
            cancelButton.disabled = false;
            cancelButton.textContent = 'Cancel Optimization';
            cancelButton.onclick = cancelOptimization;
        }
    }
    
    const totalCells = (17 * 10) + (9 * 10) + (10 * 10);
    const startTime = Date.now();
    let currentCell = 0;
    let changesMade = 0;
    let wasCancelled = false;
    
    const ACTION_LABELS = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split' };
    const formatActionLabel = (code) => ACTION_LABELS[code] || code;
    const formatEv = (value) => {
        if (!isFinite(value)) return 'n/a';
        const rounded = value.toFixed(4);
        return `${value >= 0 ? '+' : ''}${rounded}`;
    };
    const resolveScopeLabel = () => {
        const scopeValue = (!isNaN(targetCount) && targetCount !== null) ? targetCount :
            (countLevel !== null && !isNaN(countLevel) ? parseInt(countLevel) : null);
        if (scopeValue === null || isNaN(scopeValue)) {
            return 'Base';
        }
        return `TC ${scopeValue >= 0 ? '+' : ''}${scopeValue}`;
    };
    const appendChangeLog = (message) => {
        const logContainer = document.getElementById('optChangeLog');
        if (!logContainer) return;
        
        if (!logContainer.dataset.hasEntries) {
            logContainer.innerHTML = '';
            logContainer.dataset.hasEntries = 'true';
            logContainer.dataset.entryCount = '0';
        }
        
        const nextIndex = parseInt(logContainer.dataset.entryCount || '0', 10) + 1;
        logContainer.dataset.entryCount = nextIndex.toString();
        
        const entry = document.createElement('div');
        entry.className = 'opt-log-entry';
        entry.textContent = `${nextIndex}. ${message}`;
        logContainer.appendChild(entry);
        
        const maxEntries = 200;
        while (logContainer.childElementCount > maxEntries) {
            logContainer.removeChild(logContainer.firstElementChild);
        }
        logContainer.scrollTop = logContainer.scrollHeight;
    };
    const updateEta = (overrideText = null) => {
        if (progressOverride) return;
        const etaElement = document.getElementById('optEta');
        if (!etaElement) return;
        if (overrideText !== null) {
            etaElement.textContent = `ETA Remaining: ${overrideText}`;
            return;
        }
        if (currentCell <= 0) {
            etaElement.textContent = 'ETA Remaining: Calculating...';
            return;
        }
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const remainingCells = Math.max(0, totalCells - currentCell);
        const timePerCell = elapsedSeconds / currentCell;
        const etaSeconds = remainingCells * timePerCell;
        etaElement.textContent = `ETA Remaining: ${formatDuration(etaSeconds)}`;
    };
    
    const shouldCancel = () => optimizationCancelRequested;
    
    const updateProgress = (cellInfo, overallProgress) => {
        if (progressOverride) {
            progressOverride(cellInfo, overallProgress);
            return;
        }
        
        const optStatus = document.getElementById('optStatus');
        const optProgressBar = document.getElementById('optProgressBar');
        const optProgressPercent = document.getElementById('optProgressPercent');
        const optDetails = document.getElementById('optDetails');
        
        if (optStatus) optStatus.textContent = cellInfo;
        if (optProgressBar && optProgressPercent) {
            const progressValue = Math.min(overallProgress, 100);
            optProgressBar.style.width = `${progressValue}%`;
            optProgressPercent.textContent = `${Math.round(progressValue)}%`;
        }
        if (optDetails) optDetails.textContent = `Cell ${currentCell} of ${totalCells} (${changesMade} changes made)`;
        updateEta();
    };
    
    const strategy = window.getCurrentStrategy ? window.getCurrentStrategy() : window.strategy;
    if (!strategy) {
        updateProgress('Error: Strategy not available', 0);
        return;
    }
    
    // Helper to construct player cards from total (matches simulator.js logic)
    const constructPlayerCards = (playerTotal) => {
        if (playerTotal.startsWith('S')) {
            // Soft total (e.g., S18 = Ace + 7)
            const softValue = parseInt(playerTotal.substring(1));
            const secondCard = softValue - 11;
            return `A,${secondCard}`;
        } else if (playerTotal.includes(',')) {
            // Pair
            return playerTotal;
        } else {
            // Hard total - need to construct cards
            const hardValue = parseInt(playerTotal);
            if (hardValue === 21) {
                // Hard 21 requires 3+ cards (2-card 21 is blackjack/soft)
                // Use 10,10,A where A counts as 1 (hard)
                return '10,10,A';
            } else if (hardValue >= 10 && hardValue <= 20) {
                const card1 = Math.min(10, hardValue - 5);
                const card2 = hardValue - card1;
                // If card2 would be > 10, cap it at 10
                if (card2 > 10) {
                    return `${card1},10`;
                }
                return `${card1},${card2}`;
            } else {
                const cardValue = Math.floor(hardValue / 2);
                return `${cardValue},${hardValue - cardValue}`;
            }
        }
    };
    
    // Get valid actions for a player total (matches simulator.js logic)
    const getValidActions = (playerTotal) => {
        const actions = ['H', 'S'];
        if (playerTotal.startsWith('S')) {
            actions.push('D'); // Can always double soft totals
        } else if (playerTotal.includes(',')) {
            // Pairs - can double except aces
            const pairValue = playerTotal === 'A,A' ? 11 : parseInt(playerTotal.split(',')[0]);
            if (pairValue !== 11) actions.push('D');
            actions.push('P');
        } else {
            // Hard totals - can double 9-11, and can't hit on 21
            const hardValue = parseInt(playerTotal);
            if (hardValue === 21) {
                // For 21, only Stand is valid (can't hit, can't double)
                return ['S'];
            }
            if (hardValue >= 9 && hardValue <= 11) actions.push('D');
        }
        return actions;
    };
    
    updateProgress('Optimizing hard totals...', 0);
    for (let total = 21; total >= 5; total--) {
        if (shouldCancel()) {
            wasCancelled = true;
            break;
        }

        const playerTotal = total.toString();
        updateProgress(`Testing row: ${total} vs all dealers...`, ((21 - total) * 10 / totalCells) * 100);
        
        const playerCards = constructPlayerCards(playerTotal);
        const validActions = getValidActions(playerTotal);
        
        for (let dealer of dealers) {
            if (shouldCancel()) {
                wasCancelled = true;
                break;
            }
            
            currentCell++;
            const cellProgress = (currentCell / totalCells) * 100;
            updateProgress(`Testing ${playerTotal} vs ${dealer}...`, cellProgress);
            
            // Test each action using WASM spot check
            const actionResults = {};
            for (const action of validActions) {
                if (shouldCancel()) break;
                
                try {
                    const result = await runWasmSpotCheckForOptimization(playerCards, dealer, action, numSimulations, betSize, targetCount);
                    actionResults[action] = result.expectedValue || 0;
                } catch (error) {
                    console.error(`Error testing ${action} for ${playerTotal} vs ${dealer}:`, error);
                    actionResults[action] = -Infinity;
                }
            }
            
            if (shouldCancel()) break;
            
            // Find best action
            let bestAction = null;
            let bestEV = -Infinity;
            for (const [action, ev] of Object.entries(actionResults)) {
                if (ev > bestEV) {
                    bestEV = ev;
                    bestAction = action;
                }
            }
            
            if (bestAction) {
                const currentAction = isCountBased && targetCount !== null
                    ? strategy.getActionForCount(targetCount, playerTotal, dealer)
                    : strategy.getAction(playerTotal, dealer, true, false);
                
                if (currentAction !== bestAction) {
                    if (isCountBased && targetCount !== null) {
                        strategy.setCountAction(targetCount, playerTotal, dealer, bestAction);
                    } else {
                        strategy.setAction(playerTotal, dealer, bestAction);
                    }
                    changesMade++;
                    const scopeLabel = resolveScopeLabel();
                    appendChangeLog(`${scopeLabel}: ${playerTotal} vs ${dealer}: ${formatActionLabel(currentAction)} → ${formatActionLabel(bestAction)} (EV: ${formatEv(bestEV)})`);
                }
            }
        }
        
        if (wasCancelled) break;
    }
    
    // Similar logic for soft totals and pairs...
    // (Continuing with soft totals)
    updateProgress('Optimizing soft totals...', (17 * 10 / totalCells) * 100);
    for (let total = 20; total >= 12; total--) {
        if (shouldCancel()) {
            wasCancelled = true;
            break;
        }

        const playerTotal = `S${total}`;
        updateProgress(`Testing row: S${total} vs all dealers...`, ((17 * 10 + (20 - total) * 10) / totalCells) * 100);
        
        const playerCards = constructPlayerCards(playerTotal);
        const validActions = getValidActions(playerTotal);
        
        for (let dealer of dealers) {
            if (shouldCancel()) {
                wasCancelled = true;
                break;
            }
            
            currentCell++;
            const cellProgress = (currentCell / totalCells) * 100;
            updateProgress(`Testing ${playerTotal} vs ${dealer}...`, cellProgress);
            
            const actionResults = {};
            for (const action of validActions) {
                if (shouldCancel()) break;
                
                try {
                    const result = await runWasmSpotCheckForOptimization(playerCards, dealer, action, numSimulations, betSize, targetCount);
                    actionResults[action] = result.expectedValue || 0;
                } catch (error) {
                    console.error(`Error testing ${action} for ${playerTotal} vs ${dealer}:`, error);
                    actionResults[action] = -Infinity;
                }
            }
            
            if (shouldCancel()) break;
            
            let bestAction = null;
            let bestEV = -Infinity;
            for (const [action, ev] of Object.entries(actionResults)) {
                if (ev > bestEV) {
                    bestEV = ev;
                    bestAction = action;
                }
            }
            
            if (bestAction) {
                const currentAction = isCountBased && targetCount !== null
                    ? strategy.getActionForCount(targetCount, playerTotal, dealer)
                    : strategy.getAction(playerTotal, dealer, true, false);
                
                if (currentAction !== bestAction) {
                    if (isCountBased && targetCount !== null) {
                        strategy.setCountAction(targetCount, playerTotal, dealer, bestAction);
                    } else {
                        strategy.setAction(playerTotal, dealer, bestAction);
                    }
                    changesMade++;
                    const scopeLabel = resolveScopeLabel();
                    appendChangeLog(`${scopeLabel}: ${playerTotal} vs ${dealer}: ${formatActionLabel(currentAction)} → ${formatActionLabel(bestAction)} (EV: ${formatEv(bestEV)})`);
                }
            }
        }
        
        if (wasCancelled) break;
    }
    
    // Pairs
    updateProgress('Optimizing pairs...', ((17 * 10 + 9 * 10) / totalCells) * 100);
    const pairs = ['A,A', '2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8', '9,9', '10,10'];
    for (const pair of pairs) {
        if (shouldCancel()) {
            wasCancelled = true;
            break;
        }

        updateProgress(`Testing row: ${pair} vs all dealers...`, ((17 * 10 + 9 * 10 + pairs.indexOf(pair) * 10) / totalCells) * 100);
        
        const playerCards = constructPlayerCards(pair);
        const validActions = getValidActions(pair);
        
        for (let dealer of dealers) {
            if (shouldCancel()) {
                wasCancelled = true;
                break;
            }
            
            currentCell++;
            const cellProgress = (currentCell / totalCells) * 100;
            updateProgress(`Testing ${pair} vs ${dealer}...`, cellProgress);
            
            const actionResults = {};
            for (const action of validActions) {
                if (shouldCancel()) break;
                
                try {
                    const result = await runWasmSpotCheckForOptimization(playerCards, dealer, action, numSimulations, betSize, targetCount);
                    actionResults[action] = result.expectedValue || 0;
                } catch (error) {
                    console.error(`Error testing ${action} for ${pair} vs ${dealer}:`, error);
                    actionResults[action] = -Infinity;
                }
            }
            
            if (shouldCancel()) break;
            
            let bestAction = null;
            let bestEV = -Infinity;
            for (const [action, ev] of Object.entries(actionResults)) {
                if (ev > bestEV) {
                    bestEV = ev;
                    bestAction = action;
                }
            }
            
            if (bestAction) {
                const currentAction = isCountBased && targetCount !== null
                    ? strategy.getActionForCount(targetCount, pair, dealer)
                    : strategy.getAction(pair, dealer, true, false);
                
                if (currentAction !== bestAction) {
                    if (isCountBased && targetCount !== null) {
                        strategy.setCountAction(targetCount, pair, dealer, bestAction);
                    } else {
                        strategy.setAction(pair, dealer, bestAction);
                    }
                    changesMade++;
                    const scopeLabel = resolveScopeLabel();
                    appendChangeLog(`${scopeLabel}: ${pair} vs ${dealer}: ${formatActionLabel(currentAction)} → ${formatActionLabel(bestAction)} (EV: ${formatEv(bestEV)})`);
                }
            }
        }
        
        if (wasCancelled) break;
    }
    
    if (!isNestedCall) {
        if (wasCancelled) {
            updateProgress('Optimization cancelled.', 100);
            const cancelledHtml = `
                <div style="background: #fff3e0; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ff9800;">
                    <strong style="color: #ef6c00;">Optimization Cancelled</strong>
                    <div style="margin-top: 10px;">
                        <div><strong>Strategy changes applied:</strong> ${changesMade}</div>
                    </div>
                </div>
            `;
            if (resultsDiv) resultsDiv.insertAdjacentHTML('beforeend', cancelledHtml);
        } else {
            updateProgress('Optimization complete!', 100);
            const summaryHtml = `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #4caf50;">
                    <strong style="color: #2e7d32;">Optimization Complete!</strong>
                    <div style="margin-top: 10px;">
                        <div><strong>Strategy changes applied:</strong> ${changesMade}</div>
                        <div style="margin-top: 10px;">
                            <button onclick="window.changeOptimizationSubview?.('simulation'); window.runSimulation?.();" style="padding: 8px 14px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Test Optimized Strategy
                            </button>
                        </div>
                    </div>
                </div>
            `;
            if (resultsDiv) resultsDiv.insertAdjacentHTML('beforeend', summaryHtml);
        }
    }
    
    optimizationInProgress = false;
    optimizationCancelRequested = false;
    
    return { changesMade, cancelled: wasCancelled };
}

// WASM optimization for all count levels
async function optimizeAllCountLevelsWasm(numSimulations, betSize) {
    const mode = document.getElementById('strategyMode').value;
    
    if (mode !== 'countBased') {
        alert('Count-based strategy mode must be enabled to optimize all count levels. Please enable "Count-Based Strategy" mode first.');
        return;
    }
    
    const countLevels = [-4, -3, -2, -1, 1, 2, 3, 4];
    const totalCountLevels = countLevels.length;
    let completedLevels = 0;
    let totalChanges = 0;
    const changesByLevel = {};
    let wasCancelled = false;
    let partialLevel = null;
    
    optimizationCancelRequested = false;
    optimizationInProgress = true;
    
    const resultsDiv = document.getElementById('optimizationResults') || document.createElement('div');
    resultsDiv.id = 'optimizationResults';
    
    if (!document.getElementById('optimizationResults')) {
        document.querySelector('.optimization-panel').appendChild(resultsDiv);
    }
    
    resultsDiv.innerHTML = `
        <div style="margin-bottom: 15px;">
            <h3 style="color: #667eea; margin-bottom: 10px;">Strategy Optimization - All Count Levels (WASM)</h3>
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div id="optSpinner" style="width: 20px; height: 20px; border: 3px solid #f0f0f0; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 10px;"></div>
                <div id="optStatus" style="font-weight: 600; color: #333;">Starting optimization...</div>
            </div>
            <div style="width: 100%; background-color: #f0f0f0; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                <div id="optProgressBar" style="width: 0%; height: 24px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; text-align: center; line-height: 24px; color: white; font-size: 0.9em; font-weight: 600;">
                    <span id="optProgressPercent">0%</span>
                </div>
            </div>
            <div id="optDetails" style="font-size: 0.9em; color: #666;">Preparing...</div>
            <div id="optEta" style="font-size: 0.85em; color: #444; margin-top: 6px;">ETA Remaining: Calculating...</div>
            <div id="optChangeLog" style="margin-top: 12px; max-height: 200px; overflow-y: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; font-size: 0.85em; color: #333;">
                <div class="opt-log-placeholder" style="color: #888;">No strategy changes yet.</div>
            </div>
            <div style="margin-top: 12px; text-align: right;">
                <button id="optimizationCancelButton" style="padding: 8px 14px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Cancel Optimization
                </button>
            </div>
        </div>
    `;
    
    const cancelButtonInit = resultsDiv.querySelector('#optimizationCancelButton');
    if (cancelButtonInit) {
        cancelButtonInit.disabled = false;
        cancelButtonInit.textContent = 'Cancel Optimization';
        cancelButtonInit.onclick = cancelOptimization;
    }
    
    const updateProgress = (countLevel, levelIndex, message, overallProgress) => {
        const optStatus = document.getElementById('optStatus');
        const optProgressBar = document.getElementById('optProgressBar');
        const optProgressPercent = document.getElementById('optProgressPercent');
        const optDetails = document.getElementById('optDetails');
        const optCountLevel = document.getElementById('optCountLevel');
        
        if (optStatus) optStatus.textContent = message;
        if (optProgressBar && optProgressPercent) {
            const progressValue = Math.min(overallProgress, 100);
            optProgressBar.style.width = `${progressValue}%`;
            optProgressPercent.textContent = `${Math.round(progressValue)}%`;
        }
        if (optDetails) {
            optDetails.textContent = `Level ${levelIndex + 1} of ${totalCountLevels}: Count ${countLevel >= 0 ? '+' : ''}${countLevel} (${completedLevels} completed, ${totalChanges} total changes)`;
        }
    };
    
    for (let i = 0; i < countLevels.length; i++) {
        const countLevel = countLevels[i];
        updateProgress(countLevel, i, `Starting optimization for count level ${countLevel >= 0 ? '+' : ''}${countLevel}...`, (i / totalCountLevels) * 100);
        
        if (optimizationCancelRequested) {
            wasCancelled = true;
            partialLevel = countLevel;
            break;
        }
        
        const result = await optimizeStrategyWasm(countLevel, numSimulations, betSize, (cellInfo, progress) => {
            const overallProgress = ((i / totalCountLevels) + (progress / 100 / totalCountLevels)) * 100;
            updateProgress(countLevel, i, cellInfo, overallProgress);
        });
        
        if (result.cancelled || optimizationCancelRequested) {
            wasCancelled = true;
            partialLevel = countLevel;
            break;
        }
        
        completedLevels++;
        const levelChanges = result.changesMade || 0;
        totalChanges += levelChanges;
        changesByLevel[countLevel] = levelChanges;
    }
    
    const cancelButton = document.getElementById('optimizationCancelButton');
    if (cancelButton) {
        cancelButton.disabled = true;
        cancelButton.textContent = wasCancelled ? 'Cancelled' : 'Complete';
    }
    
    if (wasCancelled) {
        const optStatus = document.getElementById('optStatus');
        if (optStatus) optStatus.textContent = 'Optimization cancelled.';
        const optCountLevel = document.getElementById('optCountLevel');
        if (optCountLevel) optCountLevel.textContent = 'Optimization cancelled';
    } else {
        const finalLevel = countLevels[countLevels.length - 1];
        updateProgress(finalLevel, totalCountLevels - 1, 'Optimization complete!', 100);
    }
    
    if (wasCancelled) {
        const cancelledHtml = `
            <div style="background: #fff3e0; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ff9800;">
                <strong style="color: #ef6c00;">Optimization Cancelled</strong>
                <div style="margin-top: 10px;">
                    <div><strong>Count levels completed:</strong> ${completedLevels} of ${totalCountLevels}</div>
                    ${partialLevel !== null ? `<div><strong>Partially processed level:</strong> ${partialLevel >= 0 ? '+' : ''}${partialLevel}</div>` : ''}
                    <div><strong>Strategy changes applied:</strong> ${totalChanges}</div>
                </div>
            </div>
        `;
        if (resultsDiv) resultsDiv.insertAdjacentHTML('beforeend', cancelledHtml);
    } else {
        const summaryHtml = `
            <div style="background: #e8f5e9; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #4caf50;">
                <strong style="color: #2e7d32;">Optimization Complete for All Count Levels!</strong>
                <div style="margin-top: 10px;">
                    <div><strong>Total strategy changes:</strong> ${totalChanges}</div>
                    <div style="margin-top: 8px;">
                        <strong>Changes by count level:</strong>
                        <ul style="margin: 8px 0; padding-left: 20px;">
                            ${countLevels.map(level => `<li>Count ${level >= 0 ? '+' : ''}${level}: ${changesByLevel[level] || 0} changes</li>`).join('')}
                        </ul>
                    </div>
                    <div style="margin-top: 10px;">
                        <button onclick="window.changeOptimizationSubview?.('simulation'); window.runSimulation?.();" style="padding: 8px 14px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Test Optimized Strategy
                        </button>
                    </div>
                </div>
            </div>
        `;
        if (resultsDiv) resultsDiv.insertAdjacentHTML('beforeend', summaryHtml);
    }
    
    optimizationInProgress = false;
    optimizationCancelRequested = false;
    
    return { totalCountLevels, totalChanges, changesByLevel, cancelled: wasCancelled };
}
