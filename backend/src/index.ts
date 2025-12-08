import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { WalletService } from './services/WalletService.js';
import { PumpFunService } from './services/PumpFunService.js';
import { AgentService } from './services/AgentService.js';
import { setupWebSocket } from './websocket.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SOLANA_PRIVATE_KEY) {
  console.error('❌ SOLANA_PRIVATE_KEY not set in environment');
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set in environment');
  process.exit(1);
}

const walletService = new WalletService(SOLANA_RPC_URL, SOLANA_PRIVATE_KEY);
const pumpFunService = new PumpFunService(
  walletService.getConnection(),
  walletService.getKeypair()
);
const agentService = new AgentService(
  ANTHROPIC_API_KEY,
  pumpFunService,
  walletService
);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    wallet: walletService.publicKey.toBase58(),
    timestamp: Date.now(),
  });
});

app.get('/api/balance', async (req, res) => {
  try {
    const balance = await walletService.getBalance();
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

app.get('/api/tokens', async (req, res) => {
  try {
    const tokens = await pumpFunService.getTrendingTokens(10);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tokens' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Solana Trading Agent Server`);
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`💰 Wallet: ${walletService.publicKey.toBase58()}\n`);
});

const wss = new WebSocketServer({ server });
setupWebSocket(wss, agentService, walletService);

agentService.startAutonomousTrading(5);

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
