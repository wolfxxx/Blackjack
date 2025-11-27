// Simulation engine
class Simulator {
    constructor(game, strategy) {
        this.game = game;
        this.strategy = strategy;
    }

    runSimulations(numSimulations, betSize, progressCallback) {
        const results = {
            totalGames: 0,
            wins: 0,
            losses: 0,
            pushes: 0,
            blackjacks: 0,
            totalWinnings: 0,
            totalBet: 0,
            expectedValue: 0,
            winRate: 0,
            results: [],
            countStats: null,
            cellStats: {} // Track statistics per strategy cell
        };

        // Track count statistics if counting is enabled
        const counter = this.game.counter;
        let countStats = null;
        if (counter) {
            countStats = {
                totalHands: 0,
                countDistribution: {},
                evByCount: {},
                handsByCount: {}
            };
        }

        // Chunk size - process this many simulations before yielding to browser
        const CHUNK_SIZE = 10000;
        let currentIndex = 0;
        
        return new Promise((resolve) => {
            const processChunk = () => {
                const endIndex = Math.min(currentIndex + CHUNK_SIZE, numSimulations);
                
                for (let i = currentIndex; i < endIndex; i++) {
                    // Get count before this hand
                    let trueCount = 0;
                    let runningCount = 0;
                    if (counter) {
                        runningCount = counter.getRunningCount();
                        trueCount = counter.getTrueCount(this.game.deck.getRemainingCards(), this.game.deck.numDecks);
                        const countKey = Math.round(trueCount).toString();
                        
                        if (!countStats.countDistribution[countKey]) {
                            countStats.countDistribution[countKey] = 0;
                            countStats.evByCount[countKey] = 0;
                            countStats.handsByCount[countKey] = 0;
                        }
                        countStats.countDistribution[countKey]++;
                        countStats.handsByCount[countKey]++;
                    }
                    
                    const gameResult = this.game.playGame(this.strategy, betSize);
                    
                    // Track cell-level statistics
                    this.trackCellStats(gameResult, results.cellStats, trueCount, counter);
                    
                    results.totalGames++;
                    results.totalWinnings += gameResult.winnings;
                    results.totalBet += gameResult.bet;
                    
                    // Track EV by count
                    if (counter && countStats) {
                        const countKey = Math.round(trueCount).toString();
                        countStats.evByCount[countKey] += gameResult.winnings;
                        countStats.totalHands++;
                    }
                    
                    if (gameResult.result === 'win') {
                        results.wins++;
                    } else if (gameResult.result === 'lose') {
                        results.losses++;
                    } else if (gameResult.result === 'push') {
                        results.pushes++;
                    } else if (gameResult.result === 'blackjack') {
                        results.blackjacks++;
                        results.wins++;
                    }
                    
                    // Store sample results (first 100)
                    if (i < 100) {
                        results.results.push(gameResult);
                    }
                }
                
                currentIndex = endIndex;
                
                // Update progress
                if (progressCallback) {
                    progressCallback(currentIndex, numSimulations);
                }
                
                // Check if we're done
                if (currentIndex >= numSimulations) {
                    // Finalize results
                    results.expectedValue = results.totalWinnings / results.totalGames;
                    results.winRate = (results.wins / results.totalGames) * 100;
                    results.returnRate = (results.totalWinnings / results.totalBet) * 100;
                    
                    // Calculate average EV by count
                    if (countStats) {
                        for (let countKey in countStats.evByCount) {
                            if (countStats.handsByCount[countKey] > 0) {
                                countStats.evByCount[countKey] = countStats.evByCount[countKey] / countStats.handsByCount[countKey];
                            }
                        }
                        results.countStats = countStats;
                    }
                    
                    resolve(results);
                } else {
                    // Yield to browser, then continue
                    setTimeout(processChunk, 0);
                }
            };
            
            // Start processing
            processChunk();
        });
    }
    
    trackCellStats(gameResult, cellStats, trueCount, counter) {
        // Extract the initial decision point from the game result
        const playerCards = gameResult.playerCards;
        const dealerCard = gameResult.dealerCards[0];
        
        // Determine player total - check if it's a pair first
        let playerTotal;
        if (playerCards.length === 2 && this.game.canSplit(playerCards)) {
            // It's a pair - format as "rank,rank" or "value,value"
            const rank1 = playerCards[0].rank;
            const rank2 = playerCards[1].rank;
            if (rank1 === rank2) {
                playerTotal = `${rank1},${rank2}`;
            } else {
                // Same value but different ranks (e.g., 10, J, Q, K)
                const value1 = playerCards[0].value === 11 ? 'A' : playerCards[0].value.toString();
                const value2 = playerCards[1].value === 11 ? 'A' : playerCards[1].value.toString();
                playerTotal = `${value1},${value2}`;
            }
        } else {
            // Regular hand (hard or soft)
            const { value, isSoft } = this.game.calculateHandValue(playerCards);
            playerTotal = isSoft ? `S${value}` : value.toString();
        }
        
        const dealerCardValue = dealerCard.value === 11 ? 'A' : dealerCard.value.toString();
        
        // Get count category
        const countCategory = counter ? Math.round(trueCount) : 0;
        const countKey = countCategory.toString();
        
        // Get action from game result if available, otherwise determine it
        let action = gameResult.initialDecision ? gameResult.initialDecision.action : 'S';
        if (!action && gameResult.hands && gameResult.hands.length > 0) {
            const firstHand = gameResult.hands[0];
            if (gameResult.hands.length > 1) {
                action = 'P'; // Split
            } else if (firstHand.cards.length === 3 && playerCards.length === 2) {
                action = 'D'; // Double
            } else if (firstHand.cards.length > playerCards.length) {
                action = 'H'; // Hit
            }
        }
        
        // Create cell key: playerTotal_dealerCard_action_count
        const cellKey = `${playerTotal}_${dealerCardValue}_${action}_${countKey}`;
        
        if (!cellStats[cellKey]) {
            cellStats[cellKey] = {
                playerTotal: playerTotal,
                dealerCard: dealerCardValue,
                action: action,
                count: countCategory,
                hands: 0,
                wins: 0,
                losses: 0,
                pushes: 0,
                totalWinnings: 0,
                totalBet: 0
            };
        }
        
        const cell = cellStats[cellKey];
        cell.hands++;
        cell.totalBet += gameResult.bet;
        cell.totalWinnings += gameResult.winnings;
        
        if (gameResult.result === 'win' || gameResult.result === 'blackjack') {
            cell.wins++;
        } else if (gameResult.result === 'lose') {
            cell.losses++;
        } else {
            cell.pushes++;
        }
    }

    // Test an entire row (all dealer cards) for a given player total with all actions - much more efficient!
    async testRowActions(playerTotal, dealers, countLevel, numSimulations, betSize, progressCallback, cancelCheck = null) {
        // Parse player total to get cards
        let playerCards = '';
        let canDouble = true;
        let canSplit = false;
        
        if (playerTotal.startsWith('S')) {
            // Soft total (e.g., S18 = Ace + 7)
            const softValue = parseInt(playerTotal.substring(1));
            const secondCard = softValue - 11;
            playerCards = `A,${secondCard}`;
            canDouble = true;
        } else if (playerTotal.includes(',')) {
            // Pair
            playerCards = playerTotal;
            canDouble = true;
            canSplit = true;
        } else {
            // Hard total - need to construct cards
            const hardValue = parseInt(playerTotal);
            if (hardValue >= 10 && hardValue <= 20) {
                const card1 = Math.min(10, hardValue - 5);
                const card2 = hardValue - card1;
                playerCards = `${card1},${card2}`;
            } else {
                const cardValue = Math.floor(hardValue / 2);
                playerCards = `${cardValue},${hardValue - cardValue}`;
                if (cardValue === hardValue - cardValue) {
                    canSplit = true;
                }
            }
            canDouble = true;
        }
        
        // Determine valid actions for this player total
        const actions = ['H', 'S'];
        if (canDouble) {
            if (playerTotal.startsWith('S')) {
                actions.push('D'); // Can always double soft totals
            } else if (playerTotal.includes(',')) {
                // Pairs - can double except aces
                const pairValue = playerTotal === 'A,A' ? 11 : parseInt(playerTotal.split(',')[0]);
                if (pairValue !== 11) actions.push('D');
            } else {
                // Hard totals - can double 9-11
                const hardValue = parseInt(playerTotal);
                if (hardValue >= 9 && hardValue <= 11) actions.push('D');
            }
        }
        if (canSplit) {
            actions.push('P');
        }
        
        // Get game rules and counting settings
        const enableCounting = document.getElementById('enableCounting').checked;
        const countingSystem = enableCounting ? document.getElementById('countingSystem').value : null;
        const numDecks = parseInt(document.getElementById('numDecks').value);
        
        const gameRules = {
            dealerStandsOn: document.getElementById('dealerStandsOn').value,
            doubleAfterSplit: document.getElementById('doubleAfterSplit').checked,
            resplitAces: document.getElementById('resplitAces').checked,
            blackjackPays: document.getElementById('blackjackPays').value
        };
        
        // Results structure: results[dealerCard][action] = { totalGames, totalWinnings, ... }
        const results = {};
        dealers.forEach(dealer => {
            results[dealer] = {};
            actions.forEach(action => {
                results[dealer][action] = {
                    totalGames: 0,
                    totalWinnings: 0,
                    totalBet: 0,
                    wins: 0,
                    losses: 0,
                    pushes: 0
                };
            });
        });
        
        const CHUNK_SIZE = 10000;
        let currentIndex = 0;
        let attempts = 0; // Track total attempts for count filtering
        const targetCount = countLevel !== null ? countLevel : 0;
        let cancelled = false;
        
        return new Promise((resolve) => {
            const shouldCancel = () => cancelCheck && cancelCheck();
            let resolved = false;
            
            const finalize = () => {
                if (resolved) return;
                resolved = true;
                
                const summary = {};
                dealers.forEach(dealer => {
                    summary[dealer] = {};
                    actions.forEach(action => {
                        const cellResult = results[dealer][action];
                        cellResult.expectedValue = cellResult.totalGames > 0 ?
                            cellResult.totalWinnings / cellResult.totalGames : 0;
                        summary[dealer][action] = cellResult.expectedValue;
                    });
                });
                
                resolve({ results, summary, cancelled });
            };
            const processChunk = () => {
                const endIndex = Math.min(currentIndex + CHUNK_SIZE, numSimulations);
                
                for (let i = currentIndex; i < endIndex; i++) {
                    if (shouldCancel()) {
                        cancelled = true;
                        finalize();
                        return;
                    }
                    
                    attempts++;
                    
                    // Create a fresh deck for this simulation
                    const deck = new Deck(numDecks);
                    deck.setPenetration(100);
                    
                    // Create counter if counting is enabled
                    let counter = null;
                    if (enableCounting && countingSystem) {
                        counter = new CardCounter(countingSystem);
                    }
                    
                    // Remove player cards from deck and update count
                    const removeCard = (rank) => {
                        const index = deck.cards.findIndex(c => c.rank === rank);
                        if (index !== -1) {
                            const card = deck.cards[index];
                            if (counter) {
                                counter.updateCount(card);
                            }
                            deck.cards.splice(index, 1);
                        }
                    };
                    
                    const playerCardParts = playerCards.split(',');
                    playerCardParts.forEach(cardStr => {
                        const trimmed = cardStr.trim().toUpperCase();
                        if (trimmed === 'A') {
                            const idx = deck.cards.findIndex(c => c.rank === 'A');
                            if (idx !== -1) {
                                const card = deck.cards[idx];
                                if (counter) {
                                    counter.updateCount(card);
                                }
                                deck.cards.splice(idx, 1);
                            }
                        } else if (['J', 'Q', 'K'].includes(trimmed) || trimmed === '10') {
                            // Remove one card of the specific rank (not any face card)
                            const rankToRemove = trimmed === '10' ? '10' : trimmed;
                            const idx = deck.cards.findIndex(c => c.rank === rankToRemove);
                            if (idx !== -1) {
                                const card = deck.cards[idx];
                                if (counter) {
                                    counter.updateCount(card);
                                }
                                deck.cards.splice(idx, 1);
                            }
                        } else {
                            const idx = deck.cards.findIndex(c => c.rank === trimmed);
                            if (idx !== -1) {
                                const card = deck.cards[idx];
                                if (counter) {
                                    counter.updateCount(card);
                                }
                                deck.cards.splice(idx, 1);
                            }
                        }
                    });
                    
                    // Parse player cards once
                    const parsedPlayerCards = playerCardParts.map(c => {
                        c = c.trim().toUpperCase();
                        if (c === 'A') return { rank: 'A', suit: '♠', value: 11 };
                        if (['J', 'Q', 'K'].includes(c) || c === '10') return { rank: c === '10' ? '10' : c, suit: '♠', value: 10 };
                        return { rank: c, suit: '♠', value: parseInt(c) };
                    });
                    
                    const isInitialBlackjack = parsedPlayerCards.length === 2 && this.game.isBlackjack(parsedPlayerCards);
                    if (isInitialBlackjack) {
                        actions.length = 0;
                        actions.push('S');
                        canDouble = false;
                        canSplit = false;
                    }
                    
                    // For each dealer card, test all actions
                    for (let dealer of dealers) {
                        if (shouldCancel()) {
                            cancelled = true;
                            finalize();
                            return;
                        }
                        // Create a copy of the deck and counter state for this dealer card
                        const deckCopy = new Deck(numDecks);
                        deckCopy.cards = [...deck.cards]; // Copy remaining cards
                        deckCopy.setPenetration(100);
                        
                        let counterCopy = null;
                        if (counter) {
                            counterCopy = new CardCounter(counter.countingSystem);
                            counterCopy.runningCount = counter.runningCount; // Copy running count
                        }
                        
                        // Remove dealer card and update count
                        const dealerTrimmed = dealer.trim().toUpperCase();
                        if (dealerTrimmed === 'A') {
                            const idx = deckCopy.cards.findIndex(c => c.rank === 'A');
                            if (idx !== -1) {
                                const card = deckCopy.cards[idx];
                                if (counterCopy) {
                                    counterCopy.updateCount(card);
                                }
                                deckCopy.cards.splice(idx, 1);
                            }
                        } else if (['J', 'Q', 'K'].includes(dealerTrimmed) || dealerTrimmed === '10') {
                            // Remove one card of the specific rank (not any face card)
                            const rankToRemove = dealerTrimmed === '10' ? '10' : dealerTrimmed;
                            const idx = deckCopy.cards.findIndex(c => c.rank === rankToRemove);
                            if (idx !== -1) {
                                const card = deckCopy.cards[idx];
                                if (counterCopy) {
                                    counterCopy.updateCount(card);
                                }
                                deckCopy.cards.splice(idx, 1);
                            }
                        } else {
                            const idx = deckCopy.cards.findIndex(c => c.rank === dealerTrimmed);
                            if (idx !== -1) {
                                const card = deckCopy.cards[idx];
                                if (counterCopy) {
                                    counterCopy.updateCount(card);
                                }
                                deckCopy.cards.splice(idx, 1);
                            }
                        }
                        
                        // Check if count matches target (only if counting is enabled and countLevel specified)
                        if (enableCounting && countLevel !== null && counterCopy) {
                            const trueCount = counterCopy.getTrueCount(deckCopy.cards.length, numDecks);
                            const roundedCount = Math.round(trueCount);
                            // Only process if count matches (within 0.5 for rounding)
                            if (Math.abs(roundedCount - targetCount) > 0.5) {
                                continue; // Skip this dealer card if count doesn't match
                            }
                        }
                        
                        const parsedDealerCard = dealerTrimmed === 'A' ? 
                            { rank: 'A', suit: '♠', value: 11 } :
                            ['J', 'Q', 'K'].includes(dealerTrimmed) || dealerTrimmed === '10' ?
                            { rank: dealerTrimmed === '10' ? '10' : dealerTrimmed, suit: '♠', value: 10 } :
                            { rank: dealerTrimmed, suit: '♠', value: parseInt(dealerTrimmed) };
                        
                        // Test each action for this dealer card
                        for (let action of actions) {
                            if (shouldCancel()) {
                                cancelled = true;
                                finalize();
                                return;
                            }
                            // Create a fresh deck copy for this action
                            const actionDeck = new Deck(numDecks);
                            actionDeck.cards = [...deckCopy.cards];
                            actionDeck.setPenetration(100);
                            
                            // Create counter copy for this action
                            let actionCounter = null;
                            if (counterCopy) {
                                actionCounter = new CardCounter(counterCopy.countingSystem);
                                actionCounter.runningCount = counterCopy.runningCount;
                            }
                            
                            const tempGame = new BlackjackGame(actionDeck, gameRules, actionCounter);
                            const tempStrategy = new Strategy();
                            tempStrategy.loadBasicStrategy();
                            
                            // Set the action for this specific cell
                            if (countLevel !== null && enableCounting) {
                                tempStrategy.enableCountBased(true);
                                tempStrategy.setCountAction(countLevel, playerTotal, dealer, action);
                            } else {
                                tempStrategy.setAction(playerTotal, dealer, action);
                            }
                            
                            const gameResult = this.simulateHandWithAction(tempGame, parsedPlayerCards, parsedDealerCard, action, tempStrategy, betSize, canDouble, canSplit);
                            
                            const cellResult = results[dealer][action];
                            cellResult.totalGames++;
                            cellResult.totalWinnings += gameResult.winnings;
                            cellResult.totalBet += gameResult.bet;
                            
                            if (gameResult.result === 'win' || gameResult.result === 'blackjack') {
                                cellResult.wins++;
                            } else if (gameResult.result === 'lose') {
                                cellResult.losses++;
                            } else {
                                cellResult.pushes++;
                            }
                        }
                    }
                }
                
                currentIndex = endIndex;
                
                if (shouldCancel()) {
                    cancelled = true;
                    finalize();
                    return;
                }
                
                if (cancelled) {
                    return;
                }
                
                if (progressCallback) {
                    progressCallback(currentIndex, numSimulations);
                }
                
                if (currentIndex >= numSimulations) {
                    finalize();
                } else {
                    setTimeout(processChunk, 0);
                }
            };
            
            processChunk();
        });
    }

    // Test a specific strategy cell with a forced action - optimized version that directly tests the situation
    async testCellAction(playerTotal, dealerCard, forcedAction, countLevel, numSimulations, betSize, progressCallback) {
        // Use analyzeSituation approach but with forced action
        // Parse player total to get cards
        let playerCards = '';
        let canDouble = true;
        let canSplit = false;
        
        if (playerTotal.startsWith('S')) {
            // Soft total (e.g., S18 = Ace + 7)
            const softValue = parseInt(playerTotal.substring(1));
            const secondCard = softValue - 11;
            playerCards = `A,${secondCard}`;
            canDouble = true;
        } else if (playerTotal.includes(',')) {
            // Pair
            playerCards = playerTotal;
            canDouble = true;
            canSplit = true;
        } else {
            // Hard total - need to construct cards
            const hardValue = parseInt(playerTotal);
            // Use two cards that sum to the value (prefer 10-value combos for better representation)
            if (hardValue >= 10 && hardValue <= 20) {
                const card1 = Math.min(10, hardValue - 5);
                const card2 = hardValue - card1;
                playerCards = `${card1},${card2}`;
            } else {
                // For low values, use 2,2... or 3,3... etc
                const cardValue = Math.floor(hardValue / 2);
                playerCards = `${cardValue},${hardValue - cardValue}`;
                if (cardValue === hardValue - cardValue) {
                    canSplit = true;
                }
            }
            canDouble = true;
        }
        
        // Get game rules and settings
        const numDecks = parseInt(document.getElementById('numDecks').value);
        const enableCounting = document.getElementById('enableCounting').checked;
        const gameRules = {
            dealerStandsOn: document.getElementById('dealerStandsOn').value,
            doubleAfterSplit: document.getElementById('doubleAfterSplit').checked,
            resplitAces: document.getElementById('resplitAces').checked,
            blackjackPays: document.getElementById('blackjackPays').value
        };
        
        // Create a temporary strategy that forces this action
        const tempStrategy = new Strategy();
        tempStrategy.loadBasicStrategy(); // Start with basic strategy
        tempStrategy.setAction(playerTotal, dealerCard, forcedAction);
        
        // Test the action using analyzeSituation approach
        const results = {
            totalGames: 0,
            totalWinnings: 0,
            totalBet: 0,
            wins: 0,
            losses: 0,
            pushes: 0
        };
        
        const CHUNK_SIZE = 10000;
        let currentIndex = 0;
        
        return new Promise((resolve) => {
            const processChunk = () => {
                const endIndex = Math.min(currentIndex + CHUNK_SIZE, numSimulations);
                
                for (let i = currentIndex; i < endIndex; i++) {
                    const deck = new Deck(6);
                    deck.setPenetration(100);
                    
                    // Remove known cards from deck for accurate simulation
                    const removeCard = (rank) => {
                        const index = deck.cards.findIndex(c => c.rank === rank);
                        if (index !== -1) {
                            deck.cards.splice(index, 1);
                        }
                    };
                    
                    // Parse and remove player cards
                    const playerCardParts = playerCards.split(',');
                    playerCardParts.forEach(cardStr => {
                        const trimmed = cardStr.trim().toUpperCase();
                        if (trimmed === 'A') {
                            removeCard('A');
                        } else if (['J', 'Q', 'K'].includes(trimmed) || trimmed === '10') {
                            // Remove only one card of the specific rank (not all face cards)
                            removeCard(trimmed === '10' ? '10' : trimmed);
                        } else {
                            removeCard(trimmed);
                        }
                    });
                    
                    // Remove dealer card
                    const dealerTrimmed = dealerCard.trim().toUpperCase();
                    if (dealerTrimmed === 'A') {
                        removeCard('A');
                    } else if (['J', 'Q', 'K'].includes(dealerTrimmed) || dealerTrimmed === '10') {
                        // Remove only one card of the specific rank (not all face cards)
                        removeCard(dealerTrimmed === '10' ? '10' : dealerTrimmed);
                    } else {
                        removeCard(dealerTrimmed);
                    }
                    
                    const tempGame = new BlackjackGame(deck, gameRules);
                    const parsedPlayerCards = playerCards.split(',').map(c => {
                        c = c.trim().toUpperCase();
                        if (c === 'A') return { rank: 'A', suit: '♠', value: 11 };
                        if (['J', 'Q', 'K'].includes(c) || c === '10') return { rank: c === '10' ? '10' : c, suit: '♠', value: 10 };
                        return { rank: c, suit: '♠', value: parseInt(c) };
                    });
                    const parsedDealerCard = dealerCard.trim().toUpperCase() === 'A' ? 
                        { rank: 'A', suit: '♠', value: 11 } :
                        ['J', 'Q', 'K'].includes(dealerCard.trim().toUpperCase()) || dealerCard.trim() === '10' ?
                        { rank: dealerCard.trim().toUpperCase() === '10' ? '10' : dealerCard.trim().toUpperCase(), suit: '♠', value: 10 } :
                        { rank: dealerCard.trim(), suit: '♠', value: parseInt(dealerCard.trim()) };
                    
                    // Simulate the hand with forced action
                    const gameResult = this.simulateHandWithAction(tempGame, parsedPlayerCards, parsedDealerCard, forcedAction, tempStrategy, betSize, canDouble, canSplit);
                    
                    results.totalGames++;
                    results.totalWinnings += gameResult.winnings;
                    results.totalBet += gameResult.bet;
                    
                    if (gameResult.result === 'win' || gameResult.result === 'blackjack') {
                        results.wins++;
                    } else if (gameResult.result === 'lose') {
                        results.losses++;
                    } else {
                        results.pushes++;
                    }
                }
                
                currentIndex = endIndex;
                
                if (progressCallback) {
                    progressCallback(currentIndex, numSimulations, results.totalGames);
                }
                
                if (currentIndex >= numSimulations) {
                    results.expectedValue = results.totalGames > 0 ? results.totalWinnings / results.totalGames : 0;
                    resolve(results);
                } else {
                    setTimeout(processChunk, 0);
                }
            };
            
            processChunk();
        });
    }
    
    // Helper method to simulate a hand with a forced action
    simulateHandWithAction(game, playerCards, dealerCard, forcedAction, strategy, betSize, canDouble, canSplit) {
        const dealerHand = [dealerCard];
        dealerHand.push(game.deck.dealCard());
        
        // Check for dealer blackjack
        if (game.isBlackjack(dealerHand)) {
            if (game.isBlackjack(playerCards)) {
                return { result: 'push', winnings: 0, bet: betSize, playerCards, dealerCards: dealerHand };
            } else {
                return { result: 'lose', winnings: -betSize, bet: betSize, playerCards, dealerCards: dealerHand };
            }
        }
        
        // Check for player blackjack
        if (game.isBlackjack(playerCards)) {
            const payout = game.rules.blackjackPays === '3:2' ? 1.5 : 
                          game.rules.blackjackPays === '6:5' ? 1.2 : 1;
            return { result: 'blackjack', winnings: betSize * payout, bet: betSize, playerCards, dealerCards: dealerHand };
        }
        
        let betMultiplier = 1;
        let finalPlayerHands = [{ cards: [...playerCards], bet: 1 }];
        
        if (forcedAction === 'P' && canSplit && game.canSplit(playerCards)) {
            const card = finalPlayerHands[0].cards.pop();
            finalPlayerHands[0].cards.push(game.deck.dealCard());
            finalPlayerHands.push({ cards: [card, game.deck.dealCard()], bet: 1 });
            betMultiplier = 2;
            
            // Play each split hand with strategy
            // We're already in split hands, so any pair we encounter is a potential resplit
            for (let hand of finalPlayerHands) {
                while (!game.isBust(hand.cards) && !game.isBlackjack(hand.cards)) {
                    const { value, isSoft } = game.calculateHandValue(hand.cards);
                    const isPair = hand.cards.length === 2 && game.canSplit(hand.cards);
                    const isAcePair = isPair && hand.cards[0].rank === 'A';
                    // Check resplitting rules: aces use resplitAces, others use allowResplit
                    const canResplit = isPair ? (
                        isAcePair ? game.rules.resplitAces : game.rules.allowResplit
                    ) : false;
                    
                    let handTotal;
                    // Use pair strategy if it's a pair and resplitting is allowed
                    // This correctly handles:
                    // - allowResplit=true, resplitAces=false: pairs can resplit, aces cannot
                    // - allowResplit=true, resplitAces=true: all pairs can resplit
                    // - allowResplit=false, resplitAces=false: no resplitting
                    if (isPair && canResplit) {
                        // Use pair strategy
                        const first = hand.cards[0];
                        const normalized = first.rank === 'A'
                            ? 'A'
                            : first.value === 10 ? '10' : first.value.toString();
                        handTotal = `${normalized},${normalized}`;
                    } else {
                        handTotal = isSoft ? `S${value}` : value.toString();
                    }
                    const dealerCardValue = dealerCard.value === 11 ? 'A' : dealerCard.value.toString();
                    const canDoubleAfterSplit = hand.cards.length === 2 && game.rules.doubleAfterSplit;
                    const handAction = strategy.getAction(handTotal, dealerCardValue, canDoubleAfterSplit, canResplit);
                    
                    if (handAction === 'H') {
                        hand.cards.push(game.deck.dealCard());
                        if (game.isBust(hand.cards)) break;
                    } else if (handAction === 'D' && canDoubleAfterSplit) {
                        // Double after split
                        hand.bet *= 2;
                        hand.cards.push(game.deck.dealCard());
                        break; // Double gets exactly one card
                    } else if (handAction === 'P' && canResplit) {
                        // Resplit
                        const card = hand.cards.pop();
                        hand.cards.push(game.deck.dealCard());
                        finalPlayerHands.push({ cards: [card, game.deck.dealCard()], bet: hand.bet });
                        betMultiplier += 1;
                        continue; // Continue with this hand
                    } else {
                        break; // Stand or can't double/split
                    }
                }
            }
        } else if (forcedAction === 'D' && canDouble) {
            betMultiplier = 2;
            finalPlayerHands[0].cards.push(game.deck.dealCard());
        } else if (forcedAction === 'H') {
            finalPlayerHands[0].cards.push(game.deck.dealCard());
            if (!game.isBust(finalPlayerHands[0].cards)) {
                // Continue with strategy
                while (!game.isBust(finalPlayerHands[0].cards) && !game.isBlackjack(finalPlayerHands[0].cards)) {
                    const { value, isSoft } = game.calculateHandValue(finalPlayerHands[0].cards);
                    const handTotal = isSoft ? `S${value}` : value.toString();
                    const dealerCardValue = dealerCard.value === 11 ? 'A' : dealerCard.value.toString();
                    const handAction = strategy.getAction(handTotal, dealerCardValue, false, false);
                    
                    if (handAction === 'H') {
                        finalPlayerHands[0].cards.push(game.deck.dealCard());
                        if (game.isBust(finalPlayerHands[0].cards)) break;
                    } else {
                        break;
                    }
                }
            }
        }
        // Stand - no additional cards
        
        // Play dealer
        const dealerFinal = game.playDealer(dealerHand);
        const dealerValue = game.calculateHandValue(dealerFinal).value;
        const dealerBust = dealerValue > 21;
        
        // Evaluate hands
        let handWinnings = 0;
        for (let hand of finalPlayerHands) {
            const playerValue = game.calculateHandValue(hand.cards).value;
            if (playerValue > 21) {
                handWinnings -= betSize * hand.bet;
            } else if (dealerBust) {
                handWinnings += betSize * hand.bet;
            } else if (playerValue > dealerValue) {
                handWinnings += betSize * hand.bet;
            } else if (playerValue < dealerValue) {
                handWinnings -= betSize * hand.bet;
            }
        }
        
        const totalWinnings = handWinnings * betMultiplier;
        const totalBet = betSize * betMultiplier;
        
        let result = 'push';
        if (totalWinnings > 0) result = 'win';
        else if (totalWinnings < 0) result = 'lose';
        
        return { result, winnings: totalWinnings, bet: totalBet, playerCards, dealerCards: dealerFinal };
    }

    async analyzeSituation(playerCards, dealerCard, gameRules, numSimulations = 10000, progressCallback = null, betSize = 100) {
        // Parse player cards
        const parseCard = (cardStr) => {
            cardStr = cardStr.trim().toUpperCase();
            if (cardStr === 'A' || cardStr === 'ACE') {
                return { rank: 'A', suit: '♠', value: 11 };
            } else if (['J', 'Q', 'K'].includes(cardStr) || cardStr === '10') {
                return { rank: cardStr === '10' ? '10' : cardStr, suit: '♠', value: 10 };
            } else {
                const num = parseInt(cardStr);
                if (num >= 2 && num <= 9) {
                    return { rank: num.toString(), suit: '♠', value: num };
                }
            }
            return null;
        };

        const parsedPlayerCards = playerCards.split(',').map(parseCard).filter(c => c !== null);
        const parsedDealerCard = parseCard(dealerCard);

        if (parsedPlayerCards.length === 0 || !parsedDealerCard) {
            return { error: 'Invalid card input' };
        }

        // Calculate hand value
        const game = new BlackjackGame(new Deck(6), gameRules);
        const { value, isSoft } = game.calculateHandValue(parsedPlayerCards);
        const canSplit = parsedPlayerCards.length === 2 && parsedPlayerCards[0].value === parsedPlayerCards[1].value;
        const canDouble = parsedPlayerCards.length === 2;
        
        // Determine player total for strategy lookup
        // For pairs, use pair format (e.g., "9,9") instead of hard total (e.g., "18")
        // This matches WASM's strategy_pair_label format which uses value, not rank
        let playerTotal;
        if (canSplit) {
            // It's a pair - format as "value,value" to match WASM's strategy_pair_label
            // For Aces use "A", for 10-value cards use "10", otherwise use the numeric value
            const value1 = parsedPlayerCards[0].value === 11 ? 'A' : 
                          (parsedPlayerCards[0].value === 10 ? '10' : parsedPlayerCards[0].value.toString());
            const value2 = parsedPlayerCards[1].value === 11 ? 'A' : 
                          (parsedPlayerCards[1].value === 10 ? '10' : parsedPlayerCards[1].value.toString());
            playerTotal = `${value1},${value2}`;
        } else {
            // Regular hand (hard or soft)
            playerTotal = isSoft ? `S${value}` : value.toString();
        }

        // Test each possible action
        const actions = ['H', 'S'];
        if (canDouble) actions.push('D');
        if (canSplit) actions.push('P');

        const actionResults = {};

        for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
            const action = actions[actionIndex];
            
            // Update progress before starting this action (if callback provided)
            if (progressCallback) {
                progressCallback(action);
                // Small delay to allow browser to paint
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            const results = {
                totalGames: 0,
                wins: 0,
                losses: 0,
                pushes: 0,
                totalWinnings: 0,
                totalBet: 0
            };

            // Run simulations with proper card composition tracking
            for (let i = 0; i < numSimulations; i++) {
                const deck = new Deck(6);
                deck.setPenetration(100);
                
                // Remove known cards from deck for accurate simulation
                const removeCard = (rank) => {
                    const index = deck.cards.findIndex(c => c.rank === rank);
                    if (index !== -1) {
                        deck.cards.splice(index, 1);
                    }
                };
                
                // Remove player cards (one card per rank)
                parsedPlayerCards.forEach(card => removeCard(card.rank));
                // Remove dealer card (one card of the specific rank)
                removeCard(parsedDealerCard.rank);
                
                const tempGame = new BlackjackGame(deck, gameRules);
                
                // Create a temporary strategy that always plays this action
                const tempStrategy = new Strategy();
                tempStrategy.loadBasicStrategy();
                tempStrategy.setAction(playerTotal, parsedDealerCard.value === 11 ? 'A' : parsedDealerCard.value.toString(), action);
                
                // Simulate the hand with known initial cards
                const playerHand = [...parsedPlayerCards];
                const dealerHand = [parsedDealerCard];
                
                // Deal dealer's hole card (use game's deck to ensure consistency)
                dealerHand.push(tempGame.deck.dealCard());
                
                // Check for dealer blackjack
                if (tempGame.isBlackjack(dealerHand)) {
                    if (tempGame.isBlackjack(playerHand)) {
                        results.pushes++;
                        results.totalBet += betSize;
                        results.totalGames++;
                        continue;
                    } else {
                        results.losses++;
                        results.totalWinnings -= betSize;
                        results.totalBet += betSize;
                        results.totalGames++;
                        continue;
                    }
                }
                
                // Check for player blackjack
                if (tempGame.isBlackjack(playerHand)) {
                    const payout = gameRules.blackjackPays === '3:2' ? 1.5 : 
                                  gameRules.blackjackPays === '6:5' ? 1.2 : 1;
                    results.wins++;
                    results.totalWinnings += betSize * payout;
                    results.totalBet += betSize;
                    results.totalGames++;
                    continue;
                }
                
                // Play player hand
                let betMultiplier = 1;
                let finalPlayerHands = [{ cards: [...playerHand], bet: 1, result: null }];
                
                // tempStrategy already created above - use it
                
                if (action === 'P' && canSplit) {
                    // Split
                    const card = finalPlayerHands[0].cards.pop();
                    finalPlayerHands[0].cards.push(tempGame.deck.dealCard());
                    finalPlayerHands.push({ cards: [card, tempGame.deck.dealCard()], bet: 1, result: null });
                    betMultiplier = 2;
                    
                    // Play each split hand with strategy
                    for (let hand of finalPlayerHands) {
                        // Check if already busted (shouldn't happen, but match WASM logic)
                        if (tempGame.calculateHandValue(hand.cards).value > 21) {
                            hand.result = 'lose';
                            continue;
                        }
                        while (tempGame.calculateHandValue(hand.cards).value < 21) {
                            const { value, isSoft } = tempGame.calculateHandValue(hand.cards);
                            const handTotal = isSoft ? `S${value}` : value.toString();
                            const canDoubleAfterSplit = hand.cards.length === 2 && gameRules.doubleAfterSplit;
                            const handAction = tempStrategy.getAction(handTotal, parsedDealerCard.value === 11 ? 'A' : parsedDealerCard.value.toString(), 
                                                                     canDoubleAfterSplit, false);
                            
                            if (handAction === 'H') {
                                hand.cards.push(tempGame.deck.dealCard());
                                if (tempGame.calculateHandValue(hand.cards).value > 21) {
                                    break;
                                }
                            } else if (handAction === 'D' && canDoubleAfterSplit) {
                                // Double after split
                                hand.bet *= 2;
                                hand.cards.push(tempGame.deck.dealCard());
                                break; // Double gets exactly one card
                            } else {
                                break; // Stand or can't double
                            }
                        }
                        // Mark as lose if busted
                        if (tempGame.calculateHandValue(hand.cards).value > 21) {
                            hand.result = 'lose';
                        }
                    }
                } else if (action === 'D' && canDouble) {
                    // Double
                    betMultiplier = 2;
                    finalPlayerHands[0].cards.push(tempGame.deck.dealCard());
                    // Double gets exactly one card, then done
                } else if (action === 'H') {
                    // Hit once, then continue with strategy
                    finalPlayerHands[0].cards.push(tempGame.deck.dealCard());
                    if (tempGame.calculateHandValue(finalPlayerHands[0].cards).value > 21) {
                        finalPlayerHands[0].result = 'lose';
                    } else {
                        // Continue playing with strategy
                        while (tempGame.calculateHandValue(finalPlayerHands[0].cards).value < 21) {
                            const { value, isSoft } = tempGame.calculateHandValue(finalPlayerHands[0].cards);
                            const handTotal = isSoft ? `S${value}` : value.toString();
                            const handAction = tempStrategy.getAction(handTotal, parsedDealerCard.value === 11 ? 'A' : parsedDealerCard.value.toString(), false, false);
                            
                            if (handAction === 'H') {
                                finalPlayerHands[0].cards.push(tempGame.deck.dealCard());
                                if (tempGame.calculateHandValue(finalPlayerHands[0].cards).value > 21) {
                                    break;
                                }
                            } else {
                                break; // Stand
                            }
                        }
                        // Mark as lose if busted
                        if (tempGame.calculateHandValue(finalPlayerHands[0].cards).value > 21) {
                            finalPlayerHands[0].result = 'lose';
                        }
                    }
                }
                // Stand - no additional cards (action === 'S')
                
                // Play dealer
                const dealerFinal = tempGame.playDealer(dealerHand);
                const dealerValue = tempGame.calculateHandValue(dealerFinal).value;
                const dealerBust = dealerValue > 21;
                
                // Evaluate hands (match WASM logic exactly)
                let handWinnings = 0;
                for (let hand of finalPlayerHands) {
                    // Check if hand already marked as lose (match WASM's hand.result check)
                    if (hand.result === 'lose') {
                        handWinnings -= betSize * hand.bet;
                        continue;
                    }
                    const playerValue = tempGame.calculateHandValue(hand.cards).value;
                    if (playerValue > 21) {
                        handWinnings -= betSize * hand.bet;
                    } else if (dealerBust || playerValue > dealerValue) {
                        handWinnings += betSize * hand.bet;
                    } else if (playerValue < dealerValue) {
                        handWinnings -= betSize * hand.bet;
                    }
                    // Push (playerValue === dealerValue) results in 0, which is correct
                }
                
                results.totalWinnings += handWinnings * betMultiplier;
                results.totalBet += betSize * betMultiplier;
                
                if (handWinnings > 0) {
                    results.wins++;
                } else if (handWinnings < 0) {
                    results.losses++;
                } else {
                    results.pushes++;
                }
                results.totalGames++;
            }

            const expectedValue = results.totalWinnings / results.totalGames;
            const winRate = (results.wins / results.totalGames) * 100;
            // For Hit/Stand (betMultiplier = 1), totalBet should equal betSize * totalGames
            // Return rate should equal EV when betSize = 100
            const returnRate = results.totalBet > 0 ? (results.totalWinnings / results.totalBet) * 100 : 0;

            actionResults[action] = {
                action: action,
                expectedValue: expectedValue,
                winRate: winRate,
                returnRate: returnRate,
                wins: results.wins,
                losses: results.losses,
                pushes: results.pushes,
                totalGames: results.totalGames
            };
        }

        // Find best action
        let bestAction = null;
        let bestEV = -Infinity;
        for (let action in actionResults) {
            if (actionResults[action].expectedValue > bestEV) {
                bestEV = actionResults[action].expectedValue;
                bestAction = action;
            }
        }

        return {
            situation: {
                playerCards: parsedPlayerCards.map(c => c.rank).join(','),
                playerTotal: playerTotal,
                dealerCard: parsedDealerCard.rank,
                canDouble: canDouble,
                canSplit: canSplit
            },
            actions: actionResults,
            bestAction: bestAction,
            bestExpectedValue: bestEV
        };
    }
}

