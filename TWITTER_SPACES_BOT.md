# Twitter Spaces Voice Bot

This document describes the Twitter Spaces voice bot integration for the Solana Trading Agent.

## Overview

The Twitter Spaces Bot enables your trading agent to join Twitter Spaces (audio chat rooms) and participate in conversations about cryptocurrency trading, provide market insights, and engage with the crypto community in real-time using AI-powered voice interactions.

## Features

- **Voice Conversation**: Natural language interactions using OpenAI GPT-4 for responses
- **Speech Recognition**: Audio transcription using OpenAI Whisper
- **Text-to-Speech**: High-quality voice synthesis using ElevenLabs or OpenAI TTS
- **Auto-Join Mode**: Automatically discover and join relevant Twitter Spaces
- **Trading Commentary**: Provide real-time market insights and trading analysis
- **REST API Control**: Full programmatic control via HTTP endpoints

## Architecture

The bot is built using:
- **twitter-api-v2**: Twitter API v2 client for Node.js
- **OpenAI API**: GPT-4 for conversation, Whisper for speech-to-text, TTS for voice
- **ElevenLabs**: Optional premium voice synthesis
- **TypeScript**: Type-safe implementation

## Configuration

Add the following environment variables to your `.env` file:

```bash
# Twitter API Credentials (Required)
TWITTER_API_KEY=your_twitter_api_key_here
TWITTER_API_SECRET=your_twitter_api_secret_here
TWITTER_ACCESS_TOKEN=your_twitter_access_token_here
TWITTER_ACCESS_SECRET=your_twitter_access_secret_here

# OpenAI API (Required for voice bot)
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs API (Optional - for premium voice)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# Bot Settings
TWITTER_BOT_ENABLED=true
TWITTER_BOT_AUTO_JOIN=true
TWITTER_BOT_SEARCH_QUERY=crypto trading solana
TWITTER_BOT_TRADING_COMMENTARY=true
TWITTER_BOT_PERSONALITY=You are a knowledgeable crypto trading AI assistant...
```

### Getting Twitter API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new app or use an existing one
3. Navigate to "Keys and tokens"
4. Generate and copy:
   - API Key (Consumer Key)
   - API Secret (Consumer Secret)
   - Access Token
   - Access Token Secret

### Getting OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key to your `.env` file

### Getting ElevenLabs Credentials (Optional)

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up and navigate to your profile
3. Copy your API key
4. Browse available voices and copy the Voice ID you want to use

## API Endpoints

### Get Bot Status
```bash
GET /api/twitter/status
```

Returns the current status of the Twitter bot including whether it's active, speaking, and which Space it's in.

**Response:**
```json
{
  "enabled": true,
  "isActive": true,
  "isSpeaking": false,
  "currentSpace": "Crypto Trading Discussion",
  "messageCount": 15
}
```

### Search Live Spaces
```bash
GET /api/twitter/search?q=crypto%20trading
```

Search for live Twitter Spaces matching a query.

**Response:**
```json
{
  "spaces": [
    {
      "id": "1DXxyRYNejbKM",
      "title": "Crypto Trading Discussion",
      "state": "live",
      "participant_count": 42,
      "started_at": "2025-12-10T12:00:00.000Z"
    }
  ]
}
```

### Join a Space
```bash
POST /api/twitter/join
Content-Type: application/json

{
  "spaceId": "1DXxyRYNejbKM"
}
```

Join a specific Twitter Space by ID.

**Response:**
```json
{
  "success": true,
  "spaceId": "1DXxyRYNejbKM"
}
```

### Leave Current Space
```bash
POST /api/twitter/leave
```

Leave the currently active Space.

**Response:**
```json
{
  "success": true
}
```

### Make Bot Speak
```bash
POST /api/twitter/speak
Content-Type: application/json

{
  "message": "What's your take on the market today?"
}
```

Trigger the bot to generate a response and speak in the current Space.

**Response:**
```json
{
  "success": true
}
```

### Start Auto-Join Mode
```bash
POST /api/twitter/auto-join
Content-Type: application/json

{
  "query": "solana meme coins",
  "intervalMinutes": 5
}
```

Enable automatic Space discovery and joining.

**Response:**
```json
{
  "success": true,
  "mode": "auto-join",
  "query": "solana meme coins",
  "intervalMinutes": 5
}
```

## Usage Examples

### Basic Usage

1. **Enable the bot** by setting `TWITTER_BOT_ENABLED=true` in your `.env` file
2. **Start the application**: `npm run dev`
3. The bot will initialize and be ready to join Spaces

### Manual Space Control

```bash
# Search for live crypto Spaces
curl http://localhost:3000/api/twitter/search?q=crypto

# Join a specific Space
curl -X POST http://localhost:3000/api/twitter/join \
  -H "Content-Type: application/json" \
  -d '{"spaceId": "1DXxyRYNejbKM"}'

# Make the bot speak
curl -X POST http://localhost:3000/api/twitter/speak \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell us about recent market trends"}'

# Leave the Space
curl -X POST http://localhost:3000/api/twitter/leave
```

### Automatic Mode

Enable auto-join in your `.env`:
```bash
TWITTER_BOT_AUTO_JOIN=true
TWITTER_BOT_SEARCH_QUERY=solana trading pump.fun
```

The bot will automatically:
1. Search for live Spaces matching your query every 5 minutes
2. Join relevant Spaces automatically
3. Listen for opportunities to contribute
4. Provide trading insights and market commentary

## How It Works

### Voice Interaction Flow

1. **Audio Capture**: The bot receives audio chunks from Twitter Spaces
2. **Speech-to-Text**: Audio is transcribed using OpenAI Whisper
3. **Intent Detection**: The bot determines if it should respond based on:
   - Direct mentions (bot, AI)
   - Trading keywords (trade, buy, sell, token, price, etc.)
   - Random engagement (10% probability)
4. **Response Generation**: GPT-4 generates a contextual response
5. **Text-to-Speech**: Response is converted to speech using ElevenLabs or OpenAI TTS
6. **Audio Streaming**: Generated audio is streamed back to the Space

### Trading Integration

When `TWITTER_BOT_TRADING_COMMENTARY=true`, the bot can:
- Access real-time trading data from your TradingAgent
- Provide insights on market conditions
- Discuss recent trades and strategies
- Answer questions about specific tokens

### Conversation Memory

The bot maintains conversation history (last 10 messages) to:
- Provide contextual responses
- Avoid repetition
- Build natural dialogue flow

## Limitations & Notes

### Current Implementation

This is a reference implementation that provides the core framework. Full production deployment requires:

1. **Audio Streaming**: Twitter Spaces audio access requires additional authentication and may need internal/unofficial APIs
2. **Real-time Processing**: Production use should implement proper audio buffering and real-time processing
3. **Rate Limiting**: Implement proper rate limiting for API calls
4. **Error Handling**: Add robust error recovery for network issues

### Known Issues

- Audio streaming from Twitter Spaces requires additional setup beyond the official API
- The bot currently uses simulated engagement rather than real-time audio processing
- Voice quality depends on TTS service (ElevenLabs recommended for best quality)

### Recommendations

For production use:
1. Use ElevenLabs for higher quality voice synthesis
2. Implement proper audio routing (similar to VB-Cable in the Python reference)
3. Add rate limiting and retry logic
4. Monitor API usage and costs
5. Test thoroughly with small, private Spaces first

## Troubleshooting

### Bot Not Starting

Check that all required environment variables are set:
```bash
# Required
TWITTER_BOT_ENABLED=true
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
OPENAI_API_KEY=...
```

### API Errors

- **401 Unauthorized**: Check Twitter API credentials
- **403 Forbidden**: Verify your Twitter app has required permissions
- **429 Rate Limited**: Reduce request frequency

### Audio Issues

- Ensure you have the correct ElevenLabs Voice ID
- OpenAI TTS is used as fallback if ElevenLabs fails
- Check API rate limits for both services

## Development

### File Structure

```
src/
  twitter/
    TwitterSpacesBot.ts    # Main bot implementation
  server/
    WebServer.ts           # API endpoints (updated)
  index.ts                 # Bot initialization (updated)
```

### Extending the Bot

To add custom behaviors:

1. **Custom Triggers**: Modify `shouldRespond()` in TwitterSpacesBot.ts
2. **Enhanced Personality**: Update the system prompt in `generateResponse()`
3. **Trading Integration**: Implement `getTradingInsight()` with your TradingAgent
4. **Additional APIs**: Add new endpoints in WebServer.ts

### Testing

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Test API endpoints
curl http://localhost:3000/api/twitter/status
```

## References

- [Twitter API v2 Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [ElevenLabs API Documentation](https://elevenlabs.io/docs)
- [Original Python Implementation](https://github.com/Convodotwtf/voice-ai-twitter-spaces)

## Support

For issues or questions:
- Check the main README.md for general setup
- Review environment variable configuration
- Verify API credentials and permissions
- Check logs for error messages

## License

MIT License - Same as the main project
