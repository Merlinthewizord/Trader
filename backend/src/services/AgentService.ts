import Anthropic from '@anthropic-ai/sdk';
import { PumpFunToken, AgentThought, Trade, WalletBalance } from '../types/index.js';
import { PumpFunService } from './PumpFunService.js';
import { WalletService } from './WalletService.js';

export class AgentService {
  private anthropic: Anthropic;
  private pumpFunService: PumpFunService;
  private walletService: WalletService;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private isAnalyzing: boolean = false;
  private onThought?: (thought: AgentThought) => void;
  private onTrade?: (trade: Trade) => void;

  constructor(
    apiKey: string,
    pumpFunService: PumpFunService,
    walletService: WalletService
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.pumpFunService = pumpFunService;
    this.walletService = walletService;
  }

  setThoughtCallback(callback: (thought: AgentThought) => void) {
    this.onThought = callback;
  }

  setTradeCallback(callback: (trade: Trade) => void) {
    this.onTrade = callback;
  }

  private emitThought(type: AgentThought['type'], content: string, metadata?: Record<string, any>) {
    const thought: AgentThought = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      type,
      content,
      metadata,
    };
    if (this.onThought) {
      this.onThought(thought);
    }
  }

  async chat(userMessage: string): Promise<string> {
    try {
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      const systemPrompt = `You are a Solana trading agent specialized in analyzing pump.fun tokens. You have:
- A Solana wallet with real funds
- Access to pump.fun market data
- The ability to execute buy/sell trades

Your personality:
- Analytical and data-driven
- Cautious but opportunistic
- Transparent about your reasoning
- Conversational and engaging

When analyzing tokens, consider:
- Market cap and liquidity
- Volume and price trends
- Holder count and distribution
- Risk vs reward ratio

Current wallet address: ${this.walletService.publicKey.toBase58()}

Keep responses concise and actionable. When you make trading decisions, explain your reasoning clearly.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages: this.conversationHistory.slice(-10),
      });

      const assistantMessage = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      return assistantMessage;
    } catch (error) {
      console.error('Error in chat:', error);
      throw error;
    }
  }

  async autonomousAnalysis() {
    if (this.isAnalyzing) {
      console.log('⚠️ Analysis already in progress');
      return;
    }

    this.isAnalyzing = true;

    try {
      this.emitThought('analysis', '🔍 Starting market analysis...');

      const tokens = await this.pumpFunService.getTrendingTokens(5);
      this.emitThought('analysis', `📊 Found ${tokens.length} trending tokens to analyze`);

      const balance = await this.walletService.getBalance();
      this.emitThought('analysis', `💰 Current balance: ${balance.sol.toFixed(4)} SOL`);

      for (const token of tokens) {
        await this.analyzeAndTrade(token, balance);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      this.emitThought('analysis', '✅ Market analysis complete');
    } catch (error) {
      this.emitThought('error', `❌ Error during analysis: ${error}`);
      console.error('Error in autonomous analysis:', error);
    } finally {
      this.isAnalyzing = false;
    }
  }

  private async analyzeAndTrade(token: PumpFunToken, balance: WalletBalance) {
    try {
      this.emitThought('analysis', `Analyzing ${token.symbol} (${token.name})`);

      const analysis = await this.getTokenAnalysis(token, balance);

      this.emitThought('decision', analysis.reasoning, {
        token: token.symbol,
        action: analysis.action,
        confidence: analysis.confidence,
      });

      if (analysis.shouldTrade && analysis.action === 'buy' && balance.sol > 0.02) {
        const tradeAmount = Math.min(0.01, balance.sol * 0.1);

        this.emitThought('execution', `🔄 Executing BUY for ${token.symbol}: ${tradeAmount.toFixed(4)} SOL`);

        const result = await this.pumpFunService.buyToken(token.mint, tradeAmount);

        if (result.success) {
          const trade: Trade = {
            id: result.signature,
            type: 'buy',
            token: token.symbol,
            amount: tradeAmount,
            price: 0,
            timestamp: Date.now(),
            reasoning: analysis.reasoning,
            signature: result.signature,
          };

          this.emitThought('execution', `✅ Successfully bought ${token.symbol}`, { trade });
          if (this.onTrade) {
            this.onTrade(trade);
          }
        } else {
          this.emitThought('error', `❌ Failed to buy ${token.symbol}`);
        }
      }
    } catch (error) {
      this.emitThought('error', `Error analyzing ${token.symbol}: ${error}`);
    }
  }

  private async getTokenAnalysis(token: PumpFunToken, balance: WalletBalance): Promise<{
    shouldTrade: boolean;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    reasoning: string;
  }> {
    try {
      const prompt = `Analyze this pump.fun token for trading:

Token: ${token.name} (${token.symbol})
Market Cap: $${token.marketCap.toLocaleString()}
Liquidity: $${token.liquidity.toLocaleString()}
24h Volume: $${token.volume24h.toLocaleString()}
24h Price Change: ${token.priceChange24h.toFixed(2)}%
Holders: ${token.holders}
Age: ${Math.floor((Date.now() - token.createdAt) / 3600000)} hours

Current wallet balance: ${balance.sol.toFixed(4)} SOL

Provide your analysis in this exact format:
ACTION: [BUY/SELL/HOLD]
CONFIDENCE: [0-100]
REASONING: [Your reasoning in 1-2 sentences]

Be cautious and only recommend BUY if there's strong momentum and reasonable risk.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      const actionMatch = text.match(/ACTION:\s*(BUY|SELL|HOLD)/i);
      const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/);
      const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=\n\n|\n[A-Z]+:|$)/s);

      const action = (actionMatch?.[1]?.toLowerCase() as 'buy' | 'sell' | 'hold') || 'hold';
      const confidence = parseInt(confidenceMatch?.[1] || '0');
      const reasoning = reasoningMatch?.[1]?.trim() || 'No clear signal';

      return {
        shouldTrade: action !== 'hold' && confidence > 60,
        action,
        confidence,
        reasoning: `${token.symbol}: ${reasoning}`,
      };
    } catch (error) {
      console.error('Error getting token analysis:', error);
      return {
        shouldTrade: false,
        action: 'hold',
        confidence: 0,
        reasoning: 'Analysis failed',
      };
    }
  }

  startAutonomousTrading(intervalMinutes: number = 5) {
    console.log(`🤖 Starting autonomous trading (interval: ${intervalMinutes}m)`);

    this.autonomousAnalysis();

    setInterval(() => {
      this.autonomousAnalysis();
    }, intervalMinutes * 60 * 1000);
  }
}
