import OpenAI from 'openai';
import { SolanaWallet, TokenHolding } from '../wallet/SolanaWallet';
import { PumpFunClient, TokenInfo } from '../trading/PumpFunClient';
import { MemoryService } from '../memory/MemoryService';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';
import { BirdeyeClient, BirdeyeToken, BirdeyeTokenOverview } from '../trading/BirdeyeClient';
import { BitQueryClient, TokenAnalytics } from '../trading/BitQueryClient';

export interface PortfolioPosition {
  mint: string;
  symbol: string;
  balance: number;
  currentPrice: number;
  value: number;
  profitLoss?: number;
  profitLossPercent?: number;
}

export interface TradeDecision {
  action: 'buy' | 'sell' | 'hold';
  tokenMint?: string;
  tokenSymbol?: string;
  amount?: number | 'all';
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
  private birdeye: BirdeyeClient;
  private bitQuery?: BitQueryClient;
  private conversationHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

  constructor(
    apiKey: string,
    wallet: SolanaWallet,
    pumpFun: PumpFunClient,
    config: AgentConfig,
    memory: MemoryService,
    birdeyeApiKey: string,
    bitQueryV1Key?: string,
    bitQueryV2Key?: string
  ) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
    this.wallet = wallet;
    this.pumpFun = pumpFun;
    this.config = config;
    this.memory = memory;
    this.knowledgeBase = new KnowledgeBase();
    this.birdeye = new BirdeyeClient(birdeyeApiKey);
    console.log('🐦 Birdeye API integration enabled');

    // Initialize BitQuery if keys are provided
    if (bitQueryV1Key && bitQueryV2Key) {
      this.bitQuery = new BitQueryClient(bitQueryV1Key, bitQueryV2Key);
      console.log('🔍 BitQuery analytics enabled');
    }
  }

  async analyzeMarket(): Promise<TradeDecision> {
    const balance = await this.wallet.getBalance();

    // Get current portfolio holdings first
    console.log('💼 Checking portfolio holdings...');
    const holdings = await this.wallet.getTokenHoldings();
    const portfolio = await this.getPortfolioWithPrices(holdings);

    // Check if we have enough balance to trade
    const usableBalance = Math.max(0, balance - 0.005); // Reserve for fees
    if (usableBalance < this.config.minTradeAmountSOL) {
      console.log(`⚠️  Insufficient balance for trading. Need ${this.config.minTradeAmountSOL + 0.005} SOL minimum, have ${balance.toFixed(4)} SOL.`);

      // If we have token holdings, sell one to get SOL back
      if (portfolio.length > 0) {
        console.log('💡 Low on SOL but have token holdings. Suggesting to sell a token to get more SOL...');

        // Find the best token to sell (prioritize: most profitable, or largest holding)
        let bestToSell = portfolio[0];
        for (const token of portfolio) {
          // Prefer tokens with profit, or if no profit, prefer the largest holding
          const currentProfit = token.profitLossPercent || -100;
          const bestProfit = bestToSell.profitLossPercent || -100;

          if (currentProfit > bestProfit || (currentProfit === bestProfit && token.value > bestToSell.value)) {
            bestToSell = token;
          }
        }

        return {
          action: 'sell',
          tokenMint: bestToSell.mint,
          tokenSymbol: bestToSell.symbol,
          amount: 'all',
          reasoning: `Out of SOL for trading (${balance.toFixed(4)} SOL). Selling ${bestToSell.symbol} (${bestToSell.profitLossPercent?.toFixed(1) || 'unknown'}% P/L, $${bestToSell.value.toFixed(2)} value) to get more SOL for future trades.`,
          confidence: 95,
          riskLevel: 'low',
        };
      }

      return {
        action: 'hold',
        reasoning: `Insufficient balance for trading and no tokens to sell. Current: ${balance.toFixed(4)} SOL. Need at least ${(this.config.minTradeAmountSOL + 0.005).toFixed(4)} SOL (${this.config.minTradeAmountSOL} trade + 0.005 fees).`,
        confidence: 100,
        riskLevel: 'low',
      };
    }

    if (portfolio.length > 0) {
      console.log(`📊 Current Portfolio: ${portfolio.length} tokens`);
      portfolio.forEach(p => {
        console.log(`   ${p.symbol}: ${p.balance.toFixed(2)} tokens, Value: $${p.value.toFixed(2)}, P/L: ${p.profitLossPercent?.toFixed(1) || 'N/A'}%`);
      });
    }

    const trendingTokens = await this.pumpFun.getTrendingTokens(10);

    // Fetch trending and new tokens from Birdeye
    console.log('🔍 Fetching trending tokens from Birdeye...');
    const birdeyeTrending = await this.birdeye.getTrendingTokens(20);

    console.log('🔍 Fetching new token listings from Birdeye...');
    const birdeyeNewTokens = await this.birdeye.getNewTokens(10);

    // Analyze token quality for Birdeye tokens
    const birdeyeAnalysis = [...birdeyeTrending.slice(0, 10), ...birdeyeNewTokens.slice(0, 5)].map((token) => ({
      token,
      quality: this.birdeye.analyzeTokenQuality(token),
    }));

    // Fetch BitQuery analytics for top tokens (if available)
    let bitQueryAnalytics: Map<string, TokenAnalytics> = new Map();
    if (this.bitQuery) {
      console.log('🔍 Fetching BitQuery on-chain analytics...');
      const topTokens = [...trendingTokens.slice(0, 3), ...birdeyeTrending.slice(0, 2).map(t => ({ id: t.address }))];

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
      birdeyeAnalysis,
      tradingStats,
      recentMemories,
      bitQueryAnalytics,
      portfolio
    );

    const completion = await this.openai.chat.completions.create({
      model: 'deepseek-chat',
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

    const systemPrompt = `You are NEXUS - an AI trading agent with a quirky, cocky personality managing a Solana wallet on pump.fun.

Current wallet balance: ${balance.toFixed(4)} SOL
Recent transactions: ${recentTxs.length}

Trading Performance:
- Total Trades: ${tradingStats.totalTrades}
- Successful: ${tradingStats.successfulTrades}
- Failed: ${tradingStats.failedTrades}
- Success Rate: ${tradingStats.successRate.toFixed(1)}%

PERSONALITY:
You're extremely confident in your trading abilities (sometimes hilariously overconfident), but you're never mean or condescending. You're that friend who's really good at something and knows it, but is still fun to hang out with. You use casual language, occasional jokes, and aren't afraid to brag about your wins or make light of your losses. You might compare yourself to trading legends, make pop culture references, or use gaming/tech metaphors. You're goofy, charming, and always entertaining - like a mix between a Wall Street trader, a gamer, and a stand-up comedian.

Examples of your vibe:
- "Oh, you want to know about THAT trade? *chef's kiss* Literally textbook perfection. I should write a book."
- "Listen, I've been crunching numbers while you were sleeping. The charts are speaking to me in ancient languages."
- "Not gonna lie, that last trade was chef's kiss levels of genius. My algorithms are just DIFFERENT."
- "Bro, I literally see the Matrix but for crypto. It's both a gift and a curse."

You can:
- Analyze trending tokens on pump.fun
- Execute buy/sell trades
- Provide market insights with your unique flair
- Explain your trading reasoning (while being entertaining)
- Learn from past trades to improve your strategy

Be conversational, funny, confident (but not mean), and always bring the entertainment value while still being helpful!`;

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'deepseek-chat',
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
      let tradeAmount: number;
      let sellAllTokens = false;

      // For sell actions with "all", get the actual token balance
      if (decision.action === 'sell' && decision.amount === 'all' && decision.tokenMint) {
        console.log(`📤 Selling ALL tokens of ${decision.tokenSymbol}`);
        const tokenBalance = await this.wallet.getTokenBalance(decision.tokenMint);

        if (tokenBalance === 0) {
          throw new Error(`No ${decision.tokenSymbol} tokens to sell!`);
        }

        // Sell the entire token balance
        tradeAmount = tokenBalance;
        sellAllTokens = true;
      } else if (typeof decision.amount === 'number') {
        tradeAmount = decision.amount;
      } else {
        throw new Error('Trade amount must be specified as a number or "all"');
      }

      // Validate and clamp amount for BUY actions
      if (decision.action === 'buy') {
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

        // Reserve 0.005 SOL for rent + fees
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

      console.log(`💰 Executing ${decision.action.toUpperCase()} ${decision.action === 'sell' && sellAllTokens ? `ALL ${tradeAmount} tokens` : `with ${tradeAmount.toFixed(4)} SOL`} (original: ${decision.amount})`);

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
              denominatedInSol: sellAllTokens ? false : true, // If selling all tokens, specify in tokens not SOL
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

  private async getPortfolioWithPrices(holdings: TokenHolding[]): Promise<PortfolioPosition[]> {
    const portfolio: PortfolioPosition[] = [];

    for (const holding of holdings) {
      try {
        // Get token info to get current price
        const tokenInfo = await this.pumpFun.getTokenInfo(holding.mint);

        if (tokenInfo) {
          const currentPrice = tokenInfo.usdPrice || 0;
          const value = holding.balance * currentPrice;

          portfolio.push({
            mint: holding.mint,
            symbol: tokenInfo.symbol,
            balance: holding.balance,
            currentPrice: currentPrice,
            value: value,
            // P/L calculation would require knowing entry price - we'll add this later from memory
          });
        }
      } catch (error) {
        console.error(`Error getting price for token ${holding.mint}:`, error);
      }
    }

    return portfolio;
  }

  private buildMarketAnalysisPrompt(
    balance: number,
    tokens: TokenInfo[],
    birdeyeAnalysis: Array<{ token: BirdeyeToken; quality: { score: number; signals: string[]; warnings: string[] } }>,
    tradingStats: { totalTrades: number; successfulTrades: number; failedTrades: number; successRate: number },
    memories: string[],
    bitQueryAnalytics?: Map<string, TokenAnalytics>,
    portfolio?: PortfolioPosition[]
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

${portfolio && portfolio.length > 0 ? `
TOKEN HOLDINGS - ACTIVELY CONSIDER SELLING THESE:
${portfolio.map((p, i) => `${i + 1}. ${p.symbol}
   - Token Mint: ${p.mint}
   - Balance: ${p.balance.toFixed(2)} tokens
   - Current Price: $${p.currentPrice.toFixed(6)}
   - Total Value: $${p.value.toFixed(2)}
   - DECISION: Should you SELL this for profit, or HOLD for bigger gains?`).join('\n\n')}

⚠️ IMPORTANT: You currently hold ${portfolio.length} token(s). For EACH token above, decide if you should SELL for profit or keep holding.
` : '📭 No token holdings currently. Focus on finding BUY opportunities.\n'}

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

Birdeye Token Analysis (Trending & New Listings):
${birdeyeAnalysis.map((analysis, i) => {
  const t = analysis.token;
  const q = analysis.quality;

  const analytics = bitQueryAnalytics?.get(t.address);
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
   - Token Address: ${t.address}
   - Price: $${t.price?.toFixed(8) || 'N/A'}
   - Market Cap: $${t.mc?.toLocaleString() || 'N/A'}
   - Liquidity: $${t.liquidity?.toLocaleString() || 'N/A'}
   - 24h Volume: $${t.volume24hUSD?.toLocaleString() || t.v24hUSD?.toLocaleString() || 'N/A'}
   - 24h Change: ${t.priceChange24h?.toFixed(2) || t.v24hChangePercent?.toFixed(2) || 'N/A'}%
   - Quality Score: ${q.score}/100
   - Signals: ${q.signals.length > 0 ? q.signals.join(', ') : 'None'}
   - Warnings: ${q.warnings.length > 0 ? q.warnings.join(', ') : 'None'}${bitQueryInfo}`;
}).join('\n\n')}

Analyze these tokens from pump.fun AND Birdeye using your trading expertise and decide:
1. SELL a token from your portfolio (if you have holdings with good profit or to cut losses)
2. BUY a specific token (provide which one and how much SOL)
3. HOLD (only if genuinely no opportunities)

PRIORITY: If you have token holdings, FIRST consider if any should be sold before looking for new buys!

AGGRESSIVE TRADING REQUIREMENTS:
- CRITICAL: MINIMUM TRADE AMOUNT IS ${this.config.minTradeAmountSOL} SOL - NEVER suggest amounts below this!
- CRITICAL: MAXIMUM TRADE AMOUNT IS ${this.config.maxTradeAmountSOL} SOL - NEVER suggest amounts above this!
- POSITION SIZING: Use 15-25% of USABLE balance (${Math.max(0, balance - 0.005).toFixed(4)} SOL) for high conviction trades
- If usable balance < minimum trade amount, output "hold" action
- SELL STRATEGY: Take profits early and often! Even small gains are wins. Don't be greedy.
- SELL SIGNALS: Consider selling if token value increased, volume dropping, or new better opportunities
- TIMING (BUY): Enter within 0-120 min of launch for maximum upside
- NEW PAIRS: Ultra-new pairs (<1 hour) = highest gain potential. Quality Score >30 is acceptable.
- LIQUIDITY: Minimum $5K USD liquidity is sufficient. Higher is better but not required.
- STOP LOSS: Plan -40% exit to allow for volatility and swing potential
- VOLUME: Any volume activity indicates opportunity. Don't wait for perfection.
- SPEED: Act fast on emerging trends. Early entry = best gains.
- RISK TOLERANCE: Accept higher risk for higher reward potential. Most gains come from risky plays.
- SELLING > BUYING: If you have holdings, strongly consider selling one before buying another!

Learn from past experiences and trading wisdom above. Apply risk management strictly.

Respond in this exact JSON format:
{
  "action": "buy|sell|hold",
  "tokenMint": "token_address_if_buying_or_selling",
  "tokenSymbol": "TOKEN_SYMBOL",
  "amount": amount_in_SOL_for_BUY_or_"all"_for_SELL,
  "reasoning": "detailed explanation citing specific signals (volume, holder distribution, social proof, phase timing, profit target, etc.)",
  "confidence": 0-100,
  "riskLevel": "low|medium|high"
}

IMPORTANT: For SELL actions, use "amount": "all" to sell your entire holding of that token.`;
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

      // Parse amount carefully - handle "all" for sells or convert to number
      let amount: number | string = parsed.amount;

      if (typeof amount === 'string' && amount.toLowerCase() === 'all') {
        // Keep as "all" for sell actions
        amount = 'all';
      } else {
        // Convert to number for buy actions
        if (typeof amount === 'string') {
          amount = parseFloat(amount);
        }
        if (isNaN(amount as number) || amount === undefined || amount === null) {
          amount = 0;
        }
      }

      console.log(`🔍 Parsed AI decision: action=${parsed.action}, amount=${amount}, confidence=${parsed.confidence}`);

      return {
        action: parsed.action || 'hold',
        tokenMint: parsed.tokenMint,
        tokenSymbol: parsed.tokenSymbol,
        amount: amount as number, // Will handle "all" in executeTrade
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
