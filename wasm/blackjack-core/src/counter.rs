use std::collections::HashMap;

use crate::deck::Card;

pub struct CardCounter {
    running_count: f64,
    values: HashMap<String, i32>,
}

impl CardCounter {
    pub fn new(system: Option<String>, custom_values: Option<HashMap<String, i32>>) -> Self {
        let system_name = system.unwrap_or_else(|| "Hi-Lo".to_string());
        let values = if system_name == "Custom" {
            custom_values.unwrap_or_default()
        } else {
            default_system_values(&system_name)
        };
        CardCounter {
            running_count: 0.0,
            values,
        }
    }

    pub fn update(&mut self, card: &Card) {
        let value = self.values.get(&card.rank).copied().unwrap_or(0);
        self.running_count += value as f64;
    }

    pub fn reset(&mut self) {
        self.running_count = 0.0;
    }

    pub fn true_count(&self, remaining_cards: usize, num_decks: u8) -> f64 {
        let remaining_decks = remaining_cards as f64 / 52.0;
        let decks = remaining_decks.max(0.5).min(num_decks as f64);
        if decks <= 0.0 {
            0.0
        } else {
            self.running_count / decks
        }
    }

    pub fn count_range(&self, remaining_cards: usize, num_decks: u8) -> i32 {
        self.true_count(remaining_cards, num_decks).round() as i32
    }
}

fn default_system_values(system: &str) -> HashMap<String, i32> {
    let mut values = HashMap::new();
    let template = match system {
        "Hi-Lo" => vec![
            ("2", 1), ("3", 1), ("4", 1), ("5", 1), ("6", 1),
            ("7", 0), ("8", 0), ("9", 0),
            ("10", -1), ("J", -1), ("Q", -1), ("K", -1), ("A", -1),
        ],
        "Hi-Opt I" => vec![
            ("2", 0), ("3", 1), ("4", 1), ("5", 1), ("6", 1),
            ("7", 0), ("8", 0), ("9", 0),
            ("10", -1), ("J", -1), ("Q", -1), ("K", -1), ("A", 0),
        ],
        "Hi-Opt II" => vec![
            ("2", 1), ("3", 1), ("4", 2), ("5", 2), ("6", 1),
            ("7", 1), ("8", 0), ("9", 0),
            ("10", -2), ("J", -2), ("Q", -2), ("K", -2), ("A", 0),
        ],
        "Omega II" => vec![
            ("2", 1), ("3", 1), ("4", 2), ("5", 2), ("6", 2),
            ("7", 1), ("8", 0), ("9", -1),
            ("10", -2), ("J", -2), ("Q", -2), ("K", -2), ("A", 0),
        ],
        "KO (Knockout)" => vec![
            ("2", 1), ("3", 1), ("4", 1), ("5", 1), ("6", 1), ("7", 1),
            ("8", 0), ("9", 0),
            ("10", -1), ("J", -1), ("Q", -1), ("K", -1), ("A", -1),
        ],
        "Ace-Five" => vec![
            ("2", 0), ("3", 0), ("4", 0), ("5", 1), ("6", 0),
            ("7", 0), ("8", 0), ("9", 0),
            ("10", 0), ("J", 0), ("Q", 0), ("K", 0), ("A", -1),
        ],
        _ => vec![
            ("2", 1), ("3", 1), ("4", 1), ("5", 1), ("6", 1),
            ("7", 0), ("8", 0), ("9", 0),
            ("10", -1), ("J", -1), ("Q", -1), ("K", -1), ("A", -1),
        ],
    };
    for (rank, value) in template {
        values.insert(rank.to_string(), value);
    }
    values
}

