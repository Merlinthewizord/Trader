import { VercelRequest, VercelResponse } from '@vercel/node';
import { SolanaWallet } from '../../src/wallet/SolanaWallet';
import { PumpFunClient } from '../../src/trading/PumpFunClient';
import { TradingAgent, AgentConfig } from '../../src/agent/TradingAgent';
import { MemoryService } from '../../src/memory/MemoryService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Analyze endpoint called');

    // Initialize components
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const mem0Key = process.env.MEM0_API_KEY;
    const jupiterApiKey = process.env.JUPITER_API_KEY;
    const birdeyeApiKey = process.env.BIRDEYE_API_KEY;

    // Better error messages for debugging
    if (!privateKey) {
      return res.status(500).json({ error: 'Missing SOLANA_PRIVATE_KEY environment variable' });
    }
    if (!deepseekKey) {
      return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY environment variable' });
    }
    if (!mem0Key) {
      return res.status(500).json({ error: 'Missing MEM0_API_KEY environment variable' });
    }
    if (!birdeyeApiKey) {
      return res.status(500).json({ error: 'Missing BIRDEYE_API_KEY environment variable' });
    }

    console.log('✅ All environment variables present');

    const wallet = new SolanaWallet(rpcUrl, privateKey);
    console.log('✅ Wallet initialized');

    const priorityFee = parseFloat(process.env.PRIORITY_FEE || '0.00001');
    const pool = process.env.POOL || 'auto';
    const pumpFun = new PumpFunClient(wallet, priorityFee, pool, jupiterApiKey);
    console.log('✅ PumpFun client initialized');

    const memory = new MemoryService(mem0Key);
    console.log('✅ Memory service initialized');

    const agentConfig: AgentConfig = {
      maxTradeAmountSOL: parseFloat(process.env.MAX_TRADE_AMOUNT_SOL || '0.1'),
      minTradeAmountSOL: parseFloat(process.env.MIN_TRADE_AMOUNT_SOL || '0.01'),
      slippageBPS: parseInt(process.env.SLIPPAGE_BPS || '100'),
      riskTolerance: (process.env.RISK_TOLERANCE as any) || 'moderate',
    };

    const agent = new TradingAgent(deepseekKey, wallet, pumpFun, agentConfig, memory, birdeyeApiKey);
    console.log('✅ Trading agent initialized');
    console.log('🤖 Starting market analysis...');

    const decision = await agent.analyzeMarket();
    console.log('✅ Market analysis complete');

    return res.status(200).json({ decision });
  } catch (error: any) {
    console.error('Error in analyze endpoint:', error);
    return res.status(500).json({
      error: error.message || 'Unknown error occurred',
      details: error.stack ? error.stack.split('\n')[0] : 'No stack trace available'
    });
  }
}
