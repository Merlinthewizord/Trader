# Solana Trading Agent 🤖💰

An AI-powered autonomous trading agent for Solana tokens with pump.fun integration. Features a terminal-style web interface showing live chat with the agent, wallet balance, and real-time reasoning behind trading decisions.

## Features

- 🤖 **AI-Powered Agent**: Uses Claude (Anthropic) for intelligent trading decisions
- 💼 **Solana Wallet**: Manages its own wallet with real SOL and tokens
- 📈 **Pump.fun Integration**: Trades trending tokens on pump.fun
- 💬 **Interactive Chat**: Talk to the agent and ask about its strategy
- 📊 **Live Dashboard**: Real-time wallet balance and trade history
- 🧠 **Transparent Reasoning**: See the agent's thought process for every decision
- 🎨 **Terminal UI**: Hacker-style interface with split-screen layout

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  ┌──────────────┐         ┌──────────────┐     │
│  │ Chat Panel   │         │  Dashboard   │     │
│  │ - Messages   │         │  - Balance   │     │
│  │ - Input      │         │  - Trades    │     │
│  │              │         │  - Thoughts  │     │
│  └──────────────┘         └──────────────┘     │
│           │                       │              │
│           └───────────────────────┘              │
│                     │                            │
│                 WebSocket                        │
└─────────────────────┼──────────────────────────┘
                      │
┌─────────────────────┼──────────────────────────┐
│                  Backend                         │
│  ┌──────────────────────────────────────────┐  │
│  │           WebSocket Server               │  │
│  └────────┬────────────┬──────────┬─────────┘  │
│           │            │          │             │
│  ┌────────▼───┐  ┌────▼─────┐  ┌▼────────┐    │
│  │   Agent    │  │  Wallet  │  │ PumpFun │    │
│  │  Service   │  │ Service  │  │ Service │    │
│  │            │  │          │  │         │    │
│  │ - Claude   │  │ - Solana │  │ - API   │    │
│  │ - Strategy │  │ - Keys   │  │ - Trade │    │
│  └────────────┘  └──────────┘  └─────────┘    │
└──────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- Solana wallet with SOL (for trading)
- Anthropic API key

### Installation

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Configure environment variables:**

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your_base58_encoded_private_key_here

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:5173

# Trading Parameters
MAX_TRADE_AMOUNT_SOL=0.1
MIN_TRADE_AMOUNT_SOL=0.01
```

⚠️ **IMPORTANT**: Never commit your `.env` file! Keep your private keys secure.

### Getting Your Keys

**Solana Private Key:**
1. Create a Solana wallet using Phantom, Solflare, or Solana CLI
2. Export your private key (base58 encoded)
3. Fund it with SOL for trading

**Anthropic API Key:**
1. Sign up at https://console.anthropic.com/
2. Create an API key
3. Make sure you have credits available

## Running the Application

### Development Mode

Run both frontend and backend concurrently:

```bash
npm run dev
```

This starts:
- Backend server on `http://localhost:3001`
- Frontend on `http://localhost:5173`

### Production Build

```bash
npm run build
npm start
```

## Usage

### Talking to the Agent

Open `http://localhost:5173` in your browser. You'll see a split-screen terminal interface:

**Left Panel - Chat:**
- Type messages to chat with the agent
- Ask questions about trading strategy
- Request analysis with `analyze`

**Right Panel - Dashboard:**
- Top: Wallet balance (SOL + tokens)
- Middle: Recent trades
- Bottom: Agent's reasoning and thoughts

### Commands

- `analyze` - Trigger manual market analysis
- Ask about strategy, tokens, or trading decisions
- Chat naturally - the agent understands context

### Agent Behavior

The agent runs autonomous analysis every 5 minutes by default:

1. **Scans** trending tokens on pump.fun
2. **Analyzes** each token (market cap, volume, holders, etc.)
3. **Decides** whether to buy/sell/hold based on strategy
4. **Executes** trades if confidence is high
5. **Explains** reasoning in real-time

## Project Structure

```
Trader/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── WalletService.ts    # Solana wallet management
│   │   │   ├── PumpFunService.ts   # Pump.fun API integration
│   │   │   └── AgentService.ts     # AI trading logic
│   │   ├── types/
│   │   │   └── index.ts            # Shared types
│   │   ├── websocket.ts            # WebSocket handler
│   │   └── index.ts                # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx       # Chat interface
│   │   │   └── Dashboard.tsx       # Balance & reasoning
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts     # WebSocket hook
│   │   ├── types.ts                # Frontend types
│   │   ├── App.tsx                 # Main app
│   │   └── main.tsx                # Entry point
│   ├── package.json
│   └── tsconfig.json
└── package.json                     # Root workspace
```

## Key Technologies

- **Backend**: Node.js, TypeScript, Express, WebSocket
- **Frontend**: React, TypeScript, Vite
- **Blockchain**: Solana Web3.js, SPL Token
- **AI**: Anthropic Claude API
- **Trading**: pump.fun API

## Trading Strategy

The agent uses several factors to make decisions:

1. **Market Cap**: Prefers tokens with reasonable valuations
2. **Liquidity**: Ensures sufficient liquidity for entry/exit
3. **Volume**: Looks for active trading
4. **Holder Distribution**: Checks for healthy distribution
5. **Price Action**: Analyzes recent trends
6. **Risk Management**: Limits position sizes

## Safety Features

- **Position Limits**: Configurable max trade amounts
- **Balance Checks**: Won't trade below minimum balance
- **Mock Mode**: Test without real trades
- **Transparent Logs**: All decisions are logged
- **Error Handling**: Graceful failure handling

## Development

### Adding New Features

**New Trading Strategy:**
1. Modify `AgentService.ts` → `getTokenAnalysis()`
2. Update the Claude prompt with new criteria
3. Adjust confidence thresholds

**New Data Sources:**
1. Create new service in `backend/src/services/`
2. Integrate with `AgentService`
3. Update types if needed

**UI Changes:**
1. Modify components in `frontend/src/components/`
2. Update CSS for styling
3. WebSocket types stay synchronized

## Troubleshooting

**Connection Issues:**
- Check backend is running on port 3001
- Verify WebSocket URL in `useWebSocket.ts`
- Check browser console for errors

**Trading Errors:**
- Verify wallet has sufficient SOL
- Check RPC endpoint is working
- Review logs in backend terminal

**Agent Not Responding:**
- Verify Anthropic API key is valid
- Check API rate limits
- Review backend logs for errors

## Security Notes

⚠️ **Important Security Practices:**

1. **Never commit private keys** - Use `.env` files
2. **Limit wallet funds** - Only keep what you're willing to risk
3. **Test on devnet first** - Before using mainnet
4. **Monitor trades** - Watch the agent's decisions
5. **Set position limits** - Use MAX_TRADE_AMOUNT_SOL

## License

MIT

## Disclaimer

⚠️ **Trading cryptocurrencies carries significant risk.** This agent is for educational and experimental purposes. Only trade with funds you can afford to lose. Past performance does not guarantee future results. The authors are not responsible for any financial losses.

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

## Support

For issues or questions:
- Open a GitHub issue
- Check existing documentation
- Review logs for error messages

---

Built with ❤️ for the Solana community
