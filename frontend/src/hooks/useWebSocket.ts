import { useEffect, useState, useCallback, useRef } from 'react';
import { ChatMessage, AgentThought, WalletBalance, Trade } from '../types';

const WS_URL = 'ws://localhost:3001';

export function useWebSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Connected to trading agent');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'chat':
          setMessages((prev) => [...prev, data.data]);
          break;
        case 'thought':
          setThoughts((prev) => [...prev, data.data].slice(-50));
          break;
        case 'balance':
          setBalance(data.data);
          break;
        case 'trade':
          setTrades((prev) => [data.data, ...prev].slice(0, 20));
          break;
        case 'system':
          setMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(7),
              role: 'agent',
              content: data.data.message,
              timestamp: Date.now(),
            },
          ]);
          break;
      }
    };

    ws.onclose = () => {
      console.log('❌ Disconnected from trading agent');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat',
          content,
        })
      );
    }
  }, []);

  const refreshBalance = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'getBalance',
        })
      );
    }
  }, []);

  return {
    messages,
    thoughts,
    balance,
    trades,
    connected,
    sendMessage,
    refreshBalance,
  };
}
