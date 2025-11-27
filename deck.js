// Deck management system
class Deck {
    constructor(numDecks = 6) {
        this.numDecks = numDecks;
        this.cards = [];
        this.usedCards = [];
        this.penetration = 0;
        this.penetrationThreshold = 75; // percentage
        this.shuffle();
    }

    shuffle(counter = null) {
        this.cards = [];
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        // Create multiple decks
        for (let deck = 0; deck < this.numDecks; deck++) {
            for (let suit of suits) {
                for (let rank of ranks) {
                    this.cards.push({
                        rank: rank,
                        suit: suit,
                        value: this.getCardValue(rank)
                    });
                }
            }
        }
        
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
        
        this.usedCards = [];
        this.penetration = 0;
        
        // Reset counter on shuffle
        if (counter) {
            counter.reset();
        }
    }

    getCardValue(rank) {
        if (rank === 'A') return 11; // Ace value (can be 1 or 11)
        if (['J', 'Q', 'K'].includes(rank)) return 10;
        return parseInt(rank);
    }

    dealCard(counter = null) {
        if (this.cards.length === 0) {
            this.shuffle(counter);
        }
        
        const card = this.cards.pop();
        this.usedCards.push(card);
        
        // Update counter if provided
        if (counter) {
            counter.updateCount(card);
        }
        
        // Check if we need to reshuffle based on penetration
        const totalCards = this.numDecks * 52;
        const usedCount = this.usedCards.length;
        this.penetration = (usedCount / totalCards) * 100;
        
        if (this.penetration >= this.penetrationThreshold) {
            // Mark that we should reshuffle after this round
            // (don't reshuffle mid-hand)
        }
        
        return card;
    }

    shouldReshuffle() {
        return this.penetration >= this.penetrationThreshold && this.cards.length < 52;
    }

    setPenetration(percentage) {
        this.penetrationThreshold = percentage;
    }

    getRemainingCards() {
        return this.cards.length;
    }

    getPenetration() {
        return this.penetration.toFixed(2);
    }
}

