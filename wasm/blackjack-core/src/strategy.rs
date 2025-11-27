use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyInput {
    #[serde(default)]
    pub count_based: Option<bool>,
    pub hard: serde_json::Value,
    pub soft: serde_json::Value,
    pub pairs: serde_json::Value,
    #[serde(default)]
    pub hard_by_count: serde_json::Value,
    #[serde(default)]
    pub soft_by_count: serde_json::Value,
    #[serde(default)]
    pub pairs_by_count: serde_json::Value,
}

#[derive(Debug, Copy, Clone, PartialEq, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum Action {
    Hit,
    Stand,
    Double,
    Split,
}

impl Action {
    pub fn from_code(code: &str) -> Action {
        match code {
            "S" => Action::Stand,
            "D" => Action::Double,
            "P" => Action::Split,
            _ => Action::Hit,
        }
    }

    pub fn as_code(&self) -> &'static str {
        match self {
            Action::Hit => "H",
            Action::Stand => "S",
            Action::Double => "D",
            Action::Split => "P",
        }
    }
}

type StrategyTable = HashMap<String, HashMap<String, String>>;
type StrategyCountTable = HashMap<String, StrategyTable>;

pub struct Strategy {
    count_based: bool,
    hard: StrategyTable,
    soft: StrategyTable,
    pairs: StrategyTable,
    hard_by_count: StrategyCountTable,
    soft_by_count: StrategyCountTable,
    pairs_by_count: StrategyCountTable,
}

impl Strategy {
    pub fn from_input(input: StrategyInput) -> Result<Self, String> {
        Ok(Strategy {
            count_based: input.count_based.unwrap_or(false),
            hard: value_to_table(input.hard)?,
            soft: value_to_table(input.soft)?,
            pairs: value_to_table(input.pairs)?,
            hard_by_count: value_to_count_table(input.hard_by_count)?,
            soft_by_count: value_to_count_table(input.soft_by_count)?,
            pairs_by_count: value_to_count_table(input.pairs_by_count)?,
        })
    }

    pub fn decide_action(
        &self,
        player_label: &str,
        dealer: &str,
        can_double: bool,
        can_split: bool,
        count: i32,
    ) -> Action {
        let pair_key = if can_split {
            pair_key_from_label(player_label)
        } else {
            None
        };
        if self.count_based && count != 0 {
            let count_key = count.to_string();
            if let Some(action) = self.lookup_count_action(
                &count_key,
                player_label,
                pair_key.as_deref(),
                dealer,
                can_double,
            ) {
                return action;
            }
        }

        if let Some(key) = pair_key.as_deref() {
            if let Some(action) = self.lookup_pair(key, dealer, can_double) {
                return action;
            }
        }

        let soft_or_hard_result = self.lookup_soft_or_hard(player_label, dealer, can_double);
        if let Some(action) = soft_or_hard_result {
            return action;
        }
        
        // If lookup failed, use default
        default_action(player_label)
    }

    fn lookup_count_action(
        &self,
        count_key: &str,
        player_label: &str,
        pair_key: Option<&str>,
        dealer: &str,
        can_double: bool,
    ) -> Option<Action> {
        if let Some(key) = pair_key {
            if let Some(action) =
                lookup_action(&self.pairs_by_count, count_key, key, dealer, can_double)
            {
                return Some(action);
            }
        }

        lookup_action(
            &self.soft_by_count,
            count_key,
            soft_table_key(player_label),
            dealer,
            can_double,
        )
        .or_else(|| {
            lookup_action(
                &self.hard_by_count,
                count_key,
                player_label,
                dealer,
                can_double,
            )
        })
    }

    fn lookup_pair(&self, key: &str, dealer: &str, can_double: bool) -> Option<Action> {
        lookup_action_map(&self.pairs, key, dealer, can_double)
    }

    fn lookup_soft_or_hard(&self, player_label: &str, dealer: &str, can_double: bool) -> Option<Action> {
        if player_label.starts_with('S') {
            let key = soft_table_key(player_label);
            let soft_result = lookup_action_map(&self.soft, key, dealer, can_double);
            if soft_result.is_some() {
                return soft_result;
            }
        }
        lookup_action_map(&self.hard, player_label, dealer, can_double)
    }
}

fn lookup_action_map(
    table: &StrategyTable,
    key: &str,
    dealer: &str,
    can_double: bool,
) -> Option<Action> {
    // Try to get the row for this player total
    let row = table.get(key)?;
    // Try to get the action for this dealer card
    let code = row.get(dealer)?;
    let mut action = Action::from_code(code);
    if matches!(action, Action::Double) && !can_double {
        action = Action::Hit;
    }
    Some(action)
}

fn lookup_action(
    count_table: &StrategyCountTable,
    count_key: &str,
    label: &str,
    dealer: &str,
    can_double: bool,
) -> Option<Action> {
    count_table
        .get(count_key)
        .and_then(|table| table.get(label))
        .and_then(|row| row.get(dealer))
        .map(|code| {
            let mut action = Action::from_code(code);
            if matches!(action, Action::Double) && !can_double {
                action = Action::Hit;
            }
            action
        })
}

fn soft_table_key<'a>(label: &'a str) -> &'a str {
    label.strip_prefix('S').unwrap_or(label)
}

fn card_value_from_rank(rank: &str) -> Option<u8> {
    match rank {
        "A" => Some(11),
        "K" | "Q" | "J" | "10" => Some(10),
        _ => rank.parse::<u8>().ok(),
    }
}

fn pair_key_from_label(label: &str) -> Option<String> {
    let parts: Vec<&str> = label.split(',').collect();
    if parts.len() != 2 {
        return None;
    }
    let first = parts[0].trim();
    let second = parts[1].trim();
    if first != second {
        return None;
    }
    card_value_from_rank(first).map(|value| value.to_string())
}

fn value_to_table(value: serde_json::Value) -> Result<StrategyTable, String> {
    let mut table = HashMap::new();
    let obj = value.as_object().ok_or("strategy table must be an object")?;
    for (key, row_value) in obj {
        let row_obj = row_value
            .as_object()
            .ok_or("strategy row must be an object")?;
        let mut row = HashMap::new();
        for (dealer, action) in row_obj {
            if let Some(action_str) = action.as_str() {
                row.insert(dealer.clone(), action_str.to_string());
            }
        }
        table.insert(key.clone(), row);
    }
    Ok(table)
}

fn value_to_count_table(value: serde_json::Value) -> Result<StrategyCountTable, String> {
    if value.is_null() {
        return Ok(HashMap::new());
    }
    let mut table = HashMap::new();
    let obj = value.as_object().ok_or("count table must be an object")?;
    for (count, inner) in obj {
        table.insert(count.clone(), value_to_table(inner.clone())?);
    }
    Ok(table)
}

fn default_action(player_label: &str) -> Action {
    if player_label.starts_with('S') {
        return Action::Stand;
    }
    if let Ok(total) = player_label.parse::<i32>() {
        if total < 17 {
            Action::Hit
        } else {
            Action::Stand
        }
    } else {
        // For pair labels like "7,7" or other non-numeric labels, default to Hit for safety
        Action::Hit
    }
}
