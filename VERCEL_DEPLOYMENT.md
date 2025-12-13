# Vercel Deployment Guide 🚀

This guide will walk you through deploying your Solana Trading Agent to Vercel.

## Overview

The project has been restructured to work with Vercel's serverless architecture:

- **API Routes**: `/api` directory contains serverless functions
- **Frontend**: `/public` directory contains static files
- **Configuration**: `vercel.json` defines routing and environment variables

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install globally
   ```bash
   npm install -g vercel
   ```
3. **Git Repository**: Your code should be in a Git repository

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import Project**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Vercel will auto-detect the configuration

3. **Configure Environment Variables**:
   In the Vercel dashboard, add these environment secrets:

   ```
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   SOLANA_PRIVATE_KEY=your_wallet_private_key
   DEEPSEEK_API_KEY=your_deepseek_api_key
   MEM0_API_KEY=your_mem0_api_key
   JUPITER_API_KEY=your_jupiter_api_key
   BIRDEYE_API_KEY=your_birdeye_api_key
   PRIORITY_FEE=0.00001
   POOL=auto
   MAX_TRADE_AMOUNT_SOL=0.1
   MIN_TRADE_AMOUNT_SOL=0.01
   SLIPPAGE_BPS=100
   RISK_TOLERANCE=moderate
   ```

4. **Deploy**:
   - Click "Deploy"
   - Vercel will build and deploy automatically
   - Your site will be live at `https://your-project.vercel.app`

### Option 2: Deploy via CLI

1. **Login to Vercel**:
   ```bash
   vercel login
   ```

2. **Add Environment Variables**:
   ```bash
   vercel env add SOLANA_RPC_URL production
   vercel env add SOLANA_PRIVATE_KEY production
   vercel env add DEEPSEEK_API_KEY production
   vercel env add MEM0_API_KEY production
   vercel env add JUPITER_API_KEY production
   vercel env add BIRDEYE_API_KEY production
   vercel env add PRIORITY_FEE production
   vercel env add POOL production
   vercel env add MAX_TRADE_AMOUNT_SOL production
   vercel env add MIN_TRADE_AMOUNT_SOL production
   vercel env add SLIPPAGE_BPS production
   vercel env add RISK_TOLERANCE production
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```
   Or:
   ```bash
   vercel --prod
   ```

4. **Access Your App**:
   Vercel will provide a URL like `https://your-project.vercel.app`

## Local Development with Vercel

To test the Vercel serverless functions locally:

```bash
# Install dependencies
npm install

# Start Vercel dev server
npm run dev:vercel
```

This starts a local server at `http://localhost:3000` that simulates Vercel's serverless environment.

## Architecture

### API Routes (Serverless Functions)

All API endpoints are in the `/api` directory:

- `/api/wallet/balance` - Get wallet balance
- `/api/wallet/transactions` - Get recent transactions
- `/api/tokens/trending` - Get trending tokens from Jupiter
- `/api/agent/chat` - Chat with the AI agent
- `/api/agent/analyze` - Analyze market and get trading decision
- `/api/agent/execute` - Execute a trading decision

### Frontend

The frontend is served from `/public`:
- `index-vercel.html` - Main interface (use this for Vercel)
- `app-vercel.js` - Client-side logic (uses fetch API instead of WebSocket)
- `style.css` - Terminal styling

### Key Differences from Standalone Version

| Feature | Standalone | Vercel |
|---------|-----------|--------|
| Architecture | Long-running Node server | Serverless functions |
| Communication | WebSocket | HTTP/REST API |
| State | In-memory | Stateless (uses external services) |
| Deployment | VPS/Docker | Vercel platform |
| Scaling | Manual | Automatic |

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.mainnet-beta.solana.com` |
| `SOLANA_PRIVATE_KEY` | Wallet private key (Base58) | Your wallet key |
| `DEEPSEEK_API_KEY` | DeepSeek API key | `sk-...` |
| `MEM0_API_KEY` | Mem0 memory API key | `m0-...` |
| `BIRDEYE_API_KEY` | Birdeye API key | Your Birdeye key |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JUPITER_API_KEY` | Jupiter API key | None (uses public access) |
| `PRIORITY_FEE` | Transaction priority fee | `0.00001` |
| `POOL` | Trading pool preference | `auto` |
| `MAX_TRADE_AMOUNT_SOL` | Max SOL per trade | `0.1` |
| `MIN_TRADE_AMOUNT_SOL` | Min SOL per trade | `0.01` |
| `SLIPPAGE_BPS` | Slippage tolerance (basis points) | `100` |
| `RISK_TOLERANCE` | Risk level | `moderate` |

## Security Considerations

### Environment Secrets

⚠️ **IMPORTANT**: Never commit sensitive keys to Git!

- Use Vercel's environment variable system
- Keys are encrypted at rest
- Separate variables for production/preview/development

### API Key Rotation

Rotate your API keys periodically:
1. Generate new keys in respective platforms
2. Update Vercel environment variables
3. Redeploy: `vercel --prod`

### Rate Limiting

Vercel has built-in DDoS protection, but consider:
- Jupiter API has rate limits (30 req/min without key)
- Birdeye API has rate limits (1 call/min in current implementation)
- DeepSeek API has usage limits
- Implement client-side request throttling

## Monitoring & Logs

### View Logs

```bash
# Real-time logs
vercel logs

# Recent logs
vercel logs --follow
```

### Vercel Dashboard

- Monitor function execution time
- Track API usage
- View error rates
- Check deployment history

## Troubleshooting

### Common Issues

**1. "Module not found" errors**
```bash
npm install
vercel --prod
```

**2. Environment variables not working**
- Check they're set in Vercel dashboard
- Ensure they're set for "Production" environment
- Redeploy after adding variables

**3. Function timeout (10s limit on Hobby plan)**
- Optimize slow operations
- Consider upgrading to Pro plan (60s timeout)
- Use background jobs for long operations

**4. TypeScript errors**
```bash
npm run build
# Fix any TypeScript errors before deploying
```

## Performance Optimization

### Cold Starts

Vercel functions may have cold starts (1-3s delay). To minimize:
- Keep dependencies minimal
- Use edge functions where possible
- Consider Vercel Pro for better performance

### Caching

Implement caching for:
- Token data (cache trending tokens for 1-5 minutes)
- Wallet balance (cache for 10-30 seconds)
- Trading statistics

## Upgrading Plans

### Hobby (Free)
- ✅ Perfect for testing and demos
- ✅ Unlimited deployments
- ⚠️ 10s function timeout
- ⚠️ Limited bandwidth

### Pro ($20/month)
- ✅ 60s function timeout
- ✅ More bandwidth
- ✅ Advanced analytics
- ✅ Better performance

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)
- [Environment Variables Guide](https://vercel.com/docs/projects/environment-variables)
- [TypeScript on Vercel](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js#typescript)

## Support

If you encounter issues:
1. Check Vercel function logs
2. Verify environment variables
3. Test API routes individually
4. Review [Vercel status page](https://vercel-status.com)

## Next Steps

After deployment:
1. Test all API endpoints
2. Verify wallet balance displays correctly
3. Try the "Analyze Market" feature
4. Execute a small test trade
5. Monitor Mem0 for learning progress

Your trading agent is now running on Vercel's global edge network! 🎉
