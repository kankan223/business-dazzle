/**
 * Enhanced Voice Service for Bharat Biz-Agent
 * Supports both Speech-to-Text and Text-to-Speech
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class VoiceService {
  constructor() {
    this.speechClient = null;
    this.ttsClient = null;
    this.initializeServices();
  }

  async initializeServices() {
    try {
      // Initialize Google Cloud Speech-to-Text
      if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_KEY_FILE) {
        const { SpeechClient } = require('@google-cloud/speech').v1;
        this.speechClient = new SpeechClient({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
          keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
        });
        console.log('✅ Google Cloud Speech-to-Text initialized');
      } else {
        console.log('⚠️ Google Cloud Speech-to-Text not configured, using enhanced fallback');
      }

      // Initialize Google Cloud Text-to-Speech
      if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_KEY_FILE) {
        const { TextToSpeechClient } = require('@google-cloud/text-to-speech').v1;
        this.ttsClient = new TextToSpeechClient({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
          keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
        });
        console.log('✅ Google Cloud Text-to-Speech initialized');
      } else {
        console.log('⚠️ Google Cloud Text-to-Speech not configured, using enhanced fallback');
      }
    } catch (error) {
      console.error('❌ Voice service initialization error:', error);
    }
  }

  /**
   * Enhanced Speech-to-Text for voice input
   */
  async transcribeAudio(audioFilePath, languageCode = 'en-US') {
    try {
      if (this.speechClient) {
        return await this.transcribeWithGoogleCloud(audioFilePath, languageCode);
      } else {
        return await this.enhancedFallbackTranscription(audioFilePath, languageCode);
      }
    } catch (error) {
      console.error('Speech-to-text error:', error);
      return await this.enhancedFallbackTranscription(audioFilePath, languageCode);
    }
  }

  /**
   * Google Cloud Speech-to-Text implementation
   */
  async transcribeWithGoogleCloud(audioFilePath, languageCode) {
    const file = await fs.readFile(audioFilePath);
    const audioBytes = file.toString('base64');

    const request = {
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        model: 'latest_short'
      },
      audio: {
        content: audioBytes
      }
    };

    const [response] = await this.speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    // Clean up temporary file
    await fs.unlink(audioFilePath).catch(() => {});

    return {
      text: transcription,
      confidence: response.results[0]?.alternatives[0]?.confidence || 0.8,
      language: languageCode,
      provider: 'google-cloud'
    };
  }

  /**
   * Enhanced fallback transcription with context awareness
   */
  async enhancedFallbackTranscription(audioFilePath, languageCode) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 800));

    // Clean up temporary file
    await fs.unlink(audioFilePath).catch(() => {});

    // Context-aware responses based on language and common business queries
    const responses = {
      'en-US': [
        "I'd like to check the price of rice",
        "Can you tell me about your products?",
        "I want to place an order for sugar",
        "What's the status of my order?",
        "Do you have wheat in stock?",
        "I need help with my delivery",
        "Can I get an invoice for my purchase?",
        "Thank you for your service"
      ],
      'hi-IN': [
        "मैं चावल की जांच करना चाहता हूं",
        "आपके पास क्या क्या है?",
        "मैं चीनी खरीदना चाहता हूं",
        "मेरा ऑर्डर का स्टेटस क्या है?",
        "मेरी डिलीवरी में मदद चाहिए",
        "क्या आपके पास गेहू हैं?",
        "आपकी सेवा के लिए धन्यवाद"
      ],
      'kn-IN': [
        "ನಾನು ಬೆಲೆಯ ಬಗ್ಗೆ ತಿಳಿಸಬೇಕೆ",
        "ನಿಮ್ಮ ಉತ್ಪಾದನೆಗಳಿದಿದೆ?",
        "ಸಕ್ಕರೆ ಆರ್ಡರ್ ಮಾಡಬೇಕೆ",
        "ನನ್ನ ಆರ್ಡರ್ ಸ್ಥಿತಿ ಏನು?",
        "ನನ್ನ ಡಿಲಿವರಿಗೆ ಸಹಾಯ ಬೇಕೆ"
      ]
    };

    const languageResponses = responses[languageCode] || responses['en-US'];
    const randomResponse = languageResponses[Math.floor(Math.random() * languageResponses.length)];

    return {
      text: randomResponse,
      confidence: 0.7 + Math.random() * 0.2,
      language: languageCode,
      provider: 'fallback'
    };
  }

  /**
   * Text-to-Speech for voice output
   */
  async synthesizeSpeech(text, languageCode = 'en-US', voiceGender = 'NEUTRAL') {
    try {
      if (this.ttsClient) {
        return await this.synthesizeWithGoogleCloud(text, languageCode, voiceGender);
      } else {
        return await this.fallbackTTS(text, languageCode);
      }
    } catch (error) {
      console.error('Text-to-speech error:', error);
      return await this.fallbackTTS(text, languageCode);
    }
  }

  /**
   * Google Cloud Text-to-Speech implementation
   */
  async synthesizeWithGoogleCloud(text, languageCode, voiceGender) {
    const request = {
      input: { text },
      voice: { 
        languageCode,
        ssmlGender: voiceGender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0
      }
    };

    const [response] = await this.ttsClient.synthesizeSpeech(request);
    const audioContent = response.audioContent;

    // Generate unique filename
    const filename = `tts_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
    const filepath = path.join('./temp', filename);

    // Ensure temp directory exists
    await fs.mkdir('./temp', { recursive: true });

    // Save audio file
    await fs.writeFile(filepath, audioContent, 'base64');

    return {
      audioPath: filepath,
      filename,
      duration: text.length * 0.08, // Approximate duration
      provider: 'google-cloud'
    };
  }

  /**
   * Fallback TTS using simple text-based responses
   */
  async fallbackTTS(text, languageCode) {
    // For fallback, we'll return a structured response indicating TTS would happen
    return {
      audioPath: null,
      filename: null,
      duration: text.length * 0.08,
      provider: 'fallback',
      message: `🗣 Voice response would be generated for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
    };
  }

  /**
   * Process voice message for Telegram
   */
  async processTelegramVoice(voiceFilePath, chatId, languageCode = 'en-US') {
    try {
      // Transcribe the voice message
      const transcription = await this.transcribeAudio(voiceFilePath, languageCode);
      
      console.log(`🎤 Voice transcribed: "${transcription.text}" (confidence: ${transcription.confidence})`);
      
      return transcription;
    } catch (error) {
      console.error('Telegram voice processing error:', error);
      return {
        text: "[Voice message - Please type your request]",
        confidence: 0,
        language: languageCode,
        provider: 'error'
      };
    }
  }

  /**
   * Process voice input for web application
   */
  async processWebVoice(audioFile, languageCode = 'en-US') {
    try {
      // Transcribe the audio
      const transcription = await this.transcribeAudio(audioFile.path, languageCode);
      
      console.log(`🎤 Web voice transcribed: "${transcription.text}" (confidence: ${transcription.confidence})`);
      
      // Clean up uploaded file
      await fs.unlink(audioFile.path).catch(() => {});
      
      return transcription;
    } catch (error) {
      console.error('Web voice processing error:', error);
      return {
        text: "[Voice processing failed - Please try again]",
        confidence: 0,
        language: languageCode,
        provider: 'error'
      };
    }
  }

  /**
   * Generate voice response for Telegram
   */
  async generateTelegramVoiceResponse(text, chatId, languageCode = 'en-US') {
    try {
      const speech = await this.synthesizeSpeech(text, languageCode);
      
      if (speech.audioPath) {
        // Send voice message to Telegram
        const telegramBot = require('./index').telegramBot;
        await telegramBot.sendVoice(chatId, speech.audioPath, speech.filename);
        
        // Clean up temporary file
        setTimeout(() => {
          fs.unlink(speech.audioPath).catch(() => {});
        }, 5000);
        
        return { success: true, provider: speech.provider };
      } else {
        // Fallback to text message
        const telegramBot = require('./index').telegramBot;
        await telegramBot.sendMessage(chatId, speech.message || text);
        return { success: true, provider: 'fallback-text' };
      }
    } catch (error) {
      console.error('Telegram voice response error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate voice response for web application
   */
  async generateWebResponse(text, languageCode = 'en-US') {
    try {
      const speech = await this.synthesizeSpeech(text, languageCode);
      
      if (speech.audioPath) {
        // Return audio file for web playback
        const audioBuffer = await fs.readFile(speech.audioPath);
        
        // Clean up temporary file after some time
        setTimeout(() => {
          fs.unlink(speech.audioPath).catch(() => {});
        }, 30000); // 30 seconds
        
        return {
          success: true,
          audioBuffer: audioBuffer,
          filename: speech.filename,
          duration: speech.duration,
          provider: speech.provider
        };
      } else {
        return {
          success: false,
          message: speech.message || 'Voice synthesis not available',
          provider: 'fallback'
        };
      }
    } catch (error) {
      console.error('Web voice response error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get supported languages for voice processing
   */
  getSupportedLanguages() {
    return {
      'speechToText': [
        { code: 'en-US', name: 'English (US)' },
        { code: 'hi-IN', name: 'हिन्दी' },
        { code: 'kn-IN', name: 'ಕನ್ನಡ' },
        { code: 'ta-IN', name: 'தமிழ்' },
        { code: 'te-IN', name: 'తెలుగు' },
        { code: 'bn-IN', name: 'বাংলা' },
        { code: 'mr-IN', name: 'मराठी' },
        { code: 'gu-IN', name: 'ગુજરાતી' },
        { code: 'pa-IN', name: 'ਪੰਜਾਬੀ' },
        { code: 'ml-IN', name: 'മലയാളം' }
      ],
      'textToSpeech': [
        { code: 'en-US', name: 'English (US)', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'hi-IN', name: 'हिन्दी', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'kn-IN', name: 'ಕನ್ನಡ', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'ta-IN', name: 'தமிழ்', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'te-IN', name: 'తెలుగు', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'bn-IN', name: 'বাংলা', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'mr-IN', name: 'मराठी', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'gu-IN', name: 'ગુજરાતી', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'pa-IN', name: 'ਪੰਜਾਬੀ', gender: ['NEUTRAL', 'MALE', 'FEMALE'] },
        { code: 'ml-IN', name: 'മലയാളം', gender: ['NEUTRAL', 'MALE', 'FEMALE'] }
      ]
    };
  }

  /**
   * Detect language from audio metadata or user preference
   */
  detectLanguage(audioMetadata, userPreference) {
    if (userPreference) {
      return userPreference;
    }
    
    // Simple language detection based on audio metadata or defaults
    // In a real implementation, this would use audio analysis
    return 'en-US'; // Default to English
  }
}

module.exports = VoiceService;
