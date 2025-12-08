import dotenv from 'dotenv';
import { SolanaWallet } from './wallet/SolanaWallet';
import { PumpFunClient } from './trading/PumpFunClient';
import { TradingAgent, AgentConfig } from './agent/TradingAgent';
import { MemoryService } from './memory/MemoryService';
import { WebServer } from './server/WebServer';

dotenv.config();

async function main() {
  console.log('🚀 Starting Solana Trading Agent...\n');

  // Initialize wallet
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const privateKey = process.env.SOLANA_PRIVATE_KEY;

  const wallet = new SolanaWallet(rpcUrl, privateKey);
  console.log(`💼 Wallet Address: ${wallet.getAddress()}`);

  const balance = await wallet.getBalance();
  console.log(`💰 Current Balance: ${balance.toFixed(4)} SOL\n`);

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

  const agent = new TradingAgent(anthropicKey, wallet, pumpFun, agentConfig, memory);
  console.log(`🤖 Trading Agent initialized with ${agentConfig.riskTolerance} risk tolerance\n`);

  // Start web server
  const port = parseInt(process.env.PORT || '3000');
  const webServer = new WebServer(agent, wallet, pumpFun);

  await webServer.start(port);
  console.log(`🌐 Web interface available at http://localhost:${port}\n`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await webServer.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
