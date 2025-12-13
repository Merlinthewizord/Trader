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

export interface PersistentData {
  decisions: StoredDecision[];
  transactions: StoredTransaction[];
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
        console.log(`✅ Loaded persistent data: ${this.data.decisions.length} decisions, ${this.data.transactions.length} transactions`);
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
