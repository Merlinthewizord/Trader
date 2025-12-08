import axios, { AxiosInstance } from 'axios';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { Transaction, PublicKey } from '@solana/web3.js';

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  holders: number;
  liquidity: number;
}

export interface TradeParams {
  tokenMint: string;
  amount: number;
  slippage: number;
}

export class PumpFunClient {
  private apiClient: AxiosInstance;
  private wallet: SolanaWallet;

  constructor(apiUrl: string, wallet: SolanaWallet) {
    this.apiClient = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.wallet = wallet;
  }

  async getTrendingTokens(limit: number = 20): Promise<TokenInfo[]> {
    try {
      // Note: This is a placeholder. Actual pump.fun API endpoints may differ
      const response = await this.apiClient.get('/tokens/trending', {
        params: { limit }
      });
      return response.data.tokens || [];
    } catch (error) {
      console.error('Error fetching trending tokens:', error);
      return [];
    }
  }

  async getTokenInfo(mint: string): Promise<TokenInfo | null> {
    try {
      const response = await this.apiClient.get(`/tokens/${mint}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching token info for ${mint}:`, error);
      return null;
    }
  }

  async buyToken(params: TradeParams): Promise<string> {
    try {
      // Get swap transaction from pump.fun
      const response = await this.apiClient.post('/swap/buy', {
        mint: params.tokenMint,
        amount: params.amount,
        wallet: this.wallet.getAddress(),
        slippage: params.slippage,
      });

      const transactionData = response.data.transaction;

      // Deserialize and sign transaction
      const transaction = Transaction.from(Buffer.from(transactionData, 'base64'));
      const signature = await this.wallet.sendTransaction(transaction);

      console.log(`Buy transaction successful: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error('Error buying token:', error.response?.data || error.message);
      throw error;
    }
  }

  async sellToken(params: TradeParams): Promise<string> {
    try {
      const response = await this.apiClient.post('/swap/sell', {
        mint: params.tokenMint,
        amount: params.amount,
        wallet: this.wallet.getAddress(),
        slippage: params.slippage,
      });

      const transactionData = response.data.transaction;
      const transaction = Transaction.from(Buffer.from(transactionData, 'base64'));
      const signature = await this.wallet.sendTransaction(transaction);

      console.log(`Sell transaction successful: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error('Error selling token:', error.response?.data || error.message);
      throw error;
    }
  }

  async searchTokens(query: string): Promise<TokenInfo[]> {
    try {
      const response = await this.apiClient.get('/tokens/search', {
        params: { q: query }
      });
      return response.data.tokens || [];
    } catch (error) {
      console.error('Error searching tokens:', error);
      return [];
    }
  }
}
