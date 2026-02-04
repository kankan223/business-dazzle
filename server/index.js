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

const app = express();
const PORT = process.env.PORT || 3001;


const TelegramBot = require('node-telegram-bot-api');

// 🔥 CREATE TELEGRAM BOT (safe for dev + test)
const telegramBot = new TelegramBot(
  process.env.TELEGRAM_BOT_TOKEN,
  {
    polling: process.env.NODE_ENV !== 'test'
  }
);



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




telegramBot.on('polling_error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('🚨 Telegram polling error:', err.message);
  }
});



if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN missing in .env");
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

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Rate limiting - stricter for webhooks
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute for webhooks
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { error: 'API rate limit exceeded' },
});

app.use('/webhooks', webhookLimiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

  let content = '';
  let mediaUrl = null;
  let messageType = 'text';

  if (message.text) {
    content = message.text;
  } else if (message.voice) {
    content = '[Voice Message]';
    messageType = 'voice';
    mediaUrl = message.voice.file_id;
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

  const language = detectLanguage(content);

  if (!botConversations.has(chatId)) {
    botConversations.set(chatId, {
      customerPhone: chatId,
      customerName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
      platform: 'telegram',
      messages: [],
      context: {},
      language
    });
  }

  const conversation = botConversations.get(chatId);
  conversation.messages.push({
    id: messageId,
    type: 'customer',
    content: encrypt(content),
    timestamp: new Date(),
    mediaUrl: mediaUrl ? encrypt(mediaUrl) : null,
    messageType,
    language
  });

  const response = await processBotResponse(content, conversation, 'telegram', language);

  if (response.requiresApproval) {
    const approvalId = `app-${Date.now()}`;
    const bot = botInstances.get('bot-2');

    pendingApprovals.set(approvalId, {
    id: approvalId,
    botId: 'bot-2',
    botName: bot?.name || 'Support Bot',
    chatId,
    platform: 'telegram',
    language,
    customerName: from.first_name,
    action: response.action,
    details: response.details,
    requestedAt: new Date(),
    priority: response.priority || 'medium',
    status: 'pending',
    locked: true // 🔒 THIS WAS MISSING
  });


    if (bot) {
      bot.pendingApprovals = (bot.pendingApprovals || 0) + 1;
    }

    logSecurityEvent(
      'Approval Request Created',
      'bot-2',
      clientIp,
      'info',
      `${response.action} for ${chatId}`
    );

    await sendTelegramMessage(chatId, translations[language].approvalPending);
  } else {
    await sendTelegramMessage(
      chatId,
      response.message?.text?.body || response.message
    );
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
  if (!process.env.TELEGRAM_BOT_TOKEN) {
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
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      whatsapp: process.env.WHATSAPP_API_KEY ? 'configured' : 'not_configured',
      telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not_configured'
    }
  });
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

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║          Bharat Biz-Agent - Bot Server                   ║
║                                                          ║
║  🔐 Encryption:    AES-256-GCM Enabled                   ║
║  📱 WhatsApp:      ${process.env.WHATSAPP_API_KEY ? '✅ Configured  ' : '⚠️  Not Configured'}
║  ✈️  Telegram:     ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured  ' : '⚠️  Not Configured'}
║  🔑 Admin API:     ${process.env.ADMIN_API_KEY ? '✅ Configured  ' : '⚠️  Not Configured'}
║                                                          ║
║  🌐 Server:        http://localhost:${PORT}              ║
║  💚 Health:        http://localhost:${PORT}/health       ║
╚══════════════════════════════════════════════════════════╝
    `);

    logSecurityEvent(
      'Server Started',
      'system',
      'internal',
      'info',
      `Server listening on port ${PORT}`
    );
  });
}

module.exports = app;

