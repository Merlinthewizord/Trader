import Anthropic from 'anthropic';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { PumpFunClient, TokenInfo } from '../trading/PumpFunClient';
import { MemoryService } from '../memory/MemoryService';

export interface TradeDecision {
  action: 'buy' | 'sell' | 'hold';
  tokenMint?: string;
  tokenSymbol?: string;
  amount?: number;
  reasoning: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AgentConfig {
  maxTradeAmountSOL: number;
  minTradeAmountSOL: number;
  slippageBPS: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export class TradingAgent {
  private anthropic: Anthropic;
  private wallet: SolanaWallet;
  private pumpFun: PumpFunClient;
  private config: AgentConfig;
  private memory: MemoryService;
  private conversationHistory: { role: string; content: string }[] = [];

  constructor(
    apiKey: string,
    wallet: SolanaWallet,
    pumpFun: PumpFunClient,
    config: AgentConfig,
    memory: MemoryService
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.wallet = wallet;
    this.pumpFun = pumpFun;
    this.config = config;
    this.memory = memory;
  }

  async analyzeMarket(): Promise<TradeDecision> {
    const balance = await this.wallet.getBalance();
    const trendingTokens = await this.pumpFun.getTrendingTokens(10);

    // Retrieve relevant memories from past trades
    const tradingStats = await this.memory.getTradingStats();
    const recentMemories = await this.memory.getRelevantMemories(
      'past trading decisions and their outcomes',
      5
    );

    const prompt = this.buildMarketAnalysisPrompt(balance, trendingTokens, tradingStats, recentMemories);

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '';
    const decision = this.parseTradeDecision(response);

    // Log the decision to memory (even if not executed yet)
    await this.memory.logTrade(decision);

    return decision;
  }

  async chat(userMessage: string): Promise<string> {
    const balance = await this.wallet.getBalance();
    const recentTxs = await this.wallet.getRecentTransactions(5);
    const tradingStats = await this.memory.getTradingStats();

    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    const systemPrompt = `You are an AI trading agent managing a Solana wallet on pump.fun.
Current wallet balance: ${balance.toFixed(4)} SOL
Recent transactions: ${recentTxs.length}

Trading Performance:
- Total Trades: ${tradingStats.totalTrades}
- Successful: ${tradingStats.successfulTrades}
- Failed: ${tradingStats.failedTrades}
- Success Rate: ${tradingStats.successRate.toFixed(1)}%

You can:
- Analyze trending tokens on pump.fun
- Execute buy/sell trades
- Provide market insights
- Explain your trading reasoning
- Learn from past trades to improve your strategy

Be conversational, informative, and strategic. Always explain your reasoning clearly.`;

    const messages = [
      { role: 'user' as const, content: systemPrompt },
      ...this.conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: messages,
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '';

    this.conversationHistory.push({
      role: 'assistant',
      content: response,
    });

    return response;
  }

  async executeTrade(decision: TradeDecision): Promise<string | null> {
    if (decision.action === 'hold' || !decision.tokenMint || !decision.amount) {
      return null;
    }

    try {
      const signature =
        decision.action === 'buy'
          ? await this.pumpFun.buyToken({
              tokenMint: decision.tokenMint,
              amount: decision.amount,
              slippage: this.config.slippageBPS,
            })
          : await this.pumpFun.sellToken({
              tokenMint: decision.tokenMint,
              amount: decision.amount,
              slippage: this.config.slippageBPS,
            });

      // Log successful trade execution to memory
      await this.memory.logTrade(decision, signature);

      return signature;
    } catch (error: any) {
      console.error('Trade execution failed:', error.message);

      // Log failed trade attempt
      await this.memory.updateTradeOutcome(
        decision.tokenSymbol || 'UNKNOWN',
        'failure',
        0,
        `Trade execution failed: ${error.message}`
      );

      throw error;
    }
  }

  private buildMarketAnalysisPrompt(
    balance: number,
    tokens: TokenInfo[],
    tradingStats: { totalTrades: number; successfulTrades: number; failedTrades: number; successRate: number },
    memories: string[]
  ): string {
    const memoriesSection = memories.length > 0
      ? `\n\nPast Trading Experiences (learn from these):\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n\n')}`
      : '';

    return `You are an AI trading agent analyzing the pump.fun market. You learn from past trades to improve your strategy.

Current Portfolio:
- SOL Balance: ${balance.toFixed(4)} SOL
- Max Trade Amount: ${this.config.maxTradeAmountSOL} SOL
- Risk Tolerance: ${this.config.riskTolerance}

Trading Performance:
- Total Trades: ${tradingStats.totalTrades}
- Successful: ${tradingStats.successfulTrades}
- Failed: ${tradingStats.failedTrades}
- Success Rate: ${tradingStats.successRate.toFixed(1)}%
${memoriesSection}

Top Trending Tokens:
${tokens.map((t, i) => `${i + 1}. ${t.symbol} (${t.name})
   - Market Cap: $${t.marketCap.toLocaleString()}
   - 24h Volume: $${t.volume24h.toLocaleString()}
   - 24h Change: ${t.priceChange24h.toFixed(2)}%
   - Holders: ${t.holders}`).join('\n\n')}

Analyze these tokens and decide if you should:
1. BUY a specific token (provide which one and how much SOL to spend)
2. SELL a token from portfolio (if holding any)
3. HOLD (wait for better opportunities)

IMPORTANT: Learn from your past experiences above. If you've traded similar tokens before, consider what worked and what didn't.

Respond in this exact JSON format:
{
  "action": "buy|sell|hold",
  "tokenMint": "token_address_if_buying_or_selling",
  "tokenSymbol": "TOKEN_SYMBOL",
  "amount": amount_in_SOL,
  "reasoning": "detailed explanation of your decision (mention any relevant lessons from past trades)",
  "confidence": 0-100,
  "riskLevel": "low|medium|high"
}`;
  }

  private parseTradeDecision(response: string): TradeDecision {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          action: 'hold',
          reasoning: 'Unable to parse AI response',
          confidence: 0,
          riskLevel: 'high',
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action: parsed.action || 'hold',
        tokenMint: parsed.tokenMint,
        tokenSymbol: parsed.tokenSymbol,
        amount: parsed.amount,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0,
        riskLevel: parsed.riskLevel || 'medium',
      };
    } catch (error) {
      console.error('Error parsing trade decision:', error);
      return {
        action: 'hold',
        reasoning: 'Error parsing AI decision',
        confidence: 0,
        riskLevel: 'high',
      };
    }
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  clearConversation() {
    this.conversationHistory = [];
  }
}
