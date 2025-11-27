use rand::{rngs::SmallRng, seq::SliceRandom, SeedableRng};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct Card {
    pub rank: String,
    pub value: u8,
}

impl Card {
    pub fn new(rank: &str) -> Self {
        let value = match rank {
            "A" => 11,
            "J" | "Q" | "K" | "10" => 10,
            _ => rank.parse::<u8>().unwrap_or(0),
        };
        Card {
            rank: rank.to_string(),
            value,
        }
    }
}

pub struct Deck {
    pub num_decks: u8,
    cards: Vec<Card>,
    used_cards: Vec<Card>,
    penetration_threshold: u8,
    penetration: f64,
    rng: SmallRng,
}

impl Deck {
    pub fn new(num_decks: u8, penetration_threshold: u8, seed: u64) -> Self {
        let mut deck = Deck {
            num_decks,
            cards: Vec::new(),
            used_cards: Vec::new(),
            penetration_threshold,
            penetration: 0.0,
            rng: SmallRng::seed_from_u64(seed),
        };
        deck.shuffle();
        deck
    }

    pub fn shuffle(&mut self) {
        let ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
        self.cards.clear();
        self.used_cards.clear();

        for _ in 0..self.num_decks {
            for rank in &ranks {
                for _ in 0..4 {
                    self.cards.push(Card::new(rank));
                }
            }
        }

        self.cards.shuffle(&mut self.rng);
        self.penetration = 0.0;
    }

    pub fn deal_card(&mut self) -> Card {
        if self.cards.is_empty() {
            self.shuffle();
        }
        let card = self.cards.pop().expect("deck should not be empty");
        self.used_cards.push(card.clone());
        let total_cards = (self.num_decks as usize) * 52;
        let used = self.used_cards.len();
        self.penetration = (used as f64 / total_cards as f64) * 100.0;
        card
    }

    pub fn remaining_cards(&self) -> usize {
        self.cards.len()
    }

    pub fn should_reshuffle(&self) -> bool {
        self.penetration >= self.penetration_threshold as f64 && self.cards.len() < 52
    }

    pub fn remove_card_by_rank(&mut self, rank: &str) -> bool {
        if let Some(pos) = self.cards.iter().position(|c| c.rank == rank) {
            self.cards.remove(pos);
            true
        } else {
            false
        }
    }
}