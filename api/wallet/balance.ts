import { VercelRequest, VercelResponse } from '@vercel/node';
import { SolanaWallet } from '../../src/wallet/SolanaWallet';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!privateKey) {
      return res.status(500).json({ error: 'Wallet not configured' });
    }

    const wallet = new SolanaWallet(rpcUrl, privateKey);
    const balance = await wallet.getBalance();
    const address = wallet.getAddress();

    res.status(200).json({ balance, address });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
