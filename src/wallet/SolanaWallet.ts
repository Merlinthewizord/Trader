import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  ParsedAccountData
} from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

export interface TokenHolding {
  mint: string;
  balance: number;
  decimals: number;
}

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

  async getRecentTransactions(limit: number = 3): Promise<any[]> {
    try {
      // Only fetch signatures, not full transaction details to reduce RPC calls
      const signatures = await this.connection.getSignaturesForAddress(
        this.publicKey,
        { limit }
      );

      // Return just signature info without fetching full transaction details
      return signatures.map(sig => ({
        signature: sig.signature,
        blockTime: sig.blockTime,
        slot: sig.slot,
        err: sig.err,
      }));
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return [];
    }
  }

  async getTokenHoldings(): Promise<TokenHolding[]> {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const holdings: TokenHolding[] = [];

      for (const accountInfo of tokenAccounts.value) {
        const parsedData = accountInfo.account.data as ParsedAccountData;
        const tokenData = parsedData.parsed.info;

        const balance = parseFloat(tokenData.tokenAmount.uiAmount || '0');

        // Only include tokens with non-zero balance
        if (balance > 0) {
          holdings.push({
            mint: tokenData.mint,
            balance: balance,
            decimals: tokenData.tokenAmount.decimals,
          });
        }
      }

      return holdings;
    } catch (error) {
      console.error('Error getting token holdings:', error);
      return [];
    }
  }
}
