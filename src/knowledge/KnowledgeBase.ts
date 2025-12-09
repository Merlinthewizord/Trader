import fs from 'fs';
import path from 'path';

export interface TradingPrinciple {
  category: string;
  principle: string;
  priority: 'critical' | 'high' | 'medium';
}

export class KnowledgeBase {
  private principles: TradingPrinciple[] = [];
  private fullGuide: string = '';

  constructor() {
    this.loadKnowledge();
  }

  private loadKnowledge() {
    try {
      const guidePath = path.join(process.cwd(), 'knowledge', 'meme-coin-trading-guide.md');
      this.fullGuide = fs.readFileSync(guidePath, 'utf-8');

      // Extract key principles for quick reference
      this.principles = this.extractPrinciples();
    } catch (error) {
      console.warn('⚠️  Could not load trading knowledge base:', error);
    }
  }

  private extractPrinciples(): TradingPrinciple[] {
    return [
      // CRITICAL Risk Management
      {
        category: 'Risk Management',
        principle: 'Never invest more than you can afford to lose. Maximum 5-10% of portfolio in meme coins.',
        priority: 'critical',
      },
      {
        category: 'Risk Management',
        principle: 'Set stop loss at -20% from entry. Use 15% trailing stop to lock profits.',
        priority: 'critical',
      },
      {
        category: 'Risk Management',
        principle: 'Maximum 3-5% of capital per trade for high-risk tokens.',
        priority: 'critical',
      },
      {
        category: 'Risk Management',
        principle: 'Take profit at 100% gain to recover initial investment.',
        priority: 'critical',
      },

      // Volume Analysis
      {
        category: 'Technical Analysis',
        principle: 'Volume is MOST IMPORTANT. Current volume > 2x the 10-period average indicates strong interest.',
        priority: 'critical',
      },
      {
        category: 'Technical Analysis',
        principle: 'Volume spike without price increase signals potential dump. Exit immediately.',
        priority: 'high',
      },

      // Red Flags (CRITICAL)
      {
        category: 'Red Flags',
        principle: 'Top 10 holders own >50% of supply = RUG RISK. Single wallet >20% = DUMP INCOMING.',
        priority: 'critical',
      },
      {
        category: 'Red Flags',
        principle: 'Unlocked liquidity = instant rug possible. Ownership not renounced = dev can change rules.',
        priority: 'critical',
      },
      {
        category: 'Red Flags',
        principle: 'Bundled buys (multiple same-second) = coordinated dump setup. Avoid.',
        priority: 'critical',
      },

      // Entry Strategy
      {
        category: 'Entry Strategy',
        principle: 'Enter Phase 1-2 of pump cycle (0-60 min), exit Phase 3-4 (FOMO peak). Never chase 5x+ pumps.',
        priority: 'high',
      },
      {
        category: 'Entry Strategy',
        principle: 'Must enter within first 5-10 minutes of launch for best gains. Exit if no momentum in 30 min.',
        priority: 'high',
      },

      // Exit Strategy
      {
        category: 'Exit Strategy',
        principle: '3-5-Hold: Sell 50% at 3x, 25% at 5x, hold 25% for moonshot. Guaranteed profit + upside.',
        priority: 'critical',
      },
      {
        category: 'Exit Strategy',
        principle: 'Emergency exit signals: Sudden volume spike with price drop = DUMP. Dev wallet moving = EXIT NOW.',
        priority: 'critical',
      },

      // Green Flags
      {
        category: 'Green Flags',
        principle: 'Organic meme creation + consistent buy pressure + growing community = strong signal.',
        priority: 'high',
      },
      {
        category: 'Green Flags',
        principle: 'Token approaching $69K market cap (Raydium migration) = momentum signal.',
        priority: 'medium',
      },

      // Psychology
      {
        category: 'Psychology',
        principle: 'Avoid FOMO. If you missed 10x, don\'t chase. There will ALWAYS be another opportunity.',
        priority: 'high',
      },
      {
        category: 'Psychology',
        principle: 'Accept 70-80% of meme coins fail. Winners must be BIG to offset many small losses.',
        priority: 'high',
      },

      // Statistics
      {
        category: 'Statistics',
        principle: '98% of Pump.fun tokens fail. Only 2% last more than 1 week. Plan accordingly.',
        priority: 'high',
      },
    ];
  }

  /**
   * Get critical principles for the AI agent's decision-making
   */
  getCriticalPrinciples(): string {
    const critical = this.principles.filter((p) => p.priority === 'critical');
    return critical.map((p) => `[${p.category}] ${p.principle}`).join('\n\n');
  }

  /**
   * Get all principles by category
   */
  getPrinciplesByCategory(category: string): string {
    const filtered = this.principles.filter((p) => p.category === category);
    return filtered.map((p) => `• ${p.principle}`).join('\n');
  }

  /**
   * Get relevant knowledge for a specific token analysis
   */
  getTokenAnalysisGuidance(tokenData: {
    holderConcentration?: number;
    volumeChange?: number;
    age?: number;
    liquidityLocked?: boolean;
  }): string[] {
    const guidance: string[] = [];

    // Check holder concentration
    if (tokenData.holderConcentration && tokenData.holderConcentration > 50) {
      guidance.push(
        '🚨 CRITICAL RED FLAG: Top holders own >50% of supply. This is a RUG PULL RISK. Recommend AVOID.'
      );
    }

    // Check volume
    if (tokenData.volumeChange && tokenData.volumeChange > 2) {
      guidance.push('✅ Volume confirms interest (>2x average). Positive signal for momentum.');
    } else if (tokenData.volumeChange && tokenData.volumeChange < 0.5) {
      guidance.push('⚠️ Low volume indicates weak interest or potential abandonment.');
    }

    // Check age
    if (tokenData.age !== undefined) {
      if (tokenData.age < 1) {
        guidance.push('⚡ Ultra-early token (<1 hour old). Highest risk, highest reward. Position size <2%.');
      } else if (tokenData.age > 24) {
        guidance.push('✅ Token survived 24+ hours. This is top 2%. Lower risk profile.');
      }
    }

    // Check liquidity
    if (tokenData.liquidityLocked === false) {
      guidance.push(
        '🚨 CRITICAL RED FLAG: Liquidity NOT locked. Instant rug pull possible. AVOID or exit immediately.'
      );
    }

    return guidance;
  }

  /**
   * Get exit strategy recommendation based on profit
   */
  getExitStrategy(profitMultiple: number): string {
    if (profitMultiple >= 10) {
      return 'SELL IMMEDIATELY: You\'ve hit 10x. This is the moonshot. Take profits now (at least 75%).';
    } else if (profitMultiple >= 5) {
      return 'TAKE PROFIT: 5x achieved. Sell 25% per 3-5-Hold strategy. Trail remaining with 15% stop.';
    } else if (profitMultiple >= 3) {
      return 'SECURE GAINS: 3x hit. Sell 50% per 3-5-Hold strategy. Let rest run with tight trailing stop.';
    } else if (profitMultiple >= 2) {
      return 'CONSIDER PROFIT: 2x reached. Sell 30-50% to secure initial investment. Risk-free from here.';
    } else if (profitMultiple <= -0.2) {
      return 'STOP LOSS TRIGGERED: -20% from entry. Exit position immediately to preserve capital.';
    } else if (profitMultiple > 0 && profitMultiple < 0.5) {
      return 'SMALL GAIN: Consider holding if fundamentals strong, or take profit if momentum weakening.';
    } else {
      return 'MONITOR: Position between -20% and 2x. Hold if thesis intact, exit if losing conviction.';
    }
  }

  /**
   * Get full trading guide
   */
  getFullGuide(): string {
    return this.fullGuide;
  }

  /**
   * Get pre-trade checklist
   */
  getPreTradeChecklist(): string[] {
    return [
      'Contract verified on RugCheck (green flags only)',
      'Liquidity locked or burned',
      'Top holder <20% supply',
      'Active social media with organic engagement',
      'Trading volume >$50K in last hour',
      'No honeypot indicators',
      'Dev wallet renounced or burned',
      'Stop loss plan in place',
      'Exit targets defined',
      'Position size <5% of portfolio',
    ];
  }

  /**
   * Generate a concise trading wisdom summary for the agent
   */
  getTradingWisdom(): string {
    return `
CRITICAL TRADING WISDOM:

1. SURVIVAL FIRST: Never risk more than you can lose. 98% of tokens fail.
2. VOLUME CONFIRMS: Volume > 2x average = real interest. Volume spike + price drop = dump.
3. RED FLAGS = EXIT: Unlocked liquidity, >50% holder concentration, bundled buys = scam.
4. EARLY ENTRY: Enter 0-60 min after launch. Exit during FOMO peak (1-4 hours).
5. TAKE PROFITS: 3x = sell 50%, 5x = sell 25%, 10x = sell rest. Don't be greedy.
6. STOP LOSSES: -20% exit rule is sacred. Protect capital above all.
7. POSITION SIZE: Max 3-5% per trade. You WILL lose often. Winners must be big.
8. NO FOMO: Missed 10x? Don't chase. Another opportunity comes in 5 minutes.
9. CHECK EVERYTHING: RugCheck, holder distribution, liquidity lock, social proof.
10. TRUST DATA: Not hype. Organic growth + volume confirmation + locked liquidity = green light.
`;
  }
}
