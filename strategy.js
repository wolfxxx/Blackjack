// Strategy management system
class Strategy {
    constructor() {
        // Strategy matrix: [playerTotal][dealerCard] = action
        // Actions: H=Hit, S=Stand, D=Double, P=Split, R=Surrender
        this.hard = {};      // Hard totals (no ace as 11)
        this.soft = {};      // Soft totals (ace as 11)
        this.pairs = {};     // Pairs
        
        // Count-based strategies: [count][playerTotal][dealerCard] = action
        // null count = base strategy, specific counts override base
        this.countBased = false;
        this.hardByCount = {};   // {count: {total: {dealer: action}}}
        this.softByCount = {};
        this.pairsByCount = {};
        
        this.initializeEmpty();
    }

    initializeEmpty() {
        // Initialize hard totals (5-21)
        for (let i = 5; i <= 21; i++) {
            this.hard[i] = {};
            for (let j = 2; j <= 11; j++) {
                const dealer = j === 11 ? 'A' : j.toString();
                this.hard[i][dealer] = 'S'; // Default to stand
            }
        }

        // Initialize soft totals (13-21, where ace = 11)
        for (let i = 13; i <= 21; i++) {
            this.soft[i] = {};
            for (let j = 2; j <= 11; j++) {
                const dealer = j === 11 ? 'A' : j.toString();
                this.soft[i][dealer] = 'S'; // Default to stand
            }
        }

        // Initialize pairs (2-11, where 11 = Ace)
        for (let i = 2; i <= 11; i++) {
            this.pairs[i] = {};
            for (let j = 2; j <= 11; j++) {
                const dealer = j === 11 ? 'A' : j.toString();
                this.pairs[i][dealer] = 'H'; // Default to hit
            }
        }
    }

    setAction(playerTotal, dealerCard, action) {
        const dealer = dealerCard === 'A' || dealerCard === '11' ? 'A' : dealerCard;
        
        if (playerTotal.startsWith('S')) {
            // Soft total
            const total = parseInt(playerTotal.substring(1));
            if (total >= 13 && total <= 21) {
                this.soft[total][dealer] = action;
            }
        } else if (playerTotal.includes(',')) {
            // Pair (e.g., "8,8" or "A,A")
            const cards = playerTotal.split(',');
            if (cards[0] === cards[1]) {
                let value = cards[0] === 'A' ? 11 : parseInt(cards[0]);
                if (value >= 2 && value <= 11) {
                    this.pairs[value][dealer] = action;
                }
            }
        } else {
            // Hard total
            const total = parseInt(playerTotal);
            if (total >= 5 && total <= 21) {
                this.hard[total][dealer] = action;
            }
        }
    }

    getAction(playerTotal, dealerCard, canDouble = false, canSplit = false, count = 0) {
        const dealer = dealerCard === 'A' || dealerCard === '11' ? 'A' : dealerCard;
        
        // If count-based strategy is enabled, check count-specific strategy first
        if (this.countBased && count !== 0) {
            const countKey = count.toString();
            
            // Check for pair first if canSplit
            if (canSplit && playerTotal.includes(',')) {
                const cards = playerTotal.split(',');
                if (cards[0] === cards[1]) {
                    let value = cards[0] === 'A' ? 11 : 
                               ['J', 'Q', 'K'].includes(cards[0]) ? 10 : parseInt(cards[0]);
                    if (this.pairsByCount[countKey] && this.pairsByCount[countKey][value] && 
                        this.pairsByCount[countKey][value][dealer]) {
                        const action = this.pairsByCount[countKey][value][dealer];
                        if (action === 'D' && !canDouble) return 'H';
                        return action;
                    }
                }
            }
            
            // Check soft total
            if (playerTotal.startsWith('S')) {
                const total = parseInt(playerTotal.substring(1));
                if (this.softByCount[countKey] && this.softByCount[countKey][total] && 
                    this.softByCount[countKey][total][dealer]) {
                    const action = this.softByCount[countKey][total][dealer];
                    if (action === 'D' && !canDouble) return 'H';
                    return action;
                }
                // If soft total not found in count-based, fall through to base strategy
            } else {
                // Check hard total (only if not a soft total)
                const total = parseInt(playerTotal);
                if (!isNaN(total) && this.hardByCount[countKey] && this.hardByCount[countKey][total] && 
                    this.hardByCount[countKey][total][dealer]) {
                    const action = this.hardByCount[countKey][total][dealer];
                    if (action === 'D' && !canDouble) return 'H';
                    return action;
                }
            }
        }
        
        // Fall back to base strategy
        // Check for pair first if canSplit
        if (canSplit && playerTotal.includes(',')) {
            const cards = playerTotal.split(',');
            if (cards[0] === cards[1]) {
                let value = cards[0] === 'A' ? 11 : 
                           ['J', 'Q', 'K'].includes(cards[0]) ? 10 : parseInt(cards[0]);
                if (value >= 2 && value <= 11 && this.pairs[value] && this.pairs[value][dealer]) {
                    const action = this.pairs[value][dealer];
                    if (action === 'D' && !canDouble) return 'H';
                    return action;
                }
            }
        }
        
        // Check soft total
        if (playerTotal.startsWith('S')) {
            const total = parseInt(playerTotal.substring(1));
            if (total >= 13 && total <= 21 && this.soft[total] && this.soft[total][dealer]) {
                const action = this.soft[total][dealer];
                if (action === 'D' && !canDouble) return 'H';
                return action;
            }
        }
        
        // Check hard total (only if not a soft total or pair)
        if (!playerTotal.startsWith('S') && !playerTotal.includes(',')) {
            const total = parseInt(playerTotal);
            if (!isNaN(total) && total >= 5 && total <= 21 && this.hard[total] && this.hard[total][dealer]) {
                let action = this.hard[total][dealer];
                // If action is double but can't double, convert to hit
                if (action === 'D' && !canDouble) {
                    return 'H';
                }
                return action;
            }
            
            // Default action for hard totals
            if (!isNaN(total)) {
                return total < 17 ? 'H' : 'S';
            }
        }
        
        // Default action for soft totals or pairs (shouldn't normally reach here if strategy is loaded)
        if (playerTotal.startsWith('S')) {
            const total = parseInt(playerTotal.substring(1));
            return !isNaN(total) && total < 19 ? 'H' : 'S';
        }
        
        // Default: stand
        return 'S';
    }
    
    // Set count-based strategy
    setCountAction(count, playerTotal, dealerCard, action) {
        if (!this.countBased) {
            this.countBased = true;
        }
        
        const countKey = count.toString();
        const dealer = dealerCard === 'A' || dealerCard === '11' ? 'A' : dealerCard;
        
        if (playerTotal.startsWith('S')) {
            const total = parseInt(playerTotal.substring(1));
            if (!this.softByCount[countKey]) this.softByCount[countKey] = {};
            if (!this.softByCount[countKey][total]) this.softByCount[countKey][total] = {};
            this.softByCount[countKey][total][dealer] = action;
        } else if (playerTotal.includes(',')) {
            const cards = playerTotal.split(',');
            if (cards[0] === cards[1]) {
                let value = cards[0] === 'A' ? 11 : parseInt(cards[0]);
                if (!this.pairsByCount[countKey]) this.pairsByCount[countKey] = {};
                if (!this.pairsByCount[countKey][value]) this.pairsByCount[countKey][value] = {};
                this.pairsByCount[countKey][value][dealer] = action;
            }
        } else {
            const total = parseInt(playerTotal);
            if (!this.hardByCount[countKey]) this.hardByCount[countKey] = {};
            if (!this.hardByCount[countKey][total]) this.hardByCount[countKey][total] = {};
            this.hardByCount[countKey][total][dealer] = action;
        }
    }
    
    enableCountBased(enabled = true) {
        this.countBased = enabled;
    }

    loadBasicStrategy() {
        // Basic Strategy for 6-8 deck, dealer stands on 17
        // Hard totals
        const hardStrategy = {
            5: { 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            6: { 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            7: { 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            8: { 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            9: { 2: 'H', 3: 'D', 4: 'D', 5: 'D', 6: 'D', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            10: { 2: 'D', 3: 'D', 4: 'D', 5: 'D', 6: 'D', 7: 'D', 8: 'D', 9: 'D', 10: 'H', A: 'H' },
            11: { 2: 'D', 3: 'D', 4: 'D', 5: 'D', 6: 'D', 7: 'D', 8: 'D', 9: 'D', 10: 'D', A: 'D' },
            12: { 2: 'H', 3: 'H', 4: 'S', 5: 'S', 6: 'S', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            13: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            14: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            15: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            16: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            17: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            18: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            19: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            20: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            21: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' }
        };

        // Soft totals
        const softStrategy = {
            13: { 2: 'H', 3: 'H', 4: 'H', 5: 'D', 6: 'D', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            14: { 2: 'H', 3: 'H', 4: 'D', 5: 'D', 6: 'D', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            15: { 2: 'H', 3: 'H', 4: 'D', 5: 'D', 6: 'D', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            16: { 2: 'H', 3: 'H', 4: 'D', 5: 'D', 6: 'D', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            17: { 2: 'H', 3: 'D', 4: 'D', 5: 'D', 6: 'D', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            18: { 2: 'S', 3: 'D', 4: 'D', 5: 'D', 6: 'D', 7: 'S', 8: 'S', 9: 'H', 10: 'H', A: 'H' },
            19: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            20: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            21: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' }
        };

        // Pairs
        const pairsStrategy = {
            2: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'P', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            3: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'P', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            4: { 2: 'H', 3: 'H', 4: 'H', 5: 'P', 6: 'P', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            5: { 2: 'D', 3: 'D', 4: 'D', 5: 'D', 6: 'D', 7: 'D', 8: 'D', 9: 'D', 10: 'H', A: 'H' },
            6: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            7: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'P', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
            8: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'P', 8: 'P', 9: 'P', 10: 'P', A: 'P' },
            9: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'S', 8: 'P', 9: 'P', 10: 'S', A: 'S' },
            10: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'S', 8: 'S', 9: 'S', 10: 'S', A: 'S' },
            11: { 2: 'P', 3: 'P', 4: 'P', 5: 'P', 6: 'P', 7: 'P', 8: 'P', 9: 'P', 10: 'P', A: 'P' }
        };

        this.hard = hardStrategy;
        this.soft = softStrategy;
        this.pairs = pairsStrategy;
    }

    loadOptimalStrategy() {
        // Load optimal strategy (similar to basic but with some adjustments)
        // For now, same as basic strategy
        this.loadBasicStrategy();
    }

    exportData() {
        const clone = (obj) => JSON.parse(JSON.stringify(obj));
        return {
            countBased: this.countBased,
            hard: clone(this.hard),
            soft: clone(this.soft),
            pairs: clone(this.pairs),
            hardByCount: clone(this.hardByCount),
            softByCount: clone(this.softByCount),
            pairsByCount: clone(this.pairsByCount),
        };
    }

    importData(data = {}) {
        const clone = (obj, fallback) => (obj ? JSON.parse(JSON.stringify(obj)) : (fallback !== undefined ? fallback : {}));
        this.initializeEmpty();
        if (data.hard) this.hard = clone(data.hard);
        if (data.soft) this.soft = clone(data.soft);
        if (data.pairs) this.pairs = clone(data.pairs);
        this.hardByCount = clone(data.hardByCount, {});
        this.softByCount = clone(data.softByCount, {});
        this.pairsByCount = clone(data.pairsByCount, {});
        this.enableCountBased(!!data.countBased);
    }
}

