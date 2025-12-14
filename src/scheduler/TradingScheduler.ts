import { TradingAgent, TradeDecision } from '../agent/TradingAgent';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { LimitOrderManager } from '../trading/LimitOrderManager';

export interface TradingSchedulerConfig {
  intervalMinutes: number;
  autoExecute: boolean;
  minConfidenceForAutoTrade: number; // 0-100
  minConfidenceForHighRisk: number; // 0-100
  enabled: boolean;
}

export interface TradingEvent {
  timestamp: string;
  type: 'analysis' | 'decision' | 'trade' | 'error' | 'limit_order';
  data: any;
}

export class TradingScheduler {
  private agent: TradingAgent;
  private wallet: SolanaWallet;
  private limitOrderManager?: LimitOrderManager;
  private config: TradingSchedulerConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private eventListeners: ((event: TradingEvent) => void)[] = [];
  private isAnalyzing = false;

  constructor(
    agent: TradingAgent,
    wallet: SolanaWallet,
    config: TradingSchedulerConfig,
    limitOrderManager?: LimitOrderManager
  ) {
    this.agent = agent;
    this.wallet = wallet;
    this.config = config;
    this.limitOrderManager = limitOrderManager;
  }

  start() {
    if (this.intervalId) {
      console.log('⚠️  Trading scheduler already running');
      return;
    }

    console.log(`🤖 Starting autonomous trading bot...`);
    console.log(`   Interval: ${this.config.intervalMinutes} minutes`);
    console.log(`   Auto-execute: ${this.config.autoExecute ? 'YES' : 'NO'}`);
    console.log(`   Min confidence: ${this.config.minConfidenceForAutoTrade}%`);

    // Run immediately on start
    this.runTradingCycle();

    // Then run on interval
    this.intervalId = setInterval(
      () => this.runTradingCycle(),
      this.config.intervalMinutes * 60 * 1000
    );

    this.emitEvent({
      timestamp: new Date().toISOString(),
      type: 'analysis',
      data: { message: 'Autonomous trading bot started', config: this.config },
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Trading scheduler stopped');

      this.emitEvent({
        timestamp: new Date().toISOString(),
        type: 'analysis',
        data: { message: 'Autonomous trading bot stopped' },
      });
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  onEvent(listener: (event: TradingEvent) => void) {
    this.eventListeners.push(listener);
  }

  private emitEvent(event: TradingEvent) {
    this.eventListeners.forEach((listener) => listener(event));
  }

  private async runTradingCycle() {
    if (this.isAnalyzing) {
      console.log('⏭️  Skipping cycle - previous analysis still running');
      return;
    }

    this.isAnalyzing = true;

    try {
      const cycleStart = new Date();
      console.log(`\n${'🦅'.repeat(30)}`);
      console.log(`🇺🇸 PATRIOT TRADING CYCLE - ${cycleStart.toLocaleString()}`);
      console.log(`${'🦅'.repeat(30)}\n`);

      // STEP 1: Check portfolio positions vs stop loss and take profit
      if (this.limitOrderManager) {
        console.log('🎯 ============================================');
        console.log('📊 STEP 1: CHECKING PORTFOLIO POSITIONS');
        console.log('   Evaluating stop loss and take profit levels...');
        console.log('🎯 ============================================\n');

        try {
          await this.limitOrderManager.checkAndExecuteOrders();
          console.log('✅ Portfolio check complete\n');

          this.emitEvent({
            timestamp: new Date().toISOString(),
            type: 'limit_order',
            data: { message: 'Portfolio position check completed' },
          });
        } catch (error: any) {
          console.error('⚠️  Error checking limit orders:', error.message);
        }
      }

      // STEP 2: Get current balance
      const balance = await this.wallet.getBalance();
      console.log(`💰 FREEDOM FUNDS: ${balance.toFixed(4)} SOL\n`);

      this.emitEvent({
        timestamp: cycleStart.toISOString(),
        type: 'analysis',
        data: { message: 'PATRIOT analyzing markets for AMERICA...', balance },
      });

      // STEP 3: Scan market and analyze for new opportunities
      console.log('🦅 ============================================');
      console.log('📈 STEP 2: SCANNING MARKET FOR OPPORTUNITIES');
      console.log('   Analyzing trending tokens and new pairs...');
      console.log('🦅 ============================================\n');

      const decision = await this.agent.analyzeMarket();

      // STEP 3: Make trading decision
      console.log('\n📊 ============================================');
      console.log('🎯 STEP 3: TRADING DECISION');
      console.log('📊 ============================================');
      console.log(`   Action: ${decision.action.toUpperCase()}`);
      console.log(`   Token: ${decision.tokenSymbol || 'N/A'}`);
      console.log(`   Amount: ${decision.amount || 'N/A'} SOL`);
      console.log(`   Confidence: ${decision.confidence}%`);
      console.log(`   Risk Level: ${decision.riskLevel}`);
      console.log(`   PATRIOT's Analysis: ${decision.reasoning}`);
      console.log('📊 ============================================\n');

      this.emitEvent({
        timestamp: new Date().toISOString(),
        type: 'decision',
        data: decision,
      });

      // Auto-execute if configured and confidence is high enough
      if (this.config.autoExecute && this.shouldAutoExecute(decision)) {
        console.log(`\n⚡ AUTO-EXECUTING TRADE (confidence: ${decision.confidence}% >= ${this.config.minConfidenceForAutoTrade}%)`);

        try {
          const signature = await this.agent.executeTrade(decision);

          if (signature) {
            console.log(`✅ Trade executed successfully!`);
            console.log(`   Signature: ${signature}`);

            this.emitEvent({
              timestamp: new Date().toISOString(),
              type: 'trade',
              data: {
                ...decision,
                signature,
                executed: true,
                autoExecuted: true,
              },
            });
          } else {
            console.log('ℹ️  No trade executed (HOLD decision)');
          }
        } catch (error: any) {
          console.error('❌ Trade execution failed:', error.message);

          this.emitEvent({
            timestamp: new Date().toISOString(),
            type: 'error',
            data: {
              message: 'Trade execution failed',
              error: error.message,
              decision,
            },
          });
        }
      } else if (decision.action !== 'hold') {
        console.log(`\n⏸️  Trade NOT auto-executed:`);
        if (!this.config.autoExecute) {
          console.log(`   Reason: Auto-execution disabled`);
        } else {
          console.log(`   Reason: Confidence ${decision.confidence}% < ${this.config.minConfidenceForAutoTrade}%`);
        }
      }

      const cycleEnd = new Date();
      const duration = (cycleEnd.getTime() - cycleStart.getTime()) / 1000;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ CYCLE COMPLETED - ${cycleEnd.toLocaleString()} (${duration.toFixed(1)}s)`);
      console.log(`   Next cycle in ${this.config.intervalMinutes} minutes`);
      console.log(`${'='.repeat(60)}\n`);
    } catch (error: any) {
      console.error('❌ Trading cycle error:', error);

      this.emitEvent({
        timestamp: new Date().toISOString(),
        type: 'error',
        data: {
          message: 'Trading cycle failed',
          error: error.message,
        },
      });
    } finally {
      this.isAnalyzing = false;
    }
  }

  private shouldAutoExecute(decision: TradeDecision): boolean {
    // Don't execute HOLD decisions
    if (decision.action === 'hold') {
      return false;
    }

    // Check confidence threshold
    if (decision.confidence < this.config.minConfidenceForAutoTrade) {
      return false;
    }

    // Don't execute high-risk trades without higher confidence
    if (decision.riskLevel === 'high' && decision.confidence < this.config.minConfidenceForHighRisk) {
      return false;
    }

    return true;
  }

  updateConfig(config: Partial<TradingSchedulerConfig>) {
    this.config = { ...this.config, ...config };
    console.log('⚙️  Scheduler config updated:', this.config);

    this.emitEvent({
      timestamp: new Date().toISOString(),
      type: 'analysis',
      data: { message: 'Configuration updated', config: this.config },
    });
  }
}
