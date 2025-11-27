// Blackjack game logic
class BlackjackGame {
    constructor(deck, rules, counter = null) {
        this.deck = deck;
        this.rules = rules || {
            dealerStandsOn: 17,
            doubleAfterSplit: true,
            allowResplit: true,
            resplitAces: false,
            blackjackPays: '3:2'
        };
        this.counter = counter;
    }

    // Calculate hand value (handles Aces)
    calculateHandValue(cards) {
        let value = 0;
        let aces = 0;
        
        for (let card of cards) {
            if (card.rank === 'A') {
                aces++;
                value += 11;
            } else {
                value += card.value;
            }
        }
        
        // Adjust for aces
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        
        return { value, isSoft: aces > 0 && value <= 21 };
    }

    // Check if hand is blackjack
    isBlackjack(cards) {
        return cards.length === 2 && 
               this.calculateHandValue(cards).value === 21;
    }

    // Check if hand can be split
    canSplit(cards) {
        return cards.length === 2 && cards[0].value === cards[1].value;
    }

    // Check if hand can double
    canDouble(cards) {
        return cards.length === 2;
    }

    // Check if hand is bust
    isBust(cards) {
        return this.calculateHandValue(cards).value > 21;
    }

    // Dealer plays according to rules
    playDealer(dealerCards) {
        const hand = [...dealerCards];
        
        while (true) {
            const { value, isSoft } = this.calculateHandValue(hand);
            
            if (value > 21) break; // Bust
            
            // Determine stand value based on rules
            // "17s" means stand on soft 17, "17" means hit on soft 17
            let standValue;
            if (this.rules.dealerStandsOn === '17s') {
                standValue = 17; // Stand on all 17s including soft
            } else {
                // H17: hit on soft 17, stand on hard 17
                if (isSoft && value === 17) {
                    standValue = 18; // Must hit soft 17, so stand at 18
                } else {
                    standValue = 17; // Stand on hard 17 or higher
                }
            }
            
            if (value >= standValue) break;
            
            hand.push(this.deck.dealCard(this.counter));
        }
        
        return hand;
    }

    // Play a hand with given strategy
    playHand(initialCards, dealerUpCard, strategy, canDouble = true, canSplit = true) {
        const hands = [{ cards: [...initialCards], bet: 1, result: null }];
        let totalBet = 1;
        
        for (let i = 0; i < hands.length; i++) {
            const hand = hands[i];
            
            // Play this hand
            while (!this.isBust(hand.cards) && !this.isBlackjack(hand.cards)) {
                const { value, isSoft } = this.calculateHandValue(hand.cards);
                const isPair = hand.cards.length === 2 && this.canSplit(hand.cards);
                const isAcePair = isPair && hand.cards[0].rank === 'A';
                const hasSplit = hands.length > 1;
                
                // Determine if resplitting is allowed
                const canResplit = hasSplit ? (
                    isAcePair ? this.rules.resplitAces : this.rules.allowResplit
                ) : true; // First hand can always split if it's a pair
                
                let playerTotal;
                // Use pair strategy if it's a pair and either no split has occurred or resplitting is allowed
                if (isPair && (!hasSplit || canResplit)) {
                    const first = hand.cards[0];
                    const normalized = first.rank === 'A'
                        ? 'A'
                        : first.value === 10 ? '10' : first.value.toString();
                    playerTotal = `${normalized},${normalized}`;
                } else {
                    playerTotal = isSoft ? `S${value}` : value.toString();
                }
                const dealerCard = dealerUpCard.value === 11 ? 'A' : dealerUpCard.value.toString();
                
                // Get count for strategy if counting is enabled
                const count = this.counter ? this.counter.getCountRange(this.deck.getRemainingCards(), this.deck.numDecks) : 0;
                
                // Get strategy action (with count if applicable)
                // For split hands (i > 0), allow double if doubleAfterSplit rule is enabled
                // For first hand (i === 0), allow double if canDouble is true
                const canDoubleThisHand = hand.cards.length === 2 && (
                    (i === 0 && canDouble) || 
                    (i > 0 && this.rules.doubleAfterSplit)
                );
                const canSplitThisHand = isPair && canResplit;
                let action = strategy.getAction(playerTotal, dealerCard, canDoubleThisHand, canSplitThisHand, count);
                
                // Debug: Log strategy decision for soft 17 vs 10
                if (playerTotal === 'S17' && dealerCard === '10') {
                    console.log('Strategy lookup for S17 vs 10:', {
                        playerTotal,
                        dealerCard,
                        count,
                        countBased: strategy.countBased,
                        action,
                        canDouble: hand.cards.length === 2 && canDouble && i === 0,
                        softStrategy: strategy.soft[17] ? strategy.soft[17]['10'] : 'not found',
                        countStrategy: strategy.countBased && count !== 0 && strategy.softByCount[count.toString()] ? 
                                      (strategy.softByCount[count.toString()][17] ? strategy.softByCount[count.toString()][17]['10'] : 'not found') : 'N/A'
                    });
                }
                
                // Debug: Log strategy decision for hard 13 vs 8
                if (playerTotal === '13' && dealerCard === '8') {
                    console.log('Strategy lookup for 13 vs 8:', {
                        playerTotal,
                        dealerCard,
                        count,
                        countBased: strategy.countBased,
                        action,
                        canDouble: hand.cards.length === 2 && canDouble && i === 0,
                        hardStrategy: strategy.hard[13] ? strategy.hard[13]['8'] : 'not found',
                        countStrategy: strategy.countBased && count !== 0 && strategy.hardByCount[count.toString()] ? 
                                      (strategy.hardByCount[count.toString()][13] ? strategy.hardByCount[count.toString()][13]['8'] : 'not found') : 'N/A'
                    });
                }
                
                if (action === 'H' || action === 'S') {
                    if (action === 'H') {
                        hand.cards.push(this.deck.dealCard(this.counter));
                        if (this.isBust(hand.cards)) {
                            hand.result = 'lose';
                            break;
                        }
                    } else {
                        break; // Stand
                    }
                } else if (action === 'D') {
                    // Allow double on first hand if canDouble is true, or on split hands if doubleAfterSplit is enabled
                    const canDoubleThisHand = hand.cards.length === 2 && (
                        (i === 0 && canDouble) || 
                        (i > 0 && this.rules.doubleAfterSplit)
                    );
                    if (canDoubleThisHand) {
                        const originalBet = hand.bet;
                        hand.bet *= 2;
                        totalBet += hand.bet / 2;
                        console.log('Doubling down:', {
                            originalBet,
                            newBet: hand.bet,
                            totalBetBefore: totalBet - (hand.bet / 2),
                            totalBetAfter: totalBet,
                            canDouble,
                            i,
                            handIndex: i,
                            isSplitHand: i > 0,
                            doubleAfterSplit: this.rules.doubleAfterSplit,
                            handCardsLength: hand.cards.length
                        });
                        hand.cards.push(this.deck.dealCard(this.counter));
                        break;
                    } else {
                        // Can't double, hit instead
                        hand.cards.push(this.deck.dealCard(this.counter));
                        if (this.isBust(hand.cards)) {
                            hand.result = 'lose';
                            break;
                        }
                    }
                } else if (action === 'P') {
                    if (canSplitThisHand) {
                        const card = hand.cards.pop();
                        const newHand = { cards: [card, this.deck.dealCard(this.counter)], bet: hand.bet, result: null };
                        hand.cards.push(this.deck.dealCard(this.counter));
                        hands.push(newHand);
                        totalBet += hand.bet;
                        // Continue playing this hand
                        continue;
                    } else {
                        // Can't split, hit instead
                        hand.cards.push(this.deck.dealCard(this.counter));
                        if (this.isBust(hand.cards)) {
                            hand.result = 'lose';
                            break;
                        }
                    }
                } else {
                    // Unknown action, stand
                    break;
                }
            }
        }
        
        return { hands, totalBet };
    }

    // Play a complete game
    playGame(strategy, betSize = 100) {
        // Check if we need to reshuffle
        if (this.deck.shouldReshuffle()) {
            this.deck.shuffle(this.counter);
        }
        
        // Deal initial cards
        const playerCards = [this.deck.dealCard(this.counter), this.deck.dealCard(this.counter)];
        const dealerCards = [this.deck.dealCard(this.counter), this.deck.dealCard(this.counter)];
        const dealerUpCard = dealerCards[0];
        
        // Check for player blackjack
        if (this.isBlackjack(playerCards)) {
            if (this.isBlackjack(dealerCards)) {
                return { result: 'push', winnings: 0, bet: betSize, playerCards, dealerCards };
            } else {
                const payout = this.rules.blackjackPays === '3:2' ? 1.5 : 
                              this.rules.blackjackPays === '6:5' ? 1.2 : 1;
                return { result: 'blackjack', winnings: betSize * payout, bet: betSize, playerCards, dealerCards };
            }
        }
        
        // Check for dealer blackjack
        if (this.isBlackjack(dealerCards)) {
            return { result: 'lose', winnings: -betSize, bet: betSize, playerCards, dealerCards };
        }
        
        // Player plays
        const { hands, totalBet } = this.playHand(playerCards, dealerUpCard, strategy, 
                                                  this.rules.doubleAfterSplit, true);
        
        const totalBetAmount = betSize * totalBet;
        let totalWinnings = 0;
        
        // Dealer plays
        const dealerFinal = this.playDealer(dealerCards);
        const dealerValue = this.calculateHandValue(dealerFinal).value;
        const dealerBust = dealerValue > 21;
        
        // Evaluate each hand
        for (let hand of hands) {
            if (hand.result === 'lose') {
                totalWinnings -= betSize * hand.bet;
                continue;
            }
            
            const playerValue = this.calculateHandValue(hand.cards).value;
            
            if (playerValue > 21) {
                totalWinnings -= betSize * hand.bet;
            } else if (dealerBust) {
                totalWinnings += betSize * hand.bet;
            } else if (playerValue > dealerValue) {
                totalWinnings += betSize * hand.bet;
            } else if (playerValue < dealerValue) {
                totalWinnings -= betSize * hand.bet;
            } else {
                // Push
                totalWinnings += 0;
            }
        }
        
        return {
            result: totalWinnings > 0 ? 'win' : totalWinnings < 0 ? 'lose' : 'push',
            winnings: totalWinnings,
            bet: totalBetAmount,
            playerCards,
            dealerCards: dealerFinal,
            hands,
            initialDecision: {
                playerTotal: this.calculateHandValue(playerCards),
                dealerCard: dealerUpCard,
                action: this.getInitialAction(playerCards, dealerUpCard, hands)
            }
        };
    }
    
    getInitialAction(playerCards, dealerUpCard, finalHands) {
        // Determine the first action taken
        if (finalHands && finalHands.length > 1) {
            return 'P'; // Split
        }
        if (finalHands && finalHands.length > 0) {
            const firstHand = finalHands[0];
            if (firstHand.cards.length === 3 && playerCards.length === 2) {
                return 'D'; // Double
            }
            if (firstHand.cards.length > playerCards.length) {
                return 'H'; // Hit
            }
        }
        return 'S'; // Stand
    }
}

