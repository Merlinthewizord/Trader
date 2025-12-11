import dotenv from 'dotenv';
import { SolanaWallet } from './wallet/SolanaWallet';
import { PumpFunClient } from './trading/PumpFunClient';
import { TradingAgent, AgentConfig } from './agent/TradingAgent';
import { MemoryService } from './memory/MemoryService';
import { WebServer } from './server/WebServer';
import { TradingScheduler, TradingSchedulerConfig } from './scheduler/TradingScheduler';
import { TwitterSpacesBot, TwitterSpacesBotConfig } from './twitter/TwitterSpacesBot';

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

  // Initialize trading agent
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    process.exit(1);
  }

  const agentConfig: AgentConfig = {
    maxTradeAmountSOL: parseFloat(process.env.MAX_TRADE_AMOUNT_SOL || '0.1'),
    minTradeAmountSOL: parseFloat(process.env.MIN_TRADE_AMOUNT_SOL || '0.01'),
    slippageBPS: parseInt(process.env.SLIPPAGE_BPS || '100'),
    riskTolerance: (process.env.RISK_TOLERANCE as any) || 'moderate',
  };

  // Get BitQuery API keys (optional)
  const bitQueryV1Key = process.env.BITQUERY_API_KEY_V1;
  const bitQueryV2Key = process.env.BITQUERY_API_KEY_V2;

  const agent = new TradingAgent(openaiKey, wallet, pumpFun, agentConfig, memory, bitQueryV1Key, bitQueryV2Key);
  console.log(`🤖 Trading Agent initialized with ${agentConfig.riskTolerance} risk tolerance (using OpenRouter gpt-oss-20b)\n`);

  // Initialize autonomous trading scheduler
  const schedulerConfig: TradingSchedulerConfig = {
    intervalMinutes: parseFloat(process.env.TRADING_INTERVAL_MINUTES || '5'),
    autoExecute: process.env.AUTO_EXECUTE_TRADES === 'true',
    minConfidenceForAutoTrade: parseInt(process.env.MIN_CONFIDENCE_FOR_AUTO_TRADE || '70'),
    minConfidenceForHighRisk: parseInt(process.env.MIN_CONFIDENCE_FOR_HIGH_RISK || '80'),
    enabled: process.env.AUTONOMOUS_TRADING_ENABLED !== 'false', // Enabled by default
  };

  const scheduler = new TradingScheduler(agent, wallet, schedulerConfig);

  // Initialize Twitter Spaces Bot (optional)
  let twitterBot: TwitterSpacesBot | undefined;
  if (process.env.TWITTER_BOT_ENABLED === 'true') {
    const twitterApiKey = process.env.TWITTER_API_KEY;
    const twitterApiSecret = process.env.TWITTER_API_SECRET;
    const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
    const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (twitterApiKey && twitterApiSecret && twitterAccessToken && twitterAccessSecret && openaiApiKey) {
      const twitterConfig: TwitterSpacesBotConfig = {
        twitterApiKey,
        twitterApiSecret,
        twitterAccessToken,
        twitterAccessSecret,
        openaiApiKey,
        elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID,
        personality: process.env.TWITTER_BOT_PERSONALITY,
        autoJoinSpaces: process.env.TWITTER_BOT_AUTO_JOIN === 'true',
        tradingCommentaryEnabled: process.env.TWITTER_BOT_TRADING_COMMENTARY === 'true',
      };

      twitterBot = new TwitterSpacesBot(twitterConfig, agent);
      console.log('🐦 Twitter Spaces Bot initialized\n');

      // Start auto-join mode if enabled
      if (twitterConfig.autoJoinSpaces) {
        const searchQuery = process.env.TWITTER_BOT_SEARCH_QUERY || 'crypto trading solana';
        console.log(`🤖 Starting auto-join mode (searching: "${searchQuery}")\n`);
        twitterBot.startAutoJoinMode(searchQuery, 5);
      }
    } else {
      console.log('⚠️  Twitter bot enabled but missing required API keys. Skipping initialization.\n');
    }
  }

  // Start web server
  const port = parseInt(process.env.PORT || '3000');
  const webServer = new WebServer(agent, wallet, pumpFun, scheduler, twitterBot);

  await webServer.start(port);
  console.log(`🌐 Web interface available at http://localhost:${port}\n`);

  // Start autonomous trading if enabled
  if (schedulerConfig.enabled) {
    scheduler.start();
  } else {
    console.log('⏸️  Autonomous trading is DISABLED (set AUTONOMOUS_TRADING_ENABLED=true to enable)\n');
  }

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
