/**
 * Speech-to-Text Service for Bharat Biz-Agent
 * Supports multiple Indian languages and dialects
 */

const speech = require('@google-cloud/speech');
const fs = require('fs');
const multer = require('multer');

class SpeechToTextService {
  constructor() {
    // Initialize Google Cloud Speech client
    this.speechClient = new speech.SpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || null
    });
    
    // Configure multer for file uploads
    this.upload = multer({
      dest: 'uploads/',
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, cb) => {
        // Accept audio files only
        if (file.mimetype.startsWith('audio/')) {
          cb(null, true);
        } else {
          cb(new Error('Only audio files are allowed'), false);
        }
      }
    });
  }

  /**
   * Convert speech to text
   * @param {string} audioFilePath - Path to audio file
   * @param {string} languageCode - Language code (e.g., 'en-IN', 'hi-IN', 'kn-IN')
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(audioFilePath, languageCode = 'en-IN') {
    try {
      // Read audio file
      const audioBytes = fs.readFileSync(audioFilePath).toString('base64');

      const request = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: 'WEBM_OPUS', // Default encoding
          sampleRateHertz: 48000,
          languageCode: languageCode,
          alternativeLanguageCodes: ['en-IN', 'hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'bn-IN'],
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          model: 'latest_short', // Optimized for short audio
        },
      };

      // Detects speech in the audio file
      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      // Clean up the uploaded file
      fs.unlinkSync(audioFilePath);

      return transcription;
    } catch (error) {
      console.error('Speech-to-text error:', error);
      
      // Clean up the uploaded file even on error
      if (fs.existsSync(audioFilePath)) {
        fs.unlinkSync(audioFilePath);
      }
      
      throw error;
    }
  }

  /**
   * Get supported languages
   * @returns {Array} List of supported languages
   */
  getSupportedLanguages() {
    return [
      { code: 'en-IN', name: 'English (India)' },
      { code: 'hi-IN', name: 'हिन्दी (Hindi)' },
      { code: 'kn-IN', name: 'ಕನ್ನಡ (Kannada)' },
      { code: 'ta-IN', name: 'தமிழ் (Tamil)' },
      { code: 'te-IN', name: 'తెలుగు (Telugu)' },
      { code: 'bn-IN', name: 'বাংলা (Bengali)' },
      { code: 'mr-IN', name: 'मराठी (Marathi)' },
      { code: 'gu-IN', name: 'ગુજરાતી (Gujarati)' },
      { code: 'pa-IN', name: 'ਪੰਜਾਬੀ (Punjabi)' },
      { code: 'ml-IN', name: 'മലയാളം (Malayalam)' },
    ];
  }

  /**
   * Detect language from audio
   * @param {string} audioFilePath - Path to audio file
   * @returns {Promise<string>} Detected language code
   */
  async detectLanguage(audioFilePath) {
    try {
      const audioBytes = fs.readFileSync(audioFilePath).toString('base64');

      const request = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCodes: ['en-IN', 'hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'bn-IN'],
        },
      };

      const [response] = await this.speechClient.recognize(request);
      
      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        if (result.languageCode) {
          return result.languageCode;
        }
      }

      // Default to English if detection fails
      return 'en-IN';
    } catch (error) {
      console.error('Language detection error:', error);
      return 'en-IN';
    }
  }

  /**
   * Process voice message from bot
   * @param {Object} audioBuffer - Audio buffer from voice message
   * @param {string} platform - Platform (telegram, whatsapp)
   * @returns {Promise<Object>} Transcription with metadata
   */
  async processVoiceMessage(audioBuffer, platform = 'telegram') {
    try {
      // Save buffer to temporary file
      const tempFilePath = `uploads/voice_${Date.now()}.webm`;
      fs.writeFileSync(tempFilePath, audioBuffer);

      // Detect language first
      const detectedLanguage = await this.detectLanguage(tempFilePath);

      // Transcribe with detected language
      const transcription = await this.transcribeAudio(tempFilePath, detectedLanguage);

      return {
        text: transcription,
        language: detectedLanguage,
        confidence: 0.9, // Placeholder confidence score
        platform: platform,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Voice message processing error:', error);
      throw error;
    }
  }
}

module.exports = SpeechToTextService;
