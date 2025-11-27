pub fn card_value(card: u8) -> u8 {
    match card {
        1 => 11,          // Ace
        11 | 12 | 13 => 10,
        _ => card,
    }
}

pub fn hand_value(hand: &[u8]) -> (u8, bool) {
    let mut total = 0;
    let mut aces = 0;

    for &card in hand {
        total += card_value(card);
        if card == 1 { aces += 1; }
    }

    while total > 21 && aces > 0 {
        total -= 10;
        aces -= 1;
    }

    (total, aces > 0)
}

pub fn is_blackjack(hand: &[u8]) -> bool {
    hand.len() == 2 && hand_value(hand).0 == 21
}