import express, { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { TradingAgent } from '../agent/TradingAgent';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { PumpFunClient } from '../trading/PumpFunClient';

export interface ClientMessage {
  type: 'chat' | 'analyze' | 'execute_trade';
  data: any;
}

export interface ServerMessage {
  type: 'chat_response' | 'trade_decision' | 'wallet_update' | 'error' | 'thinking';
  data: any;
}

export class WebServer {
  private app: Express;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private agent: TradingAgent;
  private wallet: SolanaWallet;
  private pumpFun: PumpFunClient;
  private clients: Set<WebSocket> = new Set();

  constructor(agent: TradingAgent, wallet: SolanaWallet, pumpFun: PumpFunClient) {
    this.app = express();
    this.agent = agent;
    this.wallet = wallet;
    this.pumpFun = pumpFun;

    this.setupMiddleware();
    this.setupRoutes();
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
        const transactions = await this.wallet.getRecentTransactions(limit);

        // Enhance transactions with more details
        const enhancedTxs = transactions.map((tx: any) => ({
          signature: tx.signature,
          timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : 'Pending',
          status: tx.meta?.err ? '❌ Failed' : '✅ Success',
          fee: tx.meta?.fee ? (tx.meta.fee / 1e9).toFixed(6) + ' SOL' : 'N/A',
          type: this.detectTransactionType(tx),
        }));

        res.json({ transactions: enhancedTxs });
      } catch (error: any) {
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
    if (!tx.meta) return '❓ Unknown';

    const preBalances = tx.meta.preBalances || [];
    const postBalances = tx.meta.postBalances || [];

    if (preBalances.length > 0 && postBalances.length > 0) {
      const balanceChange = (postBalances[0] - preBalances[0]) / 1e9;
      if (balanceChange > 0.001) return '📥 Received';
      if (balanceChange < -0.001) return '📤 Sent/Trade';
    }

    return '🔄 Transaction';
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
