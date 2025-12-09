import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';

export class SolanaWallet {
  private connection: Connection;
  private keypair: Keypair;
  public publicKey: PublicKey;

  constructor(rpcUrl: string, privateKey?: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');

    if (privateKey) {
      const decoded = bs58.decode(privateKey);
      this.keypair = Keypair.fromSecretKey(decoded);
    } else {
      this.keypair = Keypair.generate();
      console.log('Generated new wallet. Private key:', bs58.encode(this.keypair.secretKey));
    }

    this.publicKey = this.keypair.publicKey;
  }

  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  async getTokenBalance(tokenMint: string): Promise<number> {
    try {
      const mintPublicKey = new PublicKey(tokenMint);
      const tokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        this.publicKey
      );

      const accountInfo = await getAccount(this.connection, tokenAccount);
      return Number(accountInfo.amount) / Math.pow(10, 9); // Assuming 9 decimals
    } catch (error) {
      return 0;
    }
  }

  async sendTransaction(transaction: Transaction): Promise<string> {
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.keypair]
    );
    return signature;
  }

  getKeypair(): Keypair {
    return this.keypair;
  }

  getConnection(): Connection {
    return this.connection;
  }

  getAddress(): string {
    return this.publicKey.toBase58();
  }

  async getRecentTransactions(limit: number = 10): Promise<any[]> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        this.publicKey,
        { limit }
      );

      // Fetch full transaction details including logs and token balances
      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          try {
            const tx = await this.connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });

            return {
              signature: sig.signature,
              blockTime: sig.blockTime,
              slot: sig.slot,
              err: sig.err,
              meta: tx?.meta,
              transaction: tx?.transaction,
            };
          } catch (error) {
            console.error(`Error fetching transaction ${sig.signature}:`, error);
            return {
              signature: sig.signature,
              blockTime: sig.blockTime,
              slot: sig.slot,
              err: sig.err,
              meta: null,
            };
          }
        })
      );

      return transactions;
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return [];
    }
  }
}
