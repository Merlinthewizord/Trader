# Solana Trading Agent 🤖

An AI-powered trading agent for Solana blockchain integrated with pump.fun. Features a terminal-style web interface for real-time interaction, wallet monitoring, and transparent trading decisions.

## Features

- **AI-Powered Trading**: Uses Claude (Anthropic) to analyze markets and make intelligent trading decisions
- **Solana Wallet Integration**: Complete wallet management with balance tracking
- **Pump.fun Integration**: Trade tokens on the pump.fun platform
- **Real-Time Terminal Interface**: Split-screen terminal UI showing:
  - Live chat with the AI agent
  - Wallet balance and address
  - Trading reasoning and decision-making process
  - Recent transaction history
- **WebSocket Communication**: Real-time updates for trades and wallet changes
- **Configurable Risk Management**: Set trading limits and risk tolerance

## Architecture

```
src/
├── agent/
│   └── TradingAgent.ts      # AI agent with Claude integration
├── wallet/
│   └── SolanaWallet.ts      # Solana wallet management
├── trading/
│   └── PumpFunClient.ts     # Pump.fun API integration
├── server/
│   └── WebServer.ts         # Express + WebSocket server
└── index.ts                 # Application entry point

public/
├── index.html               # Terminal UI structure
├── style.css                # Terminal styling
└── app.js                   # WebSocket client & UI logic
```

## Prerequisites

- Node.js 18+ and npm
- Solana wallet with private key (mainnet or devnet)
- Anthropic API key
- SOL tokens for trading

## Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Configure environment variables**:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your_base58_private_key_here

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Pump.fun Configuration
PUMPFUN_API_URL=https://api.pump.fun

# Trading Configuration
MAX_TRADE_AMOUNT_SOL=0.1
MIN_TRADE_AMOUNT_SOL=0.01
SLIPPAGE_BPS=100
RISK_TOLERANCE=moderate

# Server Configuration
PORT=3000
```

## Getting Your Credentials

### Solana Private Key

**Option 1: Generate New Wallet** (Recommended for testing)
```bash
npm run dev
```
On first run without a private key, a new wallet will be generated and printed to console.

**Option 2: Export from Phantom/Solflare**
1. Open your wallet extension
2. Go to Settings → Security
3. Export Private Key
4. Convert to Base58 format if needed

⚠️ **Security Warning**: Never share your private key or commit it to version control!

### Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys
3. Create a new API key
4. Copy and add to `.env`

## Usage

### Development Mode

```bash
npm run dev
```

This starts the server with hot-reload enabled.

### Production Mode

```bash
npm run build
npm start
```

### Access the Interface

Open your browser to `http://localhost:3000`

You'll see:
- **Left Panel**: Chat interface to communicate with the agent
- **Right Panel**: Wallet balance, trading reasoning, and recent transactions

## How to Use

### 1. Chat with the Agent

Type questions or commands in the chat:
- "What's my current balance?"
- "Tell me about trending tokens"
- "Should I buy anything right now?"

### 2. Analyze the Market

Click "Analyze Market" to have the agent:
1. Fetch trending tokens from pump.fun
2. Analyze market conditions
3. Provide a trade recommendation with reasoning

### 3. Execute Trades

The agent will provide trade decisions showing:
- **Action**: BUY, SELL, or HOLD
- **Token**: Which token to trade
- **Amount**: How much SOL to use
- **Reasoning**: Detailed explanation of the decision
- **Confidence**: How confident the agent is (0-100%)
- **Risk Level**: Low, Medium, or High

To execute, the agent can automatically trade based on its analysis.

## Configuration

### Risk Tolerance

Set in `.env`:
- `conservative`: Lower trade amounts, higher confidence threshold
- `moderate`: Balanced approach (default)
- `aggressive`: Higher trade amounts, takes more risks

### Trading Limits

- `MAX_TRADE_AMOUNT_SOL`: Maximum SOL per trade
- `MIN_TRADE_AMOUNT_SOL`: Minimum SOL per trade
- `SLIPPAGE_BPS`: Slippage tolerance in basis points (100 = 1%)

## API Endpoints

The server exposes these REST endpoints:

- `GET /api/health` - Server health check
- `GET /api/wallet/balance` - Current wallet balance
- `GET /api/wallet/transactions?limit=10` - Recent transactions
- `GET /api/tokens/trending?limit=20` - Trending tokens
- `POST /api/agent/chat` - Chat with the agent

## WebSocket Events

### Client → Server

```javascript
// Chat message
{ type: 'chat', data: { message: 'Hello agent!' } }

// Market analysis request
{ type: 'analyze', data: {} }

// Execute trade
{ type: 'execute_trade', data: { decision: {...} } }
```

### Server → Client

```javascript
// Chat response
{ type: 'chat_response', data: { message: '...' } }

// Trade decision
{ type: 'trade_decision', data: { action: 'buy', ... } }

// Wallet update
{ type: 'wallet_update', data: { balance: 1.5, ... } }

// Thinking status
{ type: 'thinking', data: { message: 'Analyzing...' } }

// Error
{ type: 'error', data: { message: 'Error occurred' } }
```

## Security Considerations

1. **Private Key Safety**:
   - Never commit `.env` to version control
   - Use a dedicated trading wallet with limited funds
   - Rotate keys regularly

2. **API Key Protection**:
   - Keep Anthropic API key secure
   - Monitor usage on Anthropic console
   - Set spending limits if available

3. **Trading Safety**:
   - Start with small amounts
   - Test on devnet first
   - Monitor all transactions
   - Set conservative limits initially

## Troubleshooting

### WebSocket Connection Failed

- Check that the server is running
- Verify PORT in `.env` matches your access URL
- Check browser console for errors

### Trades Not Executing

- Verify wallet has sufficient SOL balance
- Check slippage settings
- Ensure pump.fun API is accessible
- Review transaction errors in console

### Agent Not Responding

- Verify ANTHROPIC_API_KEY is valid
- Check API rate limits
- Review server logs for errors

## Development

### Build TypeScript

```bash
npm run build
```

### Type Checking

```bash
npx tsc --noEmit
```

## Project Status

This is a working prototype. The pump.fun API integration uses placeholder endpoints that need to be updated with actual pump.fun API documentation.

## Disclaimer

⚠️ **Important**: This software is for educational purposes. Cryptocurrency trading carries significant risk. Never trade with funds you cannot afford to lose. The AI agent's decisions should not be considered financial advice.

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Support

For issues or questions, please open a GitHub issue.
