# Bharat Biz-Agent 🤖🇮🇳

**Business Automation Platform for Indian SMBs**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.1+-green)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-19.2+-blue)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## About

Bharat Biz-Agent is a business automation platform built for Indian Small and Medium Businesses.

Features:
- 🤖 Multi-platform bots (Telegram, WhatsApp)
- 👨‍💼 Real-time admin dashboard
- ✅ Approval workflows
- 🔒 Data protection (AES-256-GCM)
- 🗣️ Indian language support (English, Hindi, Hinglish)
- 📊 Business analytics
- 💾 MongoDB with in-memory fallback
- 🔄 Real-time sync (WebSocket)

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 7.1+ (optional - has in-memory fallback)
- Telegram Bot Token

### Installation
```bash
# Clone the repo
git clone https://github.com/kankan223/business-dazzle.git
cd dazzle/app

# Install dependencies
npm install
cd server && npm install && cd ..

# Setup environment
cp server/.env.example server/.env
# Edit server/.env with your API keys
```

### Environment Variables
```bash
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Optional
MONGODB_URI=mongodb://localhost:27017/bharat_biz_agent
FRONTEND_URL=http://localhost:5173
ADMIN_PASSCODE=bharat_admin_2024
PORT=3003
```

### Running the Application

#### Option 1: Smart Start (Recommended)
```bash
# Make executable and run everything
chmod +x start-smart.sh
./start-smart.sh

# Access URLs
# Frontend: http://localhost:5173
# Backend:  http://localhost:3003
# Health:   http://localhost:3003/health
```

#### Option 2: Manual Start
```bash
# Terminal 1: Start backend
cd server && npm start

# Terminal 2: Start frontend
cd .. && npm run dev
```

#### Management Commands
```bash
./start-smart.sh start    # Start all services
./start-smart.sh status   # Check status  
./start-smart.sh logs     # View logs
./start-smart.sh restart  # Restart all services
./start-smart.sh stop     # Stop all services
./start-smart.sh cleanup  # Kill processes and free ports
```

### Access Points
- Frontend: http://localhost:5173
- Backend API: http://localhost:3003
- Health Check: http://localhost:3003/health

## Architecture

### Smart Startup Script (start-smart.sh)

The `start-smart.sh` script handles process management:

```
┌─────────────────────────────────────────────────────┐
│                START-SMART.SH ARCHITECTURE          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1️⃣ CLEANUP PHASE                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ • Kill processes on ports 3003, 5173, 27017 │   │
│  │ • Force cleanup of stubborn processes      │   │
│  │ • Verify all ports are free              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  2️⃣ STARTUP SEQUENCE                                │
│  ┌─────────────────────────────────────────────┐   │
│  │ MongoDB → Backend Server → Frontend   │   │
│  │ • Health checks after each service      │   │
│  │ • Wait periods for initialization    │   │
│  │ • Background process management        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  3️⃣ MONITORING & LOGGING                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ • Centralized logs (server.log, frontend.log)   │   │
│  │ • Real-time status monitoring                  │   │
│  │ • Health check endpoints                      │   │
│  │ • Process PID tracking                       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  4️⃣ COMMAND INTERFACE                                │
│  ┌─────────────────────────────────────────────┐   │
│  │ start | stop | restart | status | logs | cleanup │   │
│  │ • Graceful shutdown handling                   │   │
│  │ • Error recovery mechanisms                   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Benefits
- Zero port conflicts - Automatic cleanup
- Serial startup - MongoDB → Backend → Frontend
- Health monitoring - Built-in status checks
- Centralized logs - Easy debugging
- Graceful shutdown - Clean process termination
- Error recovery - Automatic retry mechanisms

### Backend Services
- Express Server - REST API and WebSocket server
- Database Layer - MongoDB with in-memory fallback
- Bot Services - Telegram integration
- Security - Rate limiting, encryption, validation

### Frontend Components
- React Dashboard - Admin interface
- Real-time Updates - WebSocket connections
- UI Components - Radix UI + TailwindCSS

### Core Features
- Customer Management - Add, edit, delete customers
- Order Processing - Create and track orders
- Approval System - Admin approval for sensitive actions
- Inventory Management - Product stock tracking
- Analytics - Business insights dashboard

## 🏗️ Application Architecture

### **System Overview**
```
┌─────────────────────────────────────────────────────────────┐
│                  APPLICATION ARCHITECTURE               │
├─────────────────────────────────────────────────────────────┤
│                                                         │
│  🎨 FRONTEND (React 19.2)                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ • Admin Dashboard                               │     │
│  │ • Real-time WebSocket UI                     │     │
│  │ • Customer/Order Management                   │     │
│  │ • Analytics Dashboard                         │     │
│  │ • Radix UI + TailwindCSS                    │     │
│  └─────────────────────────────────────────────────────┘     │
│                              │                              │
│                              ▼                              │
│  🔌 WEBSOCKET LAYER                                  │
│  ┌─────────────────────────────────────────────┐     │
│  │ • Real-time bidirectional communication          │     │
│  │ • Live updates for approvals/conversations     │     │
│  │ • Socket.IO implementation                   │     │
│  └─────────────────────────────────────────────┘     │
│                              │                              │
│                              ▼                              │
│  🚀 BACKEND (Node.js + Express)                        │
│  ┌─────────────────────────────────────────────┐     │
│  │ • REST API Server                          │     │
│  │ • WebSocket Server                         │     │
│  │ • Telegram Bot Integration                 │     │
│  │ • Security Middleware                     │     │
│  │ • Rate Limiting                          │     │
│  └─────────────────────────────────────────────┘     │
│                              │                              │
│                              ▼                              │
│  💾 DATABASE LAYER                                     │
│  ┌─────────────────────────────────────────────┐     │
│  │ • MongoDB (Primary)                        │     │
│  │ • In-memory Fallback                     │     │
│  │ • Collections:                          │     │
│  │   - customers, orders, conversations        │     │
│  │   - approvals, inventory, audit_logs      │     │
│  └─────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

### Data Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Telegram   │───►│   Backend   │───►│  Database   │◄───│   Admin     │
│    Bot      │    │   Server    │    │   Layer     │    │  Dashboard  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Message   │    │   REST     │    │   Data      │    │   Real-time │
│ Processing │    │   APIs     │    │ Persistence│    │   Updates   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Technology Stack
- Frontend: React 19.2, TypeScript, Vite, TailwindCSS, Radix UI
- Backend: Node.js 18+, Express 4.22.1, Socket.io 4.8.3
- Database: MongoDB 7.1.0 with in-memory fallback
- Security: AES-256-GCM encryption, Helmet.js, Rate limiting
- Communication: WebSocket (Socket.io), REST APIs
- Bot Integration: Telegram Bot API

## Bot Commands

### Telegram Bot
- `/start` - Initialize bot
- `/help` - Show available commands
- `/status` - Check bot status
- Text messages - Automatic intent processing

### Supported Actions
- Create invoices
- Check order status
- Inventory updates
- Customer inquiries
- Payment reminders

## Configuration

### Database Setup
```bash
# With MongoDB (recommended)
docker run -d -p 27017:27017 --name mongodb mongo:7.1

# Or use in-memory fallback (no setup required)
# Set SKIP_DATABASE=true in .env
```

### Telegram Bot Setup
1. Create bot via @BotFather on Telegram
2. Get bot token
3. Add `TELEGRAM_BOT_TOKEN` to environment
4. Bot will auto-initialize on server start

## Security Features

- AES-256-GCM encryption for sensitive data
- Rate limiting to prevent abuse
- Input validation with Joi schemas
- Audit logging for all actions
- Admin authentication with passcode

## API Endpoints

### Core Endpoints
- `GET /health` - System health check
- `POST /api/telegram/webhook` - Telegram webhook
- `GET /api/approvals` - List pending approvals
- `POST /api/approvals/:id` - Process approval
- `GET /api/customers` - List customers
- `POST /api/orders` - Create order

### WebSocket Events
- `conversation_updated` - New messages
- `approval_created` - New approval required
- `order_update` - Order status changes

## Docker Deployment

```bash
# Build image
docker build -t bharat-biz-agent .

# Run container
docker run -d \
  --name bharat-biz-agent \
  -p 3003:3003 \
  -p 5173:5173 \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e MONGODB_URI=mongodb://host:27017/db \
  bharat-biz-agent
```

## Troubleshooting

### Common Issues
- Bot not responding - Check TELEGRAM_BOT_TOKEN
- Database connection failed - Falls back to in-memory
- Port conflicts - Change PORT in environment
- WebSocket errors - Check FRONTEND_URL

### Health Check
```bash
curl http://localhost:3003/health
```

### Logs
- Backend logs: `server/server.log`
- Frontend: Browser console
- Database: MongoDB logs or in-memory fallback

## Limitations

- Telegram Only - WhatsApp integration planned
- Single Instance - Not cluster-ready
- In-memory Fallback - Data lost on restart without MongoDB
- Rule-based AI - Not machine learning based

## Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## License

MIT License - see LICENSE file

## Support

For issues and questions:
- Create GitHub issue
- Check logs for errors
- Verify environment configuration
