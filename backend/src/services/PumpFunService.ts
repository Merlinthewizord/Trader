import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import axios from 'axios';
import { PumpFunToken } from '../types/index.js';

export class PumpFunService {
  private connection: Connection;
  private keypair: Keypair;

  constructor(connection: Connection, keypair: Keypair) {
    this.connection = connection;
    this.keypair = keypair;
  }

  async getTrendingTokens(limit: number = 10): Promise<PumpFunToken[]> {
    try {
      const response = await axios.get('https://frontend-api.pump.fun/coins?sort=last_trade_timestamp&order=DESC&includeNsfw=false', {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 10000,
      });

      if (!response.data || !Array.isArray(response.data)) {
        console.log('⚠️ No data from pump.fun API, using mock data');
        return this.getMockTokens(limit);
      }

      return response.data.slice(0, limit).map((coin: any) => ({
        mint: coin.mint || 'unknown',
        name: coin.name || 'Unknown Token',
        symbol: coin.symbol || 'UNKNOWN',
        description: coin.description || '',
        image: coin.image_uri || '',
        marketCap: coin.market_cap || 0,
        liquidity: coin.liquidity || 0,
        volume24h: coin.volume_24h || 0,
        priceChange24h: coin.price_change_24h || 0,
        holders: coin.holder_count || 0,
        createdAt: coin.created_timestamp || Date.now(),
      }));
    } catch (error) {
      console.error('Error fetching trending tokens:', error);
      return this.getMockTokens(limit);
    }
  }

  private getMockTokens(limit: number): PumpFunToken[] {
    const mockTokens = [
      {
        mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        name: 'Bonk',
        symbol: 'BONK',
        description: 'The first Solana dog coin',
        image: '',
        marketCap: 500000,
        liquidity: 100000,
        volume24h: 50000,
        priceChange24h: 5.2,
        holders: 1500,
        createdAt: Date.now() - 86400000,
      },
      {
        mint: 'So11111111111111111111111111111111111111112',
        name: 'Wrapped SOL',
        symbol: 'SOL',
        description: 'Wrapped Solana token',
        image: '',
        marketCap: 10000000,
        liquidity: 2000000,
        volume24h: 500000,
        priceChange24h: -2.3,
        holders: 50000,
        createdAt: Date.now() - 86400000 * 30,
      },
    ];

    return mockTokens.slice(0, limit);
  }

  async buyToken(tokenMint: string, amountSOL: number): Promise<{ signature: string; success: boolean }> {
    try {
      console.log(`🔄 Attempting to buy ${amountSOL} SOL worth of ${tokenMint}`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockSignature = `mock_buy_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      console.log(`✅ Mock buy successful: ${mockSignature}`);
      return {
        signature: mockSignature,
        success: true,
      };
    } catch (error) {
      console.error('Error buying token:', error);
      return {
        signature: '',
        success: false,
      };
    }
  }

  async sellToken(tokenMint: string, amount: number): Promise<{ signature: string; success: boolean }> {
    try {
      console.log(`🔄 Attempting to sell ${amount} of ${tokenMint}`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockSignature = `mock_sell_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      console.log(`✅ Mock sell successful: ${mockSignature}`);
      return {
        signature: mockSignature,
        success: true,
      };
    } catch (error) {
      console.error('Error selling token:', error);
      return {
        signature: '',
        success: false,
      };
    }
  }

  async getTokenInfo(mint: string): Promise<PumpFunToken | null> {
    try {
      const tokens = await this.getTrendingTokens(50);
      return tokens.find(t => t.mint === mint) || null;
    } catch (error) {
      console.error('Error getting token info:', error);
      return null;
    }
  }
}
