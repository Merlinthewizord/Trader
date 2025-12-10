import express, { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { TradingAgent } from '../agent/TradingAgent';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { PumpFunClient } from '../trading/PumpFunClient';
import { TradingScheduler } from '../scheduler/TradingScheduler';
import { TwitterSpacesBot } from '../twitter/TwitterSpacesBot';

export interface ClientMessage {
  type: 'chat' | 'analyze' | 'execute_trade';
  data: any;
}

export interface ServerMessage {
  type: 'chat_response' | 'trade_decision' | 'wallet_update' | 'error' | 'thinking' | 'autonomous_event';
  data: any;
}

export class WebServer {
  private app: Express;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private agent: TradingAgent;
  private wallet: SolanaWallet;
  private pumpFun: PumpFunClient;
  private scheduler: TradingScheduler;
  private twitterBot?: TwitterSpacesBot;
  private clients: Set<WebSocket> = new Set();

  constructor(agent: TradingAgent, wallet: SolanaWallet, pumpFun: PumpFunClient, scheduler: TradingScheduler, twitterBot?: TwitterSpacesBot) {
    this.app = express();
    this.agent = agent;
    this.wallet = wallet;
    this.pumpFun = pumpFun;
    this.scheduler = scheduler;
    this.twitterBot = twitterBot;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSchedulerEvents();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private setupRoutes() {
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/wallet/balance', async (req: Request, res: Response) => {
      try {
        const balance = await this.wallet.getBalance();
        const address = this.wallet.getAddress();
        res.json({ balance, address });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/wallet/transactions', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 10;
        console.log(`📋 Fetching ${limit} recent transactions via Helius RPC...`);

        const transactions = await this.wallet.getRecentTransactions(limit);

        // Enhance transactions with more details
        const enhancedTxs = transactions.map((tx: any) => {
          // Format timestamp properly
          let timestamp = 'Pending';
          if (tx.blockTime) {
            const date = new Date(tx.blockTime * 1000);
            // Format: Dec 9, 2025 at 5:30 PM
            timestamp = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }) + ' at ' + date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
          }

          return {
            signature: tx.signature,
            timestamp,
            status: tx.err ? '❌ Failed' : '✅ Success',
            fee: tx.meta?.fee ? (tx.meta.fee / 1e9).toFixed(6) + ' SOL' : 'N/A',
            type: this.detectTransactionType(tx),
          };
        });

        console.log(`✅ Retrieved ${enhancedTxs.length} transactions from Helius`);
        res.json({ transactions: enhancedTxs });
      } catch (error: any) {
        console.error('❌ Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tokens/trending', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 20;
        const tokens = await this.pumpFun.getTrendingTokens(limit);
        res.json({ tokens });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agent/chat', async (req: Request, res: Response) => {
      try {
        const { message } = req.body;
        const response = await this.agent.chat(message);
        res.json({ response });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agent/analyze', async (req: Request, res: Response) => {
      try {
        console.log('🔍 Analyze endpoint called');
        const decision = await this.agent.analyzeMarket();
        console.log('✅ Market analysis complete');
        res.json({ decision });
      } catch (error: any) {
        console.error('❌ Error in analyze endpoint:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agent/execute', async (req: Request, res: Response) => {
      try {
        console.log('⚡ Execute trade endpoint called');
        const { decision } = req.body;
        const signature = await this.agent.executeTrade(decision);
        console.log('✅ Trade executed:', signature);
        res.json({ signature, executed: true });
      } catch (error: any) {
        console.error('❌ Error in execute endpoint:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Autonomous trading control endpoints
    this.app.get('/api/scheduler/status', (req: Request, res: Response) => {
      try {
        res.json({
          running: this.scheduler.isRunning(),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/scheduler/start', (req: Request, res: Response) => {
      try {
        this.scheduler.start();
        res.json({ status: 'started', running: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/scheduler/stop', (req: Request, res: Response) => {
      try {
        this.scheduler.stop();
        res.json({ status: 'stopped', running: false });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/scheduler/config', (req: Request, res: Response) => {
      try {
        const config = req.body;
        this.scheduler.updateConfig(config);
        res.json({ status: 'updated', config });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Twitter Spaces Bot endpoints
    this.app.get('/api/twitter/status', (req: Request, res: Response) => {
      try {
        if (!this.twitterBot) {
          return res.json({ enabled: false, message: 'Twitter bot not initialized' });
        }
        const status = this.twitterBot.getStatus();
        res.json({ enabled: true, ...status });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/twitter/search', async (req: Request, res: Response) => {
      try {
        if (!this.twitterBot) {
          return res.status(400).json({ error: 'Twitter bot not initialized' });
        }
        const query = (req.query.q as string) || 'crypto trading';
        const spaces = await this.twitterBot.searchLiveSpaces(query);
        res.json({ spaces });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/twitter/join', async (req: Request, res: Response) => {
      try {
        if (!this.twitterBot) {
          return res.status(400).json({ error: 'Twitter bot not initialized' });
        }
        const { spaceId } = req.body;
        if (!spaceId) {
          return res.status(400).json({ error: 'spaceId is required' });
        }
        const success = await this.twitterBot.joinSpace(spaceId);
        res.json({ success, spaceId });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/twitter/leave', async (req: Request, res: Response) => {
      try {
        if (!this.twitterBot) {
          return res.status(400).json({ error: 'Twitter bot not initialized' });
        }
        await this.twitterBot.leaveSpace();
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/twitter/speak', async (req: Request, res: Response) => {
      try {
        if (!this.twitterBot) {
          return res.status(400).json({ error: 'Twitter bot not initialized' });
        }
        const { message } = req.body;
        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }
        await this.twitterBot.generateAndSpeak(message);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/twitter/auto-join', async (req: Request, res: Response) => {
      try {
        if (!this.twitterBot) {
          return res.status(400).json({ error: 'Twitter bot not initialized' });
        }
        const { query, intervalMinutes } = req.body;
        await this.twitterBot.startAutoJoinMode(
          query || 'crypto trading solana',
          intervalMinutes || 5
        );
        res.json({ success: true, mode: 'auto-join', query, intervalMinutes });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private setupSchedulerEvents() {
    // Listen for scheduler events and broadcast to all connected clients
    this.scheduler.onEvent((event) => {
      this.broadcast({
        type: 'autonomous_event',
        data: event,
      });
    });
  }

  private setupWebSocket() {
    if (!this.server) return;

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket client connected');
      this.clients.add(ws);

      ws.on('message', async (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          await this.handleClientMessage(ws, message);
        } catch (error: any) {
          this.sendToClient(ws, {
            type: 'error',
            data: { message: error.message },
          });
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      // Send initial wallet state
      this.sendWalletUpdate(ws);
    });
  }

  private async handleClientMessage(ws: WebSocket, message: ClientMessage) {
    switch (message.type) {
      case 'chat':
        const chatResponse = await this.agent.chat(message.data.message);
        this.sendToClient(ws, {
          type: 'chat_response',
          data: { message: chatResponse },
        });
        break;

      case 'analyze':
        this.sendToClient(ws, {
          type: 'thinking',
          data: { message: 'Analyzing market conditions...' },
        });

        const decision = await this.agent.analyzeMarket();
        this.sendToClient(ws, {
          type: 'trade_decision',
          data: decision,
        });
        break;

      case 'execute_trade':
        this.sendToClient(ws, {
          type: 'thinking',
          data: { message: 'Executing trade...' },
        });

        const signature = await this.agent.executeTrade(message.data.decision);
        this.sendToClient(ws, {
          type: 'trade_decision',
          data: {
            ...message.data.decision,
            signature,
            executed: true
          },
        });

        // Update wallet balance after trade
        await this.sendWalletUpdate(ws);
        break;
    }
  }

  private async sendWalletUpdate(ws: WebSocket) {
    const balance = await this.wallet.getBalance();
    const address = this.wallet.getAddress();
    const transactions = await this.wallet.getRecentTransactions(5);

    this.sendToClient(ws, {
      type: 'wallet_update',
      data: { balance, address, transactions },
    });
  }

  private sendToClient(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private detectTransactionType(tx: any): string {
    if (!tx.meta) return '❓ Unknown Transaction';

    try {
      // Check transaction logs for pump.fun activity
      const logs = tx.meta.logMessages || [];
      const logText = logs.join(' ').toLowerCase();

      // Detect pump.fun/Raydium swaps
      if (logText.includes('swap') || logText.includes('raydium') || logText.includes('pump')) {
        const preBalances = tx.meta.preBalances || [];
        const postBalances = tx.meta.postBalances || [];

        if (preBalances.length > 0 && postBalances.length > 0) {
          const solChange = (postBalances[0] - preBalances[0]) / 1e9;

          // Check token balances to determine buy/sell
          const preTokenBalances = tx.meta.preTokenBalances || [];
          const postTokenBalances = tx.meta.postTokenBalances || [];

          if (solChange < -0.001 && postTokenBalances.length > preTokenBalances.length) {
            // Spent SOL and gained tokens = BUY
            return `🟢 Buy Token (${Math.abs(solChange).toFixed(4)} SOL)`;
          } else if (solChange > 0.001 && preTokenBalances.length > postTokenBalances.length) {
            // Gained SOL and lost tokens = SELL
            return `🔴 Sell Token (+${solChange.toFixed(4)} SOL)`;
          } else if (solChange < -0.001) {
            return `💱 Token Swap (${Math.abs(solChange).toFixed(4)} SOL)`;
          } else if (solChange > 0.001) {
            return `💱 Token Swap (+${solChange.toFixed(4)} SOL)`;
          }
        }

        return '💱 Token Swap';
      }

      // Check for SOL transfers
      const preBalances = tx.meta.preBalances || [];
      const postBalances = tx.meta.postBalances || [];

      if (preBalances.length > 0 && postBalances.length > 0) {
        const balanceChange = (postBalances[0] - preBalances[0]) / 1e9;

        if (balanceChange > 0.001) {
          return `📥 Received ${balanceChange.toFixed(4)} SOL`;
        }
        if (balanceChange < -0.001) {
          return `📤 Sent ${Math.abs(balanceChange).toFixed(4)} SOL`;
        }
      }

      // Check for token transfers
      const preTokenBalances = tx.meta.preTokenBalances || [];
      const postTokenBalances = tx.meta.postTokenBalances || [];

      if (postTokenBalances.length > preTokenBalances.length) {
        return '📥 Received Tokens';
      }
      if (postTokenBalances.length < preTokenBalances.length) {
        return '📤 Sent Tokens';
      }

      // Check for program interactions
      if (tx.transaction?.message?.instructions) {
        const instructions = tx.transaction.message.instructions;
        if (instructions.length > 0) {
          return '⚙️ Program Interaction';
        }
      }

      return '🔄 Transaction';
    } catch (error) {
      console.error('Error detecting transaction type:', error);
      return '❓ Unknown Transaction';
    }
  }

  broadcast(message: ServerMessage) {
    this.clients.forEach((client) => {
      this.sendToClient(client, message);
    });
  }

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
        this.setupWebSocket();
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss?.close();
      this.server?.close(() => {
        console.log('Server stopped');
        resolve();
      });
    });
  }
}
