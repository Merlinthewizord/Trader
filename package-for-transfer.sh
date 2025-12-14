#!/bin/bash

# Script to package the trading bot for transfer to another machine
# This creates a portable archive with all necessary files

echo "📦 Packaging Trader Bot for Transfer..."

# Create timestamp for unique package name
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="trader-bot-${TIMESTAMP}"
PACKAGE_DIR="/tmp/${PACKAGE_NAME}"

# Create package directory
mkdir -p "${PACKAGE_DIR}"

echo "📁 Copying codebase..."

# Copy all files except excluded ones
cp -r /home/user/Trader/* "${PACKAGE_DIR}/" 2>/dev/null || true
cp -r /home/user/Trader/.* "${PACKAGE_DIR}/" 2>/dev/null || true

# Remove unwanted directories and files
rm -rf "${PACKAGE_DIR}/node_modules"
rm -rf "${PACKAGE_DIR}/.git"
rm -rf "${PACKAGE_DIR}/dist"
rm -rf "${PACKAGE_DIR}/build"
rm -f "${PACKAGE_DIR}"/*.log
rm -f "${PACKAGE_DIR}/.env.local"
rm -f "${PACKAGE_DIR}/package-for-transfer.sh"
rm -f "${PACKAGE_DIR}"/trader-bot-*.tar.gz

echo "💾 Including persistent data..."

# Ensure data directory exists in package
mkdir -p "${PACKAGE_DIR}/data"

# Copy persistent data if it exists
if [ -f "/home/user/Trader/data/persistent-data.json" ]; then
  cp /home/user/Trader/data/persistent-data.json "${PACKAGE_DIR}/data/"
  echo "✅ persistent-data.json included"
else
  echo "⚠️  persistent-data.json not found (will be created on first run)"
fi

# Copy limit orders if they exist
if [ -f "/home/user/Trader/data/limit-orders.json" ]; then
  cp /home/user/Trader/data/limit-orders.json "${PACKAGE_DIR}/data/"
  echo "✅ limit-orders.json included"
else
  echo "⚠️  limit-orders.json not found (will be created when needed)"
fi

echo "📝 Creating setup instructions..."

# Create README for setup on new machine
cat > "${PACKAGE_DIR}/SETUP_NEW_MACHINE.md" << 'EOF'
# Trading Bot - Setup on New Machine

This package contains the complete trading bot with all historical data.

## Quick Setup

### 1. Extract the Package
```bash
tar -xzf trader-bot-*.tar.gz
cd trader-bot-*
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment

**For website testing only (no real trading):**
```bash
cp .env .env.backup
# Edit .env and use placeholder keys:
# SOLANA_PRIVATE_KEY=your_base58_private_key_here
# ANTHROPIC_API_KEY=your_key_here
# BIRDEYE_API_KEY=542677c3cfe844fab0a39eef37dcaf09
```

**For production trading:**
- Set real Solana private key (base58 format)
- Set real Anthropic API key
- Configure all other keys properly

### 4. Start the Bot

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### 5. Access the Website
Open browser to: http://localhost:3000

## What's Included

- ✅ Complete source code
- ✅ Persistent data (all bot history, decisions, chat logs)
- ✅ Limit orders data
- ✅ Configuration files
- ✅ Public website assets

## Persistent Data Files

The `data/` directory contains:
- `persistent-data.json` - Bot's complete history:
  - Last 20 trading decisions
  - Last 30 transactions
  - Last 100 wallet balance snapshots
  - Last 50 portfolio snapshots
  - Last 100 chat messages
  - Last 200 price snapshots
  - Last 100 autonomous events
- `limit-orders.json` - Active limit orders

## Website-Only Testing

If you just want to test website changes without real trading:

1. Keep placeholder keys in `.env`
2. The bot won't be able to connect to Solana (expected)
3. Website will still load and display all historical data from `persistent-data.json`
4. You can modify HTML/CSS/JS in `public/` directory
5. Restart server to see changes: `npm run dev`

## Notes

- Node.js 18+ required
- Port 3000 must be available
- For production, deploy to Render.com or similar
- All website data is automatically persisted to JSON files

## Support

Check the main README.md for full documentation.
EOF

echo "📋 Creating file manifest..."

# Create a manifest of what's included
cat > "${PACKAGE_DIR}/MANIFEST.txt" << EOF
Trading Bot Package - Created ${TIMESTAMP}

Source Code:
$(find "${PACKAGE_DIR}/src" -type f | wc -l) TypeScript files

Data Files:
$(ls -lh "${PACKAGE_DIR}/data" 2>/dev/null || echo "Data directory empty")

Configuration:
- .env (environment variables)
- package.json (dependencies)
- tsconfig.json (TypeScript config)

Website Assets:
$(find "${PACKAGE_DIR}/public" -type f 2>/dev/null | wc -l) files

Total Size:
$(du -sh "${PACKAGE_DIR}" | cut -f1)
EOF

echo "🗜️  Creating compressed archive..."

# Create tar.gz archive
cd /tmp
tar -czf "/home/user/Trader/${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"

# Clean up temp directory
rm -rf "${PACKAGE_DIR}"

echo ""
echo "✅ Package created successfully!"
echo ""
echo "📦 Archive: /home/user/Trader/${PACKAGE_NAME}.tar.gz"
echo "📊 Size: $(du -sh "/home/user/Trader/${PACKAGE_NAME}.tar.gz" | cut -f1)"
echo ""
echo "🚀 Transfer this file to your other machine and extract it:"
echo "   tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "   cd ${PACKAGE_NAME}"
echo "   npm install"
echo "   npm run dev"
echo ""
