use js_sys::Function;
use wasm_bindgen::prelude::*;

mod counter;
mod deck;
mod game;
mod strategy;
mod sim;

#[wasm_bindgen]
pub fn run_simulation(params: &JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input: sim::SimulationInput = serde_wasm_bindgen::from_value(params.clone())
        .map_err(|err| JsValue::from_str(&format!("Invalid input: {err}")))?;

    let result = sim::run(input)
        .map_err(|err| JsValue::from_str(&format!("Simulation failed: {err}")))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("Serialization failed: {err}")))
}

#[wasm_bindgen]
pub fn run_simulation_with_progress(
    params: &JsValue,
    progress_callback: &Function,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input: sim::SimulationInput = serde_wasm_bindgen::from_value(params.clone())
        .map_err(|err| JsValue::from_str(&format!("Invalid input: {err}")))?;

    let mut progress_cb = |current: u32, total: u32| {
        let _ = progress_callback.call2(
            &JsValue::NULL,
            &JsValue::from(current),
            &JsValue::from(total),
        );
    };

    let result = sim::run_with_progress(input, &mut progress_cb)
        .map_err(|err| JsValue::from_str(&format!("Simulation failed: {err}")))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("Serialization failed: {err}")))
}

#[wasm_bindgen]
pub fn run_spot_check(params: &JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input: sim::SpotCheckInput = serde_wasm_bindgen::from_value(params.clone())
        .map_err(|err| JsValue::from_str(&format!("Invalid input: {err}")))?;

    let result = sim::run_spot_check(input)
        .map_err(|err| JsValue::from_str(&format!("Spot check failed: {err}")))?;

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("Serialization failed: {err}")))
}

#[wasm_bindgen]
pub fn play_single_game(params: &JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input: sim::SimulationInput = serde_wasm_bindgen::from_value(params.clone())
        .map_err(|err| JsValue::from_str(&format!("Invalid input: {err}")))?;

    let strategy = strategy::Strategy::from_input(input.strategy)
        .map_err(|err| JsValue::from_str(&format!("Strategy error: {err}")))?;
    let penetration = input.rules.penetration_threshold.unwrap_or(75);
    let deck = deck::Deck::new(input.num_decks, penetration, input.seed);
    let game_rules = sim::to_game_rules(&input.rules);
    let counter = sim::build_counter(input.counting);
    let mut game = game::BlackjackGame::new(deck, game_rules, counter);

    let bet_size = input.bet_size.max(1.0);
    let result = game.play_game(&strategy, bet_size);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("Serialization failed: {err}")))
}