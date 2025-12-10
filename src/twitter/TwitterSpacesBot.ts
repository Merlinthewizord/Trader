import { TwitterApi, SpaceV2, UserV2 } from 'twitter-api-v2';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import { TradingAgent } from '../agent/TradingAgent';

export interface TwitterSpacesBotConfig {
  twitterApiKey: string;
  twitterApiSecret: string;
  twitterAccessToken: string;
  twitterAccessSecret: string;
  openaiApiKey: string;
  elevenLabsApiKey?: string;
  voiceId?: string;
  personality?: string;
  autoJoinSpaces?: boolean;
  tradingCommentaryEnabled?: boolean;
}

export interface SpaceParticipant {
  id: string;
  username: string;
  name: string;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  speakerId?: string;
}

export class TwitterSpacesBot {
  private twitterClient: TwitterApi;
  private openai: OpenAI;
  private elevenlabs?: ElevenLabsClient;
  private config: TwitterSpacesBotConfig;
  private tradingAgent?: TradingAgent;

  private currentSpace?: SpaceV2;
  private isActive: boolean = false;
  private isSpeaking: boolean = false;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(config: TwitterSpacesBotConfig, tradingAgent?: TradingAgent) {
    this.config = config;
    this.tradingAgent = tradingAgent;

    // Initialize Twitter API client
    this.twitterClient = new TwitterApi({
      appKey: config.twitterApiKey,
      appSecret: config.twitterApiSecret,
      accessToken: config.twitterAccessToken,
      accessSecret: config.twitterAccessSecret,
    });

    // Initialize OpenAI client (using OpenRouter for chat, regular OpenAI for audio)
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/Merlinthewizord/Trader',
        'X-Title': 'Twitter Spaces Bot'
      }
    });

    // Initialize ElevenLabs if API key provided
    if (config.elevenLabsApiKey) {
      this.elevenlabs = new ElevenLabsClient({
        apiKey: config.elevenLabsApiKey,
      });
    }

    console.log('🎙️ Twitter Spaces Bot initialized');
  }

  /**
   * Search for live Twitter Spaces based on query
   */
  async searchLiveSpaces(query: string = 'crypto trading'): Promise<SpaceV2[]> {
    try {
      const spaces = await this.twitterClient.v2.searchSpaces({
        query,
        state: 'live',
        'space.fields': ['title', 'state', 'participant_count', 'speaker_ids', 'creator_id', 'host_ids', 'started_at'],
      });

      return spaces.data || [];
    } catch (error) {
      console.error('❌ Error searching spaces:', error);
      return [];
    }
  }

  /**
   * Join a specific Twitter Space by ID
   */
  async joinSpace(spaceId: string): Promise<boolean> {
    try {
      console.log(`🚀 Attempting to join Space: ${spaceId}`);

      // Get space details
      const space = await this.twitterClient.v2.space(spaceId, {
        'space.fields': ['title', 'state', 'participant_count', 'speaker_ids', 'creator_id', 'host_ids', 'started_at'],
      });

      if (!space.data) {
        console.error('❌ Space not found');
        return false;
      }

      this.currentSpace = space.data;
      this.isActive = true;

      console.log(`✅ Joined Space: "${space.data.title}"`);
      console.log(`👥 Participants: ${space.data.participant_count || 0}`);

      // Start listening and responding
      await this.startListening();

      return true;
    } catch (error) {
      console.error('❌ Error joining space:', error);
      return false;
    }
  }

  /**
   * Leave the current Twitter Space
   */
  async leaveSpace(): Promise<void> {
    if (!this.currentSpace) {
      console.log('⚠️ Not currently in any space');
      return;
    }

    console.log(`👋 Leaving Space: "${this.currentSpace.title}"`);
    this.isActive = false;
    this.currentSpace = undefined;
    this.conversationHistory = [];
  }

  /**
   * Start listening to audio in the Space
   * Note: Twitter Spaces audio streaming requires additional authentication
   * and may need to be implemented using Twitter's internal APIs
   */
  private async startListening(): Promise<void> {
    console.log('👂 Starting to listen to Space audio...');

    // This is a placeholder for audio streaming logic
    // In production, you would:
    // 1. Connect to Twitter's audio streaming endpoint
    // 2. Receive audio chunks
    // 3. Process them through speech-to-text
    // 4. Generate responses
    // 5. Convert responses to speech and stream back

    // For now, we'll simulate periodic engagement
    this.simulateEngagement();
  }

  /**
   * Simulate engagement in the Space (for testing)
   */
  private simulateEngagement(): void {
    if (!this.isActive) return;

    // Simulate checking for opportunities to speak every 30 seconds
    const checkInterval = setInterval(async () => {
      if (!this.isActive) {
        clearInterval(checkInterval);
        return;
      }

      // In a real implementation, this would be triggered by:
      // - Someone mentioning the bot
      // - Relevant keywords being detected
      // - Natural pauses in conversation
      console.log('🎯 Listening for opportunities to engage...');
    }, 30000);
  }

  /**
   * Process incoming audio from the Space
   */
  async processAudio(audioChunk: AudioChunk): Promise<void> {
    if (!this.isActive || this.isSpeaking) return;

    try {
      // Convert audio to text using OpenAI Whisper
      const transcription = await this.transcribeAudio(audioChunk.data);

      if (transcription && transcription.trim().length > 0) {
        console.log(`📝 Transcribed: "${transcription}"`);

        // Check if we should respond
        if (this.shouldRespond(transcription)) {
          await this.generateAndSpeak(transcription);
        }
      }
    } catch (error) {
      console.error('❌ Error processing audio:', error);
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper
   */
  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Create a file-like object from buffer
      const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

      const transcription = await this.openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en',
      });

      return transcription.text;
    } catch (error) {
      console.error('❌ Error transcribing audio:', error);
      return '';
    }
  }

  /**
   * Determine if the bot should respond to a message
   */
  private shouldRespond(text: string): boolean {
    const lowerText = text.toLowerCase();

    // Respond if mentioned directly
    if (lowerText.includes('bot') || lowerText.includes('ai')) {
      return true;
    }

    // Respond to trading-related questions if trading commentary enabled
    if (this.config.tradingCommentaryEnabled) {
      const tradingKeywords = ['trade', 'buy', 'sell', 'token', 'crypto', 'price', 'market', 'pump', 'moon'];
      if (tradingKeywords.some(keyword => lowerText.includes(keyword))) {
        return true;
      }
    }

    // Random engagement (10% chance)
    return Math.random() < 0.1;
  }

  /**
   * Generate a response and speak it
   */
  async generateAndSpeak(prompt: string): Promise<void> {
    if (this.isSpeaking) return;

    this.isSpeaking = true;

    try {
      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: prompt });

      // Generate response using OpenAI
      const response = await this.generateResponse(prompt);

      console.log(`🤖 Generated response: "${response}"`);

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Convert to speech and play
      await this.speak(response);

    } catch (error) {
      console.error('❌ Error generating/speaking response:', error);
    } finally {
      this.isSpeaking = false;
    }
  }

  /**
   * Generate a text response using OpenAI
   */
  private async generateResponse(prompt: string): Promise<string> {
    try {
      // Build system prompt
      let systemPrompt = this.config.personality ||
        'You are a friendly and knowledgeable AI assistant speaking in a Twitter Space. ' +
        'Keep your responses concise (1-3 sentences), natural, and engaging. ' +
        'You have expertise in cryptocurrency trading and market analysis.';

      // Add trading context if available
      if (this.config.tradingCommentaryEnabled && this.tradingAgent) {
        systemPrompt += '\n\nYou are integrated with a live trading agent and can provide real-time market insights.';
      }

      // Limit conversation history to last 10 messages
      const recentHistory = this.conversationHistory.slice(-10);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-oss-20b',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentHistory,
          { role: 'user', content: prompt },
        ],
        max_tokens: 150,
        temperature: 0.8,
      });

      return completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error) {
      console.error('❌ Error generating response:', error);
      return 'Sorry, I encountered an error.';
    }
  }

  /**
   * Convert text to speech and play it
   */
  private async speak(text: string): Promise<void> {
    try {
      console.log(`🗣️ Speaking: "${text}"`);

      if (this.elevenlabs && this.config.voiceId) {
        // Use ElevenLabs for high-quality voice
        await this.speakWithElevenLabs(text);
      } else {
        // Use OpenAI TTS as fallback
        await this.speakWithOpenAI(text);
      }
    } catch (error) {
      console.error('❌ Error speaking:', error);
    }
  }

  /**
   * Speak using ElevenLabs TTS
   */
  private async speakWithElevenLabs(text: string): Promise<void> {
    if (!this.elevenlabs || !this.config.voiceId) return;

    try {
      const audio = await this.elevenlabs.textToSpeech.convert(this.config.voiceId, {
        text,
        modelId: 'eleven_monolingual_v1',
      });

      // In production, stream this audio to Twitter Spaces
      console.log('🎵 ElevenLabs audio generated');

      // Placeholder: would stream audio back to Twitter Spaces here
    } catch (error) {
      console.error('❌ Error with ElevenLabs TTS:', error);
      // Fallback to OpenAI
      await this.speakWithOpenAI(text);
    }
  }

  /**
   * Speak using OpenAI TTS
   */
  private async speakWithOpenAI(text: string): Promise<void> {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: text,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      // In production, stream this audio to Twitter Spaces
      console.log('🎵 OpenAI TTS audio generated');

      // Placeholder: would stream audio back to Twitter Spaces here
    } catch (error) {
      console.error('❌ Error with OpenAI TTS:', error);
    }
  }

  /**
   * Get trading insights from the trading agent
   */
  async getTradingInsight(topic: string): Promise<string> {
    if (!this.tradingAgent || !this.config.tradingCommentaryEnabled) {
      return 'Trading insights are not currently available.';
    }

    try {
      // This would integrate with the trading agent to get real-time insights
      return `Based on current market analysis: ${topic}`;
    } catch (error) {
      console.error('❌ Error getting trading insight:', error);
      return 'Unable to fetch trading insights at the moment.';
    }
  }

  /**
   * Get bot status
   */
  getStatus(): {
    isActive: boolean;
    isSpeaking: boolean;
    currentSpace?: string;
    messageCount: number;
  } {
    return {
      isActive: this.isActive,
      isSpeaking: this.isSpeaking,
      currentSpace: this.currentSpace?.title,
      messageCount: this.conversationHistory.length,
    };
  }

  /**
   * Auto-join mode: search and join relevant spaces automatically
   */
  async startAutoJoinMode(searchQuery: string = 'crypto trading', checkIntervalMinutes: number = 5): Promise<void> {
    console.log(`🤖 Starting auto-join mode (searching for: "${searchQuery}")`);

    const checkSpaces = async () => {
      if (this.isActive) {
        console.log('Already in a space, skipping search...');
        return;
      }

      console.log('🔍 Searching for relevant spaces...');
      const spaces = await this.searchLiveSpaces(searchQuery);

      if (spaces.length > 0) {
        console.log(`Found ${spaces.length} live spaces`);

        // Join the first available space
        const targetSpace = spaces[0];
        console.log(`🎯 Auto-joining: "${targetSpace.title}"`);
        await this.joinSpace(targetSpace.id);
      } else {
        console.log('No relevant spaces found');
      }
    };

    // Initial check
    await checkSpaces();

    // Periodic checks
    setInterval(checkSpaces, checkIntervalMinutes * 60 * 1000);
  }
}
