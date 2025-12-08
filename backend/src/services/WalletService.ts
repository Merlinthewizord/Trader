import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { WalletBalance, TokenBalance } from '../types/index.js';

export class WalletService {
  private connection: Connection;
  private keypair: Keypair;
  public publicKey: PublicKey;

  constructor(rpcUrl: string, privateKey: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');

    try {
      const decoded = bs58.decode(privateKey);
      this.keypair = Keypair.fromSecretKey(decoded);
      this.publicKey = this.keypair.publicKey;
      console.log(`✅ Wallet initialized: ${this.publicKey.toBase58()}`);
    } catch (error) {
      throw new Error(`Failed to initialize wallet: ${error}`);
    }
  }

  async getBalance(): Promise<WalletBalance> {
    try {
      const solBalance = await this.connection.getBalance(this.publicKey);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokens: TokenBalance[] = tokenAccounts.value.map((account) => {
        const info = account.account.data.parsed.info;
        return {
          mint: info.mint,
          symbol: 'UNKNOWN',
          amount: info.tokenAmount.uiAmount,
          decimals: info.tokenAmount.decimals,
        };
      }).filter(token => token.amount > 0);

      return {
        sol: solBalance / LAMPORTS_PER_SOL,
        tokens,
        totalValueUSD: 0,
      };
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  async sendSOL(to: PublicKey, amount: number): Promise<string> {
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.publicKey,
          toPubkey: to,
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair]
      );

      console.log(`✅ Sent ${amount} SOL to ${to.toBase58()}`);
      return signature;
    } catch (error) {
      console.error('Error sending SOL:', error);
      throw error;
    }
  }

  getKeypair(): Keypair {
    return this.keypair;
  }

  getConnection(): Connection {
    return this.connection;
  }
}
