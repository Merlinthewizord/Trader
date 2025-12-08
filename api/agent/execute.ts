import { VercelRequest, VercelResponse } from '@vercel/node';
import { SolanaWallet } from '../../src/wallet/SolanaWallet';
import { PumpFunClient } from '../../src/trading/PumpFunClient';
import { TradingAgent, AgentConfig, TradeDecision } from '../../src/agent/TradingAgent';
import { MemoryService } from '../../src/memory/MemoryService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { decision } = req.body as { decision: TradeDecision };

    if (!decision) {
      return res.status(400).json({ error: 'Decision is required' });
    }

    // Initialize components
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const mem0Key = process.env.MEM0_API_KEY;
    const jupiterApiKey = process.env.JUPITER_API_KEY;

    if (!privateKey || !anthropicKey || !mem0Key) {
      return res.status(500).json({ error: 'Missing required API keys' });
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
    const signature = await agent.executeTrade(decision);

    res.status(200).json({ signature, decision });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
