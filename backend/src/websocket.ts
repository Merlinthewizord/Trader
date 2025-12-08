import { WebSocket, WebSocketServer } from 'ws';
import { AgentService } from './services/AgentService.js';
import { WalletService } from './services/WalletService.js';
import { ChatMessage, AgentThought, Trade } from './types/index.js';

export function setupWebSocket(
  wss: WebSocketServer,
  agentService: AgentService,
  walletService: WalletService
) {
  console.log('🔌 WebSocket server initialized');

  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  agentService.setThoughtCallback((thought: AgentThought) => {
    broadcast({ type: 'thought', data: thought });
  });

  agentService.setTradeCallback((trade: Trade) => {
    broadcast({ type: 'trade', data: trade });
  });

  wss.on('connection', async (ws: WebSocket) => {
    console.log('👤 Client connected');

    const balance = await walletService.getBalance();
    ws.send(JSON.stringify({ type: 'balance', data: balance }));

    ws.send(JSON.stringify({
      type: 'system',
      data: {
        message: '🤖 Trading agent connected. Type "analyze" to trigger market analysis.',
        walletAddress: walletService.publicKey.toBase58(),
      },
    }));

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'chat') {
          const userMessage: ChatMessage = {
            id: Math.random().toString(36).substring(7),
            role: 'user',
            content: message.content,
            timestamp: Date.now(),
          };

          broadcast({ type: 'chat', data: userMessage });

          if (message.content.toLowerCase().includes('analyze')) {
            agentService.autonomousAnalysis();
          }

          const response = await agentService.chat(message.content);

          const agentMessage: ChatMessage = {
            id: Math.random().toString(36).substring(7),
            role: 'agent',
            content: response,
            timestamp: Date.now(),
          };

          broadcast({ type: 'chat', data: agentMessage });
        } else if (message.type === 'getBalance') {
          const balance = await walletService.getBalance();
          broadcast({ type: 'balance', data: balance });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Failed to process message' },
        }));
      }
    });

    ws.on('close', () => {
      console.log('👤 Client disconnected');
    });
  });

  const balanceUpdateInterval = setInterval(async () => {
    try {
      const balance = await walletService.getBalance();
      broadcast({ type: 'balance', data: balance });
    } catch (error) {
      console.error('Error updating balance:', error);
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(balanceUpdateInterval);
  });
}
