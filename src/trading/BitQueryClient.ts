import axios, { AxiosInstance } from 'axios';

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

export interface TokenAnalytics {
  holderCount: number;
  topHolders: TokenHolder[];
  holderConcentration: number; // Top 10 holders %
  liquidity: number;
  volume24h: number;
  trades24h: number;
  uniqueTraders24h: number;
}

export interface DEXTrade {
  timestamp: Date;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  trader: string;
  txHash: string;
}

export class BitQueryClient {
  private v1Client: AxiosInstance;
  private v2Client: AxiosInstance;
  private v1ApiKey: string;
  private v2ApiKey: string;

  constructor(v1ApiKey: string, v2ApiKey: string) {
    this.v1ApiKey = v1ApiKey;
    this.v2ApiKey = v2ApiKey;

    // BitQuery V1 GraphQL endpoint
    this.v1Client = axios.create({
      baseURL: 'https://graphql.bitquery.io',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': v1ApiKey,
      },
    });

    // BitQuery V2 GraphQL endpoint (streaming API)
    this.v2Client = axios.create({
      baseURL: 'https://streaming.bitquery.io/graphql',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${v2ApiKey}`,
      },
    });
  }

  /**
   * Get token holder distribution and concentration
   */
  async getTokenHolders(tokenMint: string, limit: number = 50): Promise<TokenHolder[]> {
    const query = `
      query TokenHolders($token: String!, $limit: Int!) {
        solana {
          balances(
            currency: {is: $token}
            limit: {count: $limit}
            orderBy: {descending: balance}
          ) {
            value
            address
          }
        }
      }
    `;

    try {
      const response = await this.v1Client.post('', {
        query,
        variables: {
          token: tokenMint,
          limit,
        },
      });

      const balances = response.data?.data?.solana?.balances || [];
      const totalSupply = balances.reduce((sum: number, b: any) => sum + parseFloat(b.value), 0);

      return balances.map((b: any) => ({
        address: b.address,
        balance: parseFloat(b.value),
        percentage: totalSupply > 0 ? (parseFloat(b.value) / totalSupply) * 100 : 0,
      }));
    } catch (error: any) {
      console.error('BitQuery V1 error fetching holders:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get comprehensive token analytics
   */
  async getTokenAnalytics(tokenMint: string): Promise<TokenAnalytics> {
    const holders = await this.getTokenHolders(tokenMint, 50);
    const trades = await this.getRecentTrades(tokenMint, 100);

    const holderConcentration = holders
      .slice(0, 10)
      .reduce((sum, h) => sum + h.percentage, 0);

    const volume24h = trades.reduce((sum, t) => sum + t.amount * t.price, 0);
    const uniqueTraders = new Set(trades.map(t => t.trader)).size;

    return {
      holderCount: holders.length,
      topHolders: holders.slice(0, 10),
      holderConcentration,
      liquidity: 0, // Would need separate liquidity query
      volume24h,
      trades24h: trades.length,
      uniqueTraders24h: uniqueTraders,
    };
  }

  /**
   * Get recent DEX trades for a token
   */
  async getRecentTrades(tokenMint: string, limit: number = 50): Promise<DEXTrade[]> {
    const query = `
      query RecentTrades($token: String!, $limit: Int!) {
        solana {
          dexTrades(
            baseCurrency: {is: $token}
            options: {limit: $limit, desc: "block.timestamp.time"}
            time: {since: "2024-01-01"}
          ) {
            block {
              timestamp {
                time
              }
            }
            tradeAmount(in: USD)
            side
            price
            transaction {
              signature
            }
            maker {
              address
            }
          }
        }
      }
    `;

    try {
      const response = await this.v1Client.post('', {
        query,
        variables: {
          token: tokenMint,
          limit,
        },
      });

      const trades = response.data?.data?.solana?.dexTrades || [];

      return trades.map((t: any) => ({
        timestamp: new Date(t.block.timestamp.time),
        type: t.side.toLowerCase() as 'buy' | 'sell',
        amount: parseFloat(t.tradeAmount || '0'),
        price: parseFloat(t.price || '0'),
        trader: t.maker?.address || 'unknown',
        txHash: t.transaction?.signature || '',
      }));
    } catch (error: any) {
      console.error('BitQuery V1 error fetching trades:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get real-time trading signals using V2 streaming API
   */
  async getRealtimeSignals(tokenMint: string): Promise<{
    buyPressure: number;
    sellPressure: number;
    priceChange5m: number;
    volumeChange5m: number;
  }> {
    const query = `
      query RealtimeSignals($token: String!) {
        Solana {
          DEXTradeByTokens(
            where: {Trade: {Currency: {MintAddress: {is: $token}}}}
            orderBy: {descending: Block_Time}
            limit: {count: 50}
          ) {
            Trade {
              Amount
              Price
              Side {
                Type
              }
            }
            Block {
              Time
            }
          }
        }
      }
    `;

    try {
      const response = await this.v2Client.post('', {
        query,
        variables: {
          token: tokenMint,
        },
      });

      const trades = response.data?.data?.Solana?.DEXTradeByTokens || [];

      let buyVolume = 0;
      let sellVolume = 0;

      trades.forEach((t: any) => {
        const volume = parseFloat(t.Trade.Amount || '0') * parseFloat(t.Trade.Price || '0');
        if (t.Trade.Side.Type === 'buy') {
          buyVolume += volume;
        } else {
          sellVolume += volume;
        }
      });

      const totalVolume = buyVolume + sellVolume;
      const buyPressure = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;
      const sellPressure = 100 - buyPressure;

      return {
        buyPressure,
        sellPressure,
        priceChange5m: 0, // Would need historical comparison
        volumeChange5m: 0, // Would need historical comparison
      };
    } catch (error: any) {
      console.error('BitQuery V2 error fetching signals:', error.response?.data || error.message);
      return {
        buyPressure: 50,
        sellPressure: 50,
        priceChange5m: 0,
        volumeChange5m: 0,
      };
    }
  }

  /**
   * Check if token has suspicious bundled transactions (rug pull indicator)
   */
  async detectBundledBuys(tokenMint: string): Promise<{
    hasBundledBuys: boolean;
    bundleCount: number;
    suspiciousWallets: string[];
  }> {
    const trades = await this.getRecentTrades(tokenMint, 100);

    // Group trades by timestamp (same second)
    const tradesBySecond = new Map<number, DEXTrade[]>();

    trades.forEach(trade => {
      const second = Math.floor(trade.timestamp.getTime() / 1000);
      if (!tradesBySecond.has(second)) {
        tradesBySecond.set(second, []);
      }
      tradesBySecond.get(second)!.push(trade);
    });

    // Detect bundles (3+ buys in same second)
    let bundleCount = 0;
    const suspiciousWallets = new Set<string>();

    tradesBySecond.forEach(secondTrades => {
      const buysInSecond = secondTrades.filter(t => t.type === 'buy');
      if (buysInSecond.length >= 3) {
        bundleCount++;
        buysInSecond.forEach(t => suspiciousWallets.add(t.trader));
      }
    });

    return {
      hasBundledBuys: bundleCount > 0,
      bundleCount,
      suspiciousWallets: Array.from(suspiciousWallets),
    };
  }

  /**
   * Get smart money wallets trading a token
   */
  async getSmartMoneyActivity(tokenMint: string): Promise<{
    smartMoneyBuying: boolean;
    smartMoneyCount: number;
    averageHolding: number;
  }> {
    // This would require a database of known smart money wallets
    // For now, return placeholder
    return {
      smartMoneyBuying: false,
      smartMoneyCount: 0,
      averageHolding: 0,
    };
  }
}
