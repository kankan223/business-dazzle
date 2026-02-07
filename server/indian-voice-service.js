/**
 * Enhanced Voice Service for Indian Accents
 * WHY: Voice-first design optimized for Indian languages and accents
 * CHANGE: New service for Indian voice processing with accent tolerance
 */

const fs = require('fs');
const path = require('path');

class IndianVoiceService {
  constructor() {
    this.indianAccentModels = this.initializeIndianAccentModels();
    this.hinglishVoiceCommands = this.initializeHinglishVoiceCommands();
    this.noiseTolerance = this.initializeNoiseTolerance();
    this.voiceShortcuts = this.initializeVoiceShortcuts();
  }

  // Initialize Indian accent models
  initializeIndianAccentModels() {
    return {
      // Regional accent mappings
      'hindi': {
        models: ['hi-IN', 'hi-IN-WaveNet'],
        confidence_threshold: 0.7,
        common_phrases: ['नमस्ते', 'धन्यवाद', 'बिल', 'भुगतान', 'कल', 'आज']
      },
      'hinglish': {
        models: ['en-IN', 'en-US'],
        confidence_threshold: 0.6, // Lower threshold for mixed accents
        common_phrases: ['bhej dena', 'kal bhej do', 'paisay', 'maal kitna', 'bill banao']
      },
      'punjabi': {
        models: ['en-IN', 'pa-IN'],
        confidence_threshold: 0.65,
        common_phrases: ['दਫਤਾਬਾਦ', 'ਬਿਲ', 'ਕੱਲ', 'ਭੁਗਤਾਨ']
      },
      'bengali': {
        models: ['en-IN', 'bn-IN'],
        confidence_threshold: 0.65,
        common_phrases: ['বিল', 'পেমেন্ট', 'কাল', 'পরে']
      },
      'gujarati': {
        models: ['en-IN', 'gu-IN'],
        confidence_threshold: 0.65,
        common_phrases: ['બિલ', 'ચુકવણું', 'કલ', 'પેમેન્ટ']
      },
      'tamil': {
        models: ['en-IN', 'ta-IN'],
        confidence_threshold: 0.65,
        common_phrases: ['பில்', 'செலுத்து', 'காலை', 'நாள்']
      }
    };
  }

  // Initialize Hinglish voice commands
  initializeHinglishVoiceCommands() {
    return {
      // Invoice commands
      'bill banana': { intent: 'create_invoice', confidence: 0.9 },
      'invoice banao': { intent: 'create_invoice', confidence: 0.9 },
      'bill bana do': { intent: 'create_invoice', confidence: 0.9 },
      'rupaye ka bill': { intent: 'create_invoice', confidence: 0.8 },
      '₹500 ka bill': { intent: 'create_invoice', confidence: 0.9, amount: '500' },
      'five hundred ka bill': { intent: 'create_invoice', confidence: 0.9, amount: '500' },
      
      // Payment reminder commands
      'payment bhej do': { intent: 'send_payment_reminder', confidence: 0.9 },
      'bhugtan karo': { intent: 'send_payment_reminder', confidence: 0.9 },
      'paisay maang lo': { intent: 'send_payment_reminder', confidence: 0.9 },
      'paisay yaad dilao': { intent: 'send_payment_reminder', confidence: 0.9 },
      'payment reminder': { intent: 'send_payment_reminder', confidence: 0.8 },
      
      // Inventory commands
      'rice kitna hai': { intent: 'update_inventory', confidence: 0.9, item: 'rice' },
      'sugar stock': { intent: 'update_inventory', confidence: 0.9, item: 'sugar' },
      'maal add karo': { intent: 'update_inventory', confidence: 0.8, action: 'add' },
      'stock ghatao': { intent: 'update_inventory', confidence: 0.8, action: 'reduce' },
      'reorder karo': { intent: 'update_inventory', confidence: 0.9, action: 'reorder' },
      
      // Follow-up commands
      'follow up karo': { intent: 'follow_up', confidence: 0.9 },
      'call karo': { intent: 'follow_up', confidence: 0.9 },
      'message bhejo': { intent: 'follow_up', confidence: 0.9 },
      'status check karo': { intent: 'follow_up', confidence: 0.8 },
      
      // Approval commands (Hinglish)
      'haan': { action: 'approve', confidence: 0.9 },
      'han': { action: 'approve', confidence: 0.9 },
      'yes': { action: 'approve', confidence: 0.8 },
      'theek hai': { action: 'approve', confidence: 0.8 },
      'nahi': { action: 'reject', confidence: 0.9 },
      'na': { action: 'reject', confidence: 0.9 },
      'no': { action: 'reject', confidence: 0.8 },
      'cancel karo': { action: 'reject', confidence: 0.9 }
    };
  }

  // Initialize noise tolerance for Indian environments
  initializeNoiseTolerance() {
    return {
      // Common Indian background noises
      background_noises: [
        'traffic', 'horn', 'street_noise', 'market_noise', 'crowd',
        'fan', 'ac', 'cooking', 'tv', 'radio', 'children_playing'
      ],
      noise_reduction_level: 'high', // Aggressive noise reduction
      min_speech_duration: 1.0, // 1 second minimum
      max_silence_duration: 3.0, // 3 seconds max silence
      auto_gain_control: true // Automatic gain for varying volumes
    };
  }

  // Initialize voice shortcuts for quick actions
  initializeVoiceShortcuts() {
    return {
      // Quick invoice creation
      'quick bill': {
        template: {
          customer: 'last_customer',
          items: ['rice: 5kg'],
          amount: 'auto_calculate'
        },
        activation_phrase: 'quick bill banao'
      },
      
      // Quick payment reminder
      'quick reminder': {
        template: {
          customer: 'overdue_customers',
          message: 'payment_due_template'
        },
        activation_phrase: 'sabko reminder bhej do'
      },
      
      // Quick inventory check
      'quick stock': {
        template: {
          items: 'low_stock_items',
          action: 'auto_reorder'
        },
        activation_phrase: 'stock check karo'
      }
    };
  }

  // Process voice with Indian accent optimization
  async processIndianVoice(audioBuffer, customerInfo) {
    try {
      console.log('🎙️ Processing Indian voice input');
      
      // STEP 1: Detect accent/language
      const detectedAccent = await this.detectIndianAccent(audioBuffer);
      console.log(`🗣️ Detected accent: ${detectedAccent.region}`);
      
      // STEP 2: Apply noise reduction for Indian environments
      const cleanedAudio = await this.applyNoiseReduction(audioBuffer, detectedAccent);
      
      // STEP 3: Transcribe with accent-specific models
      const transcription = await this.transcribeWithAccent(cleanedAudio, detectedAccent);
      
      // STEP 4: Post-process for Hinglish corrections
      const enhancedTranscription = this.postProcessHinglish(transcription, detectedAccent);
      
      // STEP 5: Extract voice commands
      const voiceCommands = this.extractVoiceCommands(enhancedTranscription);
      
      return {
        transcription: enhancedTranscription,
        confidence: transcription.confidence,
        detected_accent: detectedAccent,
        voice_commands: voiceCommands,
        enhanced_for_indian: true
      };
      
    } catch (error) {
      console.error('Indian voice processing error:', error);
      return {
        transcription: '',
        confidence: 0.0,
        error: error.message
      };
    }
  }

  // Detect Indian accent from audio
  async detectIndianAccent(audioBuffer) {
    try {
      // Analyze audio characteristics
      const audioFeatures = await this.analyzeAudioFeatures(audioBuffer);
      
      // Detect patterns specific to Indian accents
      let detectedRegion = 'general';
      let confidence = 0.5;
      
      // Check for Hinglish patterns
      if (this.hasHinglishPatterns(audioFeatures)) {
        detectedRegion = 'hinglish';
        confidence = 0.8;
      }
      
      // Check for regional patterns
      for (const [region, config] of Object.entries(this.indianAccentModels)) {
        if (region !== 'hinglish' && this.matchesRegionalPatterns(audioFeatures, config)) {
          detectedRegion = region;
          confidence = 0.7;
          break;
        }
      }
      
      return {
        region: detectedRegion,
        confidence: confidence,
        models: this.indianAccentModels[detectedRegion].models
      };
      
    } catch (error) {
      console.error('Accent detection error:', error);
      return {
        region: 'general',
        confidence: 0.5,
        models: ['en-IN', 'hi-IN']
      };
    }
  }

  // Analyze audio features for accent detection
  async analyzeAudioFeatures(audioBuffer) {
    // This would use audio analysis libraries
    // For now, return mock features
    return {
      spectral_features: {
        pitch_range: 'normal',
        formant_frequencies: [800, 1200, 2500], // Typical for Indian accents
        rhythm: 'syllable_timed'
      },
      duration: audioBuffer.length / 16000, // Assuming 16kHz sample rate
      energy_level: 'medium'
    };
  }

  // Check for Hinglish patterns
  hasHinglishPatterns(audioFeatures) {
    // Hinglish typically has specific prosodic patterns
    return audioFeatures.spectral_features.rhythm === 'syllable_timed' &&
           audioFeatures.spectral_features.formant_frequencies[1] > 1100;
  }

  // Check for regional accent patterns
  matchesRegionalPatterns(audioFeatures, regionConfig) {
    // Simplified pattern matching
    return audioFeatures.spectral_features.formant_frequencies[0] > 750 &&
           audioFeatures.spectral_features.formant_frequencies[0] < 900;
  }

  // Apply noise reduction optimized for Indian environments
  async applyNoiseReduction(audioBuffer, detectedAccent) {
    try {
      // Apply aggressive noise reduction for Indian street/market environments
      const noiseProfile = this.buildIndianNoiseProfile(detectedAccent);
      
      // This would integrate with audio processing libraries
      // For now, return the original buffer with note
      console.log('🔧 Applying Indian environment noise reduction');
      
      return audioBuffer;
      
    } catch (error) {
      console.error('Noise reduction error:', error);
      return audioBuffer;
    }
  }

  // Build noise profile for Indian environments
  buildIndianNoiseProfile(detectedAccent) {
    return {
      // Indian-specific noise frequencies
      traffic_noise: { freq: [100, 200, 400], reduction: 0.8 },
      horn_noise: { freq: [800, 1200, 2000], reduction: 0.9 },
      crowd_noise: { freq: [200, 400, 800, 1600], reduction: 0.7 },
      market_noise: { freq: [100, 300, 600, 1200], reduction: 0.6 }
    };
  }

  // Transcribe with accent-specific models
  async transcribeWithAccent(audioBuffer, detectedAccent) {
    try {
      // Use the best model for detected accent
      const models = detectedAccent.models;
      let bestTranscription = { text: '', confidence: 0.0 };
      
      for (const model of models) {
        // This would call the actual speech-to-text service
        const transcription = await this.transcribeWithModel(audioBuffer, model);
        
        if (transcription.confidence > bestTranscription.confidence) {
          bestTranscription = transcription;
        }
      }
      
      return bestTranscription;
      
    } catch (error) {
      console.error('Transcription error:', error);
      return { text: '', confidence: 0.0, error: error.message };
    }
  }

  // Transcribe with specific model
  async transcribeWithModel(audioBuffer, model) {
    // This would integrate with Google Speech-to-Text or similar
    // For now, return mock transcription
    return {
      text: 'bill bana do five hundred ka', // Mock transcribed text
      confidence: 0.85,
      model: model
    };
  }

  // Post-process transcription for Hinglish corrections
  postProcessHinglish(transcription, detectedAccent) {
    let correctedText = transcription.text;
    
    if (detectedAccent.region === 'hinglish') {
      // Apply Hinglish-to-standard mappings
      for (const [hinglish, standard] of Object.entries(this.hinglishVoiceCommands)) {
        if (correctedText.toLowerCase().includes(hinglish)) {
          correctedText = correctedText.replace(new RegExp(hinglish, 'gi'), standard);
        }
      }
    }
    
    return {
      ...transcription,
      text: correctedText,
      post_processed: true
    };
  }

  // Extract voice commands from transcription
  extractVoiceCommands(transcription) {
    const commands = [];
    const text = transcription.text.toLowerCase();
    
    for (const [phrase, command] of Object.entries(this.hinglishVoiceCommands)) {
      if (text.includes(phrase)) {
        commands.push({
          phrase: phrase,
          command: command.intent || command.action,
          confidence: command.confidence,
          extracted_data: command
        });
      }
    }
    
    return commands;
  }

  // Generate voice response in Indian accent
  async generateIndianVoiceResponse(text, accent = 'hinglish') {
    try {
      const responseConfig = {
        text: text,
        language: accent === 'hinglish' ? 'en-IN' : 'hi-IN',
        voice: this.getIndianVoice(accent),
        speed: 0.9, // Slightly slower for clarity
        pitch: 'medium',
        emotion: 'helpful_polite'
      };
      
      // This would use text-to-speech service
      const audioBuffer = await this.synthesizeIndianSpeech(responseConfig);
      
      return {
        audio_buffer: audioBuffer,
        config: responseConfig,
        accent_optimized: true
      };
      
    } catch (error) {
      console.error('Voice response generation error:', error);
      return { error: error.message };
    }
  }

  // Get Indian voice for TTS
  getIndianVoice(accent) {
    const voiceMap = {
      'hinglish': 'en-IN-Wavenet-D', // Male voice for Hinglish
      'hindi': 'hi-IN-Wavenet-A', // Female voice for Hindi
      'punjabi': 'pa-IN-Wavenet-B',
      'bengali': 'bn-IN-Wavenet-C',
      'gujarati': 'gu-IN-Wavenet-D',
      'tamil': 'ta-IN-Wavenet-E',
      'general': 'en-IN-Standard-B'
    };
    
    return voiceMap[accent] || voiceMap['general'];
  }

  // Synthesize Indian speech
  async synthesizeIndianSpeech(config) {
    // This would integrate with Google Text-to-Speech or similar
    // For now, return mock buffer
    console.log(`🔊 Generating Indian speech: ${config.text}`);
    return Buffer.from('mock_audio_data');
  }

  // Validate voice command for Indian business context
  validateIndianVoiceCommand(transcription, customerContext) {
    const commands = this.extractVoiceCommands({ text: transcription });
    
    // Validate against business rules
    const validatedCommands = commands.map(cmd => {
      const validation = this.validateBusinessContext(cmd, customerContext);
      
      return {
        ...cmd,
        validation: validation,
        is_valid: validation.is_valid,
        requires_approval: validation.requires_approval
      };
    });
    
    return {
      commands: validatedCommands,
      best_command: validatedCommands.find(cmd => cmd.is_valid) || null,
      confidence: validatedCommands.length > 0 ? Math.max(...validatedCommands.map(cmd => cmd.confidence)) : 0.0
    };
  }

  // Validate command against business context
  validateBusinessContext(command, customerContext) {
    // Business validation rules for Indian SMB
    const validation = {
      is_valid: true,
      requires_approval: false,
      warnings: []
    };
    
    switch (command.command) {
      case 'create_invoice':
        if (command.extracted_data.amount && parseFloat(command.extracted_data.amount) > 10000) {
          validation.requires_approval = true;
          validation.warnings.push('High amount invoice requires approval');
        }
        break;
        
      case 'send_payment_reminder':
        validation.requires_approval = true; // Always require approval
        break;
        
      case 'update_inventory':
        if (command.extracted_data.action === 'reduce' && command.extracted_data.quantity > 50) {
          validation.requires_approval = true;
          validation.warnings.push('Large inventory reduction requires approval');
        }
        break;
    }
    
    return validation;
  }
}

module.exports = new IndianVoiceService();
