// Card counting systems
class CardCounter {
    constructor(countingSystem = 'Hi-Lo') {
        this.countingSystem = countingSystem;
        this.runningCount = 0;
        this.cardValues = this.getCardValues(countingSystem);
    }

    getCardValues(system, customValues = null) {
        if (system === 'Custom' && customValues) {
            return customValues;
        }
        
        const systems = {
            'Hi-Lo': {
                '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
                '7': 0, '8': 0, '9': 0,
                '10': -1, 'J': -1, 'Q': -1, 'K': -1,
                'A': -1,
                description: 'Most popular balanced system. Easy to learn. +1 for 2-6, 0 for 7-9, -1 for 10-A.',
                balanced: true
            },
            'Hi-Opt I': {
                '2': 0, '3': 1, '4': 1, '5': 1, '6': 1,
                '7': 0, '8': 0, '9': 0,
                '10': -1, 'J': -1, 'Q': -1, 'K': -1,
                'A': 0,
                description: 'Balanced system that ignores 2s and Aces. Requires ace side count. +1 for 3-6, 0 for 2,7-9,A, -1 for 10-K.',
                balanced: true
            },
            'Hi-Opt II': {
                '2': 1, '3': 1, '4': 2, '5': 2, '6': 1,
                '7': 1, '8': 0, '9': 0,
                '10': -2, 'J': -2, 'Q': -2, 'K': -2,
                'A': 0,
                description: 'Advanced balanced system with varied point values. Requires ace side count. More accurate but harder to use.',
                balanced: true
            },
            'Omega II': {
                '2': 1, '3': 1, '4': 2, '5': 2, '6': 2,
                '7': 1, '8': 0, '9': -1,
                '10': -2, 'J': -2, 'Q': -2, 'K': -2,
                'A': 0,
                description: 'Advanced balanced system. Requires ace side count. More complex point values for better accuracy.',
                balanced: true
            },
            'KO (Knockout)': {
                '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1,
                '8': 0, '9': 0,
                '10': -1, 'J': -1, 'Q': -1, 'K': -1,
                'A': -1,
                description: 'Unbalanced system - no true count conversion needed! +1 for 2-7, 0 for 8-9, -1 for 10-A.',
                balanced: false
            },
            'Ace-Five': {
                '2': 0, '3': 0, '4': 0, '5': 1,
                '6': 0, '7': 0, '8': 0, '9': 0,
                '10': 0, 'J': 0, 'Q': 0, 'K': 0,
                'A': -1,
                description: 'Simple system focusing only on 5s and Aces. +1 for 5, -1 for Ace, 0 for all others.',
                balanced: false
            }
        };
        return systems[system] || systems['Hi-Lo'];
    }
    
    getSystemInfo(system) {
        if (system === 'Custom') {
            // For custom, we'll return empty info - will be handled by UI
            return {
                description: 'Custom counting system',
                balanced: false,
                values: {
                    '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0,
                    '10': 0, 'J': 0, 'Q': 0, 'K': 0, 'A': 0
                }
            };
        }
        
        const systemData = this.getCardValues(system);
        return {
            description: systemData.description || 'No description available',
            balanced: systemData.balanced !== undefined ? systemData.balanced : false,
            values: {
                '2': systemData['2'], '3': systemData['3'], '4': systemData['4'], '5': systemData['5'],
                '6': systemData['6'], '7': systemData['7'], '8': systemData['8'], '9': systemData['9'],
                '10': systemData['10'], 'J': systemData['J'], 'Q': systemData['Q'], 'K': systemData['K'],
                'A': systemData['A']
            }
        };
    }
    
    setCustomValues(customValues) {
        this.cardValues = customValues;
    }

    // Update count when a card is seen
    updateCount(card) {
        const value = this.cardValues[card.rank] || 0;
        this.runningCount += value;
        return value;
    }

    // Reset count (called on shuffle)
    reset() {
        this.runningCount = 0;
    }

    // Calculate true count (running count / remaining decks)
    getTrueCount(remainingCards, numDecks) {
        const remainingDecks = remainingCards / 52;
        if (remainingDecks <= 0) return 0;
        return this.runningCount / remainingDecks;
    }

    // Get count level (for strategy adjustments)
    getCountLevel(remainingCards, numDecks) {
        const trueCount = this.getTrueCount(remainingCards, numDecks);
        
        // Categorize count levels
        if (trueCount >= 4) return 'veryHigh';
        if (trueCount >= 2) return 'high';
        if (trueCount >= 0.5) return 'slightlyPositive';
        if (trueCount >= -0.5) return 'neutral';
        if (trueCount >= -2) return 'low';
        return 'veryLow';
    }

    // Get count level as integer range for strategy lookup
    getCountRange(remainingCards, numDecks) {
        const trueCount = this.getTrueCount(remainingCards, numDecks);
        
        // Round to nearest integer for strategy lookup
        return Math.round(trueCount);
    }

    getRunningCount() {
        return this.runningCount;
    }

    setCountingSystem(system, customValues = null) {
        this.countingSystem = system;
        this.cardValues = this.getCardValues(system, customValues);
        this.reset();
    }
}

