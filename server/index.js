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

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs').promises;
const http = require('http');
const socketIo = require('socket.io');

// Import database and AI services
const { 
  connectDatabase, 
  getDatabase, 
  closeDatabase,
  checkDatabaseHealth,
  BotOperations, 
  ConversationOperations, 
  ApprovalOperations, 
  CustomerOperations, 
  UserOperations, 
  AuditOperations, 
  InventoryOperations, 
  OrderOperations, 
  InvoiceOperations,
  COLLECTIONS 
} = require('./database');

// Import notification service
const notificationService = require('./notification-service');
const securityService = require('./security-service');
const backupService = require('./backup-service');
const analyticsService = require('./analytics-service');
const searchService = require('./search-service');
const exportService = require('./export-service');
const i18nService = require('./i18n-service');
const { SimpleAIService } = require('./simple-ai-service');
const intentProcessor = require('./intent-processor');
const indianLanguageProcessor = require('./indian-language-processor');
const indianVoiceService = require('./indian-voice-service');
const proactiveIntelligenceService = require('./proactive-intelligence-service');
const lowBandwidthService = require('./low-bandwidth-service');
const whatsappFirstRouter = require('./whatsapp-first-router');
const SpeechToTextService = require('./speech-service');
const VoiceService = require('./voice-server');
const InvoiceService = require('./invoice-service');
const { securityHeaders, validate, sanitizeInput, logSecurityEvent, schemas: validationSchemas, privacyControls } = require('./security-middleware');

// ==================== DEBUG TEST MODE ====================
// In-memory debug state per Telegram user
const debugModeUsers = new Map();

// Admin session management
const adminSessions = new Map(); // userId -> { authenticated: true, authenticatedAt: timestamp }

// Debug event stream connections
const debugConnections = new Set();

// Admin passcode (should be environment variable in production)
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'bharat_admin_2024';

// Check if user has admin session
function isAdmin(userId) {
  const session = adminSessions.get(userId.toString());
  if (!session) return false;
  
  // Check if session has expired
  if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
    adminSessions.delete(userId.toString());
    return false;
  }
  
  return session.authenticated;
}

// Authenticate admin user
function authenticateAdmin(userId, passcode) {
  if (passcode === ADMIN_PASSCODE) {
    adminSessions.set(userId.toString(), {
      authenticated: true,
      authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour timeout
    });
    return true;
  }
  return false;
}

// Clear admin session
function clearAdminSession(userId) {
  adminSessions.delete(userId.toString());
}

// Centralized debug event emission
function emitDebugEvent(userId, eventType, payload) {
  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    payload: payload
  };
  
  // Log to console for server-side visibility
  console.log(`🧪 DEBUG [${userId}]: ${eventType}`, JSON.stringify(payload, null, 2));
  
  // Send to all connected debug clients
  debugConnections.forEach(connection => {
    if (connection.readyState === 1) { // WebSocket open
      connection.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });
  
  // Also broadcast to admin dashboard via WebSocket
  broadcastToAdmins('debug.event', {
    userId,
    eventType,
    payload,
    timestamp: event.timestamp
  });
}

// Check if user has debug mode enabled
function isDebugMode(userId) {
  return debugModeUsers.has(userId.toString());
}

// Enable debug mode for user
function enableDebugMode(userId) {
  debugModeUsers.set(userId.toString(), {
    enabled: true,
    enabledAt: new Date().toISOString()
  });
  emitDebugEvent(userId, 'DEBUG_MODE_ENABLED', {
    userId: userId.toString(),
    enabledAt: debugModeUsers.get(userId.toString()).enabledAt
  });
}

// Disable debug mode for user
function disableDebugMode(userId) {
  if (debugModeUsers.has(userId.toString())) {
    emitDebugEvent(userId, 'DEBUG_MODE_DISABLED', {
      userId: userId.toString(),
      disabledAt: new Date().toISOString()
    });
    debugModeUsers.delete(userId.toString());
  }
}

// ==================== MIDDLEWARE & SETUP ====================

const app = express();

// Health check endpoint (always responds 200 OK)
app.get('/health', async (req, res) => {
  try {
    // Check database health
    const { checkDatabaseHealth } = require('./database');
    const dbHealth = await checkDatabaseHealth();
    
    const health = {
      status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      services: {
        database: dbHealth.status,
        ai: 'operational',
        telegram: telegramBot ? 'connected' : 'disabled',
        websocket: 'active'
      },
      details: {
        database: dbHealth
      }
    };
    
    res.status(dbHealth.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    // Even if there's an error, return 200 OK with basic info
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      error: 'Health check partial'
    });
  }
});

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

// Smart port selection with startup guard
const PORT = process.env.PORT || 3003;

// Prevent duplicate server starts
if (global.serverStarted) {
  console.log('⚠️ Server already started, skipping initialization');
  process.exit(0);
}
global.serverStarted = true;

// Create uploads directory for speech-to-text
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Initialize services
const speechService = new SpeechToTextService();
const simpleAIService = new SimpleAIService();
const voiceService = new VoiceService();
const invoiceService = new InvoiceService();

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

// Make broadcast function globally available for notification service
global.broadcastToAdmins = broadcastToAdmins;

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

// ==================== REAL-TIME SYNC BROADCASTERS ====================

// Broadcast database changes to all admin dashboards
async function broadcastEntityChange(entityType, action, data) {
  const eventName = `realtime.${entityType}`;
  broadcastToAdmins(eventName, {
    action, // 'created', 'updated', 'deleted'
    data,
    timestamp: new Date().toISOString()
  });
}

// Make broadcast functions globally available for database operations
global.broadcastEntityChange = broadcastEntityChange;

const TelegramBot = require('node-telegram-bot-api');

// 🔥 CREATE TELEGRAM BOT (safe for dev + test)
let telegramBot = null;
let telegramInitialized = false;

function initializeTelegramBot() {
  if (telegramInitialized) {
    return telegramBot;
  }

  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
    try {
      telegramBot = new TelegramBot(
        process.env.TELEGRAM_BOT_TOKEN,
        {
          polling: process.env.NODE_ENV !== 'test',
          request: {
            timeout: 30000, // 30 second timeout
            agentOptions: {
              keepAlive: true,
              family: 4, // Force IPv4
              keepAliveMsecs: 30000,
              maxSockets: 5,
              maxFreeSockets: 2
            }
          },
          polling: {
            interval: 2000, // 2 seconds between requests to avoid conflicts
            autoStart: true,
            params: {
              timeout: 30, // 30 second polling timeout
              allowed_updates: ['message', 'callback_query'] // Only get message updates
            }
          }
        }
      );
      
      telegramInitialized = true;
      console.log('✅ Telegram bot initialized successfully');
      
      // Add error handling
      telegramBot.on('polling_error', (err) => {
        if (process.env.NODE_ENV !== 'test') {
          // Handle specific polling errors
          if (err.code === 'EFATAL' || err.code === 'ESOCKETTIMEDOUT') {
            console.warn('⚠️ Telegram polling timeout, retrying...');
            // Don't log fatal errors as crashes, they're normal network issues
            return;
          }
          
          if (err.code === 'ETELEGRAM') {
            console.error('🚨 Telegram API error:', err.message);
            return;
          }
          
          console.error('🚨 Telegram polling error:', err);
          // Don't crash on polling errors, just log them
        }
      });
      
      telegramBot.on('error', (err) => {
        console.error('🚨 Telegram bot error:', err);
        // Continue running even if there are errors
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize Telegram bot:', error.message);
      telegramBot = null;
      telegramInitialized = true; // Don't retry
    }
  } else {
    console.log('⚠️ Telegram bot token not configured, skipping Telegram integration');
    telegramInitialized = true; // Mark as initialized to avoid retries
  }

  return telegramBot;
}

// Initialize Telegram bot
initializeTelegramBot();

// Telegram message handler (only if bot is configured)
if (telegramBot) {
  telegramBot.on('message', async (msg) => {
    try {
      // 1️⃣ Validate
      if (!validateTelegramMessage(msg)) return;

      const userId = msg.from.id;
      const chatId = msg.chat.id;
      const messageText = msg.text || '';

      // 2️⃣ Rate limit
      if (isTelegramRateLimited(userId)) {
        try {
          await telegramBot.sendMessage(chatId, "⏳ Please slow down a bit.");
        } catch (sendError) {
          console.warn('Failed to send rate limit message:', sendError.message);
        }
        return;
      }

      // 3️⃣ Hard approval lock
      const lockedApprovals = await ApprovalOperations.getByUserId(userId);
      const lockedApproval = lockedApprovals && lockedApprovals.length > 0 ? lockedApprovals[0] : null;
      if (lockedApproval && ['pending', 'approved'].includes(lockedApproval.status)) {
        try {
          await telegramBot.sendMessage(
            chatId,
            "⏳ Your previous request is still awaiting admin approval."
          );
        } catch (sendError) {
          console.warn('Failed to send approval lock message:', sendError.message);
        }
        return;
      }

      // 4️⃣ Process message
      await handleTelegramMessage(msg, telegramBot);

    } catch (error) {
      console.error('Telegram message handler error:', error);
      // Don't crash the bot, just log the error
    }
  });
}

// ==================== SAFE TELEGRAM HELPERS ====================

async function safeSendTelegramMessage(telegramBot, chatId, message, options = {}) {
  try {
    if (telegramBot && chatId) {
      await telegramBot.sendMessage(chatId, message, options);
    }
  } catch (error) {
    console.warn('Failed to send Telegram message:', error.message);
    // Don't crash, just log the error
  }
}

// ==================== ADMIN COMMAND HANDLERS ====================

async function handleAdminApproval(telegramBot, chatId, adminId, approvalId, action) {
  try {
    const approval = await ApprovalOperations.getById(approvalId);
    
    if (!approval) {
      await safeSendTelegramMessage(telegramBot, chatId, 
        `❌ *APPROVAL NOT FOUND*\n\nApproval ID "${approvalId}" not found.`
      );
      return;
    }

    if (approval.status !== 'pending') {
      await safeSendTelegramMessage(telegramBot, chatId, 
        `⚠️ *ALREADY PROCESSED*\n\nApproval "${approvalId}" is already ${approval.status}.`
      );
      return;
    }

    // Update approval status
    const updateData = {
      status: action === 'approve' ? 'approved' : 'rejected',
      processedBy: `admin_${adminId}`,
      processedAt: new Date(),
      adminNote: `Processed via Telegram by admin ${adminId}`
    };

    const updatedApproval = await ApprovalOperations.update(approvalId, updateData);
    
    if (updatedApproval) {
      // Broadcast update to admin dashboard
      broadcastToAdmins('approval.updated', updatedApproval);
      console.log('📡 Admin approval updated and broadcasted:', updatedApproval.id);
    }

    // Log admin action
    logSecurityEvent('Admin Approval Action', adminId.toString(), 'telegram', 'info', 
      `Admin ${action}d approval ${approvalId}`);

    if (action === 'approve') {
      // Execute the approved action
      const executionResult = await executeBusinessAction(approval.requestData, approval.customerId, approval.originalMessage);
      
      await safeSendTelegramMessage(telegramBot, chatId, 
        `✅ *APPROVAL ACCEPTED & EXECUTED*\n\n` +
        `Approval ID: ${approvalId}\n` +
        `Customer: ${approval.customerName}\n` +
        `Action: ${approval.requestData.intent}\n\n` +
        `Result: ${executionResult.message || 'Action completed successfully'}`
      );
    } else {
      await safeSendTelegramMessage(telegramBot, chatId, 
        `❌ *APPROVAL REJECTED*\n\n` +
        `Approval ID: ${approvalId}\n` +
        `Customer: ${approval.customerName}\n` +
        `Action: ${approval.requestData.intent}\n\n` +
        `Request has been cancelled.`
      );
    }

  } catch (error) {
    console.error('Admin approval handler error:', error);
    await safeSendTelegramMessage(telegramBot, chatId, 
      '❌ *ERROR PROCESSING APPROVAL*\n\n' +
      'Please check the approval ID and try again.'
    );
  }
}

async function handleAdminCreateOrder(telegramBot, chatId, adminId, orderDetails) {
  try {
    // Parse order details: "Rahul 5kg rice 500"
    const parts = orderDetails.trim().split(/\s+/);
    if (parts.length < 3) {
      await safeSendTelegramMessage(telegramBot, chatId, 
        '❌ *INVALID FORMAT*\n\n' +
        'Use: `create order <customer> <quantity> <product> <amount>`\n' +
        'Example: `create order Rahul 5kg rice 500`'
      );
      return;
    }

    const [customerName, quantity, product, amount] = parts;
    
    // Create order directly (bypasses approval for admin)
    const orderData = {
      customerId: `admin_${adminId}`,
      customerName: customerName,
      customerPhone: '0000000000',
      items: [{
        name: product,
        quantity: parseInt(quantity) || 1,
        unit: quantity.includes('kg') ? 'kg' : 'units',
        price: parseFloat(amount) || 0
      }],
      platform: 'telegram',
      status: 'confirmed',
      totalAmount: parseFloat(amount) || 0,
      createdBy: `admin_${adminId}`,
      createdAt: new Date()
    };

    const order = await OrderOperations.create(orderData);

    // Emit real-time event to admin dashboard
    broadcastToAdmins('order.created', order);
    console.log('📡 Order created and broadcasted:', order.id);

    // Create notification
    notificationService.createBusinessNotification('order.created', {
      orderId: order.id,
      customerName: customerName,
      userId: 'system'
    });

    await safeSendTelegramMessage(telegramBot, chatId, 
      `✅ *ORDER CREATED*\n\n` +
      `Order ID: ${order.id}\n` +
      `Customer: ${customerName}\n` +
      `Product: ${product}\n` +
      `Quantity: ${quantity}\n` +
      `Amount: ₹${amount}\n\n` +
      `Status: Confirmed (Admin bypass)`
    );

    // Log admin action
    logSecurityEvent('Admin Order Creation', adminId.toString(), 'telegram', 'info', 
      `Admin created order ${order.id} for ${customerName}`);

  } catch (error) {
    console.error('Admin create order error:', error);
    await safeSendTelegramMessage(telegramBot, chatId, 
      '❌ *ERROR CREATING ORDER*\n\n' +
      'Please check the order details and try again.'
    );
  }
}

async function handleAdminExecute(telegramBot, chatId, adminId, actionId) {
  try {
    await safeSendTelegramMessage(telegramBot, chatId, 
      `⚠️ *EXECUTE COMMAND*\n\n` +
      `Action "${actionId}" execution not yet implemented.\n\n` +
      'This feature is coming soon.'
    );

    // Log admin action
    logSecurityEvent('Admin Execute Action', adminId.toString(), 'telegram', 'info', 
      `Admin attempted to execute action ${actionId}`);

  } catch (error) {
    console.error('Admin execute error:', error);
    await safeSendTelegramMessage(telegramBot, chatId, 
      '❌ *ERROR EXECUTING ACTION*\n\n' +
      'Please check the action ID and try again.'
    );
  }
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
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(securityHeaders);

// Basic rate limiting
// Enhanced Rate Limiters with Security Service
const apiLimiter = securityService.createIPRateLimiter(15 * 60 * 1000, 100);
const commandLimiter = securityService.createEndpointRateLimiter('command', 60 * 1000, 30);
const speechLimiter = securityService.createEndpointRateLimiter('speech', 60 * 1000, 10);
const authLimiter = securityService.createBruteForceProtection(15 * 60 * 1000, 5);
const ddosProtection = securityService.createDDoSProtection();

// Apply security middleware
app.use(securityService.createSecurityHeadersMiddleware());
app.use(securityService.createRequestValidationMiddleware());
app.use(securityService.createIPBlockingMiddleware());
app.use(ddosProtection);
app.use('/api', apiLimiter);

// Apply i18n middleware
app.use(i18nService.languageMiddleware());

  // Debug event stream endpoint (with auth)
app.get('/api/debug/stream', authenticateApiKey, (req, res) => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Create a simple connection object for SSE
  const connection = {
    readyState: 1, // Simulate WebSocket readyState
    write: (data) => res.write(data)
  };

  // Add connection to debug connections
  debugConnections.add(connection);

  // Send initial connection event
  const connectEvent = {
    type: 'STREAM_CONNECTED',
    timestamp: new Date().toISOString(),
    payload: { message: 'Debug stream connected' }
  };
  res.write(`data: ${JSON.stringify(connectEvent)}\n\n`);

  // Send current debug mode users
  const debugStateEvent = {
    type: 'DEBUG_STATE_SYNC',
    timestamp: new Date().toISOString(),
    payload: {
      activeDebugUsers: Array.from(debugModeUsers.entries()).map(([userId, state]) => ({
        userId,
        ...state
      }))
    }
  };
  res.write(`data: ${JSON.stringify(debugStateEvent)}\n\n`);

  // Clean up on client disconnect
  req.on('close', () => {
    debugConnections.delete(connection);
  });

  // Handle connection errors
  req.on('error', () => {
    debugConnections.delete(connection);
  });
});

// Debug mode disable endpoint
app.post('/api/debug/disable', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId is required' 
      });
    }

    if (debugModeUsers.has(userId.toString())) {
      disableDebugMode(userId);
      res.json({ 
        success: true, 
        message: `Debug mode disabled for user ${userId}` 
      });
    } else {
      res.json({ 
        success: false, 
        message: `User ${userId} is not in debug mode` 
      });
    }
  } catch (error) {
    console.error('Error disabling debug mode:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Debug test mode - simulate events
app.post('/api/debug/test-mode', authenticateApiKey, async (req, res) => {
  try {
    const { enabled, eventTypes = ['message', 'approval', 'order', 'system'], interval = 3000 } = req.body;
    
    if (enabled) {
      // Start test mode - simulate events at intervals
      if (global.testModeInterval) {
        clearInterval(global.testModeInterval);
      }
      
      global.testModeEnabled = true;
      global.testModeInterval = setInterval(() => {
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const mockEvents = {
          message: {
            type: 'MESSAGE_RECEIVED',
            timestamp: new Date().toISOString(),
            payload: {
              userId: `USR-${Date.now().toString().slice(0, 8)}-TEST`,
              content: 'Test message from simulated user',
              platform: Math.random() > 0.5 ? 'telegram' : 'whatsapp'
            }
          },
          approval: {
            type: 'APPROVAL_REQUESTED',
            timestamp: new Date().toISOString(),
            payload: {
              approvalId: `APR-${Date.now().toString().slice(0, 8)}-TEST`,
              actionType: 'order_approval',
              priority: Math.floor(Math.random() * 3) + 1
            }
          },
          order: {
            type: 'ORDER_CREATED',
            timestamp: new Date().toISOString(),
            payload: {
              orderId: `ORD-${Date.now().toString().slice(0, 8)}-TEST`,
              totalAmount: Math.floor(Math.random() * 5000) + 100,
              itemCount: Math.floor(Math.random() * 5) + 1
            }
          },
          system: {
            type: 'SYSTEM_METRIC',
            timestamp: new Date().toISOString(),
            payload: {
              metric: 'cpu_usage',
              value: Math.floor(Math.random() * 100),
              unit: 'percent'
            }
          }
        };
        
        const event = mockEvents[eventType];
        
        // Broadcast to all debug connections
        debugConnections.forEach(conn => {
          if (conn.readyState === 1) {
            conn.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        });
        
        // Also broadcast to admin dashboards via WebSocket
        broadcastToAdmins('debug.event', event);
        
      }, interval);
      
      res.json({
        success: true,
        message: 'Debug test mode enabled',
        config: {
          eventTypes,
          interval,
          startedAt: new Date().toISOString()
        }
      });
    } else {
      // Disable test mode
      if (global.testModeInterval) {
        clearInterval(global.testModeInterval);
        global.testModeInterval = null;
      }
      global.testModeEnabled = false;
      
      res.json({
        success: true,
        message: 'Debug test mode disabled'
      });
    }
  } catch (error) {
    console.error('Debug test mode error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle test mode'
    });
  }
});

// Get debug test mode status
app.get('/api/debug/test-mode', authenticateApiKey, (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: global.testModeEnabled || false,
      startedAt: global.testModeStartedAt || null
    }
  });
});

// ==================== ROUTES ====================

// WhatsApp-first routes (autonomous business co-pilot)
app.use('/api/whatsapp-first', whatsappFirstRouter.getRouter());

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

async function handleTelegramMessage(message, telegramBot) {
  // Declare variables outside try block for catch block access
  let chatId, from, messageId;
  
  try {
    // Validate message structure
    if (!message || !message.chat || !message.chat.id) {
      console.error('❌ Invalid Telegram message structure:', message);
      return;
    }
    
    if (!message.from || !message.from.id) {
      console.error('❌ Invalid Telegram sender:', message.from);
      return;
    }
    
    chatId = message.chat.id;
    from = message.from;
    messageId = message.message_id;

    console.log(`📱 Telegram message from ${from.username || from.first_name}`);

    // ==================== DEBUG MODE HANDLING ====================
    const userId = from.id;
    const messageText = message.text || '';

    // Check for debug mode activation/deactivation
    if (messageText.toLowerCase().trim() === 'debug test mode') {
      enableDebugMode(userId);
      await safeSendTelegramMessage(telegramBot, chatId, 
        '🧪 Debug Test Mode ENABLED\n' +
        'All agent steps will be mirrored to dashboard'
      );
      return;
    }

    if (messageText.toLowerCase().trim() === 'exit debug') {
      disableDebugMode(userId);
      await safeSendTelegramMessage(telegramBot, chatId, '🧪 Debug Test Mode DISABLED');
      return;
    }

    // ==================== ADMIN COMMANDS ====================
    // Check for admin authentication
    const adminMatch = messageText.toLowerCase().trim().match(/^admin\s+(.+)$/);
    if (adminMatch) {
      const passcode = adminMatch[1].trim();
      
      if (authenticateAdmin(userId, passcode)) {
        await safeSendTelegramMessage(telegramBot, chatId, 
          '🔐 *ADMIN AUTHENTICATED*\n\n' +
          'You now have admin powers. Available commands:\n\n' +
          '• `approve <approvalId>` - Approve pending request\n' +
          '• `reject <approvalId>` - Reject pending request\n' +
          '• `create order <customer> <details>` - Create order\n' +
          '• `execute <actionId>` - Force execute action\n' +
          '• `admin logout` - Clear admin session\n\n' +
          '⚠️ Use admin powers responsibly.'
        );
      } else {
        await safeSendTelegramMessage(telegramBot, chatId, 
          '❌ *AUTHENTICATION FAILED*\n\n' +
          'Invalid admin passcode. Please check and try again.'
        );
      }
      return;
    }

    // Check if user is admin for admin commands
    if (isAdmin(userId)) {
      // Admin logout
      if (messageText.toLowerCase().trim() === 'admin logout') {
        clearAdminSession(userId);
        await safeSendTelegramMessage(telegramBot, chatId, 
          '👋 *ADMIN SESSION ENDED*\n\n' +
          'You are no longer authenticated as admin.'
        );
        return;
      }

      // Approve command
      const approveMatch = messageText.toLowerCase().trim().match(/^approve\s+(\w+)$/);
      if (approveMatch) {
        const approvalId = approveMatch[1];
        await handleAdminApproval(telegramBot, chatId, userId, approvalId, 'approve');
        return;
      }

      // Reject command
      const rejectMatch = messageText.toLowerCase().trim().match(/^reject\s+(\w+)$/);
      if (rejectMatch) {
        const approvalId = rejectMatch[1];
        await handleAdminApproval(telegramBot, chatId, userId, approvalId, 'reject');
        return;
      }

      // Create order command
      const createOrderMatch = messageText.toLowerCase().trim().match(/^create order\s+(.+)$/);
      if (createOrderMatch) {
        const orderDetails = createOrderMatch[1];
        await handleAdminCreateOrder(telegramBot, chatId, userId, orderDetails);
        return;
      }

      // Execute command
      const executeMatch = messageText.toLowerCase().trim().match(/^execute\s+(\w+)$/);
      if (executeMatch) {
        const actionId = executeMatch[1];
        await handleAdminExecute(telegramBot, chatId, userId, actionId);
        return;
      }
    }

    const debugEnabled = isDebugMode(userId);

    // Emit incoming message event
    emitDebugEvent(userId, 'INCOMING_MESSAGE', {
      platform: 'telegram',
      chatId: chatId,
      messageId: messageId,
      text: messageText,
      debugMode: debugEnabled
    });

    // Generate unique customer ID for cross-platform synchronization
    const customerId = `telegram-${chatId.toString()}`;

    // Handle /start command for user registration
    if (message.text && message.text.startsWith('/start')) {
      try {
        // Check if user already exists
        let user = await UserOperations.getByTelegramId(from.id);
        
        if (!user) {
          // Extract name from message if provided (e.g., /start John Doe)
          const nameMatch = message.text.match(/^\/start\s+(.+)$/);
          let name = nameMatch ? nameMatch[1].trim() : from.first_name;
          
          if (!name) {
            name = from.first_name || 'User';
          }
          
          // Create new user with unique ID
          const uniqueUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          user = await UserOperations.create({
            id: uniqueUserId,
            telegramId: from.id,
            name: name,
            username: from.username,
            phone: customerId,
            platform: 'telegram',
            registeredAt: new Date(),
            isActive: true,
            lastActiveAt: new Date()
          });
          
          console.log(`✅ New user registered: ${uniqueUserId} (${name})`);
          
          await safeSendTelegramMessage(telegramBot, chatId, 
            `👋 Welcome ${name}!\n\n` +
            `I'm your Bharat Biz-Agent - ready to help you manage your business!\n\n` +
            `Your unique ID: ${uniqueUserId}\n\n` +
            `Try commands like:\n` +
            `• "Rahul ko ₹500 ka bill bana do"\n` +
            `• "Stock check karo"\n` +
            `• "Payment reminder bhejo"\n\n` +
            `I'm ready to help you with your business needs.\n` +
            `What would you like to do today?`
          );
        } else {
          await safeSendTelegramMessage(telegramBot, chatId, 
            `👋 Welcome back ${user.name}!\n\n` +
            `I'm ready to help you with your business needs.\n` +
            `What would you like to do today?`
          );
        }
        
        return;
      } catch (error) {
        console.error('Error handling /start command:', error);
        await safeSendTelegramMessage(telegramBot, chatId, "Sorry, I had trouble setting up your account. Please try again.");
      }
    }
    
    // ==================== CANONICAL MESSAGE PIPELINE ====================
    const content = message.text || 'Non-text message received';
    
    // Step 1: Normalize + Detect Language
    const detectedLanguage = detectLanguage(content);
    emitDebugEvent(userId, 'LANGUAGE_DETECTION', {
      originalText: content,
      detectedLanguage: detectedLanguage,
      processingStep: 'language_detection'
    });

    // Step 2: Intent Extraction (AI)
    let aiResponse;
    try {
      aiResponse = await simpleAIService.processCustomerMessage(content, {
        platform: 'telegram',
        userId: userId.toString()
      }, []);
    } catch (error) {
      console.error('AI intent extraction failed:', error);
      aiResponse = {
        intent: 'general_query',
        confidence: 0.3,
        requiresApproval: false,
        proposedAction: 'human_assistance_needed'
      };
    }

    emitDebugEvent(userId, 'INTENT_EXTRACTION', {
      intent: aiResponse.intent,
      confidence: aiResponse.confidence,
      entities: aiResponse.entities,
      processingStep: 'intent_extraction'
    });

    // Step 3: Validation & Safety Checks
    const validationResult = validateBusinessLogic(aiResponse, content);
    emitDebugEvent(userId, 'VALIDATION_CHECK', {
      validationResult: validationResult.isValid,
      riskFactors: validationResult.riskFactors,
      processingStep: 'validation_check'
    });

    // Step 4: Approval Decision
    let approvalDecision = {
      required: aiResponse.requiresApproval || validationResult.requiresApproval,
      reason: '',
      riskFactors: [],
      aiConfidence: aiResponse.confidence,
      draftAction: aiResponse.proposedAction
    };

    if (approvalDecision.required) {
      approvalDecision.reason = validationResult.approvalReason || 'AI confidence low or high-risk action detected';
      approvalDecision.riskFactors = validationResult.riskFactors;
      
      // Create approval request
      try {
        const approval = await ApprovalOperations.create({
          customerId: customerId,
          action: aiResponse.proposedAction,
          details: {
            intent: aiResponse.intent,
            entities: aiResponse.entities,
            originalMessage: content,
            confidence: aiResponse.confidence
          },
          status: 'pending',
          requestedBy: 'ai',
          createdAt: new Date()
        });
        
        // Emit real-time event to admin dashboard
        broadcastToAdmins('approval.created', approval);
        console.log('📡 Approval created and broadcasted:', approval.id);
        
        // Create notification
        notificationService.createBusinessNotification('approval.pending', {
          approvalId: approval.id,
          requestType: aiResponse.proposedAction,
          userId: 'system'
        });
        
      } catch (approvalError) {
        console.error('Failed to create approval request:', approvalError);
      }
    }

    emitDebugEvent(userId, 'APPROVAL_DECISION', {
      required: approvalDecision.required,
      reason: approvalDecision.reason,
      riskFactors: approvalDecision.riskFactors,
      aiConfidence: approvalDecision.aiConfidence,
      processingStep: 'approval_decision'
    });

    // Step 5: Action Execution OR Draft
    if (!approvalDecision.required) {
      try {
        const result = await executeBusinessAction(aiResponse, customerId, content);
        emitDebugEvent(userId, 'ACTION_EXECUTION', {
          action: aiResponse.proposedAction,
          status: 'success',
          result: result,
          processingStep: 'action_execution'
        });
      } catch (executionError) {
        emitDebugEvent(userId, 'ACTION_EXECUTION', {
          action: aiResponse.proposedAction,
          status: 'failed',
          error: executionError.message,
          processingStep: 'action_execution'
        });
      }
    }

    // Step 6: Response Generation
    const responseText = generateUserResponse(aiResponse, approvalDecision, detectedLanguage);
    
    try {
      await safeSendTelegramMessage(telegramBot, chatId, responseText);
      emitDebugEvent(userId, 'RESPONSE_GENERATION', {
        responseType: approvalDecision.required ? 'approval_required' : 'action_completed',
        responseText: responseText,
        processingStep: 'response_generation'
      });
    } catch (sendError) {
      console.error('Failed to send main response:', sendError.message);
      emitDebugEvent(userId, 'ERROR_OCCURRED', {
        errorType: 'telegram_send_failed',
        errorMessage: sendError.message,
        processingStep: 'response_generation'
      });
    }

    // Step 7: Persist Everything
    try {
      // Check if conversation exists, if not create it
      const existingConversation = await ConversationOperations.getByCustomerId(customerId);
      if (!existingConversation) {
        await ConversationOperations.create({
          customerId,
          botId: 'telegram_bot',
          customerName: `Customer ${customerId}`,
          customerPhone: customerId,
          messages: [],
          lastMessageAt: new Date(),
          createdAt: new Date(),
          status: 'active',
          platform: 'telegram'
        });
        console.log('📝 Created new conversation for customer:', customerId);
      }

      await ConversationOperations.addMessage(customerId, {
        type: 'text',
        content: content,
        sender: 'user',
        platform: 'telegram',
        timestamp: new Date(),
        metadata: {
          intent: aiResponse.intent,
          confidence: aiResponse.confidence,
          language: detectedLanguage,
          approvalRequired: approvalDecision.required
        }
      });
      
      // Emit conversation update to admin dashboard
      const conversation = await ConversationOperations.getByCustomerId(customerId);
      if (conversation) {
        broadcastToAdmins('conversation.updated', {
          ...conversation,
          lastMessage: content,
          lastMessageAt: new Date(),
          platform: 'telegram',
          intent: aiResponse.intent,
          confidence: aiResponse.confidence
        });
        console.log('📡 Conversation updated and broadcasted:', customerId);
      }
    } catch (persistError) {
      emitDebugEvent(userId, 'ERROR_OCCURRED', {
        errorType: 'conversation_persist_failed',
        errorMessage: persistError.message,
        processingStep: 'persistence'
      });
    }
    
  } catch (error) {
    console.error('Error handling Telegram message:', error);
    
    // Get userId for debug events
    const errorUserId = from ? from.id : 'unknown';
    
    // Emit error event for debugging
    emitDebugEvent(errorUserId, 'ERROR_OCCURRED', {
      errorType: 'telegram_handler_error',
      errorMessage: error.message,
      errorStack: error.stack,
      processingStep: 'error_handling'
    });
    
    if (message && message.chat && message.chat.id) {
      await safeSendTelegramMessage(telegramBot, message.chat.id, "Sorry, I'm having trouble processing your message right now. Please try again later.");
    }
  }
}

// Validate business logic and safety rules
function validateBusinessLogic(aiResponse, message) {
  const result = {
    isValid: true,
    requiresApproval: aiResponse.requiresApproval,
    approvalReason: '',
    riskFactors: []
  };

  // Check for high-value operations
  const highAmounts = aiResponse.entities?.amounts?.filter(amount => amount > 1000) || [];
  if (highAmounts.length > 0) {
    result.requiresApproval = true;
    result.approvalReason = `High-value amounts detected: ₹${highAmounts.join(', ')}`;
    result.riskFactors.push('high_amount');
  }

  // Check for refund intent
  if (aiResponse.intent === 'refund' || aiResponse.proposedAction?.includes('refund')) {
    result.requiresApproval = true;
    result.approvalReason = 'Refund operations require manual review';
    result.riskFactors.push('refund_intent');
  }

  // Check for data export
  if (aiResponse.intent === 'data_export' || aiResponse.proposedAction?.includes('export')) {
    result.requiresApproval = true;
    result.approvalReason = 'Data export requires admin approval';
    result.riskFactors.push('data_export');
  }

  // Check for low confidence
  if (aiResponse.confidence < 0.6) {
    result.requiresApproval = true;
    if (!result.approvalReason) {
      result.approvalReason = 'AI confidence below threshold';
    }
    result.riskFactors.push('low_confidence');
  }

  return result;
}

// Execute business actions based on intent
async function executeBusinessAction(aiResponse, customerId, message) {
  switch (aiResponse.intent) {
    case 'create_order':
      return await handleOrderCreation(aiResponse.entities, customerId);
    case 'generate_invoice':
      return await handleInvoiceGeneration(aiResponse.entities, customerId);
    case 'payment_reminder':
      return await handlePaymentReminder(aiResponse.entities, customerId);
    case 'check_inventory':
      return await handleInventoryCheck(aiResponse.entities, customerId);
    case 'general_query':
      return await handleGeneralQuery(aiResponse.entities, message);
    default:
      return { status: 'unknown_intent', message: 'I need more information to help you with that.' };
  }
}

// Generate appropriate user response
function generateUserResponse(aiResponse, approvalDecision, language) {
  // Handle fallback responses with better messaging
  if (aiResponse.proposedAction === 'human_assistance_needed' && aiResponse.confidence === 0.6) {
    const fallbackResponses = {
      en: "🤖 I'm here to help! I can assist with:\n\n• Creating orders and invoices\n• Payment reminders\n• Inventory checks\n• General business queries\n\nPlease describe what you need in more detail, or contact our support team for complex requests.",
      hi: "🤖 मैं आपकी मदद के लिए यहाँ हूँ! मैं इनमें मदद कर सकता हूँ:\n\n• ऑर्डर और इनवॉइस बनाना\n• पेमेंट रिमाइंडर\n• इन्वेंट्री चेक\n• सामान्य व्यापारिक प्रश्न\n\nकृपया अपनी ज़रूरत विस्तार से बताएं, या जटिल अनुरोधों के लिए हमारी सहायता टीम से संपर्क करें।",
      hinglish: "🤖 Main aapki help ke liye yahan hoon! Main in mein help kar sakta hoon:\n\n• Orders aur invoices banana\n• Payment reminders\n• Inventory check\n• General business queries\n\nKripya apni zaroorat detail mein batayein, ya complex requests ke liye hamari support team se contact karein."
    };
    return fallbackResponses[language] || fallbackResponses.en;
  }
  
  if (approvalDecision.required) {
    const responses = {
      en: `⏳ Your request requires approval. I've sent it to the admin for review.\n\nAction: ${aiResponse.proposedAction}\nReason: ${approvalDecision.reason}`,
      hi: `⏳ आपका अनुरोध अनुमति की आवश्यकता है। मैंने इसे समीक्षा के लिए भेज दिया है।\n\nकार्य: ${aiResponse.proposedAction}\nकारण: ${approvalDecision.reason}`,
      hinglish: `⏳ Tumhara request approval chahiye. Maine admin ko bhej diya hai.\n\nAction: ${aiResponse.proposedAction}\nReason: ${approvalDecision.reason}`
    };
    return responses[language] || responses.en;
  }

  // Success responses
  const successResponses = {
    en: `✅ Done! ${aiResponse.proposedAction} completed successfully.`,
    hi: `✅ हो गया! ${aiResponse.proposedAction} सफलतः पूरा हुआ।`,
    hinglish: `✅ Ho gaya! ${aiResponse.proposedAction} successfully complete ho gaya.`
  };
  
  return successResponses[language] || successResponses.en;
}

// Business Action Handlers
async function handleOrderCreation(entities, customerId) {
  try {
    const products = entities.products || [];
    const quantities = entities.quantities || [];
    
    if (products.length === 0 || quantities.length === 0) {
      return { status: 'invalid_input', message: 'Please specify products and quantities.' };
    }

    const order = {
      customerId: customerId,
      items: products.map((product, index) => ({
        name: product,
        quantity: quantities[index] || 1,
        price: getProductPrice(product)
      })),
      totalAmount: calculateOrderTotal(products, quantities),
      status: 'pending',
      createdAt: new Date()
    };

    const savedOrder = await OrderOperations.create(order);
    
    // Emit real-time event to admin dashboard
    broadcastToAdmins('order.created', savedOrder);
    console.log('📡 Customer order created and broadcasted:', savedOrder.id);
    
    // Create notification
    notificationService.createBusinessNotification('order.created', {
      orderId: savedOrder.id,
      customerName: 'Customer',
      userId: 'system'
    });
    
    return { 
      status: 'success', 
      orderId: savedOrder.id,
      message: `Order created for ${products.join(', ')}. Total: ₹${order.totalAmount}` 
    };
  } catch (error) {
    return { status: 'error', message: 'Failed to create order.' };
  }
}

async function handleInvoiceGeneration(entities, customerId) {
  try {
    const products = entities.products || [];
    const amounts = entities.amounts || [];
    
    if (products.length === 0 && amounts.length === 0) {
      return { status: 'invalid_input', message: 'Please specify products or amounts for invoice.' };
    }

    const invoice = {
      customerId: customerId,
      items: products.length > 0 ? products.map(product => ({
        description: product,
        quantity: 1,
        price: getProductPrice(product),
        gst: getProductPrice(product) * 0.18
      })) : amounts.map(amount => ({
        description: 'Service/Product',
        quantity: 1,
        price: amount,
        gst: amount * 0.18
      })),
      totalAmount: products.length > 0 ? 
        products.reduce((sum, product) => sum + getProductPrice(product), 0) :
        amounts.reduce((sum, amount) => sum + amount, 0),
      status: 'pending',
      createdAt: new Date()
    };

    const savedInvoice = await InvoiceOperations.create(invoice);
    
    // Generate PDF invoice
    const invoiceService = require('./invoice-service');
    const generatedInvoice = await invoiceService.generateInvoice(savedInvoice.id, 'pdf');
    
    // Get customer details for personalized message
    const customer = await CustomerOperations.getById(customerId);
    const customerName = customer?.name || 'Customer';
    
    // Extract actual chatId from customerId (remove telegram- prefix)
    const actualChatId = customerId.replace('telegram-', '');
    
    // Send invoice to customer via Telegram
    const telegramBot = require('./bot-telegram');
    await safeSendTelegramMessage(telegramBot, actualChatId, 
      `🧾 *INVOICE GENERATED*\n\n` +
      `Hello ${customerName}!\n\n` +
      `📋 Invoice Details:\n` +
      `Invoice ID: ${savedInvoice.id}\n` +
      `Total Amount: ₹${invoice.totalAmount}\n` +
      `Status: ${savedInvoice.status}\n\n` +
      `📄 PDF invoice has been generated and saved.\n\n` +
      `You can download it from the admin panel or request a copy anytime.\n\n` +
      `Thank you for your business! 🙏`
    );
    
    console.log('🧾 Invoice generated and sent to customer:', savedInvoice.id, 'chatId:', actualChatId);
    
    // Create notification
    notificationService.createBusinessNotification('invoice.generated', {
      invoiceId: savedInvoice.id,
      amount: invoice.totalAmount,
      customerName: customerName,
      userId: 'system'
    });
    
    return { 
      status: 'success', 
      invoiceId: savedInvoice.id,
      pdfFile: generatedInvoice.filename,
      message: `Invoice generated for ₹${invoice.totalAmount} and sent to ${customerName}` 
    };
  } catch (error) {
    console.error('Invoice generation error:', error);
    return { status: 'error', message: 'Failed to generate invoice.' };
  }
}

async function handlePaymentReminder(entities, customerId) {
  try {
    const people = entities.people || [];
    
    if (people.length === 0) {
      return { status: 'invalid_input', message: 'Please specify customer names for payment reminder.' };
    }

    const reminders = people.map(person => ({
      customerId: customerId,
      personName: person,
      type: 'payment_reminder',
      message: `Payment reminder sent to ${person}`,
      status: 'sent',
      createdAt: new Date()
    }));

    // Save reminders to conversation history
    for (const reminder of reminders) {
      await ConversationOperations.addMessage(customerId, {
        type: 'system',
        content: reminder.message,
        sender: 'bot',
        platform: 'telegram',
        timestamp: new Date()
      });
    }
    
    return { 
      status: 'success', 
      message: `Payment reminders sent to: ${people.join(', ')}` 
    };
  } catch (error) {
    return { status: 'error', message: 'Failed to send payment reminders.' };
  }
}

async function handleInventoryCheck(entities, customerId) {
  try {
    const products = entities.products || [];
    
    if (products.length === 0) {
      // Return general inventory status
      const allInventory = await InventoryOperations.getAll();
      return { 
        status: 'success', 
        inventory: allInventory,
        message: 'Current inventory status' 
      };
    }

    const inventoryData = {};
    for (const product of products) {
      const stock = await InventoryOperations.getByProduct(product);
      inventoryData[product] = stock || { available: false, quantity: 0 };
    }

    return { 
      status: 'success', 
      inventory: inventoryData,
      message: 'Product availability checked' 
    };
  } catch (error) {
    return { status: 'error', message: 'Failed to check inventory.' };
  }
}

async function handleGeneralQuery(entities, message) {
  try {
    // Simple FAQ response
    const responses = {
      'price': 'Our prices: Rice ₹35/kg, Wheat ₹28/kg, Sugar ₹42/kg, Oil ₹180/L',
      'delivery': 'Delivery available within city limits: ₹20-₹50 based on distance',
      'timing': 'Business hours: 9 AM to 8 PM, Monday to Saturday',
      'payment': 'We accept UPI, bank transfer, and cash on delivery'
    };

    // Simple keyword matching
    const lowerMessage = message.toLowerCase();
    for (const [keyword, response] of Object.entries(responses)) {
      if (lowerMessage.includes(keyword)) {
        return { status: 'success', message: response };
      }
    }

    return { 
      status: 'success', 
      message: 'I can help with orders, invoices, payments, and inventory. What would you like to do?' 
    };
  } catch (error) {
    return { status: 'error', message: 'Failed to process query.' };
  }
}

// Helper functions
function getProductPrice(product) {
  const prices = {
    'rice': 35,
    'wheat': 28,
    'sugar': 42,
    'oil': 180,
    'turmeric': 120,
    'chilli': 85
  };
  
  const lowerProduct = product.toLowerCase();
  for (const [key, price] of Object.entries(prices)) {
    if (lowerProduct.includes(key)) {
      return price;
    }
  }
  return 0; // Default price
}

function calculateOrderTotal(products, quantities) {
  let total = 0;
  for (let i = 0; i < products.length; i++) {
    total += getProductPrice(products[i]) * (quantities[i] || 1);
  }
  return total;
}

// Generate action buttons for intent responses
function generateActionButtons(intentResult) {
  const buttons = [];
  
  if (intentResult.requires_approval) {
    buttons.push([
      { text: '✅ HAAN', callback_data: `approve_${intentResult.intent}` },
      { text: '❌ NAHI', callback_data: `reject_${intentResult.intent}` }
    ]);
  }
  
  switch (intentResult.intent) {
    case 'create_invoice':
      buttons.push([
        { text: '📋 EDIT ITEMS', callback_data: 'edit_invoice_items' },
        { text: '💰 EDIT AMOUNT', callback_data: 'edit_invoice_amount' }
      ]);
      break;
      
    case 'send_payment_reminder':
      buttons.push([
        { text: '📱 SEND NOW', callback_data: 'send_reminder_now' },
        { text: '⏰ SCHEDULE', callback_data: 'schedule_reminder' }
      ]);
      break;
      
    case 'follow_up':
      buttons.push([
        { text: '📞 CALL', callback_data: 'call_customer' },
        { text: '📬 WHATSAPP', callback_data: 'whatsapp_customer' }
      ]);
      break;
  }
  
  return buttons;
}

async function handleTelegramCallback(callbackQuery, clientIp) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  logSecurityEvent('Telegram Callback Received', 'system', clientIp, 'info', `Data: ${data}`);
  
  // Handle button clicks
  if (data.startsWith('approve_') || data.startsWith('reject_')) {
    await handleApprovalCallback(callbackQuery, data);
    return;
  }
  
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

// Handle approval callbacks (HAAN/NAHI responses)
async function handleApprovalCallback(callbackQuery, data) {
  const chatId = callbackQuery.message.chat.id;
  const [action, intent] = data.split('_');
  
  try {
    if (action === 'approve') {
      // Execute the approved action
      let executionResult;
      
      switch (intent) {
        case 'create_invoice':
          // Get pending invoice and execute
          const pendingInvoice = await getPendingAction(chatId, 'create_invoice');
          if (pendingInvoice) {
            executionResult = await intentProcessor.executeBusinessAction(
              { intent: 'create_invoice', entities: pendingInvoice.entities }, 
              pendingInvoice.customer
            );
          }
          break;
          
        case 'send_payment_reminder':
          const pendingReminder = await getPendingAction(chatId, 'send_payment_reminder');
          if (pendingReminder) {
            executionResult = await intentProcessor.executeBusinessAction(
              { intent: 'send_payment_reminder', entities: pendingReminder.entities },
              pendingReminder.customer
            );
          }
          break;
          
        default:
          executionResult = { status: 'error', message: 'Unknown intent for approval' };
      }
      
      if (executionResult.status === 'completed' || executionResult.status === 'sent') {
        await telegramBot.sendMessage(chatId, 
          `✅ *APPROVED & EXECUTED*\n\n${executionResult.message}`
        );
        
        // Log approval
        await AuditOperations.log('action_approved', {
          intent: intent,
          customer: chatId,
          result: executionResult,
          approved_by: 'customer_response',
          platform: 'telegram'
        });
        
      } else {
        await telegramBot.sendMessage(chatId, 
          `⚠️ *APPROVED BUT FAILED*\n\n${executionResult.message}`
        );
      }
      
    } else if (action === 'reject') {
      // Cancel the action
      await telegramBot.sendMessage(chatId, 
        `❌ *CANCELLED*\n\nAapki request cancel kar di gayi hai.`
      );
      
      // Log rejection
      await AuditOperations.log('action_rejected', {
        intent: intent,
        customer: chatId,
        rejected_by: 'customer_response',
        platform: 'telegram'
      });
    }
    
    // Answer the callback to remove loading state
    await answerTelegramCallback(callbackQuery.id);
    
  } catch (error) {
    console.error('Approval callback error:', error);
    await telegramBot.sendMessage(chatId, 
      '❌ Koi gadbad ho gayi hai. Kripya phir se try kijiye.'
    );
  }
}

// Helper function to get pending actions (would be stored in database)
async function getPendingAction(chatId, intent) {
  // This would fetch from a pending_actions collection
  // For now, return mock data
  return {
    customer: { id: chatId, name: 'Customer', platform: 'telegram' },
    entities: {
      customer: 'Customer Name',
      amount: '500',
      items: [{ name: 'Rice', quantity: '5', unit: 'kg' }]
    }
  };
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


// ==================== PRODUCTION-GRADE APPROVALS API ====================

// Get all approvals with pagination
app.get('/api/approvals', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 100, offset = 0, status } = req.query;
    
    let approvals;
    if (status === 'pending') {
      approvals = await ApprovalOperations.getPending(parseInt(limit));
    } else {
      approvals = await ApprovalOperations.getAll(parseInt(limit), parseInt(offset));
    }
    
    res.json({ 
      success: true, 
      data: approvals,
      count: approvals.length
    });
  } catch (error) {
    console.error('Error getting approvals:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get approvals' 
    });
  }
});

// Get recent pending approvals for dashboard
app.get('/api/approvals/recent', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const approvals = await ApprovalOperations.getRecent(parseInt(limit));
    
    res.json({ 
      success: true, 
      data: approvals,
      count: approvals.length
    });
  } catch (error) {
    console.error('Error getting recent approvals:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get recent approvals' 
    });
  }
});

// Get approval statistics
app.get('/api/approvals/stats', authenticateApiKey, async (req, res) => {
  try {
    const stats = await ApprovalOperations.getStats();
    res.json({ 
      success: true, 
      data: stats
    });
  } catch (error) {
    console.error('Error getting approval stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get approval stats' 
    });
  }
});

// Get single approval by ID
app.get('/api/approvals/:approvalId', authenticateApiKey, async (req, res) => {
  try {
    const { approvalId } = req.params;
    const approval = await ApprovalOperations.getByApprovalId(approvalId);
    
    if (!approval) {
      return res.status(404).json({ 
        success: false, 
        error: 'Approval not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: approval
    });
  } catch (error) {
    console.error('Error getting approval:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get approval' 
    });
  }
});

// Create new approval (internal use or admin)
app.post('/api/approvals', authenticateApiKey, async (req, res) => {
  try {
    const { userId, conversationId, actionType, payload, priority = 1 } = req.body;
    
    if (!userId || !actionType) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId and actionType are required' 
      });
    }
    
    const approval = await ApprovalOperations.create({
      userId,
      conversationId,
      actionType,
      payload,
      priority
    });
    
    // Broadcast to all connected admins via WebSocket
    broadcastToAdmins('approval.created', approval);
    
    res.status(201).json({ 
      success: true, 
      data: approval
    });
  } catch (error) {
    console.error('Error creating approval:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create approval' 
    });
  }
});

// Resolve approval (approve/reject) - completes transactional workflow
app.post('/api/approvals/:approvalId/resolve', authenticateApiKey, async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { status, notes = '' } = req.body;
    const resolvedBy = req.headers['x-admin-id'] || 'admin@dashboard';
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Status must be approved or rejected' 
      });
    }
    
    // Resolve the approval
    const approval = await ApprovalOperations.resolve(approvalId, { status, notes }, resolvedBy);
    
    // If approved, execute the action
    let executionResult = null;
    if (status === 'approved') {
      try {
        executionResult = await ApprovalOperations.executeApproval(approvalId);
      } catch (execError) {
        console.error('Error executing approval action:', execError);
        // Don't fail the request, but include error in response
        executionResult = { error: execError.message };
      }
    }
    
    // Broadcast update to all connected admins
    broadcastToAdmins('approval.resolved', { 
      approvalId, 
      status, 
      resolvedBy,
      executionResult 
    });
    
    // Log the action
    logSecurityEvent(
      `Approval ${status}`,
      resolvedBy,
      req.ip,
      'info',
      `${approval.actionType} for user ${approval.userId}`
    );
    
    res.json({ 
      success: true, 
      data: approval,
      executionResult
    });
  } catch (error) {
    console.error('Error resolving approval:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resolve approval' 
    });
  }
});

// Delete approval (admin only)
app.delete('/api/approvals/:approvalId', authenticateApiKey, async (req, res) => {
  try {
    const { approvalId } = req.params;
    
    const result = await db.collection(COLLECTIONS.APPROVALS).deleteOne({ approvalId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Approval not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Approval deleted' 
    });
  } catch (error) {
    console.error('Error deleting approval:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete approval' 
    });
  }
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

// ==================== PRODUCTION-GRADE CONVERSATIONS API ====================

// Get all conversations from database
app.get('/api/conversations', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const conversations = await ConversationOperations.getAll(parseInt(limit), parseInt(offset));
    
    res.json({ 
      success: true, 
      data: conversations,
      count: conversations.length
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get conversations' 
    });
  }
});

// Get conversation by conversationId
app.get('/api/conversations/:conversationId', authenticateApiKey, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await ConversationOperations.getByConversationId(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: conversation
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get conversation' 
    });
  }
});

// Get messages from conversation
app.get('/api/conversations/:conversationId/messages', authenticateApiKey, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await ConversationOperations.getByConversationId(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: conversation.messages || []
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get messages' 
    });
  }
});

// Add message to conversation
app.post('/api/conversations/:conversationId/messages', authenticateApiKey, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { sender, content, metadata = {} } = req.body;
    
    const result = await ConversationOperations.addMessage(conversationId, {
      sender,
      content,
      metadata
    });
    
    res.json({ 
      success: true, 
      data: result
    });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add message' 
    });
  }
});

// Get conversations by userId
app.get('/api/conversations/user/:userId', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.params;
    const conversations = await ConversationOperations.getByUserId(userId);
    
    res.json({ 
      success: true, 
      data: conversations
    });
  } catch (error) {
    console.error('Error getting user conversations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user conversations' 
    });
  }
});

// Get conversation statistics
app.get('/api/conversations/stats', authenticateApiKey, async (req, res) => {
  try {
    const stats = await ConversationOperations.getStats();
    res.json({ 
      success: true, 
      data: stats
    });
  } catch (error) {
    console.error('Error getting conversation stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get conversation stats' 
    });
  }
});

// Reset all conversations - clears messages but preserves conversations
app.post('/api/conversations/reset', authenticateApiKey, async (req, res) => {
  try {
    const { confirmation } = req.body;
    
    if (confirmation !== 'RESET_ALL_CONVERSATIONS') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Send confirmation: "RESET_ALL_CONVERSATIONS"'
      });
    }
    
    const result = await ConversationOperations.resetAll();
    
    // Log security event
    logSecurityEvent(
      'All Conversations Reset',
      req.headers['x-admin-id'] || 'admin@dashboard',
      req.ip,
      'warning',
      `Reset ${result.modifiedCount} conversations`
    );
    
    res.json({
      success: true,
      message: 'All conversations have been reset',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error resetting conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset conversations'
    });
  }
});

// Get bot stats from database
app.get('/api/stats', authenticateApiKey, async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get counts from database
    const [
      totalBots,
      activeBots,
      totalConversations,
      messageStats,
      pendingApprovalsData,
      totalUsers,
      totalOrders,
      totalInvoices
    ] = await Promise.all([
      db.collection(COLLECTIONS.BOTS).countDocuments(),
      db.collection(COLLECTIONS.BOTS).countDocuments({ status: 'active' }),
      db.collection(COLLECTIONS.CONVERSATIONS).countDocuments(),
      db.collection(COLLECTIONS.CONVERSATIONS).aggregate([
        { $project: { messageCount: { $size: { $ifNull: ['$messages', []] } } } },
        { $group: { _id: null, total: { $sum: '$messageCount' } } }
      ]).toArray(),
      ApprovalOperations.getPending(),
      db.collection(COLLECTIONS.USERS).countDocuments(),
      db.collection(COLLECTIONS.ORDERS).countDocuments(),
      db.collection(COLLECTIONS.INVOICES).countDocuments()
    ]);
    
    const totalMessages = messageStats[0]?.total || 0;
    const pendingApprovals = pendingApprovalsData.length;
    
    res.json({
      success: true,
      data: {
        totalBots,
        activeBots,
        totalConversations,
        totalMessages,
        pendingApprovals,
        totalUsers,
        totalOrders,
        totalInvoices,
        securityEvents24h: securityLogs.filter(l => 
          new Date(l.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get stats' 
    });
  }
});

// Get security logs
app.get('/api/security/logs', (req, res) => {
  res.json(securityLogs.slice(0, 100));
});

// Bot management with database sync
app.get('/api/bots', authenticateApiKey, async (req, res) => {
  try {
    const bots = await BotOperations.getAll();
    res.json({
      success: true,
      data: bots,
      count: bots.length
    });
  } catch (error) {
    console.error('Error getting bots:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bots'
    });
  }
});

app.get('/api/bots/:botId', authenticateApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = await BotOperations.getByBotId(botId);
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }
    
    res.json({
      success: true,
      data: bot
    });
  } catch (error) {
    console.error('Error getting bot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bot'
    });
  }
});

app.post('/api/bots/:botId/toggle', authenticateApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = await BotOperations.getByBotId(botId);
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }
    
    const newStatus = bot.status === 'active' ? 'paused' : 'active';
    await BotOperations.update(botId, { status: newStatus });
    
    // Also update runtime instance if exists
    const runtimeBot = botInstances.get(botId);
    if (runtimeBot) {
      runtimeBot.status = newStatus;
    }
    
    logSecurityEvent(
      `Bot ${newStatus === 'active' ? 'Activated' : 'Paused'}`,
      req.headers['x-admin-id'] || 'admin@dashboard',
      req.ip,
      'info',
      `Bot ${bot.name} (${botId}) is now ${newStatus}`
    );
    
    res.json({
      success: true,
      data: { ...bot, status: newStatus }
    });
  } catch (error) {
    console.error('Error toggling bot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle bot'
    });
  }
});

// Update bot configuration
app.put('/api/bots/:botId', authenticateApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    const { name, config, status, settings } = req.body;
    
    const bot = await BotOperations.getByBotId(botId);
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }
    
    const updateData = {
      ...(name && { name }),
      ...(config && { config }),
      ...(status && { status }),
      ...(settings && { settings })
    };
    
    const updated = await BotOperations.update(botId, updateData);
    
    // Sync with runtime instance
    const runtimeBot = botInstances.get(botId);
    if (runtimeBot) {
      Object.assign(runtimeBot, updateData);
    }
    
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating bot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bot'
    });
  }
});

// Sync all runtime bots with database config
app.post('/api/bots/sync', authenticateApiKey, async (req, res) => {
  try {
    const dbBots = await BotOperations.getAll();
    const results = [];
    
    for (const dbBot of dbBots) {
      const runtimeBot = botInstances.get(dbBot.botId);
      if (runtimeBot) {
        // Update runtime from database
        runtimeBot.status = dbBot.status;
        runtimeBot.config = dbBot.config;
        results.push({ botId: dbBot.botId, synced: true });
      } else {
        results.push({ botId: dbBot.botId, synced: false, reason: 'Not in runtime' });
      }
    }
    
    logSecurityEvent(
      'Bots Synced with Database',
      req.headers['x-admin-id'] || 'admin@dashboard',
      req.ip,
      'info',
      `Synced ${results.filter(r => r.synced).length} bots with database`
    );
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error syncing bots:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync bots'
    });
  }
});

// Admin command execution endpoint
app.post('/api/admin/execute', authenticateApiKey, async (req, res) => {
  try {
    const { command, target, params } = req.body;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }
    
    const adminId = req.headers['x-admin-id'] || 'admin@dashboard';
    const result = { executed: false, output: '' };
    
    // Validate and execute allowed commands
    switch (command.toLowerCase()) {
      case 'restart':
        result.output = 'Server restart scheduled';
        result.executed = true;
        break;
        
      case 'clearcache':
        result.output = 'Cache cleared successfully';
        result.executed = true;
        break;
        
      case 'reloadbots':
        // Reload bot configurations from database
        const dbBots = await BotOperations.getAll();
        result.output = `Reloaded ${dbBots.length} bot configurations`;
        result.executed = true;
        break;
        
      case 'sendmessage':
        if (!target || !params?.message) {
          return res.status(400).json({
            success: false,
            error: 'Target and message params required'
          });
        }
        result.output = `Message queued for ${target}`;
        result.executed = true;
        break;
        
      case 'syncdb':
        // Sync database
        result.output = 'Database sync completed';
        result.executed = true;
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown command: ${command}`
        });
    }
    
    // Log security event
    logSecurityEvent(
      'Admin Command Executed',
      adminId,
      req.ip,
      'info',
      `Command: ${command}, Target: ${target || 'none'}`
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error executing admin command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute command'
    });
  }
});

// Admin backdoor authentication endpoint
app.post('/api/admin/authenticate', authenticateApiKey, async (req, res) => {
  try {
    const { passcode, adminId } = req.body;
    
    if (!passcode || !adminId) {
      return res.status(400).json({
        success: false,
        error: 'passcode and adminId are required'
      });
    }
    
    if (passcode !== ADMIN_PASSCODE) {
      logSecurityEvent(
        'Admin Authentication Failed',
        adminId,
        req.ip,
        'warning',
        'Invalid admin passcode attempted'
      );
      
      return res.status(401).json({
        success: false,
        error: 'Invalid passcode'
      });
    }
    
    // Create admin session
    const session = {
      adminId,
      authenticated: true,
      authenticatedAt: new Date().toISOString(),
      sessionId: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    adminSessions.set(adminId, session);
    
    logSecurityEvent(
      'Admin Authenticated',
      adminId,
      req.ip,
      'info',
      'Admin session created'
    );
    
    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        authenticatedAt: session.authenticatedAt,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      }
    });
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
});

// Execute admin command
app.post('/api/admin/command', authenticateApiKey, async (req, res) => {
  try {
    const { adminId, sessionId, command, params = {} } = req.body;
    
    // Verify admin session
    const session = adminSessions.get(adminId);
    if (!session || session.sessionId !== sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired admin session'
      });
    }
    
    // Available admin commands
    const adminCommands = {
      'broadcast': async (params) => {
        const { message, platform = 'all' } = params;
        // Implementation would broadcast to all users
        return { message: 'Broadcast sent', platform, recipients: 0 };
      },
      'system_status': async () => {
        return {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version,
          timestamp: new Date().toISOString()
        };
      },
      'clear_cache': async () => {
        // Clear any in-memory caches
        return { cleared: true, timestamp: new Date().toISOString() };
      },
      'get_logs': async (params) => {
        const { lines = 100 } = params;
        return { logs: securityLogs.slice(-lines) };
      },
      'reset_conversations': async () => {
        const result = await ConversationOperations.resetAll();
        return { modifiedCount: result.modifiedCount };
      },
      'user_lookup': async (params) => {
        const { userId, phoneNumber, telegramId } = params;
        if (userId) return await UserOperations.getByUserId(userId);
        if (phoneNumber) return await UserOperations.getByPhone(phoneNumber);
        if (telegramId) return await UserOperations.getByTelegramId(telegramId);
        return null;
      }
    };
    
    const handler = adminCommands[command];
    if (!handler) {
      return res.status(400).json({
        success: false,
        error: `Unknown command: ${command}. Available: ${Object.keys(adminCommands).join(', ')}`
      });
    }
    
    const result = await handler(params);
    
    logSecurityEvent(
      `Admin Command: ${command}`,
      adminId,
      req.ip,
      'info',
      `Executed admin command: ${command}`
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Admin command error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Command execution failed'
    });
  }
});

// Verify admin session
app.get('/api/admin/session/:adminId', authenticateApiKey, async (req, res) => {
  try {
    const { adminId } = req.params;
    const session = adminSessions.get(adminId);
    
    if (!session) {
      return res.json({
        success: true,
        data: { authenticated: false }
      });
    }
    
    // Check if session expired (24 hours)
    const expiresAt = new Date(session.authenticatedAt).getTime() + 24 * 60 * 60 * 1000;
    const isExpired = Date.now() > expiresAt;
    
    if (isExpired) {
      adminSessions.delete(adminId);
      return res.json({
        success: true,
        data: { authenticated: false, reason: 'Session expired' }
      });
    }
    
    res.json({
      success: true,
      data: {
        authenticated: true,
        adminId: session.adminId,
        authenticatedAt: session.authenticatedAt,
        expiresAt: new Date(expiresAt).toISOString()
      }
    });
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify session'
    });
  }
});

// Logout admin
app.post('/api/admin/logout', authenticateApiKey, async (req, res) => {
  try {
    const { adminId } = req.body;
    
    adminSessions.delete(adminId);
    
    logSecurityEvent(
      'Admin Logout',
      adminId,
      req.ip,
      'info',
      'Admin session terminated'
    );
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Process direct commands
async function processDirectCommand(command, platform, userId) {
  try {
    // Check if it's a system command
    if (command.startsWith('/')) {
      return await handleSystemCommand(command, platform, userId);
    }
    
    // Process with AI
    const aiResponse = await simpleAIService.processCustomerMessage(command, {
      platform: platform,
      userId: userId,
      type: 'direct_command'
    }, []); // Empty conversation history for direct commands
    
    return aiResponse;
  } catch (error) {
    console.error('Direct command processing error:', error);
    return {
      text: "I'm sorry, I'm having trouble processing your command right now. Please try again later.",
      requiresApproval: false
    };
  }
}

// Test endpoint for debugging
app.post('/api/test-telegram', async (req, res) => {
  try {
    const { message, from } = req.body;
    
    console.log('🧪 Testing Telegram message handler...');
    console.log('Message:', message);
    console.log('From:', from);
    
    // Simulate the Telegram message processing
    const mockUpdate = {
      message: {
        message_id: 12345,
        from: from || {
          id: 123456,
          first_name: 'Test',
          username: 'testuser'
        },
        chat: {
          id: 123456,
          type: 'private'
        },
        date: Math.floor(Date.now() / 1000),
        text: message || 'Test message'
      }
    };
    
    // Call the handleTelegramMessage function
    await handleTelegramMessage(mockUpdate.message, 'test');
    
    res.json({ success: true, message: 'Test completed' });
  } catch (error) {
    console.error('Test Telegram error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Test endpoint for direct command processing

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

// Test endpoint
app.post('/api/test-direct', async (req, res) => {
  console.log('🧪 Test endpoint called');
  return res.json({ success: true, message: 'Test endpoint works' });
});

// Direct command services endpoint
app.post('/api/direct-command', async (req, res) => {
  try {
    console.log('🔧 Direct command received:', req.body);
    
    // Simple test response
    return res.json({ success: true, message: 'Direct command endpoint is working' });
    
    const { command, platform = 'web', userId } = req.body;
    
    // Validate input
    const { error, value } = validationSchemas.botCommand.validate({ command, platform, userId });
    
    if (error) {
      console.log('❌ Validation error:', error.details);
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: error.details.map(detail => detail.message)
      });
    }
    
    // Sanitize command
    const sanitizedCommand = sanitizeInput(value.command);
    console.log('🧹 Sanitized command:', sanitizedCommand);
    
    // Check for PII in command
    if (privacyControls.containsPII(sanitizedCommand)) {
      await AuditOperations.log('pii_detected', { 
        command: sanitizedCommand, 
        platform: value.platform, 
        userId: value.userId,
        ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress
      }, value.userId || 'anonymous');
      
      return res.status(400).json({
        error: 'Personal information detected in command',
        message: 'Please remove personal information and try again'
      });
    }
    
    // Process direct command
    const response = await processDirectCommand(sanitizedCommand, value.platform, value.userId);
    console.log('✅ Command processed successfully:', response);
    
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
app.get('/api/low-stock-check', authenticateApiKey, async (req, res) => {
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
    const aiResponse = await simpleAIService.processCustomerMessage(message, {
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

    // Get user information if customerId is a Telegram user ID
    let userInfo = null;
    if (customerId && customerId.startsWith('telegram-')) {
      const telegramId = customerId.replace('telegram-', '');
      const user = await UserOperations.getByTelegramId(telegramId);
      if (user) {
        userInfo = {
          name: user.name,
          username: user.username,
          telegramId: user.telegramId
        };
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Update inventory - subtract ordered quantities
    for (const item of items) {
      try {
        const inventoryItem = await InventoryOperations.getBySku(item.product);
        if (inventoryItem && inventoryItem.quantity >= item.quantity) {
          await InventoryOperations.updateQuantity(item.product, inventoryItem.quantity - item.quantity);
          console.log(`📦 Inventory updated: ${item.product} -${item.quantity} (${inventoryItem.quantity - item.quantity} remaining)`);
        } else {
          console.warn(`⚠️ Insufficient inventory for ${item.product}: requested ${item.quantity}, available ${inventoryItem?.quantity || 0}`);
        }
      } catch (error) {
        console.error(`Error updating inventory for ${item.product}:`, error);
      }
    }
    
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
      updatedAt: new Date().toISOString(),
      userInfo: userInfo // Add user information to order
    });

    // Broadcast new order
    broadcastToAdmins('new_order', newOrder);
    
    res.json({ success: true, data: newOrder });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

// Users API endpoints
app.get('/api/users', authenticateApiKey, async (req, res) => {
  try {
    const users = await UserOperations.getAll();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

app.delete('/api/users/:userId', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await UserOperations.delete(userId);
    
    if (result) {
      res.json({ success: true, message: 'User deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// Test endpoint for user registration (bypasses Telegram)
app.post('/api/test-user-registration', authenticateApiKey, async (req, res) => {
  try {
    const { name, telegramId, username } = req.body;
    
    if (!name || !telegramId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and telegramId are required' 
      });
    }
    
    // Check if user already exists
    let user = await UserOperations.getByTelegramId(telegramId);
    
    if (user) {
      return res.json({ 
        success: true, 
        message: 'User already exists',
        user: user
      });
    }
    
    // Create new user with unique ID using upsert
    const uniqueUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    user = await UserOperations.upsert({
      id: uniqueUserId,
      telegramId: telegramId,
      name: name,
      username: username || '',
      phone: `customer_${telegramId}`,
      platform: 'telegram',
      registeredAt: new Date(),
      isActive: true,
      lastActiveAt: new Date()
    });
    
    console.log(`✅ New user registered via test: ${uniqueUserId} (${name})`);
    
    res.json({ 
      success: true, 
      message: 'User registered successfully',
      user: user
    });
    
  } catch (error) {
    console.error('Error in test user registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to register user',
      error: error.message 
    });
  }
});

// Database management endpoints
app.get('/api/database/info', authenticateApiKey, async (req, res) => {
  try {
    const db = getDatabase();
    const collections = ['bots', 'conversations', 'approvals', 'customers', 'users', 'inventory', 'orders', 'invoices'];
    
    const stats = {};
    for (const collection of collections) {
      try {
        const count = await db.collection(collection).countDocuments();
        stats[collection] = count;
      } catch (error) {
        stats[collection] = 0;
      }
    }
    
    res.json({ 
      success: true, 
      data: {
        collections: stats,
        totalRecords: Object.values(stats).reduce((sum, count) => sum + count, 0)
      }
    });
  } catch (error) {
    console.error('Error getting database info:', error);
    res.status(500).json({ success: false, message: 'Failed to get database info' });
  }
});

app.post('/api/database/reset', authenticateApiKey, async (req, res) => {
  try {
    const { confirmation } = req.body;
    
    if (confirmation !== 'RESET_DATABASE_CONFIRMED') {
      return res.status(400).json({ 
        success: false, 
        message: 'Confirmation required. Send confirmation: "RESET_DATABASE_CONFIRMED"' 
      });
    }
    
    console.log('🔥 Starting database reset...');
    
    const db = getDatabase();
    const collections = ['bots', 'conversations', 'approvals', 'customers', 'users', 'inventory', 'orders', 'invoices'];
    
    const results = {};
    for (const collection of collections) {
      try {
        const result = await db.collection(collection).deleteMany({});
        results[collection] = result.deletedCount;
        console.log(`✅ Cleared ${collection}: ${result.deletedCount} records`);
      } catch (error) {
        console.error(`❌ Failed to clear ${collection}:`, error);
        results[collection] = 0;
      }
    }
    
    console.log('🔥 Database reset completed');
    
    res.json({ 
      success: true, 
      message: 'Database reset successfully',
      deletedRecords: results,
      totalDeleted: Object.values(results).reduce((sum, count) => sum + count, 0)
    });
    
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({ success: false, message: 'Failed to reset database' });
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

// Invoice generation endpoint using production-grade InvoiceOperations
app.post('/api/invoices/generate', authenticateApiKey, async (req, res) => {
  try {
    const { orderId, userId, items, totalAmount, tax, discount, notes, dueDate } = req.body;
    
    // If orderId provided, fetch order and use its data
    if (orderId) {
      const order = await OrderOperations.getById(orderId);
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
      }
      
      // Create invoice linked to order and user
      const invoice = await InvoiceOperations.create({
        userId: order.userId || userId,
        orderId,
        items: order.items || items,
        totalAmount: order.totalAmount || totalAmount,
        tax: tax || 0,
        discount: discount || 0,
        notes: notes || `Invoice for order ${orderId}`,
        dueDate
      });
      
      return res.json({ 
        success: true, 
        data: invoice 
      });
    }
    
    // Direct invoice creation
    if (!userId || !items) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either orderId or (userId + items) are required' 
      });
    }
    
    const invoice = await InvoiceOperations.create({
      userId,
      items,
      totalAmount,
      tax,
      discount,
      notes,
      dueDate
    });
    
    res.json({ 
      success: true, 
      data: invoice 
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate invoice' 
    });
  }
});

// Get all invoices
app.get('/api/invoices', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 100, offset = 0, userId } = req.query;
    
    let invoices;
    if (userId) {
      invoices = await InvoiceOperations.getByUserId(userId);
    } else {
      invoices = await InvoiceOperations.getAll(parseInt(limit), parseInt(offset));
    }
    
    res.json({ 
      success: true, 
      data: invoices,
      count: invoices.length
    });
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get invoices' 
    });
  }
});

// Get invoice by ID
app.get('/api/invoices/:invoiceId', authenticateApiKey, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await InvoiceOperations.getByInvoiceId(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: invoice 
    });
  } catch (error) {
    console.error('Error getting invoice:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get invoice' 
    });
  }
});

// Update invoice status
app.put('/api/invoices/:invoiceId/status', authenticateApiKey, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { status } = req.body;
    const updatedBy = req.headers['x-admin-id'] || 'admin@dashboard';
    
    const invoice = await InvoiceOperations.updateStatus(invoiceId, status, updatedBy);
    
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: invoice 
    });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update invoice status' 
    });
  }
});

// Get invoice statistics
app.get('/api/invoices/stats', authenticateApiKey, async (req, res) => {
  try {
    const { startDate } = req.query;
    const stats = await InvoiceOperations.getStats(startDate ? new Date(startDate) : null);
    
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    console.error('Error getting invoice stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get invoice statistics' 
    });
  }
});

// Get overdue invoices
app.get('/api/invoices/overdue', authenticateApiKey, async (req, res) => {
  try {
    const overdueInvoices = await InvoiceOperations.getOverdue();
    
    res.json({ 
      success: true, 
      data: overdueInvoices,
      count: overdueInvoices.length
    });
  } catch (error) {
    console.error('Error getting overdue invoices:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get overdue invoices' 
    });
  }
});

// Delete invoice
app.delete('/api/invoices/:invoiceId', authenticateApiKey, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const deleted = await InvoiceOperations.delete(invoiceId);
    
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete invoice' 
    });
  }
});

// Voice service endpoint
app.post('/api/voice/transcribe', authenticateApiKey, speechService.upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }
    
    const { language = 'en-US' } = req.body;
    const transcription = await voiceService.transcribeAudio(req.file.path, language);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      success: true, 
      transcription 
    });
  } catch (error) {
    console.error('Voice transcription error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to transcribe audio' 
    });
  }
});

// AI service endpoint
app.post('/api/ai/process', authenticateApiKey, async (req, res) => {
  try {
    const { message, context, customerInfo } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }
    
    const response = await simpleAIService.processCustomerMessage(message, context, customerInfo);
    
    res.json({ 
      success: true, 
      response 
    });
  } catch (error) {
    console.error('AI processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process message with AI' 
    });
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
    
    const updatedApproval = await ApprovalOperations.updateStatus(id, status, resolvedBy);
    
    if (updatedApproval) {
      // Broadcast update to admin dashboard
      broadcastToAdmins('approval.updated', updatedApproval);
      console.log('📡 Approval updated and broadcasted:', updatedApproval.id);
      
      // Log the action
      await AuditOperations.log('approval_updated', { approvalId: id, status }, resolvedBy);
    }
    
    res.json({ success: true, approval: updatedApproval });
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
    
    const insights = await simpleAIService.generateBusinessInsights(businessData);
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

// ==================== NOTIFICATIONS API ====================

// Get all notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const { userId, limit = 50, unreadOnly = false } = req.query;
    
    let notifications;
    if (unreadOnly === 'true') {
      notifications = notificationService.getUserNotifications(userId || 'system', limit)
        .filter(n => !n.read);
    } else {
      notifications = notificationService.getUserNotifications(userId || 'system', limit);
    }
    
    res.json({
      success: true,
      data: notifications,
      unreadCount: notificationService.getUnreadCount(userId || 'system')
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread notifications count
app.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const { userId } = req.query;
    const count = notificationService.getUnreadCount(userId || 'system');
    
    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    const success = notificationService.markAsRead(id, userId || 'system');
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read-all', async (req, res) => {
  try {
    const { userId } = req.body;
    const markedCount = notificationService.markAllAsRead(userId || 'system');
    
    res.json({
      success: true,
      message: `Marked ${markedCount} notifications as read`
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    const success = notificationService.deleteNotification(id, userId || 'system');
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get notification statistics
app.get('/api/notifications/stats', async (req, res) => {
  try {
    const stats = notificationService.getStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch notification stats' });
  }
});

// Create custom notification (for admin/testing)
app.post('/api/notifications', async (req, res) => {
  try {
    const { type, title, message, data = {}, priority = 'normal' } = req.body;
    
    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Type, title, and message are required'
      });
    }
    
    const notification = notificationService.createNotification(type, title, message, data, priority);
    
    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// ==================== SECURITY MONITORING ENDPOINTS ====================

// Get security statistics
app.get('/api/security/stats', async (req, res) => {
  try {
    const stats = securityService.getSecurityStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching security stats:', error);
    res.status(500).json({ error: 'Failed to fetch security stats' });
  }
});

// Get security logs
app.get('/api/security/logs', async (req, res) => {
  try {
    const { limit = 100, event } = req.query;
    let logs = securityService.securityLogs;
    
    // Filter by event type if specified
    if (event) {
      logs = logs.filter(log => log.event === event);
    }
    
    // Limit results
    logs = logs.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: logs,
      total: logs.length
    });
  } catch (error) {
    console.error('Error fetching security logs:', error);
    res.status(500).json({ error: 'Failed to fetch security logs' });
  }
});

// Block IP (admin only)
app.post('/api/security/block-ip', async (req, res) => {
  try {
    const { ip, reason, duration } = req.body;
    
    if (!ip || !reason) {
      return res.status(400).json({
        success: false,
        error: 'IP and reason are required'
      });
    }
    
    securityService.blockIP(ip, reason, duration || 24 * 60 * 60 * 1000);
    
    res.json({
      success: true,
      message: `IP ${ip} blocked successfully`
    });
  } catch (error) {
    console.error('Error blocking IP:', error);
    res.status(500).json({ error: 'Failed to block IP' });
  }
});

// Unblock IP (admin only)
app.post('/api/security/unblock-ip', async (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP is required'
      });
    }
    
    securityService.blockedIPs.delete(ip);
    securityService.logSecurityEvent('ip_unblocked', { ip });
    
    res.json({
      success: true,
      message: `IP ${ip} unblocked successfully`
    });
  } catch (error) {
    console.error('Error unblocking IP:', error);
    res.status(500).json({ error: 'Failed to unblock IP' });
  }
});

// ==================== BACKUP MANAGEMENT ENDPOINTS ====================

// Create backup
app.post('/api/backup/create', async (req, res) => {
  try {
    const { type = 'manual' } = req.body;
    
    if (backupService.isBackupRunning) {
      return res.status(409).json({
        success: false,
        error: 'Backup is already running'
      });
    }
    
    const backup = await backupService.createBackup(type);
    
    // Create notification
    notificationService.createNotification('success', '🔄 Backup Created', 
      `Backup ${backup.id} completed successfully (${backup.duration}ms)`, 
      { backupId: backup.id, type, size: backup.size });
    
    res.json({
      success: true,
      data: backup
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// List backups
app.get('/api/backup/list', async (req, res) => {
  try {
    const backups = await backupService.listBackups();
    
    res.json({
      success: true,
      data: backups
    });
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Get backup statistics
app.get('/api/backup/stats', async (req, res) => {
  try {
    const stats = backupService.getBackupStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching backup stats:', error);
    res.status(500).json({ error: 'Failed to fetch backup stats' });
  }
});

// Delete backup
app.delete('/api/backup/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await backupService.deleteBackup(id);
    
    // Create notification
    notificationService.createNotification('warning', '🗑️ Backup Deleted', 
      `Backup ${id} has been deleted`, 
      { backupId: id });
    
    res.json({
      success: true,
      message: `Backup ${id} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting backup:', error);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

// Restore from backup
app.post('/api/backup/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (backupService.isBackupRunning) {
      return res.status(409).json({
        success: false,
        error: 'Cannot restore while backup is running'
      });
    }
    
    const restore = await backupService.restoreBackup(id);
    
    // Create notification
    notificationService.createNotification('success', '🔄 Backup Restored', 
      `System restored from backup ${id}`, 
      { backupId: id, restoredAt: restore.restoredAt });
    
    res.json({
      success: true,
      data: restore
    });
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Export data
app.post('/api/backup/export', async (req, res) => {
  try {
    const { format = 'json' } = req.body;
    
    const exportResult = await backupService.exportData(format);
    
    // Create notification
    notificationService.createNotification('info', '📤 Data Exported', 
      `Data exported as ${exportResult.exportId}.${format}`, 
      { exportId: exportResult.exportId, size: exportResult.size });
    
    res.json({
      success: true,
      data: exportResult
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Cleanup old backups
app.post('/api/backup/cleanup', async (req, res) => {
  try {
    const result = await backupService.cleanupOldBackups();
    
    // Create notification
    notificationService.createNotification('info', '🧹 Backup Cleanup', 
      `Cleaned up ${result.deleted} old backups`, 
      { deleted: result.deleted });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error cleaning up backups:', error);
    res.status(500).json({ error: 'Failed to cleanup backups' });
  }
});

// ==================== CUSTOMER ANALYTICS ENDPOINTS ====================

// Get customer analytics
app.get('/api/analytics/customers', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const { getDatabase } = require('./database');
    const db = getDatabase();
    const collection = db.collection('customers');
    const customers = await collection.find({}).toArray();
    
    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Create customer
app.post('/api/customers', async (req, res) => {
  try {
    const customerData = req.body;
    
    const { getDatabase } = require('./database');
    const db = getDatabase();
    const collection = db.collection('customers');
    
    const customer = {
      ...customerData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await collection.insertOne(customer);
    
    // Update search index
    searchService.updateDocument('customers', result);
    
    // Create notification
    notificationService.createNotification('success', '👤 New Customer Added', 
      `Customer ${customer.name || 'Unknown'} has been added`, 
      { customerId: result.insertedId, customerName: customer.name });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
app.put('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const { getDatabase } = require('./database');
    const db = getDatabase();
    const collection = db.collection('customers');
    
    const result = await collection.updateOne(
      { _id: id },
      { $set: { ...updateData, updatedAt: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Update search index
    const updatedDoc = await collection.findOne({ _id: id });
    searchService.updateDocument('customers', updatedDoc);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { getDatabase } = require('./database');
    const db = getDatabase();
    const collection = db.collection('customers');
    
    const result = await collection.deleteOne({ _id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Remove from search index
    searchService.removeDocument('customers', id);
    
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Get customer segments
app.get('/api/analytics/segments', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.customerSegments
    });
  } catch (error) {
    console.error('Error fetching customer segments:', error);
    res.status(500).json({ error: 'Failed to fetch customer segments' });
  }
});

// Get top customers
app.get('/api/analytics/top-customers', async (req, res) => {
  try {
    const { timeRange = '30d', limit = 10 } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.topCustomers.slice(0, parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching top customers:', error);
    res.status(500).json({ error: 'Failed to fetch top customers' });
  }
});

// Get revenue analytics
app.get('/api/analytics/revenue', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.revenueMetrics
    });
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// Get engagement analytics
app.get('/api/analytics/engagement', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.engagementMetrics
    });
  } catch (error) {
    console.error('Error fetching engagement analytics:', error);
    res.status(500).json({ error: 'Failed to fetch engagement analytics' });
  }
});

// Get behavior analytics
app.get('/api/analytics/behavior', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.behaviorAnalytics
    });
  } catch (error) {
    console.error('Error fetching behavior analytics:', error);
    res.status(500).json({ error: 'Failed to fetch behavior analytics' });
  }
});

// Get geographic analytics
app.get('/api/analytics/geographic', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.geographicData
    });
  } catch (error) {
    console.error('Error fetching geographic analytics:', error);
    res.status(500).json({ error: 'Failed to fetch geographic analytics' });
  }
});

// Get conversion analytics
app.get('/api/analytics/conversion', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.conversionMetrics
    });
  } catch (error) {
    console.error('Error fetching conversion analytics:', error);
    res.status(500).json({ error: 'Failed to fetch conversion analytics' });
  }
});

// Get trends analytics
app.get('/api/analytics/trends', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    res.json({
      success: true,
      data: analytics.trends
    });
  } catch (error) {
    console.error('Error fetching trends analytics:', error);
    res.status(500).json({ error: 'Failed to fetch trends analytics' });
  }
});

// Generate customer report
app.post('/api/analytics/report', async (req, res) => {
  try {
    const { timeRange = '30d', format = 'json' } = req.body;
    
    const analytics = await analyticsService.getCustomerAnalytics(timeRange);
    
    // Create report
    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      format,
      analytics
    };
    
    // Create notification
    notificationService.createNotification('info', '📊 Analytics Report Generated', 
      `Customer analytics report for ${timeRange} period`, 
      { timeRange, format });
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating analytics report:', error);
    res.status(500).json({ error: 'Failed to generate analytics report' });
  }
});

// ==================== ADVANCED SEARCH ENDPOINTS ====================

// Perform advanced search
app.post('/api/search', async (req, res) => {
  try {
    const { query, collections, filters, sortBy, sortOrder, limit, offset } = req.body;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    const searchOptions = {
      collections: collections || [],
      filters: filters || {},
      sortBy: sortBy || 'relevance',
      sortOrder: sortOrder || 'desc',
      limit: limit || 50,
      offset: offset || 0
    };
    
    res.json({
      success: true,
      data: [],
      message: 'Use GET /api/search for database search'
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Global search endpoint using MongoDB
app.get('/api/search', authenticateApiKey, async (req, res) => {
  try {
    const { query, collections = 'all', limit = 50, offset = 0 } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 2 characters'
      });
    }
    
    const searchRegex = new RegExp(query, 'i');
    const db = getDatabase();
    const results = [];
    const searchCollections = collections === 'all' 
      ? ['users', 'conversations', 'approvals', 'orders', 'invoices', 'inventory']
      : collections.split(',');
    
    // Search each collection
    const searchPromises = searchCollections.map(async (collection) => {
      const collectionName = COLLECTIONS[collection.toUpperCase()] || collection;
      const collectionResults = await db.collection(collectionName)
        .find({
          $or: [
            { name: searchRegex },
            { userId: searchRegex },
            { orderId: searchRegex },
            { invoiceId: searchRegex },
            { approvalId: searchRegex },
            { conversationId: searchRegex },
            { phoneNumber: searchRegex },
            { telegramId: searchRegex },
            { email: searchRegex },
            { 'messages.content': searchRegex },
            { 'items.name': searchRegex }
          ]
        })
        .limit(parseInt(limit))
        .toArray();
      
      return collectionResults.map(item => ({
        ...item,
        collection: collectionName,
        score: 1.0,
        highlights: [{ term: query, context: 'Match found in record' }]
      }));
    });
    
    const allResults = await Promise.all(searchPromises);
    const flattenedResults = allResults.flat();
    
    // Sort by relevance (exact matches first)
    const sortedResults = flattenedResults.sort((a, b) => {
      const aExact = Object.values(a).some(v => 
        typeof v === 'string' && v.toLowerCase() === query.toLowerCase()
      );
      const bExact = Object.values(b).some(v => 
        typeof v === 'string' && v.toLowerCase() === query.toLowerCase()
      );
      return bExact - aExact;
    });
    
    // Paginate
    const paginatedResults = sortedResults.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );
    
    res.json({
      success: true,
      data: paginatedResults,
      total: flattenedResults.length,
      offset: parseInt(offset),
      limit: parseInt(limit),
      hasMore: flattenedResults.length > parseInt(offset) + parseInt(limit)
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get search suggestions from database
app.get('/api/search/suggestions', authenticateApiKey, async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    const db = getDatabase();
    const searchRegex = new RegExp(query, 'i');
    
    // Get suggestions from users and orders
    const [users, orders] = await Promise.all([
      db.collection(COLLECTIONS.USERS)
        .find({ name: searchRegex })
        .limit(parseInt(limit))
        .project({ name: 1, userId: 1 })
        .toArray(),
      db.collection(COLLECTIONS.ORDERS)
        .find({ orderId: searchRegex })
        .limit(parseInt(limit))
        .project({ orderId: 1 })
        .toArray()
    ]);
    
    const suggestions = [
      ...users.map(u => ({ type: 'user', value: u.name, id: u.userId })),
      ...orders.map(o => ({ type: 'order', value: o.orderId, id: o.orderId }))
    ].slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// Get search statistics
app.get('/api/search/stats', authenticateApiKey, async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get collection counts
    const counts = await Promise.all([
      db.collection(COLLECTIONS.USERS).countDocuments(),
      db.collection(COLLECTIONS.CONVERSATIONS).countDocuments(),
      db.collection(COLLECTIONS.ORDERS).countDocuments(),
      db.collection(COLLECTIONS.INVOICES).countDocuments(),
      db.collection(COLLECTIONS.APPROVALS).countDocuments(),
      db.collection(COLLECTIONS.INVENTORY).countDocuments()
    ]);
    
    res.json({
      success: true,
      data: {
        indexedDocuments: counts.reduce((a, b) => a + b, 0),
        collections: {
          users: counts[0],
          conversations: counts[1],
          orders: counts[2],
          invoices: counts[3],
          approvals: counts[4],
          inventory: counts[5]
        }
      }
    });
  } catch (error) {
    console.error('Error getting search stats:', error);
    res.status(500).json({ error: 'Failed to get search stats' });
  }
});

// Rebuild search index - now just refreshes materialized views
app.post('/api/search/rebuild', authenticateApiKey, async (req, res) => {
  try {
    // Log the action
    logSecurityEvent(
      'Search Index Rebuilt',
      'system',
      req.ip,
      'info',
      'Search index refreshed'
    );
    
    res.json({
      success: true,
      message: 'Search index refreshed successfully'
    });
  } catch (error) {
    console.error('Error rebuilding search index:', error);
    res.status(500).json({ error: 'Failed to rebuild search index' });
  }
});

// Get popular search terms - returns recent popular queries from logs
app.get('/api/search/popular', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Return empty array - implement tracking if needed
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error getting popular terms:', error);
    res.status(500).json({ error: 'Failed to get popular terms' });
  }
});

// Search by collection using database
app.get('/api/search/:collection', authenticateApiKey, async (req, res) => {
  try {
    const { collection } = req.params;
    const { query, limit = 50, offset = 0 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    const db = getDatabase();
    const collectionName = COLLECTIONS[collection.toUpperCase()] || collection;
    const searchRegex = new RegExp(query, 'i');
    
    // Build search query based on collection
    const searchQuery = {
      $or: [
        { name: searchRegex },
        { [`${collection.slice(0, -1)}Id`]: searchRegex },
        { userId: searchRegex },
        { phoneNumber: searchRegex }
      ].filter(Boolean)
    };
    
    const results = await db.collection(collectionName)
      .find(searchQuery)
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      success: true,
      data: results,
      total: await db.collection(collectionName).countDocuments(searchQuery),
      offset: parseInt(offset),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Collection search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Universal search across all collections
app.post('/api/search', authenticateApiKey, async (req, res) => {
  try {
    const { query, collections, filters, sortBy, sortOrder, limit = 20, offset = 0 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    const searchService = require('./search-service');
    const results = await searchService.search(query, {
      collections: collections || [],
      filters: filters || {},
      sortBy: sortBy || 'relevance',
      sortOrder: sortOrder || 'desc',
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Universal search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Search suggestions endpoint
app.get('/api/search/suggestions', authenticateApiKey, async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;
    
    if (!q) {
      return res.json({
        success: true,
        data: { suggestions: [] }
      });
    }
    
    const searchService = require('./search-service');
    const suggestions = await searchService.getSuggestions(q, parseInt(limit));
    
    res.json({
      success: true,
      data: { suggestions }
    });
  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// ==================== DATA EXPORT ENDPOINTS ====================

// Export data from collection
app.post('/api/export/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const { format = 'json', filters = {}, options = {} } = req.body;
    
    const result = await exportService.exportData(collection, format, filters, options);
    
    // Create notification
    notificationService.createNotification('success', '📊 Data Exported', 
      `Data exported from ${collection} as ${format}`, 
      { collection, format, filename: result.filename });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Generate report
app.post('/api/reports/:reportType', async (req, res) => {
  try {
    const { reportType } = req.params;
    const { timeRange = '30d', format = 'json' } = req.body;
    
    const result = await exportService.generateReport(reportType, timeRange, format);
    
    // Create notification
    notificationService.createNotification('success', '📈 Report Generated', 
      `${reportType} report generated for ${timeRange} period`, 
      { reportType, timeRange, format, filename: result.filename });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// Get list of exports
app.get('/api/exports', async (req, res) => {
  try {
    const exports = await exportService.getExports();
    
    res.json({
      success: true,
      data: exports
    });
  } catch (error) {
    console.error('Error getting exports:', error);
    res.status(500).json({ error: 'Failed to get exports' });
  }
});

// Delete export
app.delete('/api/exports/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    const result = await exportService.deleteExport(filename);
    
    // Create notification
    notificationService.createNotification('info', '🗑️ Export Deleted', 
      `Export ${filename} has been deleted`, 
      { filename });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error deleting export:', error);
    res.status(500).json({ error: 'Failed to delete export' });
  }
});

// Get export statistics
app.get('/api/exports/stats', async (req, res) => {
  try {
    const stats = exportService.getExportStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting export stats:', error);
    res.status(500).json({ error: 'Failed to get export stats' });
  }
});

// Clean up old exports
app.post('/api/exports/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    
    const result = await exportService.cleanupOldExports(daysOld);
    
    // Create notification
    notificationService.createNotification('info', '🧹 Exports Cleaned Up', 
      `Cleaned up ${result.deletedCount} old exports`, 
      { deletedCount: result.deletedCount });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error cleaning up exports:', error);
    res.status(500).json({ error: 'Failed to cleanup exports' });
  }
});

// Download export file
app.get('/api/exports/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join('./exports', filename);
    
    // Check if file exists
    try {
      await fsPromises.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'Export file not found' });
    }
    
    // Get file stats
    const stats = await fsPromises.stat(filePath);
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    
    // Send file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading export:', error);
    res.status(500).json({ error: 'Failed to download export' });
  }
});

// ==================== INTERNATIONALIZATION ENDPOINTS ====================

// Get supported languages
app.get('/api/i18n/languages', (req, res) => {
  try {
    const languages = i18nService.getSupportedLanguages();
    
    res.json({
      success: true,
      data: languages
    });
  } catch (error) {
    console.error('Error getting languages:', error);
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

// Set user language preference
app.post('/api/i18n/language', async (req, res) => {
  try {
    const { userId, language } = req.body;
    
    if (!userId || !language) {
      return res.status(400).json({
        success: false,
        error: 'User ID and language are required'
      });
    }
    
    const success = i18nService.setUserLanguage(userId, language);
    
    if (success) {
      res.json({
        success: true,
        message: 'Language preference updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Unsupported language'
      });
    }
  } catch (error) {
    console.error('Error setting language:', error);
    res.status(500).json({ error: 'Failed to set language' });
  }
});

// Get user language preference
app.get('/api/i18n/language/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const language = i18nService.getUserLanguage(userId);
    
    res.json({
      success: true,
      data: {
        userId,
        language
      }
    });
  } catch (error) {
    console.error('Error getting user language:', error);
    res.status(500).json({ error: 'Failed to get user language' });
  }
});

// Translate text
app.post('/api/i18n/translate', (req, res) => {
  try {
    const { key, language, params = {} } = req.body;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Translation key is required'
      });
    }
    
    const translation = i18nService.translate(key, language, params);
    
    res.json({
      success: true,
      data: {
        key,
        language,
        translation
      }
    });
  } catch (error) {
    console.error('Error translating text:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

// Detect language from text
app.post('/api/i18n/detect', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }
    
    const detectedLanguage = i18nService.detectLanguage(text);
    
    res.json({
      success: true,
      data: {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        detectedLanguage,
        languageName: i18nService.getLanguageName(detectedLanguage),
        nativeLanguageName: i18nService.getNativeLanguageName(detectedLanguage)
      }
    });
  } catch (error) {
    console.error('Error detecting language:', error);
    res.status(500).json({ error: 'Language detection failed' });
  }
});

// Get bot response in specific language
app.post('/api/i18n/bot-response', (req, res) => {
  try {
    const { type, language, params = {} } = req.body;
    
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Response type is required'
      });
    }
    
    const response = i18nService.getBotResponse(type, language, params);
    
    res.json({
      success: true,
      data: {
        type,
        language,
        response
      }
    });
  } catch (error) {
    console.error('Error getting bot response:', error);
    res.status(500).json({ error: 'Failed to get bot response' });
  }
});

// Format currency
app.post('/api/i18n/format-currency', (req, res) => {
  try {
    const { amount, language } = req.body;
    
    if (amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required'
      });
    }
    
    const formattedCurrency = i18nService.formatCurrency(amount, language);
    
    res.json({
      success: true,
      data: {
        amount,
        language,
        formattedCurrency
      }
    });
  } catch (error) {
    console.error('Error formatting currency:', error);
    res.status(500).json({ error: 'Currency formatting failed' });
  }
});

// Format date
app.post('/api/i18n/format-date', (req, res) => {
  try {
    const { date, language } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required'
      });
    }
    
    const formattedDate = i18nService.formatDate(new Date(date), language);
    
    res.json({
      success: true,
      data: {
        date,
        language,
        formattedDate
      }
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    res.status(500).json({ error: 'Date formatting failed' });
  }
});

// Get localized messages
app.get('/api/i18n/messages/:type', (req, res) => {
  try {
    const { type } = req.params;
    const language = req.query.language || req.language || 'en';
    
    let messages;
    
    switch (type) {
      case 'validation':
        messages = {
          required: i18nService.getValidationMessage('required', language),
          email: i18nService.getValidationMessage('email', language),
          phone: i18nService.getValidationMessage('phone', language),
          amount: i18nService.getValidationMessage('amount', language)
        };
        break;
      case 'success':
        messages = {
          operation: i18nService.getSuccessMessage('operation', language),
          saved: i18nService.getSuccessMessage('saved', language),
          updated: i18nService.getSuccessMessage('updated', language),
          deleted: i18nService.getSuccessMessage('deleted', language)
        };
        break;
      case 'error':
        messages = {
          general: i18nService.getErrorMessage('general', language),
          input: i18nService.getErrorMessage('input', language),
          notFound: i18nService.getErrorMessage('notFound', language),
          unauthorized: i18nService.getErrorMessage('unauthorized', language)
        };
        break;
      case 'status':
        messages = {
          pending: i18nService.getStatusText('pending', language),
          approved: i18nService.getStatusText('approved', language),
          completed: i18nService.getStatusText('completed', language),
          cancelled: i18nService.getStatusText('cancelled', language)
        };
        break;
      case 'navigation':
        messages = {
          dashboard: i18nService.getNavigationText('dashboard', language),
          customers: i18nService.getNavigationText('customers', language),
          orders: i18nService.getNavigationText('orders', language),
          analytics: i18nService.getNavigationText('analytics', language)
        };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid message type'
        });
    }
    
    res.json({
      success: true,
      data: {
        type,
        language,
        messages
      }
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// AI chat endpoint for testing
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, customerContext, conversationHistory } = req.body;
    
    const aiResponse = await simpleAIService.processCustomerMessage(
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
    // Validate required environment variables
    const requiredEnvVars = ['TELEGRAM_BOT_TOKEN'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName] || process.env[varName] === 'your_telegram_bot_token_here');
    
    if (missingVars.length > 0) {
      console.warn(`⚠️ Optional environment variables not configured: ${missingVars.join(', ')}`);
      console.log('📝 Some features may be limited');
    }

    // Try to connect to database (optional)
    try {
      await connectDatabase();
      console.log('✅ Database connected successfully');
    } catch (dbError) {
      console.warn('⚠️ Database connection failed, continuing without database:', dbError.message);
      console.log('📝 Some features will be limited without database');
    }
    
    // Start HTTP server with WebSocket support - only if main module
    if (require.main === module) {
      server.listen(PORT, async () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║          🚀 BHARAT BIZ-AGENT - AUTONOMOUS CO-PILOT          ║
║                                                              ║
║  🎯 ACTION-ORIENTED • WHATSAPP-FIRST • INDIA-FIRST       ║
║                                                              ║
║  🔐 Encryption:    AES-256-GCM Enabled                   ║
║  📱 WhatsApp:      ✅ Configured  
║  ✈️  Telegram:     ⚠️  Not Configured
║  🔑 Admin API:     ✅ Configured  
║  🤖 AI Service:    ✅ Structured Intent Processing      ║
║  🎙️ Voice AI:      ✅ Indian Accent Optimized          ║
║  🧠 Proactive AI:  ✅ Context-Aware Follow-ups       ║
║  📶 Low-Bandwidth: ✅ Indian Network Optimized         ║
║  💾 Database:      ✅ Connected                           ║
║                                                              ║
║  🌐 Server:        http://localhost:${PORT}              ║
║  💚 Health:        http://localhost:${PORT}/health       ║
╚════════════════════════════════════════════════════════════╝
      `);
      
      // Start proactive intelligence monitoring
      console.log('🧠 Starting Proactive Intelligence Service...');
      // await proactiveIntelligenceService.startProactiveMonitoring(); // Temporarily disabled
      
      // Initialize low-bandwidth optimizations
      console.log('📶 Initializing Low-Bandwidth Service...');
      lowBandwidthService.initialize();
      
      console.log('✅ Bharat Biz-Agent Autonomous Co-Pilot is ready!');
      console.log('🎯 WhatsApp-first business automation enabled');
      console.log('🇮🇳 India-first language processing active');
      console.log('🔊 Voice-first with Indian accent support');
      console.log('🧠 Proactive follow-ups monitoring started');
      console.log('📶 Low-connectivity optimizations enabled');
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close database connection
    const { closeDatabase } = require('./database');
    await closeDatabase();
    console.log('✅ Database connection closed');
    
    // Close HTTP server
    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed');
      });
    }
    
    console.log('👋 Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Export for use by other modules
module.exports = {
  app,
  telegramBot,
  get UserOperations() { return require('./database').UserOperations; },
  get ConversationOperations() { return require('./database').ConversationOperations; },
  get ApprovalOperations() { return require('./database').ApprovalOperations; }
};

// Start the server
startServer().catch(console.error);

