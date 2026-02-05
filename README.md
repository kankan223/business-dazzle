# Bharat Biz-Agent 🤖🇮🇳

**AI-Powered Business Assistant for Indian SMBs with WhatsApp & Telegram Bot Integration**

[![Docker](c)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 📋 Overview

Bharat Biz-Agent is a comprehensive business automation platform designed specifically for Indian Small and Medium Businesses (SMBs). It combines:

- 🤖 **WhatsApp & Telegram Bots** - Automated customer interactions
- 👨‍💼 **Admin Dashboard** - Complete control and monitoring  
- ✅ **Approval Workflows** - Human-in-the-loop for sensitive actions
- 🔒 **End-to-End Encryption** - Data safety and privacy
- 🗣️ **Multilingual Support** - Hindi, Hinglish, and English
- 📊 **Business Analytics** - Real-time insights
- 🧠 **AI-Powered** - Google Gemini AI for intelligent responses
- 💾 **Database Integration** - MongoDB for data persistence

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 5.0+
- Google Gemini API Key (Free)

### Setup Steps

```bash
# 1. Clone the repository
git clone https://github.com/kankan223/business-dazzle.git
cd business-dazzle/app

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
cp server/.env.example server/.env

# 4. Get your Gemini API Key (Free)
# Visit: https://makersuite.google.com/app/apikey
# Add to server/.env: GEMINI_API_KEY=your_key_here

# 5. Set up Telegram Bot (Optional)
# Message @BotFather on Telegram -> /newbot
# Add to server/.env: TELEGRAM_BOT_TOKEN=your_token_here

# 6. Start MongoDB
mongod

# 7. Start the backend server
cd server
node index.js

# 8. Start the frontend (in another terminal)
cd ..
npm run dev
```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## 🔧 Configuration

### Required Environment Variables

Create `server/.env` with:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/bharat_biz_agent

# AI Service (Required - Free)
GEMINI_API_KEY=your_gemini_api_key_here

# Security
ADMIN_API_KEY=your_admin_api_key_here
ENCRYPTION_KEY=your_32_byte_encryption_key_here

# Server
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### Optional: Telegram Bot Setup

1. Message @BotFather on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token
4. Add to `server/.env`: `TELEGRAM_BOT_TOKEN=your_token_here`

### Optional: WhatsApp Business API

1. Create a Meta Business account: https://business.facebook.com/
2. Set up WhatsApp Business API
3. Add credentials to `server/.env`

## 📁 Project Structure

```
app/
├── src/                    # Frontend React app
│   ├── App.tsx            # Main dashboard
│   ├── services/          # API service layer
│   └── components/        # UI components
├── server/                 # Backend Node.js server
│   ├── index.js           # Bot handlers & API
│   ├── database.js         # MongoDB operations
│   ├── gemini-service.js  # AI service
│   └── .env.example       # Environment template
└── .env.example           # Frontend environment template
```

## 🤖 AI Features

### Google Gemini Integration

- **Free to use** - No cost for basic usage
- **Multilingual** - Understands English, Hindi, Hinglish
- **Context-aware** - Remembers conversation history
- **Smart approvals** - Automatically detects when admin approval is needed
- **Business insights** - Generates recommendations from data

### AI Capabilities

| Feature | Description |
|---------|-------------|
| Customer Support | Handle inquiries automatically |
| Order Processing | Take orders and check inventory |
| Approval Detection | Identify sensitive requests |
| Language Translation | Support multiple Indian languages |
| Business Analytics | Generate insights from data |

## 📊 Real-time Features

- **Live Dashboard** - Real-time updates via WebSocket
- **Conversation Monitoring** - Track all bot interactions
- **Approval Queue** - Review and approve sensitive actions
- **Security Logs** - Audit trail of all activities
- **Business Metrics** - Performance analytics

## �️ Security Features

- ✅ **AES-256 Encryption** - All messages encrypted
- ✅ **Database Security** - MongoDB with authentication
- ✅ **Rate Limiting** - Prevent abuse
- ✅ **Input Validation** - Sanitize all inputs
- ✅ **Audit Logging** - Track all actions
- ✅ **API Key Protection** - Secure admin access

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bots` | GET | List all bots |
| `/api/conversations` | GET | List all conversations |
| `/api/approvals` | GET | List pending approvals |
| `/api/approvals/:id/update` | POST | Approve/reject request |
| `/api/stats` | GET | System statistics |
| `/api/insights` | GET | AI-generated insights |
| `/api/ai/chat` | POST | Test AI chat |
| `/health` | GET | Health check |

## � Troubleshooting

### Common Issues

1. **Build Fails**: Make sure all dependencies are installed
2. **Database Connection**: Check MongoDB is running and URI is correct
3. **AI Not Working**: Verify Gemini API key is valid
4. **Telegram Bot**: Check bot token and webhook setup

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm run dev

# Check server logs
cd server && node index.js
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- Google Gemini AI for powering the intelligence
- MongoDB for data storage
- Open-source community for tools and libraries

## 📞 Support

- Create an issue on GitHub for bugs
- Check the troubleshooting section above
- Review the API documentation

---

**Made with ❤️ for Bharat** 🇮🇳
