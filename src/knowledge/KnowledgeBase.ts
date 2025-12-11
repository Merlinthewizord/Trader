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

    // Check holder concentration (much more lenient)
    if (tokenData.holderConcentration && tokenData.holderConcentration > 80) {
      guidance.push(
        '⚠️ Note: Top holders own >80% of supply. Higher risk but can still be profitable if caught early.'
      );
    }

    // Check volume
    if (tokenData.volumeChange && tokenData.volumeChange > 1) {
      guidance.push('✅ Volume activity detected. Momentum building.');
    } else if (tokenData.volumeChange && tokenData.volumeChange < 0.2) {
      guidance.push('ℹ️ Low volume but early tokens often start slow.');
    }

    // Check age
    if (tokenData.age !== undefined) {
      if (tokenData.age < 1) {
        guidance.push('🚀 Ultra-early token (<1 hour old). MAXIMUM GAIN POTENTIAL. Go aggressive!');
      } else if (tokenData.age > 24) {
        guidance.push('✅ Token survived 24+ hours. Proven staying power.');
      }
    }

    // Check liquidity (informational only, not blocking)
    if (tokenData.liquidityLocked === false) {
      guidance.push(
        'ℹ️ Liquidity not locked. Monitor closely but doesn\'t prevent entry on early opportunities.'
      );
    }

    return guidance;
  }

  /**
   * Get exit strategy recommendation based on profit
   */
  getExitStrategy(profitMultiple: number): string {
    if (profitMultiple >= 20) {
      return 'MASSIVE WIN: 20x+! Take 50-75% profit and let rest ride for even bigger gains.';
    } else if (profitMultiple >= 10) {
      return 'EXCELLENT: 10x achieved. Consider taking 30-50% profit, hold rest for moonshot potential.';
    } else if (profitMultiple >= 5) {
      return 'STRONG GAINS: 5x hit. Can take 25% profit but consider holding for bigger multiples.';
    } else if (profitMultiple >= 3) {
      return 'GOOD PROFIT: 3x reached. Hold for bigger gains or take small profit if momentum weakens.';
    } else if (profitMultiple >= 2) {
      return 'EARLY PROFIT: 2x is just the start. Hold for bigger multiples unless red flags appear.';
    } else if (profitMultiple <= -0.4) {
      return 'STOP LOSS: -40% from entry. Consider exiting to preserve capital.';
    } else if (profitMultiple > 0 && profitMultiple < 1) {
      return 'BUILDING: Small gains, let it run. Patience pays in meme coins.';
    } else {
      return 'HOLD: Position still developing. Give it time to reach 5-10x targets.';
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
      'Token has any trading volume',
      'Liquidity exists (minimum $5K)',
      'Basic contract information available',
      'Entry timing is early (<2 hours from launch)',
      'Position sized aggressively (15-25% for high conviction)',
      'Stop loss mentally set at -40%',
      'Target gains: 10x+ minimum',
      'Ready to act fast on momentum',
    ];
  }

  /**
   * Generate a concise trading wisdom summary for the agent
   */
  getTradingWisdom(): string {
    return `
AGGRESSIVE TRADING STRATEGY:

1. HIGH RISK, HIGH REWARD: Trade aggressively to capture early gains. Speed matters more than perfection.
2. VOLUME IS KING: Any volume activity = potential opportunity. Don't overthink it.
3. ACCEPT RISK: Take calculated risks on new launches. You miss 100% of shots you don't take.
4. ULTRA-EARLY ENTRY: Enter within 0-120 min of launch for maximum gains. Early bird gets the worm.
5. RIDE THE WAVE: Hold for bigger multiples. Don't sell too early. 10x+ is the goal.
6. FLEXIBLE STOPS: -40% stop loss gives room for volatility. Meme coins swing hard.
7. AGGRESSIVE SIZING: Use 15-25% per trade for high conviction plays. Go big or go home.
8. MOMENTUM TRADING: Volume spikes = opportunity. Jump on trends quickly.
9. FAST DECISIONS: Speed > Perfection. Analyze quickly and act decisively.
10. TRUST YOUR GUT: Data helps but don't let it paralyze you. Take action.
`;
  }
}
