use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{
    counter::CardCounter,
    deck::{Card, Deck},
    game::{BlackjackGame, GameResult, GameRules},
    strategy::{Strategy, StrategyInput},
};

fn default_bet_size() -> f64 {
    100.0
}

fn default_progress_interval() -> u32 {
    10_000
}

#[derive(Debug, Deserialize)]
pub struct RulesInput {
    pub dealer_hits_soft_17: bool,
    #[serde(default)]
    pub dealer_stands_on: Option<String>,
    #[serde(default)]
    pub double_after_split: Option<bool>,
    #[serde(default)]
    pub allow_resplit: Option<bool>,
    #[serde(default)]
    pub resplit_aces: Option<bool>,
    #[serde(default)]
    pub blackjack_pays: Option<String>,
    #[serde(default)]
    pub penetration_threshold: Option<u8>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CountingInput {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub system: Option<String>,
    #[serde(default)]
    pub custom_values: Option<HashMap<String, i32>>,
}

#[derive(Debug, Deserialize)]
pub struct SimulationInput {
    pub num_decks: u8,
    pub iterations: u32,
    pub seed: u64,
    pub strategy: StrategyInput,
    pub rules: RulesInput,
    #[serde(default = "default_bet_size")]
    pub bet_size: f64,
    #[serde(default = "default_progress_interval")]
    pub progress_interval: u32,
    #[serde(default)]
    pub counting: Option<CountingInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResult {
    pub total_games: u32,
    pub wins: u32,
    pub losses: u32,
    pub pushes: u32,
    pub blackjacks: u32,
    pub total_winnings: f64,
    pub total_bet: f64,
    pub expected_value: f64,
    pub win_rate: f64,
    pub return_rate: f64,
    pub count_stats: Option<CountStats>,
    pub cell_stats: HashMap<String, CellStats>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountStats {
    pub total_hands: u32,
    pub count_distribution: HashMap<String, u32>,
    pub ev_by_count: HashMap<String, f64>,
    pub hands_by_count: HashMap<String, u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellStats {
    pub player_total: String,
    pub dealer_card: String,
    pub action: String,
    pub count: i32,
    pub hands: u32,
    pub wins: u32,
    pub losses: u32,
    pub pushes: u32,
    pub total_winnings: f64,
    pub total_bet: f64,
}

pub fn run(input: SimulationInput) -> Result<SimulationResult, String> {
    run_with_progress(input, |_current, _total| {})
}

pub fn run_with_progress<F>(input: SimulationInput, mut progress_cb: F) -> Result<SimulationResult, String>
where
    F: FnMut(u32, u32),
{
    let strategy = Strategy::from_input(input.strategy)?;
    let penetration = input.rules.penetration_threshold.unwrap_or(75);
    let deck = Deck::new(input.num_decks, penetration, input.seed);
    let game_rules = to_game_rules(&input.rules);
    let counter = build_counter(input.counting.clone());
    let counting_enabled = counter.is_some();
    let mut game = BlackjackGame::new(deck, game_rules, counter);

    let mut wins = 0;
    let mut losses = 0;
    let mut pushes = 0;
    let mut blackjacks = 0;
    let mut total_winnings = 0.0;
    let mut total_bet = 0.0;
    let mut cell_stats: HashMap<String, CellStats> = HashMap::new();
    let mut count_stats = init_count_stats();

    let bet_size = input.bet_size.max(1.0);
    let progress_interval = input.progress_interval.max(1);

    for game_index in 0..input.iterations {
        let count_range = game.count_range();
        let true_count = game.get_true_count();
        if counting_enabled {
            update_count_stats_pregame(&mut count_stats, true_count);
        }

        let result = game.play_game(&strategy, bet_size);

        match result.outcome.as_str() {
            "win" => wins += 1,
            "lose" => losses += 1,
            "push" => pushes += 1,
            "blackjack" => {
                wins += 1;
                blackjacks += 1;
            }
            _ => {}
        }

        total_winnings += result.winnings;
        total_bet += result.bet;

        if counting_enabled {
            update_count_stats_postgame(&mut count_stats, true_count, result.winnings);
        }

        track_cell_stats(&result, count_range, &mut cell_stats);

        let completed = game_index + 1;
        if completed % progress_interval == 0 || completed == input.iterations {
            progress_cb(completed, input.iterations);
        }
    }

    finalize_count_stats(&mut count_stats);

    let mut agg_wins: u32 = 0;
    let mut agg_losses: u32 = 0;
    let mut agg_pushes: u32 = 0;
    let mut agg_hands: u32 = 0;
    let aggregated_bet: f64 = cell_stats.values().map(|c| c.total_bet).sum();
    let aggregated_winnings: f64 = cell_stats.values().map(|c| c.total_winnings).sum();
    for cell in cell_stats.values() {
        agg_wins += cell.wins;
        agg_losses += cell.losses;
        agg_pushes += cell.pushes;
        agg_hands += cell.hands;
    }
    let total_games = agg_hands.max(input.iterations);
    wins = agg_wins;
    losses = agg_losses;
    pushes = agg_pushes;
    total_bet = aggregated_bet;
    total_winnings = aggregated_winnings;
    let expected_value = if total_games > 0 {
        total_winnings / total_games as f64
    } else {
        0.0
    };
    let win_rate = if total_games > 0 {
        (wins as f64 / total_games as f64) * 100.0
    } else {
        0.0
    };
    let return_rate = if total_bet.abs() > f64::EPSILON {
        (total_winnings / total_bet) * 100.0
    } else {
        0.0
    };

    Ok(SimulationResult {
        total_games,
        wins,
        losses,
        pushes,
        blackjacks,
        total_winnings,
        total_bet,
        expected_value,
        win_rate,
        return_rate,
        count_stats: if counting_enabled {
            Some(count_stats)
        } else {
            None
        },
        cell_stats,
    })
}

pub fn to_game_rules(rules: &RulesInput) -> GameRules {
    GameRules {
        dealer_hits_soft_17: rules.dealer_hits_soft_17,
        dealer_stands_on: rules
            .dealer_stands_on
            .clone()
            .unwrap_or_else(|| "17".to_string()),
        double_after_split: rules.double_after_split.unwrap_or(true),
        allow_resplit: rules.allow_resplit.unwrap_or(true),
        _resplit_aces: rules.resplit_aces.unwrap_or(false),
        blackjack_pays: rules
            .blackjack_pays
            .clone()
            .unwrap_or_else(|| "3:2".to_string()),
    }
}

pub fn build_counter(config: Option<CountingInput>) -> Option<CardCounter> {
    let cfg = config?;
    if !cfg.enabled {
        return None;
    }
    Some(CardCounter::new(cfg.system.clone(), cfg.custom_values.clone()))
}

fn init_count_stats() -> CountStats {
    CountStats {
        total_hands: 0,
        count_distribution: HashMap::new(),
        ev_by_count: HashMap::new(),
        hands_by_count: HashMap::new(),
    }
}

fn update_count_stats_pregame(stats: &mut CountStats, true_count: f64) {
    let count_bucket = true_count.round() as i32;
    let key = count_bucket.to_string();
    *stats.count_distribution.entry(key.clone()).or_default() += 1;
    *stats.hands_by_count.entry(key).or_default() += 1;
    stats.total_hands += 1;
}

fn update_count_stats_postgame(stats: &mut CountStats, true_count: f64, winnings: f64) {
    let count_bucket = true_count.round() as i32;
    let key = count_bucket.to_string();
    *stats.ev_by_count.entry(key).or_default() += winnings;
}

fn finalize_count_stats(stats: &mut CountStats) {
    for (key, total) in stats.hands_by_count.clone() {
        if total > 0 {
            if let Some(sum) = stats.ev_by_count.get_mut(&key) {
                *sum /= total as f64;
            }
        }
    }
}

fn track_cell_stats(result: &GameResult, count_key: i32, cell_stats: &mut HashMap<String, CellStats>) {
    let player_total = describe_player_total(&result.player_cards);
    let dealer_card = describe_dealer_card(&result.dealer_up_card);
    // Skip tracking if no initial action (early return, e.g., dealer blackjack)
    let action_code = match result.initial_action {
        Some(action) => action.as_code(),
        None => return, // Skip tracking for early returns
    };
    let key = format!("{player_total}_{dealer_card}_{action_code}_{count_key}");

    let entry = cell_stats.entry(key).or_insert(CellStats {
        player_total: player_total.clone(),
        dealer_card: dealer_card.clone(),
        action: action_code.to_string(),
        count: count_key,
        hands: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        total_winnings: 0.0,
        total_bet: 0.0,
    });

    entry.hands += 1;
    entry.total_bet += result.bet;
    entry.total_winnings += result.winnings;

    match result.outcome.as_str() {
        "win" | "blackjack" => entry.wins += 1,
        "lose" => entry.losses += 1,
        _ => entry.pushes += 1,
    }
}

fn describe_player_total(cards: &[Card]) -> String {
    if cards.len() == 2 && cards[0].value == cards[1].value {
        return format!("{},{}", cards[0].rank, cards[1].rank);
    }
    let (value, is_soft) = calculate_value(cards);
    if is_soft {
        format!("S{}", value)
    } else {
        value.to_string()
    }
}

fn describe_dealer_card(card: &Card) -> String {
    if card.rank == "A" {
        "A".to_string()
    } else if card.value == 10 {
        "10".to_string()
    } else {
        card.value.to_string()
    }
}

fn calculate_value(cards: &[Card]) -> (u8, bool) {
    let mut value = 0;
    let mut aces = 0;
    for card in cards {
        if card.rank == "A" {
            value += 11;
            aces += 1;
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

#[derive(Debug, Deserialize)]
pub struct SpotCheckInput {
    pub num_decks: u8,
    pub iterations: u32,
    pub seed: u64,
    pub strategy: StrategyInput,
    pub rules: RulesInput,
    #[serde(default = "default_bet_size")]
    pub bet_size: f64,
    pub player_cards: Vec<String>,
    pub dealer_card: String,
    pub forced_action: String,
    #[serde(default)]
    pub counting: Option<CountingInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotCheckResult {
    pub total_games: u32,
    pub wins: u32,
    pub losses: u32,
    pub pushes: u32,
    pub total_winnings: f64,
    pub total_bet: f64,
    pub expected_value: f64,
    pub win_rate: f64,
    pub return_rate: f64,
}

pub fn run_spot_check(input: SpotCheckInput) -> Result<SpotCheckResult, String> {
    let strategy = Strategy::from_input(input.strategy)?;
    let game_rules = to_game_rules(&input.rules);
    
    let mut wins = 0;
    let mut losses = 0;
    let mut pushes = 0;
    let mut total_winnings = 0.0;
    let mut total_bet = 0.0;
    
    let bet_size = input.bet_size.max(1.0);
    let mut rng_seed = input.seed;
    
    for _ in 0..input.iterations {
        let mut deck = Deck::new(input.num_decks, 100, rng_seed);
        rng_seed = rng_seed.wrapping_add(1);
        
        for card_rank in &input.player_cards {
            deck.remove_card_by_rank(card_rank);
        }
        deck.remove_card_by_rank(&input.dealer_card);
        
        let counter_for_game = build_counter(input.counting.clone());
        let mut game = BlackjackGame::new(deck, game_rules.clone(), counter_for_game);
        
        let player_cards: Vec<Card> = input.player_cards.iter()
            .map(|r| Card::new(r))
            .collect();
        let dealer_up = Card::new(&input.dealer_card);
        
        let dealer_hole = game.deal_card();
        let dealer_cards = vec![dealer_up.clone(), dealer_hole];
        
        if game.is_blackjack(&player_cards) {
            if game.is_blackjack(&dealer_cards) {
                pushes += 1;
                total_bet += bet_size;
                continue;
            } else {
                let payout = match game_rules.blackjack_pays.as_str() {
                    "6:5" => 1.2,
                    "1:1" => 1.0,
                    _ => 1.5,
                };
                wins += 1;
                total_winnings += bet_size * payout;
                total_bet += bet_size;
                continue;
            }
        }
        
        if game.is_blackjack(&dealer_cards) {
            losses += 1;
            total_winnings -= bet_size;
            total_bet += bet_size;
            continue;
        }
        
        let dealer_label = if dealer_up.value == 11 {
            "A".to_string()
        } else {
            dealer_up.value.to_string()
        };
        
        let mut hands = vec![crate::game::HandRecord {
            cards: player_cards.clone(),
            bet: 1.0,
            result: None,
        }];
        
        let action = match input.forced_action.as_str() {
            "D" => crate::strategy::Action::Double,
            "P" => crate::strategy::Action::Split,
            "S" => crate::strategy::Action::Stand,
            _ => crate::strategy::Action::Hit,
        };
        
        let can_double = player_cards.len() == 2;
        let is_pair = player_cards.len() == 2 && game.can_split(&player_cards);
        
        match action {
            crate::strategy::Action::Split => {
                if is_pair && player_cards.len() == 2 {
                    let card = hands[0].cards.pop().unwrap();
                    let new_hand = crate::game::HandRecord {
                        cards: vec![card, game.deal_card()],
                        bet: 1.0,
                        result: None,
                    };
                    hands[0].cards.push(game.deal_card());
                    hands.push(new_hand);
                }
            }
            crate::strategy::Action::Double => {
                if can_double && player_cards.len() == 2 {
                    hands[0].cards.push(game.deal_card());
                }
            }
            crate::strategy::Action::Hit => {
                hands[0].cards.push(game.deal_card());
            }
            crate::strategy::Action::Stand => {}
        }
        
        if action == crate::strategy::Action::Split {
            // We're already in split hands, so any pair is a potential resplit
            let mut i = 0;
            while i < hands.len() {
                if game.calculate_hand_value(&hands[i].cards).0 > 21 {
                    hands[i].result = Some("lose".to_string());
                    i += 1;
                    continue;
                }
                while game.calculate_hand_value(&hands[i].cards).0 < 21 {
                    let (value, is_soft) = game.calculate_hand_value(&hands[i].cards);
                    // Check if this is a pair and if resplitting is allowed
                    let is_pair = game.can_split(&hands[i].cards);
                    let is_ace_pair = is_pair && hands[i].cards.len() == 2 && 
                                     hands[i].cards[0].rank == "A";
                    // We're already in split hands, so any pair is a potential resplit
                    // Check resplitting rules: aces use resplit_aces, others use allow_resplit
                    let can_resplit = is_pair ? (
                        if is_ace_pair {
                            game_rules._resplit_aces
                        } else {
                            game_rules.allow_resplit
                        }
                    ) : false;
                    
                    // Use pair strategy if it's a pair and resplitting is allowed
                    let player_label = if is_pair && can_resplit {
                        // Use pair strategy
                        let first = &hands[i].cards[0];
                        let normalized = if first.rank == "A" {
                            "A".to_string()
                        } else if first.value == 10 {
                            "10".to_string()
                        } else {
                            first.value.to_string()
                        };
                        format!("{},{}", normalized, normalized)
                    } else if is_soft {
                        format!("S{}", value)
                    } else {
                        value.to_string()
                    };
                    let count = game.count_range();
                    let can_double_after_split = game_rules.double_after_split && hands[i].cards.len() == 2;
                    let hand_action = strategy.decide_action(
                        &player_label,
                        &dealer_label,
                        can_double_after_split,
                        can_resplit,
                        count,
                    );
                    
                    match hand_action {
                        crate::strategy::Action::Hit => {
                            hands[i].cards.push(game.deal_card());
                            if game.calculate_hand_value(&hands[i].cards).0 > 21 {
                                break;
                            }
                        }
                        crate::strategy::Action::Double => {
                            if can_double_after_split {
                                hands[i].bet *= 2.0;
                                hands[i].cards.push(game.deal_card());
                                break; // Double gets exactly one card
                            } else {
                                // Can't double, hit instead
                                hands[i].cards.push(game.deal_card());
                                if game.calculate_hand_value(&hands[i].cards).0 > 21 {
                                    break;
                                }
                            }
                        }
                        crate::strategy::Action::Split => {
                            if can_resplit && hands[i].cards.len() == 2 {
                                // Resplit
                                let card = hands[i].cards.pop().unwrap();
                                let new_hand = crate::game::HandRecord {
                                    cards: vec![card, game.deal_card()],
                                    bet: hands[i].bet,
                                    result: None,
                                };
                                hands[i].cards.push(game.deal_card());
                                hands.push(new_hand);
                                // Continue with this hand (don't increment i yet)
                                continue;
                            } else {
                                // Can't split, hit instead
                                hands[i].cards.push(game.deal_card());
                                if game.calculate_hand_value(&hands[i].cards).0 > 21 {
                                    break;
                                }
                            }
                        }
                        _ => break,
                    }
                }
                if game.calculate_hand_value(&hands[i].cards).0 > 21 {
                    hands[i].result = Some("lose".to_string());
                }
                i += 1;
            }
        } else if action == crate::strategy::Action::Hit {
            if game.calculate_hand_value(&hands[0].cards).0 > 21 {
                hands[0].result = Some("lose".to_string());
            } else {
                while game.calculate_hand_value(&hands[0].cards).0 < 21 {
                    let (value, is_soft) = game.calculate_hand_value(&hands[0].cards);
                    let player_label = if is_soft {
                        format!("S{}", value)
                    } else {
                        value.to_string()
                    };
                    let count = game.count_range();
                    let hand_action = strategy.decide_action(
                        &player_label,
                        &dealer_label,
                        false,
                        false,
                        count,
                    );
                    
                    match hand_action {
                        crate::strategy::Action::Hit => {
                            hands[0].cards.push(game.deal_card());
                            if game.calculate_hand_value(&hands[0].cards).0 > 21 {
                                break;
                            }
                        }
                        _ => break,
                    }
                }
                if game.calculate_hand_value(&hands[0].cards).0 > 21 {
                    hands[0].result = Some("lose".to_string());
                }
            }
        } else if game.calculate_hand_value(&hands[0].cards).0 > 21 {
            hands[0].result = Some("lose".to_string());
        }
        
        let dealer_final = game.play_dealer(&dealer_cards);
        let dealer_value = game.calculate_hand_value(&dealer_final).0;
        let dealer_bust = dealer_value > 21;
        
        // Calculate total bet from all hands (accounts for double after split)
        let total_hand_bets: f64 = hands.iter().map(|h| h.bet).sum();
        
        let mut hand_winnings = 0.0;
        for hand in &hands {
            let bet_amount = bet_size * hand.bet;
            if let Some(result) = &hand.result {
                if result == "lose" {
                    hand_winnings -= bet_amount;
                    continue;
                }
            }
            let player_value = game.calculate_hand_value(&hand.cards).0;
            if player_value > 21 {
                hand_winnings -= bet_amount;
            } else if dealer_bust || player_value > dealer_value {
                hand_winnings += bet_amount;
            } else if player_value < dealer_value {
                hand_winnings -= bet_amount;
            }
        }
        
        total_winnings += hand_winnings;
        total_bet += bet_size * total_hand_bets;
        
        if hand_winnings > 0.0 {
            wins += 1;
        } else if hand_winnings < 0.0 {
            losses += 1;
        } else {
            pushes += 1;
        }
    }
    
    let total_games = input.iterations;
    let expected_value = if total_games > 0 {
        total_winnings / total_games as f64
    } else {
        0.0
    };
    let win_rate = if total_games > 0 {
        (wins as f64 / total_games as f64) * 100.0
    } else {
        0.0
    };
    let return_rate = if total_bet.abs() > f64::EPSILON {
        (total_winnings / total_bet) * 100.0
    } else {
        0.0
    };
    
    Ok(SpotCheckResult {
        total_games,
        wins,
        losses,
        pushes,
        total_winnings,
        total_bet,
        expected_value,
        win_rate,
        return_rate,
    })
}
