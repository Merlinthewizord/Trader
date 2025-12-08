import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Utility script to generate a new Solana wallet
 * Run with: npx tsx src/utils/generateWallet.ts
 */

function generateWallet() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  console.log('\n🔐 New Solana Wallet Generated\n');
  console.log('Public Key (Address):');
  console.log(publicKey);
  console.log('\nPrivate Key (Base58):');
  console.log(privateKey);
  console.log('\n⚠️  IMPORTANT: Save your private key securely!');
  console.log('Add it to your .env file as SOLANA_PRIVATE_KEY');
  console.log('\n⚠️  Never share your private key with anyone!');
  console.log('⚠️  Fund this wallet with SOL before trading\n');
}

generateWallet();
