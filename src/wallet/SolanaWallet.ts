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
      const signatures = await this.connection.getSignaturesForAddress(
        this.publicKey,
        { limit }
      );

      const transactions = [];

      for (const sig of signatures) {
        try {
          // Add small delay between RPC calls to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));

          const tx = await this.connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (!tx || !tx.meta) {
            transactions.push({
              signature: sig.signature,
              blockTime: sig.blockTime,
              type: 'Unknown',
              status: sig.err ? 'Failed' : 'Success',
              fee: 0,
              asset: 'Unknown',
              amount: 0,
              action: 'Unknown'
            });
            continue;
          }

          let action = 'Unknown';
          let asset = 'SOL';
          let amount = 0;
          let type = 'Transfer';

          // Check for token transfers in parsed instructions
          const instructions = tx.transaction.message.instructions;
          for (const instruction of instructions) {
            if ('parsed' in instruction && instruction.parsed) {
              const parsed = instruction.parsed;

              // Check for token transfers
              if (parsed.type === 'transfer' && instruction.program === 'spl-token') {
                const info = parsed.info;
                asset = info.mint || 'Unknown Token';
                amount = info.tokenAmount?.uiAmount || info.amount || 0;

                // Determine direction
                if (info.source && info.destination) {
                  const sourceOwner = info.authority || info.source;
                  const destOwner = info.destination;

                  if (sourceOwner === this.publicKey.toBase58()) {
                    action = 'Sell';
                    type = 'Token Sale';
                  } else if (destOwner === this.publicKey.toBase58()) {
                    action = 'Buy';
                    type = 'Token Purchase';
                  } else {
                    action = 'Send';
                    type = 'Token Transfer';
                  }
                }
              }
              // Check for SOL transfers
              else if (parsed.type === 'transfer' && instruction.program === 'system') {
                const info = parsed.info;
                asset = 'SOL';
                amount = (info.lamports || 0) / LAMPORTS_PER_SOL;

                if (info.source === this.publicKey.toBase58()) {
                  action = 'Send';
                  type = 'SOL Transfer';
                } else if (info.destination === this.publicKey.toBase58()) {
                  action = 'Receive';
                  type = 'SOL Transfer';
                }
              }
            }
          }

          // Check post token balances for more detailed info
          if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
            for (let i = 0; i < tx.meta.postTokenBalances.length; i++) {
              const postBalance = tx.meta.postTokenBalances[i];
              const preBalance = tx.meta.preTokenBalances[i];

              if (postBalance && preBalance && postBalance.mint) {
                const change = postBalance.uiTokenAmount.uiAmount! - preBalance.uiTokenAmount.uiAmount!;
                if (Math.abs(change) > 0) {
                  asset = postBalance.mint;
                  amount = Math.abs(change);

                  if (change > 0) {
                    action = 'Buy';
                    type = 'Token Purchase';
                  } else {
                    action = 'Sell';
                    type = 'Token Sale';
                  }
                }
              }
            }
          }

          transactions.push({
            signature: sig.signature,
            blockTime: sig.blockTime,
            type,
            status: sig.err ? 'Failed' : 'Success',
            fee: (tx.meta.fee || 0) / LAMPORTS_PER_SOL,
            asset,
            amount,
            action
          });
        } catch (txError) {
          console.error(`Error parsing transaction ${sig.signature}:`, txError);
          transactions.push({
            signature: sig.signature,
            blockTime: sig.blockTime,
            type: 'Unknown',
            status: sig.err ? 'Failed' : 'Success',
            fee: 0,
            asset: 'Unknown',
            amount: 0,
            action: 'Unknown'
          });
        }
      }

      return transactions;
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
