# Blackjack Simulator

A comprehensive blackjack simulator built with HTML, CSS, and JavaScript that allows you to configure game rules, set custom strategies, run simulations, and analyze specific situations.

## Features

### Game Settings
- **Number of Decks**: Configure how many decks to use (1-8)
- **Penetration Depth**: Set how deep into the deck to play before reshuffling (50-100%)
- **Dealer Rules**: Choose whether dealer stands on hard 17 or soft 17
- **Game Rules**: Configure double after split, resplit aces, and blackjack payouts

### Card Counting System
- **Multiple Counting Systems**: Choose from Hi-Lo, Hi-Opt I, Hi-Opt II, Omega II, KO, or Ace-Five
- **Running Count Tracking**: Automatically tracks running count as cards are dealt
- **True Count Calculation**: Calculates true count (running count / remaining decks) for accurate strategy adjustments
- **Count-Based Strategy**: Optionally adjust strategy based on true count
- **Count Statistics**: View expected value by count level after simulations

### Strategy Configuration
- **Interactive Strategy Tables**: Click cells to modify your strategy
  - Hard Totals: For hands without an ace counted as 11
  - Soft Totals: For hands with an ace counted as 11
  - Pairs: Strategy for when you can split
- **Pre-built Strategies**: Load basic strategy or optimal strategy
- **Custom Strategy**: Build your own strategy by clicking on cells
- **Count-Based Strategies**: Different strategies for different true count levels (when enabled)

### Simulation Engine
- Run thousands of simulations to find expected value
- Track win rate, return rate, and detailed statistics
- See wins, losses, pushes, and blackjacks
- **Count Statistics**: View distribution of counts and expected value by count level

### Situation Analysis
- Analyze specific situations (e.g., "16 vs 10")
- Compare all possible actions (Hit, Stand, Double, Split)
- See expected value and win rate for each action
- Find the optimal play for any situation

## How to Use

1. **Open the simulator**: Open `index.html` in a web browser

2. **Configure game settings**: Adjust the number of decks, penetration, and rules to match your game

3. **Enable card counting** (optional):
   - Check "Enable Card Counting"
   - Select a counting system (Hi-Lo is recommended for beginners)
   - Check "Use Count-Based Strategy" to adjust play based on count

4. **Set your strategy**:
   - Click on strategy table cells to change actions
   - Actions: H=Hit, S=Stand, D=Double, P=Split
   - Or load a pre-built strategy
   - If using count-based strategy, you can set different actions for different count levels

5. **Run simulations**:
   - Set number of simulations (recommended: 10,000+)
   - Set bet size
   - Click "Run Simulation" to see expected outcomes
   - If counting is enabled, view count statistics showing EV by count level

6. **Analyze specific situations**:
   - Enter your cards (e.g., "10,6" for 16)
   - Enter dealer up card (e.g., "10")
   - Check/uncheck if you can double or split
   - Click "Analyze Situation" to see best play and odds

## Example Usage

### Analyzing "16 vs 10"
1. Go to "Situation Analysis" panel
2. Enter "10,6" in "Your Cards"
3. Enter "10" in "Dealer Up Card"
4. Click "Analyze Situation"
5. Review the expected value for each action to find the best play

### Testing a Custom Strategy
1. Load basic strategy
2. Modify specific cells (e.g., change 16 vs 10 to Double instead of Stand)
3. Run 10,000+ simulations
4. Compare expected value to see if your modification improves results

## Technical Details

- Built with vanilla JavaScript (no dependencies)
- Uses proper card composition tracking for accurate simulations
- Implements full blackjack rules including splits, doubles, and dealer play
- Strategy matrices support hard totals (5-21), soft totals (13-21), and pairs (2-11)
- Card counting systems:
  - **Hi-Lo**: Balanced system, most popular (+1 for 2-6, 0 for 7-9, -1 for 10-A)
  - **Hi-Opt I/II**: More complex systems with different point values
  - **Omega II**: Advanced system with varied point values
  - **KO (Knockout)**: Unbalanced system, no true count conversion needed
  - **Ace-Five**: Simple system focusing on aces and fives

## Notes

- Higher simulation counts provide more accurate results but take longer
- Situation analysis removes known cards from the deck for accuracy
- The simulator respects penetration depth and reshuffles accordingly
- Strategy tables are color-coded: Red=Hit, Green=Stand, Orange=Double, Blue=Split
- **Card Counting**: True count = Running count / Remaining decks. Higher positive counts favor the player
- **Count-Based Strategy**: When enabled, the simulator uses different strategies for different count levels, allowing you to optimize play based on deck composition

