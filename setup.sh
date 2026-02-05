#!/bin/bash

# Bharat Biz-Agent Setup Script
# This script helps you set up the development environment

echo "🤖🇮🇳 Welcome to Bharat Biz-Agent Setup!"
echo "======================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if MongoDB is running
if ! command -v mongod &> /dev/null; then
    echo "⚠️  MongoDB is not installed or not in PATH"
    echo "Please install MongoDB 5.0+ and start it with: mongod"
    echo "Visit: https://www.mongodb.com/try/download/community"
else
    echo "✅ MongoDB found"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Set up environment files
echo ""
echo "🔧 Setting up environment files..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
else
    echo "ℹ️  .env file already exists"
fi

if [ ! -f server/.env ]; then
    cp server/.env.example server/.env
    echo "✅ Created server/.env file"
else
    echo "ℹ️  server/.env file already exists"
fi

# Instructions for Gemini API
echo ""
echo "🧠 AI Setup Instructions:"
echo "=========================="
echo "1. Get your FREE Gemini API Key:"
echo "   Visit: https://makersuite.google.com/app/apikey"
echo "2. Add it to server/.env:"
echo "   GEMINI_API_KEY=your_key_here"
echo ""

# Instructions for Telegram Bot (optional)
echo "📱 Optional Telegram Bot Setup:"
echo "==============================="
echo "1. Message @BotFather on Telegram"
echo "2. Send: /newbot"
echo "3. Follow the instructions"
echo "4. Add token to server/.env:"
echo "   TELEGRAM_BOT_TOKEN=your_token_here"
echo ""

# Start instructions
echo "🚀 Ready to Start!"
echo "=================="
echo "1. Start MongoDB (if not running): mongod"
echo "2. Start backend server: cd server && node index.js"
echo "3. Start frontend: npm run dev"
echo ""
echo "🌐 Access the application:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
echo "   Health:   http://localhost:3001/health"
echo ""

echo "✨ Setup complete!"
