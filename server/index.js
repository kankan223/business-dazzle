/**
 * Bharat Biz-Agent - Bot Server
 * WhatsApp & Telegram Bot Integration with Admin Approval System
 * 
 * Security Features:
 * - AES-256-GCM encryption for all messages
 * - Rate limiting to prevent abuse
 * - Helmet.js for security headers
 * - Input validation and sanitization
 * - Audit logging for all actions
 */

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Import database and AI services
const { 
  connectDatabase, 
  getDatabase, 
  BotOperations, 
  ConversationOperations, 
  ApprovalOperations, 
  CustomerOperations, 
  AuditOperations,
  InventoryOperations,
  OrderOperations
} = require('./database');
const geminiService = require('./gemini-service');
const SpeechToTextService = require('./speech-service');

// API Key Authentication Middleware
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authorization header required' 
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const adminApiKey = process.env.ADMIN_API_KEY;
  
  if (!adminApiKey) {
    console.error('ADMIN_API_KEY not configured in environment');
    return res.status(500).json({ 
      success: false, 
      error: 'Server configuration error' 
    });
  }
  
  if (token !== adminApiKey) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid API key' 
    });
  }
  
  next();
};

const app = express();
const PORT = process.env.PORT || 3001;

// Create uploads directory for speech-to-text
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Initialize services
const speechService = new SpeechToTextService();

// Create HTTP server for WebSocket support
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔌 Admin dashboard connected:', socket.id);
  
  // Join admin room for real-time updates
  socket.join('admin_room');
  
  // Send initial data to newly connected admin
  socket.emit('initial_data', {
    timestamp: new Date().toISOString(),
    message: 'Connected to Bharat Biz-Agent dashboard'
  });
  
  // Handle real-time message updates
  socket.on('admin_message', async (data) => {
    try {
      // Validate admin message
      const validation = validateInput(data, validationSchemas.customerMessage);
      if (!validation.isValid) {
        socket.emit('error', { 
          type: 'validation_error', 
          details: validation.errors 
        });
        return;
      }
      
      // Broadcast to all admin dashboards
      broadcastToAdmins('message_update', {
        ...data,
        timestamp: new Date().toISOString(),
        id: socket.id
      });
      
      // Log the admin action
      await AuditOperations.log({
        action: 'admin_message',
        details: privacyControls.maskSensitiveData(data),
        userId: data.userId || 'admin',
        ipAddress: socket.handshake.address,
        severity: 'info'
      });
      
    } catch (error) {
      console.error('WebSocket message error:', error);
      socket.emit('error', { 
        type: 'message_error', 
        message: 'Failed to process message' 
      });
    }
  });
  
  // Handle conversation status updates
  socket.on('conversation_status', async (data) => {
    try {
      broadcastToAdmins('conversation_update', {
        ...data,
        timestamp: new Date().toISOString()
      });
      
      await AuditOperations.log({
        action: 'conversation_update',
        details: { conversationId: data.conversationId, status: data.status },
        userId: 'admin',
        ipAddress: socket.handshake.address,
        severity: 'info'
      });
      
    } catch (error) {
      console.error('Conversation status error:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Admin dashboard disconnected:', socket.id);
    broadcastToAdmins('admin_disconnected', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  });
});

// Function to broadcast updates to admin dashboard
function broadcastToAdmins(event, data) {
  console.log(`📡 Broadcasting ${event} to admins:`, data);
  io.to('admin_room').emit(event, data);
}

// Enhanced message broadcasting for bot messages
async function broadcastMessageToAdmins(messageData) {
  const broadcastData = {
    ...messageData,
    timestamp: new Date().toISOString(),
    broadcastId: crypto.randomBytes(16).toString('hex')
  };
  
  broadcastToAdmins('new_message', broadcastData);
  
  // Also update conversation list if applicable
  if (messageData.conversationId) {
    broadcastToAdmins('conversation_updated', {
      conversationId: messageData.conversationId,
      lastMessage: messageData,
      timestamp: new Date().toISOString()
    });
  }
}


const TelegramBot = require('node-telegram-bot-api');

// 🔥 CREATE TELEGRAM BOT (safe for dev + test)
let telegramBot = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
  telegramBot = new TelegramBot(
    process.env.TELEGRAM_BOT_TOKEN,
    {
      polling: process.env.NODE_ENV !== 'test'
    }
  );
  console.log('✅ Telegram bot configured');
} else {
  console.log('⚠️  Telegram bot not configured (optional)');
}



// Telegram message handler (only if bot is configured)
if (telegramBot) {
  telegramBot.on('message', async (msg) => {
  try {
    // 1️⃣ Validate
    if (!validateTelegramMessage(msg)) return;

    const userId = msg.from.id;
    const chatId = msg.chat.id;

    // 2️⃣ Rate limit
    if (isTelegramRateLimited(userId)) {
      return telegramBot.sendMessage(chatId, "⏳ Please slow down a bit.");
    }

    // 3️⃣ Hard approval lock
    const lockedApproval = [...pendingApprovals.values()].find(
      a =>
        a.platform === 'telegram' &&
        a.chatId === chatId &&
        a.status === 'pending' &&
        a.locked === true
    );

    if (lockedApproval) {
      return telegramBot.sendMessage(
        chatId,
        "⏳ Your previous request is still awaiting admin approval."
      );
    }

    // 4️⃣ Forward sanitized message
    await handleTelegramMessage(msg, 'telegram');

  } catch (err) {
    console.error("🚨 Telegram handler error:", err);
  }
});

  // Telegram polling error handler
  telegramBot.on('polling_error', (err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('🚨 Telegram polling error:', err);
    }
  });
}


// ==================== TELEGRAM INPUT VALIDATION ====================

function validateTelegramMessage(msg) {
  // Basic shape check
  if (!msg || !msg.from || !msg.chat) return false;

  // Ignore bot messages
  if (msg.from.is_bot) return false;

  // Only allow text messages for now
  if (typeof msg.text !== 'string') return false;

  // Trim & length guard (prevents memory abuse)
  const text = msg.text.trim();
  if (text.length === 0) return false;
  if (text.length > 500) return false;

  // Block control / weird unicode spam
  const unsafePattern = /[\u0000-\u001F\u007F]/;
  if (unsafePattern.test(text)) return false;

  return true;
}

// ==================== TELEGRAM RATE LIMITING ====================

const telegramUserRateLimit = new Map();

// Allow 1 message per second per user
 
function isTelegramRateLimited(userId) {
  const now = Date.now();
  const last = telegramUserRateLimit.get(userId) || 0;

  if (now - last < 1000) {
    return true;
  }

  telegramUserRateLimit.set(userId, now);
  return false;
}


// ==================== SECURITY MIDDLEWARE ====================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { error: 'API rate limit exceeded. Please try again later.' }
});

const commandLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 commands per minute
  message: { error: 'Too many commands. Please wait before trying again.' }
});

const speechLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 speech requests per minute
  message: { error: 'Too many speech requests. Please wait before trying again.' }
});
app.use('/api', apiLimiter);

// ==================== ENCRYPTION UTILITIES ====================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const AUTH_TAG_LENGTH = 16;
const IV_LENGTH = 16;

/**
 * Encrypt text using AES-256-GCM
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted data in format: iv:authTag:ciphertext
 */
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt text using AES-256-GCM
 * @param {string} encryptedData - Data in format: iv:authTag:ciphertext
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedData) {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '[Encrypted Message]';
  }
}

// ==================== IN-MEMORY STORAGE ====================
// In production, use Redis or a proper database

const pendingApprovals = new Map();
const botConversations = new Map();
const botInstances = new Map();
const securityLogs = [];
const messageHistory = new Map();

// Initialize with sample bots
botInstances.set('bot-1', {
  id: 'bot-1',
  name: 'Sales Bot - Primary',
  platform: 'whatsapp',
  status: 'active',
  phoneNumber: '+91-98765-43210',
  encryptionEnabled: true,
  autoApproveThreshold: 5000
});

botInstances.set('bot-2', {
  id: 'bot-2',
  name: 'Support Bot',
  platform: 'telegram',
  status: 'active',
  encryptionEnabled: true,
  autoApproveThreshold: 10000
});

// ==================== AUDIT LOGGING ====================

function logSecurityEvent(event, user, ip, severity, details) {
  const log = {
    id: `log-${Date.now()}`,
    event,
    user: user || 'system',
    ip: ip || 'unknown',
    timestamp: new Date(),
    severity: severity || 'info',
    details: details || ''
  };
  securityLogs.unshift(log);
  
  // Keep only last 1000 logs
  if (securityLogs.length > 1000) {
    securityLogs.pop();
  }
  
  console.log(`[${severity.toUpperCase()}] ${event}: ${details}`);
}

// ==================== LANGUAGE DETECTION ====================

function detectLanguage(text) {
  const hindiRegex = /[\u0900-\u097F]/;
  const hinglishWords = ['hai', 'hoon', 'aap', 'kaise', 'karo', 'bhejo', 'dena', 'lena', 'rupee', 'rupey', 'kal', 'aaj', 'mujhe', 'chahiye', 'karna', 'karo', 'batao', 'bataiye', 'kitna', 'kitne', 'nahi', 'haan', 'theek', 'sahi'];
  
  if (hindiRegex.test(text)) return 'hi';
  const lowerText = text.toLowerCase();
  if (hinglishWords.some(word => lowerText.includes(word))) return 'hinglish';
  return 'en';
}

// ==================== TRANSLATIONS ====================

const translations = {
  en: {
    greeting: 'Namaste! 🙏 Welcome to Bharat Biz-Agent. How can I help you?\n\n1️⃣ Place an order\n2️⃣ Check prices\n3️⃣ View stock\n4️⃣ Generate invoice',
    orderPrompt: 'What would you like to order?\n\n• Rice (Basmati) - ₹120/kg\n• Wheat Flour - ₹45/kg\n• Sugar - ₹42/kg\n• Cooking Oil - ₹180/litre',
    approvalPending: '⏳ Your request has been sent for admin approval. You will receive a response shortly.',
    approvalApproved: '✅ Your request has been approved!',
    approvalRejected: '❌ Sorry, your request could not be approved. Please contact support.',
    defaultResponse: 'I can help you with:\n1️⃣ Place an order\n2️⃣ Check prices\n3️⃣ View stock\n4️⃣ Generate invoice\n\nWhat would you like to do?',
    voiceReceived: '🎤 I received your voice message. Our team will review it shortly.',
    paymentInfo: 'You can pay via:\n📱 UPI: bharatbiz@upi\n🏦 Bank: Bharat Business\nIFSC: HDFC0001234\n💵 Cash on delivery'
  },
  hi: {
    greeting: 'नमस्ते! 🙏 भारत बिज़-एजेंट में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?\n\n1️⃣ ऑर्डर दें\n2️⃣ कीमत जाँचें\n3️⃣ स्टॉक देखें\n4️⃣ इनवॉइस बनाएं',
    orderPrompt: 'आप क्या ऑर्डर करना चाहेंगे?\n\n• चावल (बासमती) - ₹120/किलो\n• गेहूं का आटा - ₹45/किलो\n• चीनी - ₹42/किलो\n• खाना पकाने का तेल - ₹180/लीटर',
    approvalPending: '⏳ आपकी रिक्वेस्ट एडमिन के अप्रूवल के लिए भेज दी गई है। जल्द ही जवाब मिलेगा।',
    approvalApproved: '✅ आपकी रिक्वेस्ट अप्रूव हो गई है!',
    approvalRejected: '❌ माफ़ कीजिए, आपकी रिक्वेस्ट अप्रूव नहीं हो सकी। कृपया सपोर्ट से संपर्क करें।',
    defaultResponse: 'मैं आपकी मदद कर सकता हूँ:\n1️⃣ ऑर्डर दें\n2️⃣ कीमत जाँचें\n3️⃣ स्टॉक देखें\n4️⃣ इनवॉइस बनाएं\n\nआप क्या करना चाहेंगे?',
    voiceReceived: '🎤 मैंने आपका वॉयस मैसेज प्राप्त कर लिया है। हमारी टीम जल्द ही इसे देखेगी।',
    paymentInfo: 'आप इस प्रकार भुगतान कर सकते हैं:\n📱 यूपीआई: bharatbiz@upi\n🏦 बैंक: भारत बिजनेस\nआईएफएससी: HDFC0001234\n💵 कैश ऑन डिलीवरी'
  },
  hinglish: {
    greeting: 'Namaste! 🙏 Main aapka Bharat Biz-Agent hoon. Kya help kar sakta hoon?\n\n1️⃣ Order karo\n2️⃣ Price check karo\n3️⃣ Stock dekho\n4️⃣ Invoice banao',
    orderPrompt: 'Kya order karna hai?\n\n• Rice (Basmati) - ₹120/kg\n• Wheat Flour - ₹45/kg\n• Sugar - ₹42/kg\n• Cooking Oil - ₹180/litre',
    approvalPending: '⏳ Aapki request admin ke approval ke liye bhej di gayi hai. Jald hi jawab milega.',
    approvalApproved: '✅ Aapki request approve ho gayi hai!',
    approvalRejected: '❌ Maaf kijiye, aapki request approve nahi ho saki. Please support se contact karein.',
    defaultResponse: 'Main help kar sakta hoon:\n1️⃣ Order karo\n2️⃣ Price check karo\n3️⃣ Stock dekho\n4️⃣ Invoice banao\n\nKya karna hai?',
    voiceReceived: '🎤 Aapka voice message mil gaya hai. Hamari team jald hi dekhegi.',
    paymentInfo: 'Aap payment kar sakte hain:\n📱 UPI: bharatbiz@upi\n🏦 Bank: Bharat Business\nIFSC: HDFC0001234\n💵 Cash on delivery'
  }
};

// ==================== PRODUCT DATABASE ====================

const products = {
  'rice': { name: 'Rice (Basmati)', nameHi: 'चावल (बासमती)', price: 120, unit: 'kg', unitHi: 'किलो' },
  'chawal': { name: 'Rice (Basmati)', nameHi: 'चावल (बासमती)', price: 120, unit: 'kg', unitHi: 'किलो' },
  'wheat': { name: 'Wheat Flour', nameHi: 'गेहूं का आटा', price: 45, unit: 'kg', unitHi: 'किलो' },
  'flour': { name: 'Wheat Flour', nameHi: 'गेहूं का आटा', price: 45, unit: 'kg', unitHi: 'किलो' },
  'atta': { name: 'Wheat Flour', nameHi: 'गेहूं का आटा', price: 45, unit: 'kg', unitHi: 'किलो' },
  'sugar': { name: 'Sugar', nameHi: 'चीनी', price: 42, unit: 'kg', unitHi: 'किलो' },
  'cheeni': { name: 'Sugar', nameHi: 'चीनी', price: 42, unit: 'kg', unitHi: 'किलो' },
  'oil': { name: 'Cooking Oil', nameHi: 'खाना पकाने का तेल', price: 180, unit: 'litre', unitHi: 'लीटर' },
  'tel': { name: 'Cooking Oil', nameHi: 'खाना पकाने का तेल', price: 180, unit: 'litre', unitHi: 'लीटर' }
};

// ==================== WHATSAPP BOT HANDLERS ====================

// WhatsApp Webhook Verification
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    logSecurityEvent('WhatsApp Webhook Verified', 'system', req.ip, 'info', 'Webhook verification successful');
    res.status(200).send(challenge);
  } else {
    logSecurityEvent('WhatsApp Webhook Verification Failed', 'system', req.ip, 'warning', 'Invalid verification token');
    res.sendStatus(403);
  }
});

// WhatsApp Incoming Messages
app.post('/webhooks/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    
    // Log incoming webhook
    logSecurityEvent('WhatsApp Webhook Received', 'system', req.ip, 'info', `Entries: ${body.entry?.length || 0}`);
    
    if (body.entry) {
      for (const entry of body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value.messages) {
              for (const message of change.value.messages) {
                await handleWhatsAppMessage(message, req.ip);
              }
            }
          }
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    logSecurityEvent('WhatsApp Webhook Error', 'system', req.ip, 'critical', error.message);
    res.sendStatus(500);
  }
});

async function handleWhatsAppMessage(message, clientIp) {
  const from = message.from;
  const messageId = message.id;
  const timestamp = new Date(message.timestamp * 1000);
  
  console.log(`📱 WhatsApp message from ${from}`);
  
  let content = '';
  let mediaUrl = null;
  let messageType = 'text';
  
  // Handle different message types
  if (message.type === 'text') {
    content = message.text.body;
  } else if (message.type === 'audio' || message.type === 'voice') {
    content = '[Voice Message]';
    messageType = 'voice';
    mediaUrl = message.audio?.link || message.voice?.link;
  } else if (message.type === 'image') {
    content = '[Image]';
    messageType = 'image';
    mediaUrl = message.image?.link;
  } else if (message.type === 'document') {
    content = `[Document: ${message.document?.filename}]`;
    messageType = 'document';
    mediaUrl = message.document?.link;
  } else if (message.type === 'location') {
    content = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
    messageType = 'location';
  }
  
  // Detect language
  const language = detectLanguage(content);
  
  // Store conversation
  if (!botConversations.has(from)) {
    botConversations.set(from, {
      customerPhone: from,
      platform: 'whatsapp',
      messages: [],
      context: {},
      language: language
    });
  }
  
  const conversation = botConversations.get(from);
  conversation.messages.push({
    id: messageId,
    type: 'customer',
    content: encrypt(content),
    timestamp,
    mediaUrl: mediaUrl ? encrypt(mediaUrl) : null,
    messageType,
    language
  });
  
  // Process with AI/Bot logic
  const response = await processBotResponse(content, conversation, 'whatsapp', language);
  
  // Check if approval needed
  if (response.requiresApproval) {
    const approvalId = `app-${Date.now()}`;
    const bot = botInstances.get('bot-1');
    
    pendingApprovals.set(approvalId, {
      id: approvalId,
      botId: 'bot-1',
      botName: bot?.name || 'Sales Bot',
      customerPhone: from,
      action: response.action,
      details: response.details,
      requestedAt: new Date(),
      priority: response.priority || 'medium',
      status: 'pending',
      platform: 'whatsapp'
    });
    
    // Update bot pending count
    if (bot) {
      bot.pendingApprovals = (bot.pendingApprovals || 0) + 1;
    }
    
    logSecurityEvent('Approval Request Created', 'bot-1', clientIp, 'info', `${response.action} for ${from}`);
    
    // Send waiting message to customer
    await sendWhatsAppMessage(from, {
      text: { body: translations[language].approvalPending }
    });
  } else {
    // Send immediate response
    await sendWhatsAppMessage(from, response.message);
  }
}

async function sendWhatsAppMessage(to, message) {
  if (!process.env.WHATSAPP_API_KEY || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log('⚠️ WhatsApp not configured, simulating message:', message);
    return { success: true, simulated: true };
  }
  
  const apiUrl = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        ...message
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Unknown error');
    }
    
    console.log('✅ WhatsApp message sent:', data.messages?.[0]?.id);
    return data;
  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:', error.message);
    logSecurityEvent('WhatsApp Send Failed', 'system', 'internal', 'warning', error.message);
    return { error: error.message };
  }
}

// ==================== TELEGRAM BOT HANDLERS ====================

// Telegram Webhook  (webhook need HTTPS + setWebhook. and polling and webhoook cannot coexist..   will be used for production)

// app.post('/webhooks/telegram', async (req, res) => {
//   try {
//     const update = req.body;
    
//     logSecurityEvent('Telegram Webhook Received', 'system', req.ip, 'info', `Update ID: ${update.update_id}`);
    
//     if (update.message) {
//       await handleTelegramMessage(update.message, req.ip);
//     } else if (update.callback_query) {
//       await handleTelegramCallback(update.callback_query, req.ip);
//     }
    
//     res.sendStatus(200);
//   } catch (error) {
//     console.error('❌ Telegram webhook error:', error);
//     logSecurityEvent('Telegram Webhook Error', 'system', req.ip, 'critical', error.message);
//     res.sendStatus(500);
//   }
// });

async function handleTelegramMessage(message, clientIp) {
  const chatId = message.chat.id;
  const from = message.from;
  const messageId = message.message_id;

  console.log(`📱 Telegram message from ${from.username || from.first_name}`);

  // Generate unique customer ID for cross-platform synchronization
  const customerId = `telegram-${chatId.toString()}`;
  
  let content = '';
  let mediaUrl = null;
  let messageType = 'text';

  if (message.text) {
    content = message.text;
  } else if (message.voice) {
    // Handle voice message
    try {
      const voiceFile = await telegramBot.getFileLink(message.voice.file_id);
      const response = await fetch(voiceFile);
      const buffer = await response.buffer();
      
      // Save temporarily for speech-to-text
      const tempPath = `uploads/voice_${Date.now()}.ogg`;
      require('fs').writeFileSync(tempPath, buffer);
      
      // Transcribe voice message
      const transcription = await speechService.transcribeAudio(tempPath, 'en-IN');
      content = transcription;
      messageType = 'voice';
      
      // Clean up temp file
      require('fs').unlinkSync(tempPath);
      
    } catch (error) {
      console.error('Voice processing error:', error);
      content = '[Voice Message - Could not transcribe]';
      messageType = 'voice';
    }
  } else if (message.audio) {
    content = '[Audio]';
    messageType = 'audio';
    mediaUrl = message.audio.file_id;
  } else if (message.photo) {
    content = '[Photo]';
    messageType = 'image';
    mediaUrl = message.photo[message.photo.length - 1].file_id;
  } else if (message.document) {
    content = `[Document: ${message.document.file_name}]`;
    messageType = 'document';
    mediaUrl = message.document.file_id;
  }

  // Check if content is empty
  if (!content || content.trim() === '') {
    console.log('⚠️ Empty message received, ignoring...');
    return;
  }

  const language = detectLanguage(content);

  try {
    // Get or create customer with unique ID
    const customer = {
      phone: customerId, // Use unique ID instead of just chatId
      name: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
      platform: 'telegram',
      language
    };
    await CustomerOperations.upsert(customer);

    // Get or create conversation using unique customer ID
    let conversation = await ConversationOperations.getByCustomerId(customerId);
    if (!conversation || conversation.length === 0) {
      await ConversationOperations.upsert({
        customerId: customerId, // Use unique ID
        botId: 'telegram-bot-001',
        customerName: customer.name,
        customerPhone: customer.phone,
        messages: []
      });
      conversation = await ConversationOperations.getByCustomerId(customerId);
    }

    // Add customer message to conversation
    await ConversationOperations.addMessage(customerId, 'telegram-bot-001', {
      sender: 'customer',
      text: content,
      content: content, // For backward compatibility
      timestamp: new Date().toISOString(),
      type: messageType,
      translated: language !== 'en'
    });

    // Get conversation history for AI context
    const conversationData = conversation[0] || { messages: [] };
    const customerContext = {
      name: customer.name,
      phone: customer.phone,
      platform: 'telegram',
      language
    };

    // Process with AI using same function as web commands
    const aiResponse = await processDirectCommand(content, 'telegram', customerId);
    
    // Add bot response to conversation
    await ConversationOperations.addMessage(customerId, 'telegram-bot-001', {
      sender: 'bot',
      text: aiResponse.response || aiResponse.text,
      content: aiResponse.response || aiResponse.text, // For backward compatibility
      timestamp: new Date().toISOString(),
      type: 'text',
      translated: false
    });

    // Update bot metrics
    await BotOperations.incrementMetrics('telegram-bot-001', {
      totalMessages: 2, // Customer + bot message
      connectedCustomers: 1
    });

    // Handle approval requirements
    if (aiResponse.approvalNeeded) {
      const approval = await ApprovalOperations.create({
        botId: 'telegram-bot-001',
        botName: 'Telegram Assistant',
        customerName: customer.name,
        customerPhone: customer.phone,
        action: 'customer_request',
        details: {
          message: content,
          aiResponse: aiResponse.response,
          suggestedActions: aiResponse.suggestedActions
        },
        priority: 'medium'
      });

      // Broadcast to admin dashboard
      broadcastToAdmins('new_approval', approval);

      // Log the action
      await AuditOperations.log('approval_requested', {
        approvalId: approval.id,
        customerPhone: customer.phone,
        message: content
      });

      await telegramBot.sendMessage(chatId, "⏳ Your request requires admin approval. We'll get back to you shortly.");
    } else {
      // Send AI response directly
      await telegramBot.sendMessage(chatId, aiResponse.response || aiResponse.text);
    }

    // Broadcast new message to admin dashboard
    const updatedConversation = await ConversationOperations.getByCustomerId(customerId);
    if (updatedConversation && updatedConversation.length > 0) {
      broadcastToAdmins('new_message', updatedConversation[0]);
    }

  } catch (error) {
    console.error('Error handling Telegram message:', error);
    await telegramBot.sendMessage(chatId, "Sorry, I'm having trouble processing your message right now. Please try again later.");
  }
}


async function handleTelegramCallback(callbackQuery, clientIp) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  logSecurityEvent('Telegram Callback Received', 'system', clientIp, 'info', `Data: ${data}`);
  
  // Handle button clicks
  if (data.startsWith('order:')) {
    const product = data.split(':')[1];
    await sendTelegramMessage(chatId, `Aapne ${product} select kiya hai. Kitni quantity chahiye?`);
  } else if (data.startsWith('price:')) {
    const productKey = data.split(':')[1];
    const product = products[productKey];
    if (product) {
      await sendTelegramMessage(chatId, `${product.name} ka rate ₹${product.price} per ${product.unit} hai.`);
    }
  }
  
  // Answer callback query
  await answerTelegramCallback(callbackQuery.id);
}

async function sendTelegramMessage(chatId, text, options = {}) {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_telegram_bot_token_here') {
    console.log('⚠️ Telegram not configured, simulating message:', text);
    return { success: true, simulated: true };
  }
  
  const apiUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: options?.parse_mode ?? undefined,
        reply_markup: options.reply_markup,
        ...options
      })
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.description || 'Unknown error');
    }
    
    console.log('✅ Telegram message sent:', data.result.message_id);
    return data;
  } catch (error) {
    console.error('❌ Failed to send Telegram message:', error.message);
    logSecurityEvent('Telegram Send Failed', 'system', 'internal', 'warning', error.message);
    return { error: error.message };
  }
}

async function answerTelegramCallback(callbackQueryId) {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_telegram_bot_token_here') return;
  
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
  } catch (error) {
    console.error('Failed to answer callback:', error);
  }
}

// ==================== BOT RESPONSE PROCESSING ====================

async function processBotResponse(input, conversation, platform, language = 'en') {
  const lowerInput = input.toLowerCase();
  const context = conversation.context || {};
  const t = translations[language];
  
  // Greeting
  if (lowerInput.match(/^(hi|hello|namaste|namaskar|hey|start|\/start)/)) {
    return {
      message: { text: { body: t.greeting } }
    };
  }
  
  // Order/Inquiry intent
  if (lowerInput.match(/(order|buy|purchase|chahiye|lena|book| mangna)/)) {
    return handleOrderIntent(input, language, context);
  }
  
  // Price inquiry
  if (lowerInput.match(/(price|rate|kimat|daam|kitne|kitna)/)) {
    return handlePriceInquiry(input, language);
  }
  
  // Invoice request
  if (lowerInput.match(/(invoice|bill|receipt|chalan|chalan)/)) {
    const amount = extractAmount(input) || 0;
    return {
      requiresApproval: amount > 5000,
      action: 'generate_invoice',
      priority: amount > 10000 ? 'high' : 'medium',
      details: { amount },
      message: { text: { body: language === 'hi' ? 'इनवॉइस बनाने के लिए एडमिन अप्रूवल चाहिए।' : 'Invoice generate karne ke liye admin approval chahiye.' } }
    };
  }
  
  // Inventory inquiry
  if (lowerInput.match(/(stock|inventory|available|hai|bacha|kitna bacha)/)) {
    return handleInventoryInquiry(language);
  }
  
  // Payment
  if (lowerInput.match(/(payment|pay|bhugtan|paisa|kaise pay)/)) {
    return {
      message: { text: { body: t.paymentInfo } }
    };
  }
  
  // Voice message acknowledgment
  if (input === '[Voice Message]' || input === '[Voice message recorded]') {
    return {
      message: { text: { body: t.voiceReceived } }
    };
  }
  
  // Help
  if (lowerInput.match(/(help|madad|sahayta|kaise)/)) {
    return {
      message: { text: { body: t.defaultResponse } }
    };
  }
  
  // Default response
  return {
    message: { text: { body: t.defaultResponse } }
  };
}

function handleOrderIntent(input, language, context) {
  const t = translations[language];
  
  // Extract products from input
  const orderedItems = [];
  let total = 0;
  
  for (const [key, product] of Object.entries(products)) {
    const regex = new RegExp(`(\\d+)?\\s*${key}`, 'i');
    const match = input.match(regex);
    
    if (match || input.toLowerCase().includes(key)) {
      const quantity = match && match[1] ? parseInt(match[1]) : 1;
      const itemTotal = product.price * quantity;
      total += itemTotal;
      
      orderedItems.push({
        name: language === 'hi' ? product.nameHi : product.name,
        quantity,
        unit: language === 'hi' ? product.unitHi : product.unit,
        price: product.price,
        total: itemTotal
      });
    }
  }
  
  if (orderedItems.length === 0) {
    return {
      message: { text: { body: t.orderPrompt } }
    };
  }
  
  // Calculate totals
  const gst = Math.round(total * 0.18);
  const grandTotal = total + gst;
  
  // Format order summary
  const itemList = orderedItems.map(i => 
    language === 'hi' 
      ? `• ${i.name}: ${i.quantity} ${i.unit} x ₹${i.price} = ₹${i.total}`
      : `• ${i.name}: ${i.quantity} ${i.unit} x ₹${i.price} = ₹${i.total}`
  ).join('\n');
  
  const summary = language === 'hi'
    ? `आपका ऑर्डर:\n\n${itemList}\n\nउप-योग: ₹${total}\nजीएसटी (18%): ₹${gst}\n*कुल: ₹${grandTotal}*\n\nक्या कन्फर्म करना है?`
    : `Aapka order:\n\n${itemList}\n\nSubtotal: ₹${total}\nGST (18%): ₹${gst}\n*Total: ₹${grandTotal}*\n\nConfirm karna hai?`;
  
  return {
    requiresApproval: grandTotal > 5000,
    action: 'generate_invoice',
    priority: grandTotal > 10000 ? 'high' : 'medium',
    details: { 
      amount: grandTotal, 
      items: orderedItems.map(i => `${i.name} ${i.quantity}${i.unit}`),
      subtotal: total,
      gst: gst
    },
    message: { text: { body: summary } }
  };
}

function handlePriceInquiry(input, language) {
  const results = [];
  
  for (const [key, product] of Object.entries(products)) {
    if (input.toLowerCase().includes(key)) {
      results.push(language === 'hi'
        ? `• ${product.nameHi}: ₹${product.price}/${product.unitHi}`
        : `• ${product.name}: ₹${product.price}/${product.unit}`
      );
    }
  }
  
  if (results.length === 0) {
    // Return all prices
    return {
      message: { 
        text: { 
          body: language === 'hi' 
            ? 'सभी उत्पादों की कीमतें:\n• चावल (बासमती): ₹120/किलो\n• गेहूं का आटा: ₹45/किलो\n• चीनी: ₹42/किलो\n• खाना पकाने का तेल: ₹180/लीटर'
            : 'Sabhi products ke rates:\n• Rice (Basmati): ₹120/kg\n• Wheat Flour: ₹45/kg\n• Sugar: ₹42/kg\n• Cooking Oil: ₹180/litre'
        } 
      }
    };
  }
  
  return {
    message: { text: { body: results.join('\n') } }
  };
}

function handleInventoryInquiry(language) {
  const inventory = [
    { name: 'Rice (Basmati)', nameHi: 'चावल (बासमती)', quantity: 150, unit: 'kg', unitHi: 'किलो', low: false },
    { name: 'Wheat Flour', nameHi: 'गेहूं का आटा', quantity: 25, unit: 'kg', unitHi: 'किलो', low: true },
    { name: 'Sugar', nameHi: 'चीनी', quantity: 80, unit: 'kg', unitHi: 'किलो', low: false },
    { name: 'Cooking Oil', nameHi: 'खाना पकाने का तेल', quantity: 12, unit: 'litre', unitHi: 'लीटर', low: true },
  ];
  
  const stockList = inventory.map(i => {
    const name = language === 'hi' ? i.nameHi : i.name;
    const unit = language === 'hi' ? i.unitHi : i.unit;
    const status = i.low ? (language === 'hi' ? ' ⚠️ कम' : ' ⚠️ Low') : ' ✓';
    return `• ${name}: ${i.quantity} ${unit}${status}`;
  }).join('\n');
  
  const message = language === 'hi'
    ? `स्टॉक स्थिति:\n\n${stockList}\n\n⚠️ = कम स्टॉक, जल्दी ऑर्डर करें`
    : `Stock status:\n\n${stockList}\n\n⚠️ = Low stock, order soon`;
  
  return {
    message: { text: { body: message } }
  };
}

function extractAmount(input) {
  const match = input.match(/(\d{3,})/);
  return match ? parseInt(match[1]) : null;
}

// ==================== ADMIN API ENDPOINTS ====================

// Authentication middleware for admin APIs
function authenticateAdmin(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    logSecurityEvent('Unauthorized API Access', 'unknown', req.ip, 'warning', 'Invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// ==================== TEST-ONLY SEED ENDPOINT ====================

if (process.env.NODE_ENV === 'test') {
  app.post('/api/approvals/seed', (req, res) => {
    const approval = {
      ...req.body,
      status: 'pending',
      requestedAt: new Date(),
    };

    pendingApprovals.set(approval.id, approval);
    res.status(200).json({ success: true, approval });
  });
}


// Get pending approvals
app.get('/api/approvals', (req, res) => {
  const approvals = Array.from(pendingApprovals.values());
  res.json(approvals);
});

// Approve/reject request
app.post('/api/approvals/:id', async (req, res) => {
  const { id } = req.params;
  const { approved, adminId = 'admin@bharatbiz.com' } = req.body;
  
  const approval = pendingApprovals.get(id);
  if (!approval) {
    return res.status(404).json({ error: 'Approval not found' });
  }
  
  approval.status = approved ? 'approved' : 'rejected';
  approval.locked = false;
  approval.resolvedAt = new Date();
  approval.resolvedBy = adminId;
  
  // Update bot pending count
  const bot = botInstances.get(approval.botId);
  if (bot && bot.pendingApprovals > 0) {
    bot.pendingApprovals--;
  }
  
  // Log the action
  logSecurityEvent(
    `Approval ${approved ? 'Approved' : 'Rejected'}`,
    adminId,
    req.ip,
    'info',
    `${approval.action} for ${approval.customerPhone}`
  );
  
  // Notify customer
  const language = approval.language || 'en';
  const message = approved 
    ? translations[language].approvalApproved
    : translations[language].approvalRejected;
  
  if (approval.platform === 'whatsapp') {
    await sendWhatsAppMessage(
      approval.customerPhone,
      { text: { body: message } }
    );
  } else if (approval.platform === 'telegram') {
    await sendTelegramMessage(
      approval.chatId,
      message
    );
  }

  
  res.json({ success: true, approval });
});

// Get conversations
app.get('/api/conversations', (req, res) => {
  const conversations = Array.from(botConversations.entries()).map(([id, conv]) => ({
    id,
    customerPhone: conv.customerPhone,
    customerName: conv.customerName,
    platform: conv.platform,
    messageCount: conv.messages.length,
    lastActivity: conv.messages[conv.messages.length - 1]?.timestamp,
    language: conv.language
  }));
  
  res.json(conversations);
});

// Get specific conversation messages
app.get('/api/conversations/:id/messages', (req, res) => {
  const { id } = req.params;
  const conversation = botConversations.get(id);
  
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  
  const messages = conversation.messages.map(m => ({
    ...m,
    content: decrypt(m.content)
  }));
  
  res.json(messages);
});

// Get bot stats
app.get('/api/stats', (req, res) => {
  const stats = {
    totalBots: botInstances.size,
    activeBots: Array.from(botInstances.values()).filter(b => b.status === 'active').length,
    pendingApprovals: Array.from(pendingApprovals.values()).filter(a => a.status === 'pending').length,
    totalConversations: botConversations.size,
    totalMessages: Array.from(botConversations.values()).reduce((sum, c) => sum + c.messages.length, 0),
    securityEvents24h: securityLogs.filter(l => 
      new Date(l.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length
  };
  
  res.json(stats);
});

// Get security logs
app.get('/api/security/logs', (req, res) => {
  res.json(securityLogs.slice(0, 100));
});

// Bot management
app.get('/api/bots', (req, res) => {
  const bots = Array.from(botInstances.values());
  res.json(bots);
});

app.post('/api/bots/:id/toggle', (req, res) => {
  const { id } = req.params;
  const bot = botInstances.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  
  bot.status = bot.status === 'active' ? 'paused' : 'active';
  
  logSecurityEvent(
    `Bot ${bot.status === 'active' ? 'Activated' : 'Paused'}`,
    req.body.adminId || 'admin',
    req.ip,
    'info',
    `Bot ${bot.name} is now ${bot.status}`
  );
  
  res.json({ success: true, bot });
});

// Process direct commands
async function processDirectCommand(command, platform, userId) {
  try {
    // Check if it's a system command
    if (command.startsWith('/')) {
      return await handleSystemCommand(command, platform, userId);
    }
    
    // Process with AI
    const aiResponse = await geminiService.processCustomerMessage(command, {
      platform: platform,
      userId: userId,
      type: 'direct_command'
    });
    
    return aiResponse;
  } catch (error) {
    console.error('Direct command processing error:', error);
    return {
      text: "I'm sorry, I'm having trouble processing your command right now. Please try again later.",
      requiresApproval: false
    };
  }
}

// Handle system commands
async function handleSystemCommand(command, platform, userId) {
  const cmd = command.toLowerCase().trim();
  
  switch (cmd) {
    case '/help':
      return {
        text: `🤖 *Bharat Biz-Agent Commands*

📋 *Business Commands:*
• /price [product] - Check product price
• /stock [product] - Check inventory
• /order [product] [quantity] - Place order
• /status - Check order status

🔧 *System Commands:*
• /help - Show this help
• /ping - Check bot status
• /language - Change language
• /voice - Enable voice mode

💬 *AI Commands:*
Just type your question in English, Hindi, Hinglish, or any Indian language!

📞 *Need Help?*
Contact admin for assistance.`,
        requiresApproval: false
      };
      
    case '/ping':
      return {
        text: '🏓 Pong! Bot is working perfectly! 🚀',
        requiresApproval: false
      };
      
    case '/language':
      return {
        text: '🌐 *Language Options*\n\n• English (Default)\n• हिन्दी (Hindi)\n• हिंग्लिश (Hinglish)\n• ಕನ್ನಡ (Kannada)\n• தமிழ் (Tamil)\n• తెలుగు (Telugu)\n\nType in any language - I understand! 🤗',
        requiresApproval: false
      };
      
    case '/voice':
      return {
        text: '🎤 *Voice Mode Enabled*\n\nSend me a voice message and I\'ll transcribe it for you!\n\nSupported languages: English, Hindi, Kannada, Tamil, Telugu, Bengali, Marathi, Gujarati, Punjabi, Malayalam',
        requiresApproval: false
      };
      
    default:
      return {
        text: `❓ Unknown command: ${command}\n\nType /help to see available commands.`,
        requiresApproval: false
      };
  }
}

// Speech-to-text endpoint
app.post('/api/speech-to-text', speechLimiter, speechService.upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { language } = req.body;
    
    // Validate file
    if (req.file.size > 10 * 1024 * 1024) { // 10MB limit
      return res.status(400).json({ error: 'Audio file too large. Maximum size is 10MB' });
    }
    
    // Validate language
    const allowedLanguages = ['en-IN', 'hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'ml-IN'];
    if (language && !allowedLanguages.includes(language)) {
      return res.status(400).json({ 
        error: 'Unsupported language',
        allowedLanguages: allowedLanguages
      });
    }
    
    const transcription = await speechService.transcribeAudio(req.file.path, language || 'en-IN');
    
    // Check for PII in transcription
    if (privacyControls.containsPII(transcription)) {
      await AuditOperations.log({
        action: 'pii_in_speech',
        details: { 
          transcription: privacyControls.maskSensitiveData({ text: transcription }),
          language: language || 'en-IN',
          fileSize: req.file.size
        },
        userId: req.body.userId || 'anonymous',
        ipAddress: req.ip,
        severity: 'warning'
      });
      
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        error: 'Personal information detected in audio',
        message: 'Please remove personal information from audio and try again'
      });
    }
    
    // Log speech processing (anonymized)
    await AuditOperations.log({
      action: 'speech_to_text',
      details: privacyControls.anonymizeForAnalytics({
        language: language || 'en-IN',
        fileSize: req.file.size,
        duration: 'unknown', // Could be extracted from audio metadata
        timestamp: new Date().toISOString()
      }),
      userId: req.body.userId || 'anonymous',
      ipAddress: req.ip,
      severity: 'info'
    });
    
    res.json({
      success: true,
      transcription: transcription,
      language: language || 'en-IN'
    });
  } catch (error) {
    console.error('Speech-to-text error:', error);
    
    // Clean up the uploaded file even on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to transcribe audio',
      message: error.message 
    });
  }
});

// Direct command services endpoint
app.post('/api/direct-command', commandLimiter, async (req, res) => {
  try {
    const { command, platform = 'web', userId } = req.body;
    
    // Validate input
    const validation = validateInput(
      { command, platform, userId }, 
      validationSchemas.botCommand
    );
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: validation.errors 
      });
    }
    
    // Sanitize command
    const sanitizedCommand = validation.sanitizedData.command;
    
    // Check for PII in command
    if (privacyControls.containsPII(sanitizedCommand)) {
      await AuditOperations.log('pii_detected', { 
        command: sanitizedCommand, 
        platform, 
        userId,
        ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress
      }, userId || 'anonymous');
      
      return res.status(400).json({
        error: 'Personal information detected in command',
        message: 'Please remove personal information and try again'
      });
    }
    
    // Process direct command
    const response = await processDirectCommand(sanitizedCommand, platform, userId);
    
    // Log command for analytics (anonymized)
    await AuditOperations.log('direct_command', privacyControls.anonymizeForAnalytics({
        command: sanitizedCommand,
        platform,
        response: response,
        timestamp: new Date().toISOString()
      }), userId || 'anonymous');
    
    res.json({
      success: true,
      command: sanitizedCommand,
      response: response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Direct command error:', error);
    res.status(500).json({ 
      error: 'Failed to process command',
      message: error.message 
    });
  }
});

// Get supported languages
app.get('/api/speech-languages', (req, res) => {
  try {
    const languages = speechService.getSupportedLanguages();
    res.json({
      success: true,
      languages: languages
    });
  } catch (error) {
    console.error('Error getting supported languages:', error);
    res.status(500).json({ success: false, error: 'Failed to get supported languages' });
  }
});

// Inventory Management API
app.get('/api/inventory', authenticateApiKey, async (req, res) => {
  try {
    const inventory = await InventoryOperations.getAll();
    res.json({ success: true, data: inventory });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
  }
});

app.post('/api/inventory', authenticateApiKey, async (req, res) => {
  try {
    const { name, sku, quantity, unit, price, lowStockThreshold } = req.body;
    
    if (!name || !sku || !quantity || !unit || !price) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const newItem = await InventoryOperations.create({
      name,
      sku: sku.toUpperCase(),
      quantity: parseInt(quantity),
      unit,
      price: parseFloat(price),
      lowStockThreshold: parseInt(lowStockThreshold) || Math.floor(parseInt(quantity) * 0.2),
      inquiries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Broadcast inventory update
    broadcastToAdmins('inventory_updated', { action: 'added', item: newItem });
    
    res.json({ success: true, data: newItem });
  } catch (error) {
    console.error('Error adding inventory item:', error);
    res.status(500).json({ success: false, error: 'Failed to add inventory item' });
  }
});

app.put('/api/inventory/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, quantity, unit, price, lowStockThreshold } = req.body;
    
    const updateData = {
      ...(name && { name }),
      ...(quantity && { quantity: parseInt(quantity) }),
      ...(unit && { unit }),
      ...(price && { price: parseFloat(price) }),
      ...(lowStockThreshold && { lowStockThreshold: parseInt(lowStockThreshold) }),
      updatedAt: new Date().toISOString()
    };

    const updatedItem = await InventoryOperations.update(id, updateData);
    
    if (!updatedItem) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }

    // Check for low stock warning
    if (updatedItem.quantity < updatedItem.lowStockThreshold) {
      broadcastToAdmins('low_stock_warning', { item: updatedItem });
    }

    // Broadcast inventory update
    broadcastToAdmins('inventory_updated', { action: 'updated', item: updatedItem });
    
    res.json({ success: true, data: updatedItem });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ success: false, error: 'Failed to update inventory item' });
  }
});

// Low Stock Warning API
app.get('/api/inventory/low-stock', authenticateApiKey, async (req, res) => {
  try {
    const lowStockItems = await InventoryOperations.getLowStock();
    res.json({ success: true, data: lowStockItems });
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch low stock items' });
  }
});

// Check and broadcast low stock warnings
app.post('/api/inventory/check-low-stock', authenticateApiKey, async (req, res) => {
  try {
    const lowStockItems = await InventoryOperations.getLowStock();
    
    if (lowStockItems.length > 0) {
      // Broadcast low stock warnings
      broadcastToAdmins('low_stock_warning', { 
        items: lowStockItems,
        message: `⚠️ Low Stock Alert: ${lowStockItems.length} items need restocking`,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ 
      success: true, 
      data: { 
        lowStockCount: lowStockItems.length,
        items: lowStockItems
      }
    });
  } catch (error) {
    console.error('Error checking low stock:', error);
    res.status(500).json({ success: false, error: 'Failed to check low stock' });
  }
});

// Test AI Service endpoint
app.post('/api/test-ai', authenticateApiKey, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Test AI service with inventory sync
    const aiResponse = await geminiService.processCustomerMessage(message, {
      platform: 'test',
      userId: 'test-user',
      type: 'test'
    });

    res.json({ 
      success: true, 
      data: {
        message: message,
        response: aiResponse.response || aiResponse.text,
        approvalNeeded: aiResponse.approvalNeeded,
        confidence: aiResponse.confidence
      }
    });
  } catch (error) {
    console.error('AI test error:', error);
    res.status(500).json({ success: false, error: 'Failed to process AI request' });
  }
});

app.delete('/api/inventory/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await InventoryOperations.delete(id);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }

    // Broadcast inventory update
    broadcastToAdmins('inventory_updated', { action: 'deleted', id });
    
    res.json({ success: true, message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ success: false, error: 'Failed to delete inventory item' });
  }
});

// Orders API
app.get('/api/orders', authenticateApiKey, async (req, res) => {
  try {
    const { customerId, status } = req.query;
    const orders = await OrderOperations.getAll({ customerId, status });
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

app.post('/api/orders', authenticateApiKey, async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, items, platform } = req.body;
    
    if (!customerId || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const newOrder = await OrderOperations.create({
      orderId: `ORD-${Date.now()}`,
      customerId,
      customerName,
      customerPhone,
      platform: platform || 'web',
      items,
      totalAmount,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Broadcast new order
    broadcastToAdmins('new_order', newOrder);
    
    res.json({ success: true, data: newOrder });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

// Order tracking endpoints
app.get('/api/orders/:orderId', authenticateApiKey, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await OrderOperations.getById(orderId);
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

app.put('/api/orders/:orderId/status', authenticateApiKey, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, updatedBy = 'admin' } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }
    
    const updatedOrder = await OrderOperations.updateStatus(orderId, status, updatedBy);
    
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Broadcast order status update
    broadcastToAdmins('order_status_updated', { orderId, status, updatedBy });
    
    res.json({ success: true, data: updatedOrder });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
});

app.get('/api/orders/customer/:customerId', authenticateApiKey, async (req, res) => {
  try {
    const { customerId } = req.params;
    const orders = await OrderOperations.getByCustomerId(customerId);
    
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customer orders' });
  }
});

app.get('/api/orders/tracking/:trackingId', authenticateApiKey, async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    // Find order by tracking ID or order ID
    let order = await OrderOperations.getById(trackingId);
    
    if (!order) {
      // Try to find by orderId field
      const allOrders = await OrderOperations.getAll();
      order = allOrders.find(o => o.orderId === trackingId || o.id === trackingId);
    }
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Add tracking information
    const trackingInfo = {
      ...order,
      trackingHistory: [
        {
          status: 'Order Placed',
          timestamp: order.createdAt,
          location: 'Processing Center'
        },
        ...(order.status !== 'pending' ? [{
          status: order.status,
          timestamp: order.updatedAt,
          location: order.status === 'delivered' ? 'Customer Address' : 'In Transit'
        }] : [])
      ],
      estimatedDelivery: new Date(Date.parse(order.createdAt) + 24 * 60 * 60 * 1000).toISOString(),
      currentStatus: order.status
    };
    
    res.json({ success: true, data: trackingInfo });
  } catch (error) {
    console.error('Error fetching tracking info:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tracking information' });
  }
});

// Activity Overview API
app.get('/api/activity', authenticateApiKey, async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const [conversations, orders, approvals, inventory] = await Promise.all([
      ConversationOperations.getByDateRange(startDate),
      OrderOperations.getByDateRange(startDate),
      ApprovalOperations.getByDateRange(startDate),
      InventoryOperations.getAll()
    ]);

    const activity = {
      timeRange,
      summary: {
        totalConversations: conversations.length,
        totalOrders: orders.length,
        pendingApprovals: approvals.filter(a => a.status === 'pending').length,
        lowStockItems: inventory.filter(i => i.quantity < i.lowStockThreshold).length,
        totalRevenue: orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.totalAmount, 0)
      },
      recentConversations: conversations.slice(0, 10),
      recentOrders: orders.slice(0, 10),
      pendingApprovals: approvals.filter(a => a.status === 'pending').slice(0, 10),
      lowStockItems: inventory.filter(i => i.quantity < i.lowStockThreshold)
    };

    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error fetching activity data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity data' });
  }
});

// WhatsApp Bot Webhook (placeholder for future implementation)
app.post('/api/whatsapp/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // TODO: Implement WhatsApp Business API integration
    console.log('WhatsApp webhook received:', req.body);
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Error handling WhatsApp webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// ==================== DATABASE API ENDPOINTS ====================

// Get bots from database
app.get('/api/bots', async (req, res) => {
  try {
    const bots = await BotOperations.getAll();
    res.json(bots);
  } catch (error) {
    console.error('Error fetching bots:', error);
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

// Get conversations from database
app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await ConversationOperations.getAll();
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get approvals from database
app.get('/api/approvals', async (req, res) => {
  try {
    const approvals = await ApprovalOperations.getAll();
    res.json(approvals);
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// Update approval status
app.post('/api/approvals/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolvedBy } = req.body;
    
    await ApprovalOperations.updateStatus(id, status, resolvedBy);
    
    // Broadcast update to admin dashboard
    broadcastToAdmins('approval_updated', { id, status, resolvedBy });
    
    // Log the action
    await AuditOperations.log('approval_updated', { approvalId: id, status }, resolvedBy);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating approval:', error);
    res.status(500).json({ error: 'Failed to update approval' });
  }
});

// Get business stats from database
app.get('/api/stats', async (req, res) => {
  try {
    const bots = await BotOperations.getAll();
    const conversations = await ConversationOperations.getAll();
    const approvals = await ApprovalOperations.getAll();
    const pendingApprovals = approvals.filter(a => a.status === 'pending');
    
    const stats = {
      totalBots: bots.length,
      activeBots: bots.filter(b => b.status === 'active').length,
      pendingApprovals: pendingApprovals.length,
      totalCustomers: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0),
      botHandledOrders: 0, // Will be implemented with orders collection
      revenue: 0, // Will be calculated from orders
      activeBots: bots.filter(b => b.status === 'active').length
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get AI-powered business insights
app.get('/api/insights', async (req, res) => {
  try {
    const bots = await BotOperations.getAll();
    const conversations = await ConversationOperations.getAll();
    const approvals = await ApprovalOperations.getAll();
    
    const businessData = {
      totalOrders: 0, // Will be calculated from orders
      revenue: 0, // Will be calculated from orders
      activeCustomers: conversations.length,
      botPerformance: bots.reduce((acc, bot) => {
        acc[bot.botId] = {
          status: bot.status,
          connectedCustomers: bot.connectedCustomers || 0,
          totalMessages: bot.totalMessages || 0
        };
        return acc;
      }, {}),
      recentIssues: approvals.filter(a => a.status === 'pending').slice(0, 5)
    };
    
    const insights = await geminiService.generateBusinessInsights(businessData);
    res.json(insights);
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Get security logs from database
app.get('/api/security/logs', async (req, res) => {
  try {
    const logs = await AuditOperations.getRecent(100);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching security logs:', error);
    res.status(500).json({ error: 'Failed to fetch security logs' });
  }
});

// AI chat endpoint for testing
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, customerContext, conversationHistory } = req.body;
    
    const aiResponse = await geminiService.processCustomerMessage(
      message,
      customerContext || {},
      conversationHistory || []
    );
    
    res.json(aiResponse);
  } catch (error) {
    console.error('Error processing AI chat:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  logSecurityEvent('Unhandled Error', 'system', req.ip, 'critical', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ==================== TEST SEED ENDPOINT ====================

if (process.env.NODE_ENV === 'test') {
  app.post('/api/approvals/seed', (req, res) => {
    const approval = {
      ...req.body,
      status: 'pending',
      requestedAt: new Date(),
    };

    pendingApprovals.set(approval.id, approval);
    res.json({ success: true, approval });
  });
}

// ==================== START SERVER ====================

async function startServer() {
  try {
    // Connect to database first
    await connectDatabase();
    console.log('✅ Database connected successfully');
    
    // Start HTTP server with WebSocket support
    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║          Bharat Biz-Agent - Bot Server                   ║
║                                                          ║
║  🔐 Encryption:    AES-256-GCM Enabled                   ║
║  📱 WhatsApp:      ${process.env.WHATSAPP_API_KEY ? '✅ Configured  ' : '⚠️  Not Configured'}
║  ✈️  Telegram:     ${(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') ? '✅ Configured  ' : '⚠️  Not Configured'}
║  🔑 Admin API:     ${process.env.ADMIN_API_KEY ? '✅ Configured  ' : '⚠️  Not Configured'}
║  🤖 AI Service:    ${(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') ? '✅ Configured  ' : '⚠️  Not Configured'}
║  💾 Database:      ✅ Connected                           ║
║                                                          ║
║  🌐 Server:        http://localhost:${PORT}              ║
║  💚 Health:        http://localhost:${PORT}/health       ║
╚══════════════════════════════════════════════════════════╝
    
[INFO] Server Started: Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

module.exports = app;

// Start the server
startServer().catch(console.error);

