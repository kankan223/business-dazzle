/**
 * Telegram Bot Service for Bharat Biz-Agent
 * Handles Telegram bot initialization and message processing
 */

const TelegramBot = require('node-telegram-bot-api');

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.initializeBot();
  }

  initializeBot() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured');
        return;
      }

      this.bot = new TelegramBot(token);
      console.log('✅ Telegram bot initialized successfully');
      
      // Set up bot commands and handlers
      this.setupBotHandlers();
      
    } catch (error) {
      console.error('❌ Failed to initialize Telegram bot:', error);
    }
  }

  setupBotHandlers() {
    if (!this.bot) return;

    // Handle /start command
    this.bot.onText(/\/start/, (msg) => {
      this.handleStartCommand(msg);
    });

    // Handle regular messages
    this.bot.on('message', (msg) => {
      this.handleMessage(msg);
    });

    // Handle callback queries (inline buttons)
    this.bot.on('callback_query', (query) => {
      this.handleCallbackQuery(query);
    });

    // Error handling
    this.bot.on('polling_error', (error) => {
      console.error('Telegram bot polling error:', error);
    });
  }

  handleStartCommand(msg) {
    const chatId = msg.chat.id;
    const welcomeMessage = `👋 Welcome to Bharat Biz-Agent!

I'm your intelligent business assistant. I can help you with:

📦 Orders and purchases
🧾 Invoice generation  
💬 Customer support
📊 Business insights
🔍 Product information

Type /help to see all available commands.`;

    this.bot.sendMessage(chatId, welcomeMessage);
  }

  handleMessage(msg) {
    const chatId = msg.chat.id;
    const message = msg.text;
    
    // Forward message to main server for processing
    this.processMessage(chatId, message, msg);
  }

  handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    // Handle button callbacks
    if (data.startsWith('action_')) {
      this.processAction(chatId, data, query);
    }
    
    query.answer();
  }

  async processMessage(chatId, message, originalMessage) {
    try {
      // Import here to avoid circular dependencies
      const { processCustomerMessage } = require('./index');
      
      // Process the message through the main system
      await processCustomerMessage(message, chatId, originalMessage);
      
    } catch (error) {
      console.error('Error processing Telegram message:', error);
      this.bot.sendMessage(chatId, 'Sorry, I encountered an error. Please try again.');
    }
  }

  async processAction(chatId, action, query) {
    try {
      // Handle specific actions from inline buttons
      switch (action) {
        case 'action_help':
          this.sendHelpMessage(chatId);
          break;
        case 'action_status':
          this.sendStatusMessage(chatId);
          break;
        default:
          console.log('Unknown action:', action);
      }
    } catch (error) {
      console.error('Error processing action:', error);
    }
  }

  sendHelpMessage(chatId) {
    const helpText = `🤖 *Available Commands:*

/start - Start the bot
/help - Show this help message
/status - Check bot status

*What I can help you with:*
📦 Place orders
🧾 Generate invoices  
💬 Customer support
📊 Business insights
🔍 Product information
💰 Payment processing

Just type your request in natural language!`;
    
    this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  }

  sendStatusMessage(chatId) {
    const statusText = `📊 *Bot Status:*

🟢 Status: Online
🤖 Model: Gemini AI
📱 Platform: Telegram
🔗 Backend: Connected
💾 Database: Connected

*Services Active:*
✅ Customer Support
✅ Order Processing
✅ Invoice Generation
✅ Business Analytics`;

    this.bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
  }

  // Safe send message method with error handling
  async sendMessage(chatId, text, options = {}) {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      return null;
    }
  }

  // Get bot instance
  getBot() {
    return this.bot;
  }

  // Check if bot is initialized
  isInitialized() {
    return this.bot !== null;
  }
}

// Create singleton instance
const telegramBotService = new TelegramBotService();

module.exports = telegramBotService;
