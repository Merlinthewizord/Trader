import axios, { AxiosInstance } from 'axios';

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
}

export class DexScreenerClient {
  private static readonly BASE_URL = 'https://api.dexscreener.com';
  private apiClient: AxiosInstance;

  constructor() {
    this.apiClient = axios.create({
      baseURL: DexScreenerClient.BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Search for Solana pairs
   * Rate limit: 300 requests per minute
   */
  async searchPairs(query: string): Promise<DexPair[]> {
    try {
      const response = await this.apiClient.get('/latest/dex/search', {
        params: { q: query },
      });

      // Filter for Solana pairs only
      const solanaPairs = (response.data.pairs || []).filter(
        (pair: DexPair) => pair.chainId === 'solana'
      );

      console.log(`🔍 Found ${solanaPairs.length} Solana pairs matching "${query}"`);
      return solanaPairs;
    } catch (error: any) {
      console.error(`Error searching pairs for "${query}":`, error.message);
      return [];
    }
  }

  /**
   * Get pairs for a specific token on Solana
   */
  async getTokenPairs(tokenAddress: string): Promise<DexPair[]> {
    try {
      const response = await this.apiClient.get(`/token-pairs/v1/solana/${tokenAddress}`);

      console.log(`✅ Retrieved ${response.data.pairs?.length || 0} pairs for token ${tokenAddress.substring(0, 8)}...`);
      return response.data.pairs || [];
    } catch (error: any) {
      console.error(`Error fetching pairs for token ${tokenAddress}:`, error.message);
      return [];
    }
  }

  /**
   * Get multiple tokens' pairs at once (up to 30)
   */
  async getMultipleTokenPairs(tokenAddresses: string[]): Promise<{ [address: string]: DexPair[] }> {
    try {
      // DexScreener allows up to 30 addresses
      const addresses = tokenAddresses.slice(0, 30).join(',');
      const response = await this.apiClient.get(`/tokens/v1/solana/${addresses}`);

      const result: { [address: string]: DexPair[] } = {};
      const pairs = response.data.pairs || [];

      // Group pairs by token address
      pairs.forEach((pair: DexPair) => {
        const tokenAddr = pair.baseToken.address;
        if (!result[tokenAddr]) {
          result[tokenAddr] = [];
        }
        result[tokenAddr].push(pair);
      });

      console.log(`✅ Retrieved pairs for ${Object.keys(result).length} tokens`);
      return result;
    } catch (error: any) {
      console.error('Error fetching multiple token pairs:', error.message);
      return {};
    }
  }

  /**
   * Get specific pair by chain and pair address
   */
  async getPairByAddress(pairAddress: string): Promise<DexPair | null> {
    try {
      const response = await this.apiClient.get(`/latest/dex/pairs/solana/${pairAddress}`);

      if (response.data.pair) {
        console.log(`✅ Retrieved pair data for ${pairAddress.substring(0, 8)}...`);
        return response.data.pair;
      }

      return null;
    } catch (error: any) {
      console.error(`Error fetching pair ${pairAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get new pairs created recently (heuristic approach)
   * Since DexScreener doesn't have a direct "new pairs" endpoint,
   * we search for recently active pairs and filter by creation time
   */
  async getNewSolanaPairs(maxAgeHours: number = 6): Promise<DexPair[]> {
    try {
      console.log(`🔍 Searching for new Solana pairs (< ${maxAgeHours}h old)...`);

      // Search for common quote tokens to find new pairs
      const quoteTokens = ['SOL', 'USDC', 'USDT'];
      const allPairs: DexPair[] = [];

      for (const quoteToken of quoteTokens) {
        const pairs = await this.searchPairs(quoteToken);

        // Filter for Solana pairs created in the last X hours
        const newPairs = pairs.filter((pair) => {
          if (!pair.pairCreatedAt) return false;

          const ageMs = Date.now() - pair.pairCreatedAt;
          const ageHours = ageMs / (1000 * 60 * 60);

          return ageHours <= maxAgeHours && pair.chainId === 'solana';
        });

        allPairs.push(...newPairs);

        // Rate limiting: wait 250ms between requests (300 req/min limit)
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // Sort by creation time (newest first) and remove duplicates
      const uniquePairs = Array.from(
        new Map(allPairs.map((pair) => [pair.pairAddress, pair])).values()
      );

      const sortedPairs = uniquePairs.sort((a, b) => {
        return (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0);
      });

      console.log(`✅ Found ${sortedPairs.length} new Solana pairs (< ${maxAgeHours}h old)`);
      return sortedPairs;
    } catch (error: any) {
      console.error('Error fetching new Solana pairs:', error.message);
      return [];
    }
  }

  /**
   * Get pairs with high trading activity (potential trending)
   */
  async getTrendingPairs(minVolumeUsd: number = 50000, minTxns: number = 20): Promise<DexPair[]> {
    try {
      console.log(`🔍 Searching for trending Solana pairs (vol > $${minVolumeUsd}, txns > ${minTxns})...`);

      const searchQueries = ['SOL', 'pump', 'Raydium'];
      const allPairs: DexPair[] = [];

      for (const query of searchQueries) {
        const pairs = await this.searchPairs(query);

        // Filter for high activity pairs
        const trendingPairs = pairs.filter((pair) => {
          const vol24h = pair.volume?.h24 || 0;
          const txns24h = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);

          return vol24h >= minVolumeUsd && txns24h >= minTxns && pair.chainId === 'solana';
        });

        allPairs.push(...trendingPairs);

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // Remove duplicates and sort by volume
      const uniquePairs = Array.from(
        new Map(allPairs.map((pair) => [pair.pairAddress, pair])).values()
      );

      const sortedPairs = uniquePairs.sort((a, b) => {
        return (b.volume?.h24 || 0) - (a.volume?.h24 || 0);
      });

      console.log(`✅ Found ${sortedPairs.length} trending Solana pairs`);
      return sortedPairs.slice(0, 20); // Return top 20
    } catch (error: any) {
      console.error('Error fetching trending pairs:', error.message);
      return [];
    }
  }

  /**
   * Analyze pair quality based on key metrics
   */
  analyzePairQuality(pair: DexPair): {
    score: number;
    signals: string[];
    warnings: string[];
  } {
    const signals: string[] = [];
    const warnings: string[] = [];
    let score = 50; // Base score

    // Check liquidity
    if (pair.liquidity?.usd) {
      if (pair.liquidity.usd > 100000) {
        signals.push(`High liquidity: $${(pair.liquidity.usd / 1000).toFixed(0)}K`);
        score += 15;
      } else if (pair.liquidity.usd < 10000) {
        warnings.push(`Low liquidity: $${(pair.liquidity.usd / 1000).toFixed(1)}K (manipulation risk)`);
        score -= 20;
      }
    }

    // Check 24h volume
    if (pair.volume?.h24) {
      if (pair.volume.h24 > 50000) {
        signals.push(`Strong volume: $${(pair.volume.h24 / 1000).toFixed(0)}K/24h`);
        score += 10;
      } else if (pair.volume.h24 < 5000) {
        warnings.push(`Low volume: $${(pair.volume.h24 / 1000).toFixed(1)}K/24h`);
        score -= 10;
      }
    }

    // Check price change
    if (pair.priceChange?.h24) {
      if (pair.priceChange.h24 > 50) {
        signals.push(`Strong momentum: +${pair.priceChange.h24.toFixed(1)}% (24h)`);
        score += 5;
      } else if (pair.priceChange.h24 < -50) {
        warnings.push(`Heavy dump: ${pair.priceChange.h24.toFixed(1)}% (24h)`);
        score -= 15;
      }
    }

    // Check transaction balance
    if (pair.txns?.h24) {
      const buyRatio = pair.txns.h24.buys / (pair.txns.h24.buys + pair.txns.h24.sells);
      if (buyRatio > 0.6) {
        signals.push(`Buy pressure: ${(buyRatio * 100).toFixed(0)}% buys`);
        score += 10;
      } else if (buyRatio < 0.4) {
        warnings.push(`Sell pressure: ${((1 - buyRatio) * 100).toFixed(0)}% sells`);
        score -= 10;
      }
    }

    // Check pair age
    if (pair.pairCreatedAt) {
      const ageHours = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60);
      if (ageHours < 1) {
        warnings.push(`Very new pair: ${(ageHours * 60).toFixed(0)} minutes old (high risk)`);
        score -= 5;
      } else if (ageHours > 168) {
        // >1 week old
        signals.push(`Established pair: ${(ageHours / 24).toFixed(0)} days old`);
        score += 5;
      }
    }

    return { score, signals, warnings };
  }
}
