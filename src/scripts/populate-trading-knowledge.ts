import dotenv from 'dotenv';
import { MemoryService } from '../memory/MemoryService';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';

dotenv.config();

/**
 * Populate mem0 with comprehensive trading knowledge
 * Run this once to initialize the agent's long-term memory
 */
async function populateTradingKnowledge() {
  console.log('🧠 Populating mem0 with trading knowledge...\n');

  const mem0Key = process.env.MEM0_API_KEY;
  if (!mem0Key) {
    console.error('❌ MEM0_API_KEY not found');
    process.exit(1);
  }

  const memory = new MemoryService(mem0Key);
  const kb = new KnowledgeBase();

  // Critical Risk Management Principles
  console.log('📋 Adding Risk Management principles...');
  await memory.addInsight(
    'CRITICAL RISK MANAGEMENT: Never invest more than 5-10% of portfolio in meme coins. Maximum 3-5% per single trade. Set -20% stop loss on EVERY trade. Use 15% trailing stop to lock in profits.'
  );

  await memory.addInsight(
    'PROFIT TAKING STRATEGY (3-5-Hold): Sell 50% at 3x profit, sell 25% at 5x profit, hold 25% for moonshot (10x+). This guarantees profit while maintaining upside potential.'
  );

  await memory.addInsight(
    'CAPITAL PROTECTION: Take back initial investment after 100% gain (2x). This makes the trade risk-free. Never let a winning trade turn into a losing trade.'
  );

  // Volume Analysis
  console.log('📊 Adding Technical Analysis principles...');
  await memory.addInsight(
    'VOLUME IS KING: Volume > 2x the 10-period average confirms genuine interest. Volume spike WITHOUT price increase = DUMP WARNING. Exit immediately when this pattern appears.'
  );

  await memory.addInsight(
    'TECHNICAL INDICATORS: RSI < 30 = oversold (buy signal), RSI > 70 = overbought (take profit). MACD bullish crossover = entry signal. ADX > 25 = strong trend confirmation.'
  );

  // Critical Red Flags
  console.log('🚨 Adding Red Flag detection...');
  await memory.addInsight(
    'CRITICAL RED FLAGS - AUTO AVOID: (1) Top 10 holders own >50% supply = RUG RISK, (2) Single wallet >20% = DUMP INCOMING, (3) Unlocked liquidity = instant rug possible, (4) Ownership not renounced = dev can manipulate, (5) Bundled buys = coordinated dump setup.'
  );

  await memory.addInsight(
    'HONEYPOT DETECTION: Only buy orders with no sells = honeypot. Instant 10x-50x pump at launch = wash trading. Check RugCheck.xyz BEFORE every trade. Green flags only.'
  );

  await memory.addInsight(
    'LIQUIDITY RED FLAGS: Liquidity held by single wallet = RUG RISK. No liquidity lock after Raydium migration = SCAM. Thin liquidity (<$10K) = easy manipulation. Always verify liquidity is locked/burned.'
  );

  // Entry Strategies
  console.log('🎯 Adding Entry strategies...');
  await memory.addInsight(
    'PUMP.FUN WAVE PATTERN: Phase 1 (0-15min) = Discovery, Phase 2 (15-60min) = Momentum, Phase 3 (1-4h) = FOMO Peak, Phase 4 (4-24h) = Distribution, Phase 5 (24h+) = Death. Enter Phase 1-2, EXIT Phase 3-4.'
  );

  await memory.addInsight(
    'EARLY ENTRY TIMING: Must enter within first 5-10 minutes of launch for maximum gains. Exit if no momentum within 30 minutes. Never chase pumps that are already 5x or higher.'
  );

  await memory.addInsight(
    'BONDING CURVE SIGNAL: Token approaching $69K market cap = Raydium migration imminent = momentum signal. Steady climb is good. Instant jump = wash trading, avoid.'
  );

  // Exit Strategies
  console.log('💰 Adding Exit strategies...');
  await memory.addInsight(
    'EMERGENCY EXIT SIGNALS: (1) Sudden volume spike + price drop = DUMP, (2) Dev wallet moving tokens = EXIT NOW, (3) Major whale selling = follow smart money, (4) RugCheck flags turn red/yellow = liquidity risk.'
  );

  await memory.addInsight(
    'PROFIT MILESTONES: 2x = consider taking 30-50% to secure initial investment. 3x = sell 50% per 3-5-Hold strategy. 5x = sell additional 25%. 10x = sell remaining 25% (moonshot achieved). Don\'t be greedy.'
  );

  await memory.addInsight(
    'STOP LOSS DISCIPLINE: -20% from entry = exit automatically, no exceptions. -15% = watch carefully. Small losses are acceptable. Large losses destroy portfolios. Cut losses fast, let winners run.'
  );

  // Green Flags
  console.log('✅ Adding Green Flag indicators...');
  await memory.addInsight(
    'GREEN FLAGS - GOOD SIGNALS: (1) Organic meme creation (community-made content), (2) Growing Twitter/X engagement, (3) Multiple buyers not just 2-3 wallets, (4) Consistent buy pressure 15-30+ minutes, (5) Unique character/identity not copycat.'
  );

  await memory.addInsight(
    'ON-CHAIN VALIDATION: Trading volume confirms social hype (not just tweets). 5+ transactions per minute during launch = real interest. Fast-growing liquidity pools = capital inflow. Check all three together.'
  );

  await memory.addInsight(
    'SURVIVOR PATTERN: Token survives 24+ hours = top 2% already. These become multi-day/week plays. Lower risk, steady gains. Dips are buying opportunities for survivors.'
  );

  // Psychology
  console.log('🧠 Adding Trading Psychology...');
  await memory.addInsight(
    'AVOID FOMO: If you missed 10x, DO NOT chase it. There will ALWAYS be another opportunity in 5-10 minutes on Pump.fun. Patience beats panic. Stick to your plan.'
  );

  await memory.addInsight(
    'ACCEPT LOSSES: 70-80% of meme coins fail. 98% of Pump.fun tokens don\'t reach significant market cap. Only 2% last more than 1 week. Winners must be BIG to offset many small losses. This is the reality.'
  );

  await memory.addInsight(
    'EMOTIONAL CONTROL: Never revenge trade after loss. Take break after 2 consecutive losses. Use data not emotions. Fear and greed are your enemies. Mechanical execution beats intuition.'
  );

  // Position Sizing
  console.log('💵 Adding Position Sizing rules...');
  await memory.addInsight(
    'POSITION SIZING: Ultra-early tokens (<1 hour) = max 2% of portfolio. Tokens 1-24 hours = max 3-5%. Survivors (24+ hours) = can go up to 5-8%. Never go all-in on single token.'
  );

  await memory.addInsight(
    'DIVERSIFICATION: Don\'t put all capital in meme coins. 5-10% of total portfolio max. Spread across 3-5 different tokens. One rug pull shouldn\'t wipe you out.'
  );

  // Market Cap Strategy
  console.log('📈 Adding Market Cap strategies...');
  await memory.addInsight(
    'MARKET CAP TARGETS: <$100K = ultra high risk/reward, $100K-$1M = high risk/reward (sweet spot), $1M-$10M = moderate risk/solid gains, >$10M = lower risk/lower upside for meme coin.'
  );

  // Pre-Trade Checklist
  console.log('✔️ Adding Pre-Trade Checklist...');
  await memory.addInsight(
    'PRE-TRADE CHECKLIST (check ALL before buying): Contract verified on RugCheck (green only), Liquidity locked/burned, Top holder <20% supply, Active social (organic not bots), Volume >$50K last hour, No honeypot, Dev wallet renounced, Stop loss plan set, Exit targets defined, Position <5% portfolio.'
  );

  // Success Principles
  console.log('🏆 Adding Success Principles...');
  await memory.addInsight(
    'CORE SUCCESS PRINCIPLES: (1) Survival First - protect capital above all, (2) Patience Pays - best entries come to those who wait, (3) Cut Losses Fast - preserve capital, (4) Let Winners Run - but secure profits along the way, (5) Stay Humble - market will humble you.'
  );

  await memory.addInsight(
    'TRADING WISDOM: Plan your trade, trade your plan. Write down entry, stop loss, and profit targets BEFORE buying. Execute mechanically. Review every trade to learn. Keep a trading journal.'
  );

  console.log('\n✅ Knowledge population complete!');
  console.log('🎓 Agent now has comprehensive trading knowledge in mem0 memory.');
  console.log('💡 These memories will persist across sessions and improve over time.\n');
}

// Run the script
populateTradingKnowledge().catch((error) => {
  console.error('❌ Error populating knowledge:', error);
  process.exit(1);
});
