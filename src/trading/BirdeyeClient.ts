import axios, { AxiosInstance } from 'axios';

export interface BirdeyeToken {
  address: string;
  decimals: number;
  liquidity?: number;
  logoURI?: string;
  name: string;
  symbol: string;
  volume24hUSD?: number;
  price?: number;
  priceChange24h?: number;
  mc?: number; // market cap
  v24hUSD?: number; // 24h volume
  v24hChangePercent?: number;
  rank?: number;
}

export interface BirdeyePair {
  address: string;
  baseAddress: string;
  baseSymbol: string;
  baseDecimals: number;
  quoteAddress: string;
  quoteSymbol: string;
  quoteDecimals: number;
  price: number;
  priceChange24h: number;
  liquidity: number;
  volume24h: number;
  buy24h: number;
  sell24h: number;
  lastTradeUnixTime: number;
}

export interface BirdeyeTradeData {
  buy24h: number;
  sell24h: number;
  buyVolume24h: number;
  sellVolume24h: number;
  trades24h: number;
  uniqueWallets24h: number;
}

export interface BirdeyeTokenOverview {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  liquidity: number;
  volume24h: number;
  marketCap: number;
  holder: number;
  extensions?: {
    description?: string;
    website?: string;
    twitter?: string;
  };
}

/**
 * Birdeye API Client for Solana token data
 * Implements rate limiting (1 call per minute) as required
 */
export class BirdeyeClient {
  private static readonly BASE_URL = 'https://public-api.birdeye.so';
  private static readonly CHAIN = 'solana';
  private apiClient: AxiosInstance;
  private apiKey: string;

  // Rate limiting: 1 call per minute
  private lastCallTime: number = 0;
  private readonly MIN_CALL_INTERVAL = 60000; // 60 seconds in milliseconds

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.apiClient = axios.create({
      baseURL: BirdeyeClient.BASE_URL,
      timeout: 15000,
      headers: {
        'accept': 'application/json',
        'X-API-KEY': apiKey,
        'x-chain': BirdeyeClient.CHAIN,
      },
    });
  }

  /**
   * Rate limiting: Wait if needed to ensure 1 call per minute
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.MIN_CALL_INTERVAL) {
      const waitTime = this.MIN_CALL_INTERVAL - timeSinceLastCall;
      console.log(`⏳ Rate limit: waiting ${(waitTime / 1000).toFixed(1)}s before next API call...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Get trending tokens on Solana
   */
  async getTrendingTokens(limit: number = 20): Promise<BirdeyeToken[]> {
    await this.enforceRateLimit();

    try {
      const response = await this.apiClient.get('/defi/token_trending', {
        params: {
          sort_by: 'rank',
          sort_type: 'asc',
          offset: 0,
          limit: Math.min(limit, 20), // Max 20 per API limits
        },
      });

      const tokens = response.data?.data?.tokens || [];
      console.log(`🔥 Retrieved ${tokens.length} trending Solana tokens from Birdeye`);
      return tokens;
    } catch (error: any) {
      console.error('Error fetching trending tokens:', error.message);
      return [];
    }
  }

  /**
   * Get token list with optional sorting
   */
  async getTokenList(
    sortBy: 'volume' | 'market_cap' | 'price_change_24h' = 'volume',
    limit: number = 50
  ): Promise<BirdeyeToken[]> {
    await this.enforceRateLimit();

    try {
      const response = await this.apiClient.get('/defi/tokenlist', {
        params: {
          sort_by: sortBy,
          sort_type: 'desc',
          offset: 0,
          limit: Math.min(limit, 50), // Max 50 per request
        },
      });

      const tokens = response.data?.data?.tokens || [];
      console.log(`📋 Retrieved ${tokens.length} tokens from Birdeye`);
      return tokens;
    } catch (error: any) {
      console.error('Error fetching token list:', error.message);
      return [];
    }
  }

  /**
   * Get token overview with price, volume, and market data
   */
  async getTokenOverview(tokenAddress: string): Promise<BirdeyeTokenOverview | null> {
    await this.enforceRateLimit();

    try {
      const response = await this.apiClient.get('/defi/token_overview', {
        params: { address: tokenAddress },
      });

      if (response.data?.data) {
        console.log(`✅ Retrieved overview for token ${tokenAddress.substring(0, 8)}...`);
        return response.data.data;
      }

      return null;
    } catch (error: any) {
      console.error(`Error fetching token overview for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get multiple token prices at once (up to 100 tokens)
   */
  async getMultipleTokenPrices(
    tokenAddresses: string[]
  ): Promise<Map<string, { price: number; priceChange24h?: number }>> {
    await this.enforceRateLimit();

    try {
      const addresses = tokenAddresses.slice(0, 100).join(',');
      const response = await this.apiClient.get('/defi/multi_price', {
        params: { list_address: addresses },
      });

      const priceMap = new Map<string, { price: number; priceChange24h?: number }>();
      const data = response.data?.data || {};

      Object.keys(data).forEach((address) => {
        const tokenData = data[address];
        if (tokenData && tokenData.value !== undefined) {
          priceMap.set(address, {
            price: tokenData.value,
            priceChange24h: tokenData.priceChange24h,
          });
        }
      });

      console.log(`✅ Retrieved prices for ${priceMap.size} tokens`);
      return priceMap;
    } catch (error: any) {
      console.error('Error fetching multiple token prices:', error.message);
      return new Map();
    }
  }

  /**
   * Get token price
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    await this.enforceRateLimit();

    try {
      const response = await this.apiClient.get('/defi/price', {
        params: { address: tokenAddress },
      });

      if (response.data?.data?.value !== undefined) {
        return response.data.data.value;
      }

      return null;
    } catch (error: any) {
      console.error(`Error fetching price for token ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get trade data for a token (buy/sell volumes, trade counts, etc.)
   */
  async getTokenTradeData(tokenAddress: string): Promise<BirdeyeTradeData | null> {
    await this.enforceRateLimit();

    try {
      const response = await this.apiClient.get('/defi/v3/token/trade-data/single', {
        params: { address: tokenAddress },
      });

      if (response.data?.data) {
        const data = response.data.data;
        return {
          buy24h: data.buy24h || 0,
          sell24h: data.sell24h || 0,
          buyVolume24h: data.buyVolume24h || 0,
          sellVolume24h: data.sellVolume24h || 0,
          trades24h: (data.buy24h || 0) + (data.sell24h || 0),
          uniqueWallets24h: data.uniqueWallet24h || 0,
        };
      }

      return null;
    } catch (error: any) {
      console.error(`Error fetching trade data for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get new token listings (tokens created recently)
   */
  async getNewTokens(limit: number = 20): Promise<BirdeyeToken[]> {
    await this.enforceRateLimit();

    try {
      const response = await this.apiClient.get('/defi/v3/token/new-listing', {
        params: {
          offset: 0,
          limit: Math.min(limit, 20),
        },
      });

      const tokens = response.data?.data?.items || [];
      console.log(`🆕 Found ${tokens.length} new tokens on Solana`);
      return tokens;
    } catch (error: any) {
      console.error('Error fetching new tokens:', error.message);
      return [];
    }
  }

  /**
   * Search for tokens by symbol or name
   * Note: This is a client-side search using token list
   */
  async searchTokens(query: string, limit: number = 10): Promise<BirdeyeToken[]> {
    await this.enforceRateLimit();

    try {
      // Get token list and filter locally
      const tokens = await this.getTokenList('volume', 100);

      const searchQuery = query.toLowerCase();
      const matchedTokens = tokens.filter(
        (token) =>
          token.symbol.toLowerCase().includes(searchQuery) ||
          token.name.toLowerCase().includes(searchQuery)
      );

      console.log(`🔍 Found ${matchedTokens.length} tokens matching "${query}"`);
      return matchedTokens.slice(0, limit);
    } catch (error: any) {
      console.error(`Error searching tokens for "${query}":`, error.message);
      return [];
    }
  }

  /**
   * Analyze token quality based on Birdeye metrics
   */
  analyzeTokenQuality(token: BirdeyeTokenOverview | BirdeyeToken): {
    score: number;
    signals: string[];
    warnings: string[];
  } {
    const signals: string[] = [];
    const warnings: string[] = [];
    let score = 50; // Base score

    // Check liquidity
    if (token.liquidity) {
      if (token.liquidity > 100000) {
        signals.push(`High liquidity: $${(token.liquidity / 1000).toFixed(0)}K`);
        score += 15;
      } else if (token.liquidity < 10000) {
        warnings.push(`Low liquidity: $${(token.liquidity / 1000).toFixed(1)}K (manipulation risk)`);
        score -= 20;
      }
    }

    // Check 24h volume
    const volume24h = 'volume24h' in token ? token.volume24h : token.volume24hUSD;
    if (volume24h) {
      if (volume24h > 50000) {
        signals.push(`Strong volume: $${(volume24h / 1000).toFixed(0)}K/24h`);
        score += 10;
      } else if (volume24h < 5000) {
        warnings.push(`Low volume: $${(volume24h / 1000).toFixed(1)}K/24h`);
        score -= 10;
      }
    }

    // Check price change
    const priceChange = 'priceChange24h' in token ? token.priceChange24h : undefined;
    if (priceChange !== undefined) {
      if (priceChange > 50) {
        signals.push(`Strong momentum: +${priceChange.toFixed(1)}% (24h)`);
        score += 5;
      } else if (priceChange < -50) {
        warnings.push(`Heavy dump: ${priceChange.toFixed(1)}% (24h)`);
        score -= 15;
      }
    }

    // Check market cap
    const marketCap = 'marketCap' in token ? token.marketCap : token.mc;
    if (marketCap) {
      if (marketCap > 1000000) {
        signals.push(`Established: $${(marketCap / 1000000).toFixed(2)}M MC`);
        score += 5;
      } else if (marketCap < 50000) {
        warnings.push(`Very low MC: $${(marketCap / 1000).toFixed(0)}K (high risk)`);
        score -= 5;
      }
    }

    return { score, signals, warnings };
  }
}
