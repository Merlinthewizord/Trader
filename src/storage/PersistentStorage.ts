import * as fs from 'fs/promises';
import * as path from 'path';
import { TradeDecision } from '../agent/TradingAgent';

export interface StoredDecision {
  decision: TradeDecision;
  timestamp: string;
  executed: boolean;
  signature?: string;
}

export interface StoredTransaction {
  signature: string;
  timestamp: string;
  status: string;
  fee: string;
  type: string;
  action?: string;
  asset?: string;
  amount?: number;
  blockTime?: number;
}

export interface WalletSnapshot {
  timestamp: string;
  balance: number;
  usdValue?: number;
}

export interface PortfolioSnapshot {
  timestamp: string;
  tokens: Array<{
    mint: string;
    symbol: string;
    balance: number;
    usdValue?: number;
    price?: number;
  }>;
}

export interface ChatMessage {
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface PriceSnapshot {
  timestamp: string;
  asset: string;
  price: number;
}

export interface AutonomousEvent {
  timestamp: string;
  type: string;
  data: any;
  description?: string;
}

export interface PersistentData {
  decisions: StoredDecision[];
  transactions: StoredTransaction[];
  walletSnapshots: WalletSnapshot[];
  portfolioHistory: PortfolioSnapshot[];
  chatHistory: ChatMessage[];
  priceHistory: PriceSnapshot[];
  autonomousEvents: AutonomousEvent[];
  lastUpdated: string;
}

export class PersistentStorage {
  private dataPath: string;
  private data: PersistentData;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string = './data') {
    this.dataPath = path.join(dataDir, 'persistent-data.json');
    this.data = {
      decisions: [],
      transactions: [],
      walletSnapshots: [],
      portfolioHistory: [],
      chatHistory: [],
      priceHistory: [],
      autonomousEvents: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  async initialize() {
    try {
      // Ensure data directory exists
      const dir = path.dirname(this.dataPath);
      await fs.mkdir(dir, { recursive: true });

      // Try to load existing data
      try {
        const fileContent = await fs.readFile(this.dataPath, 'utf-8');
        this.data = JSON.parse(fileContent);
        console.log(`✅ Loaded persistent data: ${this.data.decisions.length} decisions, ${this.data.transactions.length} transactions, ${this.data.walletSnapshots?.length || 0} wallet snapshots, ${this.data.chatHistory?.length || 0} chat messages`);
      } catch (error) {
        // File doesn't exist yet, use default empty data
        console.log('📝 No existing persistent data found, starting fresh');
        await this.save();
      }
    } catch (error) {
      console.error('Error initializing persistent storage:', error);
    }
  }

  async addDecision(decision: TradeDecision, executed: boolean = false, signature?: string) {
    const storedDecision: StoredDecision = {
      decision,
      timestamp: new Date().toISOString(),
      executed,
      signature,
    };

    // Add to beginning of array (newest first)
    this.data.decisions.unshift(storedDecision);

    // Keep only last 20 decisions
    if (this.data.decisions.length > 20) {
      this.data.decisions = this.data.decisions.slice(0, 20);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  async addTransaction(transaction: StoredTransaction) {
    // Check if transaction already exists
    const exists = this.data.transactions.some(tx => tx.signature === transaction.signature);
    if (exists) {
      return; // Don't add duplicates
    }

    // Add to beginning of array (newest first)
    this.data.transactions.unshift(transaction);

    // Keep only last 30 transactions
    if (this.data.transactions.length > 30) {
      this.data.transactions = this.data.transactions.slice(0, 30);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  async updateTransactions(transactions: StoredTransaction[]) {
    // Add new transactions that don't exist
    for (const tx of transactions) {
      const exists = this.data.transactions.some(stored => stored.signature === tx.signature);
      if (!exists) {
        this.data.transactions.unshift(tx);
      }
    }

    // Keep only last 30 transactions
    if (this.data.transactions.length > 30) {
      this.data.transactions = this.data.transactions.slice(0, 30);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  getRecentDecisions(limit: number = 10): StoredDecision[] {
    return this.data.decisions.slice(0, limit);
  }

  getRecentTransactions(limit: number = 10): StoredTransaction[] {
    return this.data.transactions.slice(0, limit);
  }

  getAllData(): PersistentData {
    return { ...this.data };
  }

  async addWalletSnapshot(balance: number, usdValue?: number) {
    const snapshot: WalletSnapshot = {
      timestamp: new Date().toISOString(),
      balance,
      usdValue,
    };

    this.data.walletSnapshots.unshift(snapshot);

    // Keep only last 100 wallet snapshots
    if (this.data.walletSnapshots.length > 100) {
      this.data.walletSnapshots = this.data.walletSnapshots.slice(0, 100);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  async addPortfolioSnapshot(tokens: Array<{
    mint: string;
    symbol: string;
    balance: number;
    usdValue?: number;
    price?: number;
  }>) {
    const snapshot: PortfolioSnapshot = {
      timestamp: new Date().toISOString(),
      tokens,
    };

    this.data.portfolioHistory.unshift(snapshot);

    // Keep only last 50 portfolio snapshots
    if (this.data.portfolioHistory.length > 50) {
      this.data.portfolioHistory = this.data.portfolioHistory.slice(0, 50);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  async addChatMessage(role: 'user' | 'assistant', content: string) {
    const message: ChatMessage = {
      timestamp: new Date().toISOString(),
      role,
      content,
    };

    this.data.chatHistory.push(message);

    // Keep only last 100 chat messages
    if (this.data.chatHistory.length > 100) {
      this.data.chatHistory = this.data.chatHistory.slice(-100);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  async addPriceSnapshot(asset: string, price: number) {
    const snapshot: PriceSnapshot = {
      timestamp: new Date().toISOString(),
      asset,
      price,
    };

    this.data.priceHistory.unshift(snapshot);

    // Keep only last 200 price snapshots (allows tracking multiple assets)
    if (this.data.priceHistory.length > 200) {
      this.data.priceHistory = this.data.priceHistory.slice(0, 200);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  async addAutonomousEvent(type: string, data: any, description?: string) {
    const event: AutonomousEvent = {
      timestamp: new Date().toISOString(),
      type,
      data,
      description,
    };

    this.data.autonomousEvents.unshift(event);

    // Keep only last 100 autonomous events
    if (this.data.autonomousEvents.length > 100) {
      this.data.autonomousEvents = this.data.autonomousEvents.slice(0, 100);
    }

    this.data.lastUpdated = new Date().toISOString();
    await this.debouncedSave();
  }

  getRecentWalletSnapshots(limit: number = 20): WalletSnapshot[] {
    return this.data.walletSnapshots.slice(0, limit);
  }

  getRecentPortfolioSnapshots(limit: number = 10): PortfolioSnapshot[] {
    return this.data.portfolioHistory.slice(0, limit);
  }

  getChatHistory(limit: number = 50): ChatMessage[] {
    return this.data.chatHistory.slice(-limit);
  }

  getRecentPriceSnapshots(asset: string, limit: number = 50): PriceSnapshot[] {
    return this.data.priceHistory
      .filter(snapshot => snapshot.asset === asset)
      .slice(0, limit);
  }

  getRecentAutonomousEvents(limit: number = 20): AutonomousEvent[] {
    return this.data.autonomousEvents.slice(0, limit);
  }

  private async debouncedSave() {
    // Debounce saves to avoid writing too frequently
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.save();
    }, 1000); // Save 1 second after last update
  }

  private async save() {
    try {
      await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
      console.log('💾 Persistent data saved');
    } catch (error) {
      console.error('Error saving persistent data:', error);
    }
  }
}
