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
    // Initialize components
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const mem0Key = process.env.MEM0_API_KEY;
    const jupiterApiKey = process.env.JUPITER_API_KEY;

    // Better error messages for debugging
    if (!privateKey) {
      return res.status(500).json({ error: 'Missing SOLANA_PRIVATE_KEY environment variable' });
    }
    if (!anthropicKey) {
      return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY environment variable' });
    }
    if (!mem0Key) {
      return res.status(500).json({ error: 'Missing MEM0_API_KEY environment variable' });
    }

    const wallet = new SolanaWallet(rpcUrl, privateKey);
    const priorityFee = parseFloat(process.env.PRIORITY_FEE || '0.00001');
    const pool = process.env.POOL || 'auto';
    const pumpFun = new PumpFunClient(wallet, priorityFee, pool, jupiterApiKey);
    const memory = new MemoryService(mem0Key);

    const agentConfig: AgentConfig = {
      maxTradeAmountSOL: parseFloat(process.env.MAX_TRADE_AMOUNT_SOL || '0.1'),
      minTradeAmountSOL: parseFloat(process.env.MIN_TRADE_AMOUNT_SOL || '0.01'),
      slippageBPS: parseInt(process.env.SLIPPAGE_BPS || '100'),
      riskTolerance: (process.env.RISK_TOLERANCE as any) || 'moderate',
    };

    const agent = new TradingAgent(anthropicKey, wallet, pumpFun, agentConfig, memory);
    const decision = await agent.analyzeMarket();

    return res.status(200).json({ decision });
  } catch (error: any) {
    console.error('Error in analyze endpoint:', error);
    return res.status(500).json({
      error: error.message || 'Unknown error occurred',
      details: error.stack ? error.stack.split('\n')[0] : 'No stack trace available'
    });
  }
}
