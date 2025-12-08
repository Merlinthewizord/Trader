import axios from 'axios';
import { SolanaWallet } from '../wallet/SolanaWallet';
import { VersionedTransaction } from '@solana/web3.js';
import { JupiterClient, JupiterTokenInfo } from './JupiterClient';

// Export Jupiter's TokenInfo as our standard TokenInfo
export type TokenInfo = JupiterTokenInfo;

export interface TradeParams {
  tokenMint: string;
  amount: number;
  denominatedInSol: boolean;
  slippage: number;
  priorityFee?: number;
  pool?: 'pump' | 'raydium' | 'pump-amm' | 'launchlab' | 'raydium-cpmm' | 'bonk' | 'auto';
}

export class PumpFunClient {
  private static readonly TRADE_API_URL = 'https://pumpportal.fun/api/trade-local';
  private wallet: SolanaWallet;
  private defaultPriorityFee: number;
  private defaultPool: string;
  private jupiter: JupiterClient;

  constructor(wallet: SolanaWallet, priorityFee: number = 0.00001, pool: string = 'auto', jupiterApiKey?: string) {
    this.wallet = wallet;
    this.defaultPriorityFee = priorityFee;
    this.defaultPool = pool;
    this.jupiter = new JupiterClient(jupiterApiKey);
  }

  async getTrendingTokens(limit: number = 20): Promise<TokenInfo[]> {
    // Use Jupiter API to get trending tokens with high organic scores
    // Organic score indicates quality activity (non-bot)
    return await this.jupiter.getTopOrganicTokens('24h', limit);
  }

  async getTokenInfo(mint: string): Promise<TokenInfo | null> {
    // Use Jupiter API to get token information
    return await this.jupiter.getTokenInfo(mint);
  }

  async buyToken(params: TradeParams): Promise<string> {
    try {
      console.log(`Buying token ${params.tokenMint}: ${params.amount} ${params.denominatedInSol ? 'SOL' : 'tokens'}`);

      // Call PumpPortal trade-local API
      const response = await axios.post(
        PumpFunClient.TRADE_API_URL,
        {
          publicKey: this.wallet.getAddress(),
          action: 'buy',
          mint: params.tokenMint,
          denominatedInSol: params.denominatedInSol ? 'true' : 'false',
          amount: params.amount,
          slippage: params.slippage,
          priorityFee: params.priorityFee || this.defaultPriorityFee,
          pool: params.pool || this.defaultPool,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      // Deserialize the versioned transaction
      const tx = VersionedTransaction.deserialize(new Uint8Array(response.data));

      // Sign with wallet keypair
      const signerKeyPair = this.wallet.getKeypair();
      tx.sign([signerKeyPair]);

      // Submit transaction
      const connection = this.wallet.getConnection();
      const signature = await connection.sendTransaction(tx);

      console.log(`✅ Buy transaction successful: ${signature}`);
      console.log(`   View on Solscan: https://solscan.io/tx/${signature}`);

      return signature;
    } catch (error: any) {
      console.error('❌ Error buying token:', error.response?.data || error.message);
      throw error;
    }
  }

  async sellToken(params: TradeParams): Promise<string> {
    try {
      console.log(`Selling token ${params.tokenMint}: ${params.amount} ${params.denominatedInSol ? 'SOL' : 'tokens'}`);

      // Call PumpPortal trade-local API
      const response = await axios.post(
        PumpFunClient.TRADE_API_URL,
        {
          publicKey: this.wallet.getAddress(),
          action: 'sell',
          mint: params.tokenMint,
          denominatedInSol: params.denominatedInSol ? 'true' : 'false',
          amount: params.amount,
          slippage: params.slippage,
          priorityFee: params.priorityFee || this.defaultPriorityFee,
          pool: params.pool || this.defaultPool,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      // Deserialize the versioned transaction
      const tx = VersionedTransaction.deserialize(new Uint8Array(response.data));

      // Sign with wallet keypair
      const signerKeyPair = this.wallet.getKeypair();
      tx.sign([signerKeyPair]);

      // Submit transaction
      const connection = this.wallet.getConnection();
      const signature = await connection.sendTransaction(tx);

      console.log(`✅ Sell transaction successful: ${signature}`);
      console.log(`   View on Solscan: https://solscan.io/tx/${signature}`);

      return signature;
    } catch (error: any) {
      console.error('❌ Error selling token:', error.response?.data || error.message);
      throw error;
    }
  }

  async searchTokens(query: string): Promise<TokenInfo[]> {
    // Use Jupiter API to search tokens by name, symbol, or mint
    return await this.jupiter.searchTokens(query);
  }

  /**
   * Get recently created/tradable tokens
   */
  async getRecentTokens(): Promise<TokenInfo[]> {
    return await this.jupiter.getRecentTokens();
  }

  /**
   * Get most traded tokens in the last period
   */
  async getTopTradedTokens(interval: '5m' | '1h' | '6h' | '24h' = '24h', limit: number = 20): Promise<TokenInfo[]> {
    return await this.jupiter.getTopTradedTokens(interval, limit);
  }
}
