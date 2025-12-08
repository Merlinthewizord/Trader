import { VercelRequest, VercelResponse } from '@vercel/node';
import { JupiterClient } from '../../src/trading/JupiterClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jupiterApiKey = process.env.JUPITER_API_KEY;
    const jupiter = new JupiterClient(jupiterApiKey);

    const limit = parseInt(req.query.limit as string) || 20;
    const tokens = await jupiter.getTopOrganicTokens('24h', limit);

    res.status(200).json({ tokens });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
