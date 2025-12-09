import Anthropic from '@anthropic-ai/sdk';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { PumpFunClient, TokenInfo } from '../trading/PumpFunClient';
import { MemoryService } from '../memory/MemoryService';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';
import { DexScreenerClient, DexPair } from '../trading/DexScreenerClient';

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
  private knowledgeBase: KnowledgeBase;
  private dexScreener: DexScreenerClient;
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
    this.knowledgeBase = new KnowledgeBase();
    this.dexScreener = new DexScreenerClient();
  }

  async analyzeMarket(): Promise<TradeDecision> {
    const balance = await this.wallet.getBalance();
    const trendingTokens = await this.pumpFun.getTrendingTokens(10);

    // Fetch new pairs from DexScreener (last 6 hours)
    console.log('🔍 Fetching new Solana pairs from DexScreener...');
    const newPairs = await this.dexScreener.getNewSolanaPairs(6);
    const trendingPairs = await this.dexScreener.getTrendingPairs();

    // Analyze pair quality
    const pairAnalysis = newPairs.slice(0, 10).map((pair) => ({
      pair,
      quality: this.dexScreener.analyzePairQuality(pair),
    }));

    // Retrieve relevant memories from past trades
    const tradingStats = await this.memory.getTradingStats();
    const recentMemories = await this.memory.getRelevantMemories(
      'past trading decisions and their outcomes',
      5
    );

    const prompt = this.buildMarketAnalysisPrompt(
      balance,
      trendingTokens,
      pairAnalysis,
      tradingStats,
      recentMemories
    );

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
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
      model: 'claude-sonnet-4-5-20250929',
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
              denominatedInSol: true, // Buy with SOL
              slippage: this.config.slippageBPS,
            })
          : await this.pumpFun.sellToken({
              tokenMint: decision.tokenMint,
              amount: decision.amount,
              denominatedInSol: true, // Sell for SOL
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
    pairAnalysis: Array<{ pair: DexPair; quality: { score: number; signals: string[]; warnings: string[] } }>,
    tradingStats: { totalTrades: number; successfulTrades: number; failedTrades: number; successRate: number },
    memories: string[]
  ): string {
    const memoriesSection = memories.length > 0
      ? `\n\nPast Trading Experiences (learn from these):\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n\n')}`
      : '';

    // Get trading wisdom from knowledge base
    const tradingWisdom = this.knowledgeBase.getTradingWisdom();

    return `You are an EXPERT meme coin trading agent with comprehensive knowledge of pump.fun dynamics, risk management, and market psychology.

${tradingWisdom}

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

Top Trending Tokens (Pump.fun):
${tokens.map((t, i) => `${i + 1}. ${t.symbol} (${t.name})
   - Mint: ${t.id}
   - Price: $${t.usdPrice?.toFixed(6) || 'N/A'}
   - Market Cap: $${t.mcap?.toLocaleString() || 'N/A'}
   - 24h Volume: $${t.stats24h?.volume?.toLocaleString() || 'N/A'}
   - 24h Change: ${t.stats24h?.priceChange?.toFixed(2) || 'N/A'}%
   - Holders: ${t.holderCount?.toLocaleString() || 'N/A'}
   - Organic Score: ${t.organicScore?.toFixed(1) || 'N/A'} (${t.organicScoreLabel || 'N/A'})
   - Verified: ${t.isVerified ? 'Yes' : 'No'}`).join('\n\n')}

NEW Solana Pairs from DexScreener (Last 6 Hours):
${pairAnalysis.map((analysis, i) => {
  const p = analysis.pair;
  const q = analysis.quality;
  const ageHours = p.pairCreatedAt ? ((Date.now() - p.pairCreatedAt) / (1000 * 60 * 60)).toFixed(1) : 'N/A';

  return `${i + 1}. ${p.baseToken.symbol}/${p.quoteToken.symbol} (${p.dexId})
   - Pair Address: ${p.pairAddress}
   - Token Address: ${p.baseToken.address}
   - Age: ${ageHours} hours
   - Price: $${parseFloat(p.priceUsd || '0').toFixed(8)}
   - Market Cap: $${p.marketCap?.toLocaleString() || 'N/A'}
   - Liquidity: $${p.liquidity?.usd?.toLocaleString() || 'N/A'}
   - 24h Volume: $${p.volume?.h24?.toLocaleString() || 'N/A'}
   - 24h Change: ${p.priceChange?.h24?.toFixed(2) || 'N/A'}%
   - 24h Txns: ${(p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0)} (${p.txns?.h24?.buys || 0} buys, ${p.txns?.h24?.sells || 0} sells)
   - Quality Score: ${q.score}/100
   - Signals: ${q.signals.length > 0 ? q.signals.join(', ') : 'None'}
   - Warnings: ${q.warnings.length > 0 ? q.warnings.join(', ') : 'None'}`;
}).join('\n\n')}

Analyze these tokens AND new pairs using your trading expertise and decide:
1. BUY a specific token (provide which one and how much SOL)
2. SELL a token from portfolio (if holding any)
3. HOLD (wait for better opportunities)

CRITICAL ANALYSIS REQUIREMENTS:
- Check for RED FLAGS: Holder concentration >50%, unlocked liquidity, bundled buys
- Verify GREEN FLAGS: Organic social proof, volume confirmation, consistent buy pressure
- Apply POSITION SIZING: Never exceed 3-5% of balance on single trade
- Consider TIMING: Enter Phase 1-2 (0-60 min), avoid chasing Phase 3 FOMO
- NEW PAIRS ANALYSIS: DexScreener pairs <1 hour old = ultra high risk. Quality Score <50 = AVOID. Low liquidity (<$10K) = manipulation risk.
- LIQUIDITY CHECK: For DexScreener pairs, prioritize those with locked liquidity and >$50K USD liquidity
- Use STOP LOSS: Plan -20% exit point BEFORE entering
- Remember: 98% of tokens fail. Be selective. Quality over quantity.

Learn from past experiences and trading wisdom above. Apply risk management strictly.

Respond in this exact JSON format:
{
  "action": "buy|sell|hold",
  "tokenMint": "token_address_if_buying_or_selling",
  "tokenSymbol": "TOKEN_SYMBOL",
  "amount": amount_in_SOL,
  "reasoning": "detailed explanation citing specific signals (volume, holder distribution, social proof, phase timing, red/green flags)",
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
