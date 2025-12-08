export interface WalletBalance {
  sol: number;
  tokens: TokenBalance[];
  totalValueUSD: number;
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  amount: number;
  decimals: number;
  valueUSD?: number;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  token: string;
  amount: number;
  price: number;
  timestamp: number;
  reasoning: string;
  signature?: string;
}

export interface AgentThought {
  id: string;
  timestamp: number;
  type: 'analysis' | 'decision' | 'execution' | 'error';
  content: string;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

export interface PumpFunToken {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  holders: number;
  createdAt: number;
}

export interface TradingStrategy {
  analyzeToken(token: PumpFunToken): Promise<{
    shouldTrade: boolean;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    reasoning: string;
  }>;
}
