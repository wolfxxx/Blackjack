use serde::Serialize;

use crate::{
    counter::CardCounter,
    deck::{Card, Deck},
    strategy::{Action, Strategy},
};

#[derive(Clone)]
pub struct GameRules {
    pub dealer_hits_soft_17: bool,
    pub dealer_stands_on: String,
    pub double_after_split: bool,
    pub allow_resplit: bool,
    pub _resplit_aces: bool,
    pub blackjack_pays: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct HandRecord {
    pub cards: Vec<Card>,
    pub bet: f64,
    pub result: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GameResult {
    pub outcome: String,
    pub winnings: f64,
    pub bet: f64,
    pub player_cards: Vec<Card>,
    pub dealer_cards: Vec<Card>,
    pub dealer_up_card: Card,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_action: Option<Action>,
    pub hands: Vec<HandRecord>,
}

pub struct BlackjackGame {
    pub deck: Deck,
    pub rules: GameRules,
    pub counter: Option<CardCounter>,
}

impl BlackjackGame {
    pub fn new(deck: Deck, rules: GameRules, counter: Option<CardCounter>) -> Self {
        BlackjackGame { deck, rules, counter }
    }

    pub fn get_true_count(&self) -> f64 {
        if let Some(counter) = &self.counter {
            counter.true_count(self.deck.remaining_cards(), self.deck.num_decks)
        } else {
            0.0
        }
    }

    pub fn count_range(&self) -> i32 {
        if let Some(counter) = &self.counter {
            counter.count_range(self.deck.remaining_cards(), self.deck.num_decks)
        } else {
            0
        }
    }

    pub fn deal_card(&mut self) -> Card {
        let card = self.deck.deal_card();
        if let Some(counter) = &mut self.counter {
            counter.update(&card);
        }
        card
    }

    pub fn calculate_hand_value(&self, cards: &[Card]) -> (u8, bool) {
        let mut value = 0;
        let mut aces = 0;
        for card in cards {
            if card.rank == "A" {
                aces += 1;
                value += 11;
            } else {
                value += card.value;
            }
        }
        while value > 21 && aces > 0 {
            value -= 10;
            aces -= 1;
        }
        (value, aces > 0 && value <= 21)
    }

    pub fn is_blackjack(&self, cards: &[Card]) -> bool {
        cards.len() == 2 && self.calculate_hand_value(cards).0 == 21
    }

    pub fn can_split(&self, cards: &[Card]) -> bool {
        cards.len() == 2 && cards[0].value == cards[1].value
    }

    pub fn play_dealer(&mut self, dealer_cards: &[Card]) -> Vec<Card> {
        let mut hand = dealer_cards.to_vec();
        loop {
            let (value, is_soft) = self.calculate_hand_value(&hand);
            if value > 21 {
                break;
            }
            let stand_value = match self.rules.dealer_stands_on.as_str() {
                "17s" => 17,
                _ => {
                    if self.rules.dealer_hits_soft_17 && is_soft && value == 17 {
                        18
                    } else {
                        17
                    }
                }
            };
            if value >= stand_value {
                break;
            }
            hand.push(self.deal_card());
        }
        hand
    }

    fn dealer_card_value(card: &Card) -> String {
        if card.value == 11 {
            "A".to_string()
        } else {
            card.value.to_string()
        }
    }

    fn get_initial_action(&self, initial_cards: &[Card], hands: &[HandRecord]) -> Action {
        if hands.len() > 1 {
            return Action::Split;
        }
        if let Some(first_hand) = hands.first() {
            if first_hand.cards.len() == 3 && initial_cards.len() == 2 {
                return Action::Double;
            }
            if first_hand.cards.len() > initial_cards.len() {
                return Action::Hit;
            }
        }
        Action::Stand
    }

    fn strategy_pair_label(cards: &[Card]) -> Option<String> {
        if cards.len() != 2 {
            return None;
        }
        if cards[0].value != cards[1].value {
            return None;
        }
        let symbol = if cards[0].rank == "A" {
            "A".to_string()
        } else if cards[0].value == 10 {
            "10".to_string()
        } else {
            cards[0].value.to_string()
        };
        Some(format!("{},{}", symbol, symbol))
    }

    pub fn play_game(&mut self, strategy: &Strategy, bet_size: f64) -> GameResult {
        if self.deck.should_reshuffle() {
            self.deck.shuffle();
            if let Some(counter) = &mut self.counter {
                counter.reset();
            }
        }

        let player_cards = vec![self.deal_card(), self.deal_card()];
        let dealer_cards = vec![self.deal_card(), self.deal_card()];
        let dealer_up = dealer_cards[0].clone();

        // Check for player blackjack immediately (known after dealing)
        // If player has blackjack, treat it as Stand (no decision category needed)
        if self.is_blackjack(&player_cards) {
            // Check if dealer also has blackjack
            if self.is_blackjack(&dealer_cards) {
                return GameResult {
                    outcome: "push".to_string(),
                    winnings: 0.0,
                    bet: bet_size,
                    player_cards: player_cards.clone(),
                    dealer_cards: dealer_cards.clone(),
                    dealer_up_card: dealer_up,
                    initial_action: Some(Action::Stand), // Count as Stand
                    hands: vec![HandRecord { cards: player_cards, bet: 1.0, result: None }],
                };
            } else {
                // Player has blackjack, dealer doesn't - automatic win
                let payout = match self.rules.blackjack_pays.as_str() {
                    "6:5" => 1.2,
                    "1:1" => 1.0,
                    _ => 1.5,
                };
                return GameResult {
                    outcome: "blackjack".to_string(),
                    winnings: bet_size * payout,
                    bet: bet_size,
                    player_cards: player_cards.clone(),
                    dealer_cards: dealer_cards.clone(),
                    dealer_up_card: dealer_up,
                    initial_action: Some(Action::Stand), // Count as Stand
                    hands: vec![HandRecord { cards: player_cards, bet: 1.0, result: None }],
                };
            }
        }

        let mut hands = vec![HandRecord { cards: player_cards.clone(), bet: 1.0, result: None }];
        let mut total_bet_units = 1.0;
        let mut hand_index = 0usize;
        let mut initial_action: Option<Action> = None; // Track the actual initial action
        let mut initial_action_set = false; // Track if we've set the initial action yet

        while hand_index < hands.len() {
            // Check if we've split by seeing if there are multiple hands
            let has_split = hands.len() > 1;
            // Determine if this hand can be split
            // For the first hand before any splits: can always split if it's a pair
            // For hands after a split: can resplit if resplitting is allowed
            let is_pair = self.can_split(&hands[hand_index].cards);
            let is_ace_pair = is_pair && hands[hand_index].cards.len() == 2 && 
                             hands[hand_index].cards[0].rank == "A";
            let can_resplit = if has_split {
                if is_ace_pair {
                    self.rules._resplit_aces
                } else {
                    self.rules.allow_resplit
                }
            } else {
                true // First hand can always split if it's a pair
            };
            let can_split = is_pair && can_resplit;
            loop {
                // Recalculate can_double each iteration (important after splits)
                // If we've split (hands.len() > 1), all hands should use double_after_split rule
                // Otherwise, first hand can always double
                let has_split_now = hands.len() > 1;
                // For the original first hand before any splits: can always double
                // For any hand after a split: can double only if double_after_split rule is enabled
                let can_double = if hands[hand_index].cards.len() == 2 {
                    if !has_split_now {
                        // No split yet, first hand can always double
                        hand_index == 0
                    } else {
                        // Split has occurred, check double_after_split rule
                        self.rules.double_after_split
                    }
                } else {
                    false
                };
                
                let (value, is_soft) = self.calculate_hand_value(&hands[hand_index].cards);
                // Recalculate is_pair inside the loop (cards may have been added)
                let is_pair_now = self.can_split(&hands[hand_index].cards);
                let is_ace_pair_now = is_pair_now && hands[hand_index].cards.len() == 2 && 
                                     hands[hand_index].cards[0].rank == "A";
                let can_resplit_now = if has_split_now && is_pair_now {
                    if is_ace_pair_now {
                        self.rules._resplit_aces
                    } else {
                        self.rules.allow_resplit
                    }
                } else {
                    !has_split_now && is_pair_now // First hand can always split if it's a pair
                };
                // Use pair strategy if it's a pair and either:
                // 1. No split has occurred yet, OR
                // 2. Resplitting is allowed (and for aces, resplit_aces must be enabled)
                let pair_strategy_label = if is_pair_now && (!has_split_now || can_resplit_now) {
                    Self::strategy_pair_label(&hands[hand_index].cards)
                } else {
                    None
                };
                if value >= 21 {
                    break;
                }
                let player_label = if let Some(pair_label) = pair_strategy_label.clone() {
                    pair_label
                } else if is_soft {
                    format!("S{}", value)
                } else {
                    value.to_string()
                };
                let dealer_label = Self::dealer_card_value(&dealer_up);
                let count = self.count_range();
                // can_split_for_strategy: allow split if it's a pair and resplitting is allowed
                let can_split_for_strategy = is_pair_now && can_resplit_now;
                let action = strategy.decide_action(
                    &player_label,
                    &dealer_label,
                    can_double,
                    can_split_for_strategy,
                    count,
                );
                
                // Track the initial action (first decision for the first hand, before any splits)
                if !initial_action_set && hand_index == 0 && hands.len() == 1 && hands[hand_index].cards.len() == player_cards.len() {
                    initial_action = Some(action);
                    initial_action_set = true;
                }

                match action {
                    Action::Hit => {
                        hands[hand_index].cards.push(self.deal_card());
                        if self.calculate_hand_value(&hands[hand_index].cards).0 > 21 {
                            hands[hand_index].result = Some("lose".to_string());
                            break;
                        }
                    }
                    Action::Stand => break,
                    Action::Double => {
                        // Allow double on first hand or on split hands if double_after_split is enabled
                        if hands[hand_index].cards.len() == 2 && can_double {
                            hands[hand_index].bet *= 2.0;
                            total_bet_units += hands[hand_index].bet / 2.0;
                            hands[hand_index].cards.push(self.deal_card());
                            break;
                        } else {
                            hands[hand_index].cards.push(self.deal_card());
                            if self.calculate_hand_value(&hands[hand_index].cards).0 > 21 {
                                hands[hand_index].result = Some("lose".to_string());
                            }
                            break;
                        }
                    }
                    Action::Split => {
                        if hands[hand_index].cards.len() == 2 && can_split_for_strategy {
                            let card = hands[hand_index].cards.pop().unwrap();
                        let new_hand = HandRecord {
                                cards: vec![card, self.deal_card()],
                                bet: hands[hand_index].bet,
                                result: None,
                            };
                            hands[hand_index].cards.push(self.deal_card());
                            total_bet_units += new_hand.bet;
                            hands.push(new_hand);
                            // has_split is now automatically true since hands.len() > 1
                            continue;
                        } else {
                            hands[hand_index].cards.push(self.deal_card());
                            if self.calculate_hand_value(&hands[hand_index].cards).0 > 21 {
                                hands[hand_index].result = Some("lose".to_string());
                                break;
                            }
                        }
                    }
                }
            }
            hand_index += 1;
        }

        // Now check for dealer blackjack (after player has made decisions)
        // Player blackjack was already handled earlier, so we only check dealer here
        let dealer_has_blackjack = self.is_blackjack(&dealer_cards);
        
        if dealer_has_blackjack {
            // Dealer has blackjack, player doesn't - player loses all hands
            let mut total_winnings = 0.0;
            for hand in &hands {
                total_winnings -= bet_size * hand.bet;
            }
            return GameResult {
                outcome: "lose".to_string(),
                winnings: total_winnings,
                bet: bet_size * total_bet_units,
                player_cards: player_cards.clone(),
                dealer_cards: dealer_cards.clone(),
                dealer_up_card: dealer_up,
                initial_action: initial_action, // Player made decision before dealer revealed
                hands: hands.clone(),
            };
        }
        
        // No blackjack, play dealer normally
        let dealer_final = self.play_dealer(&dealer_cards);
        let dealer_value = self.calculate_hand_value(&dealer_final).0;
        let dealer_bust = dealer_value > 21;

        let mut total_winnings = 0.0;
        for hand in &mut hands {
            let bet = bet_size * hand.bet;
            if let Some(result) = &hand.result {
                if result == "lose" {
                    total_winnings -= bet;
                    continue;
                }
            }
            let player_value = self.calculate_hand_value(&hand.cards).0;
            if player_value > 21 {
                total_winnings -= bet;
            } else if dealer_bust || player_value > dealer_value {
                total_winnings += bet;
            } else if player_value < dealer_value {
                total_winnings -= bet;
            }
        }

        let outcome = if total_winnings > 0.0 {
            "win"
        } else if total_winnings < 0.0 {
            "lose"
        } else {
            "push"
        }
        .to_string();

        GameResult {
            outcome,
            winnings: total_winnings,
            bet: bet_size * total_bet_units,
            player_cards,
            dealer_cards: dealer_final,
            dealer_up_card: dealer_up,
            initial_action,
            hands,
        }
    }
}

