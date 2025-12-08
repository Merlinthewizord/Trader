import axios, { AxiosInstance } from 'axios';

export interface JupiterTokenInfo {
  id: string; // mint address
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  circSupply?: number;
  totalSupply?: number;
  holderCount?: number;
  organicScore?: number;
  organicScoreLabel?: string;
  isVerified?: boolean;
  cexes?: string[];
  tags?: string[];
  fdv?: number; // Fully diluted valuation
  mcap?: number; // Market cap
  usdPrice?: number;
  liquidity?: number;
  stats5m?: TokenStats;
  stats1h?: TokenStats;
  stats6h?: TokenStats;
  stats24h?: TokenStats;
}

export interface TokenStats {
  price?: number;
  priceChange?: number;
  volume?: number;
  liquidity?: number;
  txns?: number;
  buys?: number;
  sells?: number;
}

export class JupiterClient {
  private static readonly BASE_URL = 'https://api.jup.ag/tokens/v2';
  private apiClient: AxiosInstance;
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    this.apiClient = axios.create({
      baseURL: JupiterClient.BASE_URL,
      timeout: 15000,
      headers,
    });
  }

  /**
   * Get trending tokens
   * @param category - toptrending, toporganicscore, or toptraded
   * @param interval - 5m, 1h, 6h, or 24h
   * @param limit - Number of results (default 50)
   */
  async getTrendingTokens(
    category: 'toptrending' | 'toporganicscore' | 'toptraded' = 'toptrending',
    interval: '5m' | '1h' | '6h' | '24h' = '24h',
    limit: number = 20
  ): Promise<JupiterTokenInfo[]> {
    try {
      const response = await this.apiClient.get(`/${category}/${interval}`, {
        params: { limit },
      });

      console.log(`✅ Retrieved ${response.data.length} ${category} tokens (${interval})`);
      return response.data || [];
    } catch (error: any) {
      console.error(`Error fetching trending tokens:`, error.message);
      return [];
    }
  }

  /**
   * Search tokens by symbol, name, or mint address
   * @param query - Symbol, name, or comma-separated mint addresses (max 100)
   */
  async searchTokens(query: string): Promise<JupiterTokenInfo[]> {
    try {
      const response = await this.apiClient.get('/search', {
        params: { query },
      });

      return response.data || [];
    } catch (error: any) {
      console.error(`Error searching tokens for "${query}":`, error.message);
      return [];
    }
  }

  /**
   * Get token information by mint address
   */
  async getTokenInfo(mint: string): Promise<JupiterTokenInfo | null> {
    try {
      const results = await this.searchTokens(mint);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error(`Error getting token info for ${mint}:`, error);
      return null;
    }
  }

  /**
   * Get recently created tokens
   */
  async getRecentTokens(): Promise<JupiterTokenInfo[]> {
    try {
      const response = await this.apiClient.get('/recent');
      console.log(`✅ Retrieved ${response.data.length} recent tokens`);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching recent tokens:', error.message);
      return [];
    }
  }

  /**
   * Get tokens by tag (e.g., 'verified', 'lst')
   */
  async getTokensByTag(tag: string): Promise<JupiterTokenInfo[]> {
    try {
      const response = await this.apiClient.get('/tag', {
        params: { query: tag },
      });

      console.log(`✅ Retrieved ${response.data.length} tokens with tag "${tag}"`);
      return response.data || [];
    } catch (error: any) {
      console.error(`Error fetching tokens with tag "${tag}":`, error.message);
      return [];
    }
  }

  /**
   * Get verified tokens
   */
  async getVerifiedTokens(): Promise<JupiterTokenInfo[]> {
    return this.getTokensByTag('verified');
  }

  /**
   * Get top tokens by organic score (high quality, non-bot activity)
   */
  async getTopOrganicTokens(interval: '5m' | '1h' | '6h' | '24h' = '24h', limit: number = 20): Promise<JupiterTokenInfo[]> {
    return this.getTrendingTokens('toporganicscore', interval, limit);
  }

  /**
   * Get most traded tokens
   */
  async getTopTradedTokens(interval: '5m' | '1h' | '6h' | '24h' = '24h', limit: number = 20): Promise<JupiterTokenInfo[]> {
    return this.getTrendingTokens('toptraded', interval, limit);
  }
}
