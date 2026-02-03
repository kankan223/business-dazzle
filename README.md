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

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/kankan223/business-dazzle.git
cd business-dazzle

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env with your credentials
nano .env

# 4. Start with Docker Compose
docker-compose up -d

# 5. Access the application
# Frontend: http://localhost
# API: http://localhost/api
```

### Manual Setup

```bash
# Frontend
cd bharat-biz-agent
npm install
npm run build

# Backend
cd server
npm install
npm start
```

## 🔧 Configuration

### WhatsApp Business API Setup

1. Create a Meta Business account: https://business.facebook.com/
2. Set up WhatsApp Business API
3. Get your API Key, Phone Number ID, and Verify Token
4. Add to `.env` file

### Telegram Bot Setup

1. Message @BotFather on Telegram
2. Create a new bot
3. Copy the bot token
4. Add to `.env` file
5. Set webhook URL: `https://your-domain.com/webhooks/telegram`

## 📁 Project Structure

```
bharat-biz-agent/
├── src/                    # Frontend React app
│   ├── App.tsx            # Main dashboard
│   └── ...
├── server/                 # Backend Node.js server
│   ├── index.js           # Bot handlers & API
│   └── package.json
├── Dockerfile             # Docker build
├── docker-compose.yml     # Docker orchestration
├── nginx.conf             # Nginx configuration
└── .env.example           # Environment template
```

## 🛡️ Security Features

- ✅ **AES-256 Encryption** - All messages encrypted at rest
- ✅ **TLS/SSL** - Secure data in transit
- ✅ **Rate Limiting** - Prevent abuse
- ✅ **Helmet.js** - Security headers
- ✅ **Input Validation** - Sanitize all inputs
- ✅ **Audit Logging** - Track all actions
- ✅ **2FA Support** - Two-factor authentication

## 🤖 Bot Capabilities

### Customer-Facing Features

| Feature | WhatsApp | Telegram | Description |
|---------|----------|----------|-------------|
| Order Taking | ✅ | ✅ | Place orders via chat |
| Price Inquiry | ✅ | ✅ | Check product prices |
| Invoice Generation | ✅ | ✅ | Auto-generate invoices |
| Inventory Check | ✅ | ✅ | Real-time stock status |
| Voice Messages | ✅ | ✅ | Audio communication |
| Payment Info | ✅ | ✅ | UPI/Bank details |

### Admin Features

- 📊 Real-time dashboard
- ✅ Approve/reject bot actions
- 💬 Monitor conversations
- 📦 Manage inventory
- 🔐 Security audit logs
- 📈 Analytics & reports

## 🗣️ Supported Languages

- **English** - Full support
- **Hindi** - Devanagari script
- **Hinglish** - Romanized Hindi (e.g., "Namaste, kaise ho?")

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/approvals` | GET | List pending approvals |
| `/api/approvals/:id` | POST | Approve/reject request |
| `/api/conversations` | GET | List all conversations |
| `/api/stats` | GET | System statistics |
| `/health` | GET | Health check |

## 🐳 Docker Commands

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild
docker-compose up -d --build

# Shell access
docker exec -it bharat-biz-agent sh
```

## 🔍 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | ✅ | AES-256 encryption key |
| `WHATSAPP_API_KEY` | ⚠️ | WhatsApp Business API |
| `WHATSAPP_PHONE_NUMBER_ID` | ⚠️ | WhatsApp phone ID |
| `WHATSAPP_VERIFY_TOKEN` | ⚠️ | Webhook verification |
| `TELEGRAM_BOT_TOKEN` | ⚠️ | Telegram bot token |
| `SUPABASE_URL` | ❌ | Database URL (optional) |
| `SUPABASE_KEY` | ❌ | Database key (optional) |

## 📊 Screenshots

### Admin Dashboard
![Dashboard](docs/dashboard.png)

### Bot Management
![Bots](docs/bots.png)

### Approval Workflow
![Approvals](docs/approvals.png)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- Built for Indian SMBs 🇮🇳
- Inspired by the need for accessible business tools
- Powered by open-source technologies

## 📞 Support

- Email: support@bharatbiz.com
- WhatsApp: +91-XXXXX-XXXXX
- Telegram: @BharatBizSupport

---

**Made with ❤️ for Bharat**
