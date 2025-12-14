import dotenv from 'dotenv';
import { SolanaWallet } from './wallet/SolanaWallet';
import { PumpFunClient } from './trading/PumpFunClient';
import { TradingAgent, AgentConfig } from './agent/TradingAgent';
import { MemoryService } from './memory/MemoryService';
import { WebServer } from './server/WebServer';
import { TradingScheduler, TradingSchedulerConfig } from './scheduler/TradingScheduler';
import { LimitOrderManager, LimitOrderConfig } from './trading/LimitOrderManager';

dotenv.config();

async function main() {
  console.log('🚀 Starting Solana Trading Agent...\n');

  // Initialize wallet
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const privateKey = process.env.SOLANA_PRIVATE_KEY;

  // Log RPC endpoint being used
  const rpcProvider = rpcUrl.includes('helius') ? '⚡ Helius RPC' :
                      rpcUrl.includes('quicknode') ? '⚡ QuickNode RPC' :
                      '🌐 Default RPC';
  console.log(`${rpcProvider}: ${rpcUrl.split('?')[0]}${rpcUrl.includes('?') ? '?api-key=***' : ''}\n`);

  const wallet = new SolanaWallet(rpcUrl, privateKey);
  console.log(`💼 Wallet Address: ${wallet.getAddress()}`);

  let balance = 0;
  try {
    balance = await wallet.getBalance();
    console.log(`💰 Current Balance: ${balance.toFixed(4)} SOL\n`);
  } catch (error) {
    console.log(`⚠️  Could not fetch balance (network issue), continuing anyway...\n`);
  }

  // Initialize pump.fun client with Jupiter API integration
  const priorityFee = parseFloat(process.env.PRIORITY_FEE || '0.00001');
  const pool = process.env.POOL || 'auto';
  const jupiterApiKey = process.env.JUPITER_API_KEY;
  const pumpFun = new PumpFunClient(wallet, priorityFee, pool, jupiterApiKey);
  console.log(`⚡ PumpPortal client initialized (priority fee: ${priorityFee}, pool: ${pool})`);
  console.log(`🪐 Jupiter API ${jupiterApiKey ? 'enabled' : 'disabled (public access)'}\n`);

  // Initialize memory service
  const mem0Key = process.env.MEM0_API_KEY;
  if (!mem0Key) {
    console.error('❌ MEM0_API_KEY not found in environment variables');
    process.exit(1);
  }

  const memory = new MemoryService(mem0Key);
  console.log(`🧠 Memory service initialized\n`);

  // Initialize limit order manager
  const limitOrderConfig: LimitOrderConfig = {
    takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || '30'), // +30%
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '-40'), // -40%
  };

  const slippage = parseInt(process.env.SLIPPAGE_BPS || '1000');
  const limitOrderManager = new LimitOrderManager(pumpFun, wallet, limitOrderConfig, slippage);
  await limitOrderManager.initialize();
  console.log(`🎯 Limit Order Manager initialized (TP: +${limitOrderConfig.takeProfitPercent}%, SL: ${limitOrderConfig.stopLossPercent}%)\n`);

  // Initialize trading agent
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
    process.exit(1);
  }

  const agentConfig: AgentConfig = {
    maxTradeAmountSOL: parseFloat(process.env.MAX_TRADE_AMOUNT_SOL || '0.1'),
    minTradeAmountSOL: parseFloat(process.env.MIN_TRADE_AMOUNT_SOL || '0.01'),
    slippageBPS: parseInt(process.env.SLIPPAGE_BPS || '100'),
    riskTolerance: (process.env.RISK_TOLERANCE as any) || 'moderate',
  };

  // Get Birdeye API key (recommended for market data)
  const birdeyeApiKey = process.env.BIRDEYE_API_KEY;

  // Get BitQuery API keys (optional)
  const bitQueryV1Key = process.env.BITQUERY_API_KEY_V1;
  const bitQueryV2Key = process.env.BITQUERY_API_KEY_V2;

  const agent = new TradingAgent(anthropicKey, wallet, pumpFun, agentConfig, memory, limitOrderManager, birdeyeApiKey, bitQueryV1Key, bitQueryV2Key);
  console.log(`🤖 Trading Agent initialized with ${agentConfig.riskTolerance} risk tolerance (using Anthropic Claude)\n`);

  // Initialize autonomous trading scheduler
  const schedulerConfig: TradingSchedulerConfig = {
    intervalMinutes: parseFloat(process.env.TRADING_INTERVAL_MINUTES || '10'),
    autoExecute: process.env.AUTO_EXECUTE_TRADES === 'true',
    minConfidenceForAutoTrade: parseInt(process.env.MIN_CONFIDENCE_FOR_AUTO_TRADE || '60'),
    minConfidenceForHighRisk: parseInt(process.env.MIN_CONFIDENCE_FOR_HIGH_RISK || '65'),
    enabled: process.env.AUTONOMOUS_TRADING_ENABLED !== 'true', // Enabled by default
  };

  const scheduler = new TradingScheduler(agent, wallet, schedulerConfig, limitOrderManager);

  // Start web server
  const port = parseInt(process.env.PORT || '3000');
  const webServer = new WebServer(agent, wallet, pumpFun, scheduler);

  await webServer.start(port);
  console.log(`🌐 Web interface available at http://localhost:${port}\n`);

  // Start autonomous trading if enabled
  if (schedulerConfig.enabled) {
    scheduler.start();
    console.log('✅ PATRIOT ULTRA-AGGRESSIVE MODE ACTIVE:');
    console.log('   ⚡ Cycle Frequency: Every 10 minutes (6 per hour)');
    console.log('   🎯 Trade Target: 3+ trades per hour (~50% execution rate)');
    console.log('   📊 Min Confidence: 60% (normal) | 65% (high-risk)');
    console.log('   \n   Workflow per cycle:');
    console.log('   1. Check portfolio positions vs stop loss/take profit');
    console.log('   2. Scan Birdeye for new & trending tokens');
    console.log('   3. Make aggressive BUY/SELL decision (brief analysis)');
    console.log('   4. Execute immediately if confidence >= threshold\n');
  } else {
    console.log('⏸️  Autonomous trading is DISABLED (set AUTONOMOUS_TRADING_ENABLED=true to enable)\n');
  }

  // NOTE: Limit order checking is now integrated into the main trading cycle
  // No need for separate monitoring - it runs every 10 minutes as part of the cycle

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    scheduler.stop();
    await webServer.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
