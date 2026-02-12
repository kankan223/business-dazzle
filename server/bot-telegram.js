/**
 * Telegram Bot Service for Bharat Biz-Agent
 * Handles Telegram bot initialization and message processing
 */

const TelegramBot = require('node-telegram-bot-api');

class TelegramBotService {
  constructor() {
    this.bot = null;
  
  }

  setBot(botInstance) {
    this.bot = botInstance;
    if (this.bot) {
      console.log('✅ Telegram bot service linked to bot instance');
    }
  }

  getBot() {
    // If no bot set, try to get from index.js
    if (!this.bot) {
      try {
        const indexModule = require('./index');
        if (indexModule.telegramBot) {
          this.bot = indexModule.telegramBot;
        }
      } catch (e) {
        // Ignore circular dependency errors
      }
    }
    return this.bot;
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

  // Send document/PDF
  async sendDocument(chatId, filePath, options = {}) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return null;
      }
      return await this.bot.sendDocument(chatId, filePath, options);
    } catch (error) {
      console.error('Error sending Telegram document:', error);
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
