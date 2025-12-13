import { PumpFunClient, TokenInfo } from './PumpFunClient';
import { SolanaWallet } from '../wallet/SolanaWallet';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface LimitOrder {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  type: 'take_profit' | 'stop_loss';
  entryPrice: number;
  targetPrice: number;
  tokenAmount: number; // Amount of tokens to sell
  createdAt: string;
  buySignature?: string;
}

export interface LimitOrderConfig {
  takeProfitPercent: number; // e.g., 30 = +30%
  stopLossPercent: number; // e.g., -40 = -40%
}

export class LimitOrderManager {
  private orders: Map<string, LimitOrder> = new Map();
  private pumpFun: PumpFunClient;
  private wallet: SolanaWallet;
  private config: LimitOrderConfig;
  private dataPath: string;
  private monitorInterval: NodeJS.Timeout | null = null;
  private slippage: number;

  constructor(
    pumpFun: PumpFunClient,
    wallet: SolanaWallet,
    config: LimitOrderConfig,
    slippage: number = 1000,
    dataDir: string = './data'
  ) {
    this.pumpFun = pumpFun;
    this.wallet = wallet;
    this.config = config;
    this.slippage = slippage;
    this.dataPath = path.join(dataDir, 'limit-orders.json');
  }

  async initialize() {
    // Load existing limit orders from file
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const ordersArray: LimitOrder[] = JSON.parse(data);
      ordersArray.forEach(order => {
        this.orders.set(order.id, order);
      });
      console.log(`📋 Loaded ${this.orders.size} limit orders`);
    } catch (error) {
      // File doesn't exist yet, start fresh
      console.log('📋 No existing limit orders found');
    }
  }

  async createLimitOrders(
    tokenMint: string,
    tokenSymbol: string,
    entryPrice: number,
    tokenAmount: number,
    buySignature?: string
  ): Promise<{ takeProfitOrder: LimitOrder; stopLossOrder: LimitOrder }> {
    // Calculate target prices
    const takeProfitPrice = entryPrice * (1 + this.config.takeProfitPercent / 100);
    const stopLossPrice = entryPrice * (1 + this.config.stopLossPercent / 100);

    // Create take profit order
    const takeProfitOrder: LimitOrder = {
      id: `tp_${tokenMint}_${Date.now()}`,
      tokenMint,
      tokenSymbol,
      type: 'take_profit',
      entryPrice,
      targetPrice: takeProfitPrice,
      tokenAmount,
      createdAt: new Date().toISOString(),
      buySignature,
    };

    // Create stop loss order
    const stopLossOrder: LimitOrder = {
      id: `sl_${tokenMint}_${Date.now()}`,
      tokenMint,
      tokenSymbol,
      type: 'stop_loss',
      entryPrice,
      targetPrice: stopLossPrice,
      tokenAmount,
      createdAt: new Date().toISOString(),
      buySignature,
    };

    // Store orders
    this.orders.set(takeProfitOrder.id, takeProfitOrder);
    this.orders.set(stopLossOrder.id, stopLossOrder);

    await this.saveOrders();

    console.log(`✅ Created limit orders for ${tokenSymbol}:`);
    console.log(`   📈 Take Profit: $${takeProfitPrice.toFixed(6)} (+${this.config.takeProfitPercent}%)`);
    console.log(`   📉 Stop Loss: $${stopLossPrice.toFixed(6)} (${this.config.stopLossPercent}%)`);

    return { takeProfitOrder, stopLossOrder };
  }

  async checkAndExecuteOrders(): Promise<void> {
    if (this.orders.size === 0) return;

    console.log(`🔍 Checking ${this.orders.size} limit orders...`);

    for (const [orderId, order] of this.orders.entries()) {
      try {
        // Get current token price
        const tokenInfo = await this.pumpFun.getTokenInfo(order.tokenMint);
        if (!tokenInfo || !tokenInfo.usdPrice) {
          console.log(`⚠️  No price data for ${order.tokenSymbol}, skipping...`);
          continue;
        }

        const currentPrice = tokenInfo.usdPrice;
        const priceChangePercent = ((currentPrice - order.entryPrice) / order.entryPrice) * 100;

        // Check if order should be executed
        let shouldExecute = false;
        if (order.type === 'take_profit' && currentPrice >= order.targetPrice) {
          console.log(`🎯 TAKE PROFIT triggered for ${order.tokenSymbol}!`);
          console.log(`   Entry: $${order.entryPrice.toFixed(6)} → Current: $${currentPrice.toFixed(6)} (+${priceChangePercent.toFixed(2)}%)`);
          shouldExecute = true;
        } else if (order.type === 'stop_loss' && currentPrice <= order.targetPrice) {
          console.log(`🛑 STOP LOSS triggered for ${order.tokenSymbol}!`);
          console.log(`   Entry: $${order.entryPrice.toFixed(6)} → Current: $${currentPrice.toFixed(6)} (${priceChangePercent.toFixed(2)}%)`);
          shouldExecute = true;
        }

        if (shouldExecute) {
          await this.executeLimitOrder(order);
        }
      } catch (error: any) {
        console.error(`❌ Error checking order ${orderId}:`, error.message);
      }
    }
  }

  private async executeLimitOrder(order: LimitOrder): Promise<void> {
    try {
      console.log(`💰 Executing ${order.type} for ${order.tokenSymbol}...`);

      // Get actual token balance
      const actualBalance = await this.wallet.getTokenBalance(order.tokenMint);

      if (actualBalance === 0) {
        console.log(`⚠️  No ${order.tokenSymbol} tokens to sell, removing order...`);
        this.removeOrder(order.id, order.tokenMint);
        return;
      }

      // Sell all tokens
      const signature = await this.pumpFun.sellToken({
        tokenMint: order.tokenMint,
        amount: actualBalance,
        denominatedInSol: false, // Sell by token amount
        slippage: this.slippage,
      });

      console.log(`✅ Limit order executed: ${signature}`);

      // Remove both orders for this token (take profit AND stop loss)
      this.removeOrder(order.id, order.tokenMint);

    } catch (error: any) {
      console.error(`❌ Failed to execute limit order:`, error.message);
      // Don't remove order if execution failed - will retry next cycle
    }
  }

  private removeOrder(orderId: string, tokenMint: string) {
    // Remove this specific order
    this.orders.delete(orderId);

    // Remove ALL orders for this token (both take profit and stop loss)
    const ordersToRemove: string[] = [];
    for (const [id, order] of this.orders.entries()) {
      if (order.tokenMint === tokenMint) {
        ordersToRemove.push(id);
      }
    }

    ordersToRemove.forEach(id => this.orders.delete(id));

    console.log(`🗑️  Removed ${ordersToRemove.length + 1} order(s) for token`);
    this.saveOrders();
  }

  private async saveOrders() {
    try {
      const ordersArray = Array.from(this.orders.values());
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.dataPath, JSON.stringify(ordersArray, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving limit orders:', error);
    }
  }

  startMonitoring(intervalMs: number = 30000) {
    if (this.monitorInterval) {
      console.log('⚠️  Limit order monitoring already running');
      return;
    }

    console.log(`🔄 Starting limit order monitoring (checking every ${intervalMs / 1000}s)`);
    this.monitorInterval = setInterval(() => {
      this.checkAndExecuteOrders().catch(err => {
        console.error('Error in limit order monitoring:', err);
      });
    }, intervalMs);

    // Check immediately on start
    this.checkAndExecuteOrders().catch(err => {
      console.error('Error in initial limit order check:', err);
    });
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('🛑 Stopped limit order monitoring');
    }
  }

  getActiveOrders(): LimitOrder[] {
    return Array.from(this.orders.values());
  }

  getOrdersForToken(tokenMint: string): LimitOrder[] {
    return Array.from(this.orders.values()).filter(o => o.tokenMint === tokenMint);
  }
}
