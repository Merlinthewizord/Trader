import OpenAI from 'openai';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { PumpFunClient, TokenInfo } from '../trading/PumpFunClient';
import { MemoryService } from '../memory/MemoryService';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';
import { DexScreenerClient, DexPair } from '../trading/DexScreenerClient';
import { BitQueryClient, TokenAnalytics } from '../trading/BitQueryClient';

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
  private openai: OpenAI;
  private wallet: SolanaWallet;
  private pumpFun: PumpFunClient;
  private config: AgentConfig;
  private memory: MemoryService;
  private knowledgeBase: KnowledgeBase;
  private dexScreener: DexScreenerClient;
  private bitQuery?: BitQueryClient;
  private conversationHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

  constructor(
    apiKey: string,
    wallet: SolanaWallet,
    pumpFun: PumpFunClient,
    config: AgentConfig,
    memory: MemoryService,
    bitQueryV1Key?: string,
    bitQueryV2Key?: string
  ) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/Merlinthewizord/Trader',
        'X-Title': 'Solana Trading Agent'
      }
    });
    this.wallet = wallet;
    this.pumpFun = pumpFun;
    this.config = config;
    this.memory = memory;
    this.knowledgeBase = new KnowledgeBase();
    this.dexScreener = new DexScreenerClient();

    // Initialize BitQuery if keys are provided
    if (bitQueryV1Key && bitQueryV2Key) {
      this.bitQuery = new BitQueryClient(bitQueryV1Key, bitQueryV2Key);
      console.log('🔍 BitQuery analytics enabled');
    }
  }

  async analyzeMarket(): Promise<TradeDecision> {
    const balance = await this.wallet.getBalance();

    // Check if we have enough balance to trade
    const usableBalance = Math.max(0, balance - 0.005); // Reserve for fees
    if (usableBalance < this.config.minTradeAmountSOL) {
      console.log(`⚠️  Insufficient balance for trading. Need ${this.config.minTradeAmountSOL + 0.005} SOL minimum, have ${balance.toFixed(4)} SOL.`);
      return {
        action: 'hold',
        reasoning: `Insufficient balance for trading. Current: ${balance.toFixed(4)} SOL. Need at least ${(this.config.minTradeAmountSOL + 0.005).toFixed(4)} SOL (${this.config.minTradeAmountSOL} trade + 0.005 fees).`,
        confidence: 100,
        riskLevel: 'low',
      };
    }

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

    // Fetch BitQuery analytics for top tokens (if available)
    let bitQueryAnalytics: Map<string, TokenAnalytics> = new Map();
    if (this.bitQuery) {
      console.log('🔍 Fetching BitQuery on-chain analytics...');
      const topTokens = [...trendingTokens.slice(0, 3), ...pairAnalysis.slice(0, 2).map(p => ({ id: p.pair.baseToken.address }))];

      for (const token of topTokens) {
        try {
          const analytics = await this.bitQuery.getTokenAnalytics(token.id);
          bitQueryAnalytics.set(token.id, analytics);
        } catch (error) {
          // Continue if BitQuery fails for a token
        }
      }
    }

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
      recentMemories,
      bitQueryAnalytics
    );

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-oss-20b',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are an expert Solana trading agent analyzing market conditions to make informed trading decisions.' },
        { role: 'user', content: prompt }
      ],
    });

    const response = completion.choices[0]?.message?.content || '';
    const decision = this.parseTradeDecision(response);

    // Log the decision to memory (even if not executed yet)
    await this.memory.logTrade(decision);

    return decision;
  }

  async chat(userMessage: string): Promise<string> {
    const balance = await this.wallet.getBalance();
    const recentTxs = await this.wallet.getRecentTransactions(2);
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

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-oss-20b',
      max_tokens: 2048,
      messages: messages,
    });

    const response = completion.choices[0]?.message?.content || '';

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
      // Validate and clamp amount
      let tradeAmount = decision.amount;

      // Enforce minimum
      if (tradeAmount < this.config.minTradeAmountSOL) {
        console.log(`⚠️  Trade amount ${tradeAmount} SOL below minimum ${this.config.minTradeAmountSOL} SOL. Using minimum.`);
        tradeAmount = this.config.minTradeAmountSOL;
      }

      // Enforce maximum
      if (tradeAmount > this.config.maxTradeAmountSOL) {
        console.log(`⚠️  Trade amount ${tradeAmount} SOL above maximum ${this.config.maxTradeAmountSOL} SOL. Using maximum.`);
        tradeAmount = this.config.maxTradeAmountSOL;
      }

      // For buys, reserve 0.005 SOL for rent + fees
      if (decision.action === 'buy') {
        const balance = await this.wallet.getBalance();
        const maxAvailable = balance - 0.005; // Reserve for rent and fees

        if (tradeAmount > maxAvailable) {
          console.log(`⚠️  Trade amount ${tradeAmount} SOL exceeds available balance. Using ${maxAvailable.toFixed(4)} SOL instead.`);
          tradeAmount = Math.max(this.config.minTradeAmountSOL, maxAvailable);
        }

        if (tradeAmount < this.config.minTradeAmountSOL) {
          throw new Error(`Insufficient balance. Need at least ${this.config.minTradeAmountSOL + 0.005} SOL (${this.config.minTradeAmountSOL} trade + 0.005 rent/fees). Current: ${balance.toFixed(4)} SOL`);
        }
      }

      console.log(`💰 Executing ${decision.action.toUpperCase()} with ${tradeAmount.toFixed(4)} SOL (original: ${decision.amount.toFixed(4)} SOL)`);

      const signature =
        decision.action === 'buy'
          ? await this.pumpFun.buyToken({
              tokenMint: decision.tokenMint,
              amount: tradeAmount,
              denominatedInSol: true, // Buy with SOL
              slippage: this.config.slippageBPS,
            })
          : await this.pumpFun.sellToken({
              tokenMint: decision.tokenMint,
              amount: tradeAmount,
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
    memories: string[],
    bitQueryAnalytics?: Map<string, TokenAnalytics>
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
- Min Trade Amount: ${this.config.minTradeAmountSOL} SOL (REQUIRED MINIMUM - never go below this!)
- Max Trade Amount: ${this.config.maxTradeAmountSOL} SOL
- Usable Balance: ${Math.max(0, balance - 0.005).toFixed(4)} SOL (after reserving 0.005 SOL for fees)
- Risk Tolerance: ${this.config.riskTolerance}

Trading Performance:
- Total Trades: ${tradingStats.totalTrades}
- Successful: ${tradingStats.successfulTrades}
- Failed: ${tradingStats.failedTrades}
- Success Rate: ${tradingStats.successRate.toFixed(1)}%
${memoriesSection}

Top Trending Tokens (Pump.fun):
${tokens.map((t, i) => {
  const analytics = bitQueryAnalytics?.get(t.id);
  let bitQueryInfo = '';
  if (analytics) {
    bitQueryInfo = `
   📊 ON-CHAIN ANALYTICS (BitQuery):
   - Holder Concentration: ${analytics.holderConcentration.toFixed(1)}% (top 10 holders)
   - Unique Traders (24h): ${analytics.uniqueTraders24h}
   - On-chain Volume (24h): $${analytics.volume24h.toLocaleString()}
   - Trade Count (24h): ${analytics.trades24h}`;
  }
  return `${i + 1}. ${t.symbol} (${t.name})
   - Mint: ${t.id}
   - Price: $${t.usdPrice?.toFixed(6) || 'N/A'}
   - Market Cap: $${t.mcap?.toLocaleString() || 'N/A'}
   - 24h Volume: $${t.stats24h?.volume?.toLocaleString() || 'N/A'}
   - 24h Change: ${t.stats24h?.priceChange?.toFixed(2) || 'N/A'}%
   - Holders: ${t.holderCount?.toLocaleString() || 'N/A'}
   - Organic Score: ${t.organicScore?.toFixed(1) || 'N/A'} (${t.organicScoreLabel || 'N/A'})
   - Verified: ${t.isVerified ? 'Yes' : 'No'}${bitQueryInfo}`;
}).join('\n\n')}

NEW Solana Pairs from DexScreener (Last 6 Hours):
${pairAnalysis.map((analysis, i) => {
  const p = analysis.pair;
  const q = analysis.quality;
  const ageHours = p.pairCreatedAt ? ((Date.now() - p.pairCreatedAt) / (1000 * 60 * 60)).toFixed(1) : 'N/A';

  const analytics = bitQueryAnalytics?.get(p.baseToken.address);
  let bitQueryInfo = '';
  if (analytics) {
    bitQueryInfo = `
   📊 ON-CHAIN ANALYTICS (BitQuery):
   - Holder Concentration: ${analytics.holderConcentration.toFixed(1)}% (top 10 holders)
   - Unique Traders (24h): ${analytics.uniqueTraders24h}
   - On-chain Volume (24h): $${analytics.volume24h.toLocaleString()}
   - Trade Count (24h): ${analytics.trades24h}`;
  }

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
   - Warnings: ${q.warnings.length > 0 ? q.warnings.join(', ') : 'None'}${bitQueryInfo}`;
}).join('\n\n')}

Analyze these tokens AND new pairs using your trading expertise and decide:
1. BUY a specific token (provide which one and how much SOL)
2. SELL a token from portfolio (if holding any)
3. HOLD (only if genuinely no opportunities)

AGGRESSIVE TRADING REQUIREMENTS:
- CRITICAL: MINIMUM TRADE AMOUNT IS ${this.config.minTradeAmountSOL} SOL - NEVER suggest amounts below this!
- CRITICAL: MAXIMUM TRADE AMOUNT IS ${this.config.maxTradeAmountSOL} SOL - NEVER suggest amounts above this!
- POSITION SIZING: Use 15-25% of USABLE balance (${Math.max(0, balance - 0.005).toFixed(4)} SOL) for high conviction trades
- If usable balance < minimum trade amount, output "hold" action
- TIMING: Enter within 0-120 min of launch for maximum upside
- NEW PAIRS: Ultra-new pairs (<1 hour) = highest gain potential. Quality Score >30 is acceptable.
- LIQUIDITY: Minimum $5K USD liquidity is sufficient. Higher is better but not required.
- STOP LOSS: Plan -40% exit to allow for volatility and swing potential
- VOLUME: Any volume activity indicates opportunity. Don't wait for perfection.
- SPEED: Act fast on emerging trends. Early entry = best gains.
- RISK TOLERANCE: Accept higher risk for higher reward potential. Most gains come from risky plays.

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

      // Parse amount carefully - ensure it's a number
      let amount = parsed.amount;
      if (typeof amount === 'string') {
        amount = parseFloat(amount);
      }
      if (isNaN(amount) || amount === undefined || amount === null) {
        amount = 0;
      }

      console.log(`🔍 Parsed AI decision: action=${parsed.action}, amount=${amount}, confidence=${parsed.confidence}`);

      return {
        action: parsed.action || 'hold',
        tokenMint: parsed.tokenMint,
        tokenSymbol: parsed.tokenSymbol,
        amount: amount,
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
