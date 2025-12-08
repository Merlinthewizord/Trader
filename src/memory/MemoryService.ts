import { MemoryClient } from 'mem0ai';
import { TradeDecision } from '../agent/TradingAgent';

export interface TradeRecord {
  timestamp: string;
  action: 'buy' | 'sell' | 'hold';
  tokenMint?: string;
  tokenSymbol?: string;
  amount?: number;
  reasoning: string;
  confidence: number;
  riskLevel: string;
  outcome?: 'success' | 'failure' | 'pending';
  profitLoss?: number;
  signature?: string;
  lessonLearned?: string;
}

export class MemoryService {
  private client: MemoryClient;
  private userId: string;

  constructor(apiKey: string, userId: string = 'trading-agent-001') {
    this.client = new MemoryClient(apiKey);
    this.userId = userId;
  }

  /**
   * Log a trade decision to memory
   */
  async logTrade(decision: TradeDecision, signature?: string): Promise<void> {
    try {
      const tradeRecord: TradeRecord = {
        timestamp: new Date().toISOString(),
        action: decision.action,
        tokenMint: decision.tokenMint,
        tokenSymbol: decision.tokenSymbol,
        amount: decision.amount,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        riskLevel: decision.riskLevel,
        signature: signature,
        outcome: 'pending',
      };

      // Create a structured memory entry
      const memoryText = this.formatTradeForMemory(tradeRecord);

      await this.client.add(memoryText, {
        user_id: this.userId,
        metadata: {
          type: 'trade',
          action: decision.action,
          tokenSymbol: decision.tokenSymbol,
          confidence: decision.confidence,
          riskLevel: decision.riskLevel,
          timestamp: tradeRecord.timestamp,
        },
      });

      console.log(`✅ Trade logged to memory: ${decision.action.toUpperCase()} ${decision.tokenSymbol || 'N/A'}`);
    } catch (error) {
      console.error('Error logging trade to memory:', error);
    }
  }

  /**
   * Update trade outcome with profit/loss and lessons learned
   */
  async updateTradeOutcome(
    tokenSymbol: string,
    outcome: 'success' | 'failure',
    profitLoss: number,
    lessonLearned: string
  ): Promise<void> {
    try {
      const outcomeText = `Trade outcome for ${tokenSymbol}: ${outcome.toUpperCase()}.
Profit/Loss: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(4)} SOL.
Lesson learned: ${lessonLearned}`;

      await this.client.add(outcomeText, {
        user_id: this.userId,
        metadata: {
          type: 'trade_outcome',
          tokenSymbol,
          outcome,
          profitLoss,
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`✅ Trade outcome updated for ${tokenSymbol}: ${outcome}`);
    } catch (error) {
      console.error('Error updating trade outcome:', error);
    }
  }

  /**
   * Get relevant memories for market analysis
   */
  async getRelevantMemories(query: string, limit: number = 5): Promise<string[]> {
    try {
      const memories = await this.client.search(query, {
        user_id: this.userId,
        limit,
      });

      return memories.map((m: any) => m.memory || m.text || '');
    } catch (error) {
      console.error('Error retrieving memories:', error);
      return [];
    }
  }

  /**
   * Get all memories for the agent
   */
  async getAllMemories(): Promise<any[]> {
    try {
      const memories = await this.client.getAll({
        user_id: this.userId,
      });

      return memories || [];
    } catch (error) {
      console.error('Error getting all memories:', error);
      return [];
    }
  }

  /**
   * Get trading statistics from memory
   */
  async getTradingStats(): Promise<{
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    successRate: number;
  }> {
    try {
      const memories = await this.getAllMemories();

      const tradeOutcomes = memories.filter(
        (m: any) => m.metadata?.type === 'trade_outcome'
      );

      const successfulTrades = tradeOutcomes.filter(
        (m: any) => m.metadata?.outcome === 'success'
      ).length;

      const failedTrades = tradeOutcomes.filter(
        (m: any) => m.metadata?.outcome === 'failure'
      ).length;

      const totalTrades = successfulTrades + failedTrades;
      const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;

      return {
        totalTrades,
        successfulTrades,
        failedTrades,
        successRate,
      };
    } catch (error) {
      console.error('Error getting trading stats:', error);
      return {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        successRate: 0,
      };
    }
  }

  /**
   * Get lessons learned about a specific token
   */
  async getTokenLessons(tokenSymbol: string): Promise<string[]> {
    try {
      const query = `What have I learned about trading ${tokenSymbol}?`;
      const memories = await this.getRelevantMemories(query, 3);
      return memories;
    } catch (error) {
      console.error('Error getting token lessons:', error);
      return [];
    }
  }

  /**
   * Get memories about similar market conditions
   */
  async getSimilarMarketMemories(marketDescription: string): Promise<string[]> {
    try {
      const query = `Past trades in similar market conditions: ${marketDescription}`;
      const memories = await this.getRelevantMemories(query, 5);
      return memories;
    } catch (error) {
      console.error('Error getting similar market memories:', error);
      return [];
    }
  }

  /**
   * Format trade record for memory storage
   */
  private formatTradeForMemory(trade: TradeRecord): string {
    let text = `Trade Decision on ${trade.timestamp}: ${trade.action.toUpperCase()}`;

    if (trade.tokenSymbol) {
      text += ` ${trade.tokenSymbol}`;
    }

    if (trade.amount) {
      text += ` for ${trade.amount.toFixed(4)} SOL`;
    }

    text += `.\nReasoning: ${trade.reasoning}`;
    text += `\nConfidence: ${trade.confidence}%`;
    text += `\nRisk Level: ${trade.riskLevel}`;

    if (trade.signature) {
      text += `\nTransaction: ${trade.signature}`;
    }

    return text;
  }

  /**
   * Add a general insight or observation to memory
   */
  async addInsight(insight: string): Promise<void> {
    try {
      await this.client.add(insight, {
        user_id: this.userId,
        metadata: {
          type: 'insight',
          timestamp: new Date().toISOString(),
        },
      });

      console.log('✅ Insight added to memory');
    } catch (error) {
      console.error('Error adding insight:', error);
    }
  }

  /**
   * Clear all memories (use with caution!)
   */
  async clearAllMemories(): Promise<void> {
    try {
      await this.client.deleteAll({
        user_id: this.userId,
      });

      console.log('🗑️  All memories cleared');
    } catch (error) {
      console.error('Error clearing memories:', error);
    }
  }
}
