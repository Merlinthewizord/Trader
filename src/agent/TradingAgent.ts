import Anthropic from '@anthropic-ai/sdk';
import { SolanaWallet, TokenHolding } from '../wallet/SolanaWallet';
import { PumpFunClient, TokenInfo } from '../trading/PumpFunClient';
import { MemoryService } from '../memory/MemoryService';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';
import { DexScreenerClient, DexPair } from '../trading/DexScreenerClient';
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
  private anthropic: Anthropic;
  private wallet: SolanaWallet;
  private pumpFun: PumpFunClient;
  private config: AgentConfig;
  private memory: MemoryService;
  private knowledgeBase: KnowledgeBase;
  private dexScreener: DexScreenerClient;
  private bitQuery?: BitQueryClient;
  private conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

  constructor(
    apiKey: string,
    wallet: SolanaWallet,
    pumpFun: PumpFunClient,
    config: AgentConfig,
    memory: MemoryService,
    bitQueryV1Key?: string,
    bitQueryV2Key?: string
  ) {
    this.anthropic = new Anthropic({
      apiKey,
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
    // Get REAL on-chain balances via RPC
    const balance = await this.wallet.getBalance();

    // Get current portfolio holdings first
    console.log('💼 Checking RPC on-chain portfolio holdings...');
    const holdings = await this.wallet.getTokenHoldings();
    const portfolio = await this.getPortfolioWithPrices(holdings);
    const portfolioValue = await this.getPortfolioValue(balance, holdings);

    console.log(`\n💰 REAL-TIME PORTFOLIO VALUE:`);
    console.log(`   Total Value: $${portfolioValue.totalValueUSD.toFixed(2)} USD`);
    console.log(`   SOL: ${portfolioValue.solBalance.toFixed(4)} SOL ($${portfolioValue.solValueUSD.toFixed(2)} @ $${portfolioValue.solPriceUSD.toFixed(2)})`);
    if (portfolioValue.tokens.length > 0) {
      console.log(`   Token Holdings:`);
      portfolioValue.tokens.forEach(t => {
        console.log(`     - ${t.symbol}: ${t.balance.toFixed(2)} tokens ($${t.valueUSD.toFixed(2)})`);
      });
    } else {
      console.log(`   Token Holdings: NONE`);
    }

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
      bitQueryAnalytics,
      portfolio,
      portfolioValue
    );

    const completion = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: 'You are an expert Solana trading agent analyzing market conditions to make informed trading decisions.',
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const response = completion.content[0].type === 'text' ? completion.content[0].text : '';
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

    const completion = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: this.conversationHistory,
    });

    const response = completion.content[0].type === 'text' ? completion.content[0].text : '';

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

  private async getSolPrice(): Promise<number> {
    // Try multiple price sources with fallbacks
    const priceSources = [
      // CoinGecko API (most reliable, no auth required)
      async () => {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
          headers: { 'Accept': 'application/json' },
        });
        const data: any = await response.json();
        return data?.solana?.usd;
      },
      // Binance API (very reliable)
      async () => {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
        const data: any = await response.json();
        return parseFloat(data?.price);
      },
      // Jupiter API (original)
      async () => {
        const response = await fetch('https://price.jup.ag/v6/price?ids=SOL');
        const data: any = await response.json();
        return data?.data?.SOL?.price;
      },
    ];

    for (const source of priceSources) {
      try {
        const price = await Promise.race([
          source(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]) as number;

        if (price && price > 0) {
          return price;
        }
      } catch (error) {
        // Try next source
        continue;
      }
    }

    // All sources failed, return default
    console.error('⚠️ All SOL price sources failed, using default $200');
    return 200;
  }

  private async getPortfolioValue(solBalance: number, holdings: TokenHolding[]): Promise<{
    solBalance: number;
    solPriceUSD: number;
    solValueUSD: number;
    tokens: Array<{ mint: string; symbol: string; balance: number; priceUSD: number; valueUSD: number }>;
    totalValueUSD: number;
  }> {
    const solPrice = await this.getSolPrice();
    const solValueUSD = solBalance * solPrice;

    const tokens: Array<{ mint: string; symbol: string; balance: number; priceUSD: number; valueUSD: number }> = [];
    let tokensValueUSD = 0;

    for (const holding of holdings) {
      try {
        const tokenInfo = await this.pumpFun.getTokenInfo(holding.mint);
        if (tokenInfo && tokenInfo.usdPrice) {
          const valueUSD = holding.balance * tokenInfo.usdPrice;
          tokens.push({
            mint: holding.mint,
            symbol: tokenInfo.symbol,
            balance: holding.balance,
            priceUSD: tokenInfo.usdPrice,
            valueUSD: valueUSD,
          });
          tokensValueUSD += valueUSD;
        }
      } catch (error) {
        console.error(`Error getting price for ${holding.mint}:`, error);
      }
    }

    return {
      solBalance,
      solPriceUSD: solPrice,
      solValueUSD,
      tokens,
      totalValueUSD: solValueUSD + tokensValueUSD,
    };
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
    pairAnalysis: Array<{ pair: DexPair; quality: { score: number; signals: string[]; warnings: string[] } }>,
    tradingStats: { totalTrades: number; successfulTrades: number; failedTrades: number; successRate: number },
    memories: string[],
    bitQueryAnalytics?: Map<string, TokenAnalytics>,
    portfolio?: PortfolioPosition[],
    portfolioValue?: {
      solBalance: number;
      solPriceUSD: number;
      solValueUSD: number;
      tokens: Array<{ mint: string; symbol: string; balance: number; priceUSD: number; valueUSD: number }>;
      totalValueUSD: number;
    }
  ): string {
    const memoriesSection = memories.length > 0
      ? `\n\nPast Trading Experiences (learn from these):\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n\n')}`
      : '';

    // Get trading wisdom from knowledge base
    const tradingWisdom = this.knowledgeBase.getTradingWisdom();

    return `You are an EXPERT meme coin trading agent with comprehensive knowledge of pump.fun dynamics, risk management, and market psychology.

${tradingWisdom}

🏦 REAL-TIME PORTFOLIO (verified via RPC):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 TOTAL VALUE: $${portfolioValue?.totalValueUSD.toFixed(2) || '0.00'} USD

SOL Holdings:
  • Balance: ${balance.toFixed(4)} SOL = $${portfolioValue?.solValueUSD.toFixed(2) || '0.00'} (@ $${portfolioValue?.solPriceUSD.toFixed(2) || '0'}/SOL)
  • Usable: ${Math.max(0, balance - 0.005).toFixed(4)} SOL (reserves 0.005 for fees)
  • Trade Limits: Min ${this.config.minTradeAmountSOL} SOL | Max ${this.config.maxTradeAmountSOL} SOL

${portfolioValue && portfolioValue.tokens.length > 0 ? `
🪙 TOKEN HOLDINGS (RPC-VERIFIED - YOU OWN THESE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${portfolioValue.tokens.map((t, i) => `${i + 1}. ${t.symbol}
   📍 Mint: ${t.mint}
   💎 Balance: ${t.balance.toFixed(2)} tokens
   💵 Price: $${t.priceUSD.toFixed(6)}
   💰 Total Value: $${t.valueUSD.toFixed(2)}
   ⚠️ You can SELL this (use amount: "all" or SOL value)`).join('\n\n')}

🚨 CRITICAL: You can ONLY sell the ${portfolioValue.tokens.length} token${portfolioValue.tokens.length > 1 ? 's' : ''} listed above.
   To sell any other token = IMPOSSIBLE (you don't own it!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : `
🪙 TOKEN HOLDINGS: NONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📭 You don't own ANY tokens.
🚨 You can only BUY (cannot SELL - nothing to sell!)
   Focus on finding BUY opportunities from trending tokens below.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`}

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
