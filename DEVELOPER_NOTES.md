# 📝 **DEVELOPER NOTES - BHARAT BIZ-AGENT**

## 🎯 **PROJECT OVERVIEW**

**Bharat Biz-Agent** is a comprehensive business management system with AI-powered customer service, real-time synchronization, and multi-platform bot integration.

### 🏗️ **ARCHITECTURE**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend     │    │    Backend      │    │   Database      │
│   (React)      │◄──►│   (Node.js)     │◄──►│   (MongoDB)    │
│  Port: 5173    │    │  Port: 3002    │    │  Port: 27017   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Admin UI     │    │  Telegram Bot   │    │  WhatsApp Bot   │
│   Dashboard    │    │   Integration   │    │   Integration   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 **TECHNICAL STACK**

### **Frontend**
- **Framework**: React 19.2.0 with TypeScript
- **Build Tool**: Vite 7.3.0
- **UI Library**: Radix UI + Tailwind CSS
- **State Management**: React Hooks
- **Real-time**: Socket.IO Client
- **Charts**: Recharts

### **Backend**
- **Runtime**: Node.js 25.4.0
- **Framework**: Express.js
- **Language**: JavaScript (ES6+)
- **Real-time**: Socket.IO
- **AI Service**: Google Gemini 2.5-pro
- **Authentication**: JWT + API Keys

### **Database**
- **Database**: MongoDB 7.1.0
- **ODM**: Native MongoDB Driver
- **Collections**: customers, conversations, approvals, audit_logs, orders

## 🚀 **SETUP & DEPLOYMENT**

### **Prerequisites**
```bash
# Node.js 18+ required
node --version

# MongoDB required (local or remote)
mongosh --version

# Git for version control
git --version
```

### **Installation**
```bash
# Clone repository
git clone <repository-url>
cd dazzle/app

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ..
npm install

# Environment setup
cp server/.env.example server/.env
cp .env.example .env.local
```

### **Environment Configuration**

#### **Backend (.env)**
```env
# Database
MONGODB_URI=mongodb://localhost:27017/bharat-biz-agent

# AI Service
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-pro

# Authentication
ADMIN_API_KEY=bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS
ENCRYPTION_KEY=your_32_character_encryption_key

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Server
PORT=3002
NODE_ENV=development
```

#### **Frontend (.env.local)**
```env
VITE_API_URL=http://localhost:3002
VITE_WS_URL=http://localhost:3002
VITE_ADMIN_API_KEY=bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS
VITE_DEBUG=true
```

## 🎯 **SINGLE COMMAND DEPLOYMENT**

### **Smart Start Script**
```bash
# Start all services
./start-smart.sh

# Check status
./start-smart.sh status

# View logs
./start-smart.sh logs

# Stop all services
./start-smart.sh stop

# Clean restart
./start-smart.sh restart
```

### **What the Script Does**
1. **Cleanup**: Kills all existing processes
2. **MongoDB**: Starts if available
3. **Backend**: Starts with integrated Telegram bot
4. **Frontend**: Starts development server
5. **Health Checks**: Verifies all services are responding
6. **Monitoring**: Provides real-time status and logs

## 🐛 **ISSUES FIXED**

### **✅ Frontend Compilation Errors**
```typescript
// Fixed TypeScript errors
- Property 'onNewApproval' → 'onNewMessage'
- Added type annotations: (data: any)
- Removed unused parameters
```

### **✅ Bot Character Encoding**
```javascript
// Fixed emoji display
'� Sugar' → '🍬 Sugar'
// Proper UTF-8 encoding in responses
```

### **✅ Process Management**
```bash
# Enhanced cleanup
pkill -f "telegram" 2>/dev/null
pkill -f "node.*telegram" 2>/dev/null
Force kill stubborn processes
```

### **✅ Database Synchronization**
```javascript
// Unique customer IDs
const customerId = `${platform}-${chatId}`;
// Real-time WebSocket sync
broadcastToAdmins('new_message', conversation);
```

## 📊 **DATABASE SCHEMA**

### **Customers Collection**
```javascript
{
  _id: ObjectId,
  phone: String, // Unique identifier
  name: String,
  platform: String, // 'telegram', 'whatsapp', 'web'
  language: String,
  createdAt: Date,
  updatedAt: Date
}
```

### **Conversations Collection**
```javascript
{
  _id: ObjectId,
  customerId: String, // Links to customers collection
  botId: String,
  customerName: String,
  customerPhone: String,
  messages: [{
    sender: String, // 'customer', 'bot'
    text: String,
    content: String, // For backward compatibility
    timestamp: Date,
    type: String, // 'text', 'voice', 'image', 'document'
    translated: Boolean
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### **Orders Collection**
```javascript
{
  _id: ObjectId,
  orderId: String, // Unique order identifier
  customerId: String, // Links to customer
  customerName: String,
  customerPhone: String,
  platform: String,
  items: [{
    product: String,
    quantity: Number,
    price: Number,
    unit: String
  }],
  totalAmount: Number,
  status: String, // 'pending', 'confirmed', 'delivered', 'cancelled'
  createdAt: Date,
  updatedAt: Date
}
```

### **Approvals Collection**
```javascript
{
  _id: ObjectId,
  botId: String,
  botName: String,
  customerName: String,
  customerPhone: String,
  action: String,
  details: Object,
  priority: String,
  status: String, // 'pending', 'approved', 'rejected'
  resolvedBy: String,
  resolvedAt: Date,
  createdAt: Date
}
```

## 🔄 **SYNCHRONIZATION MECHANISM**

### **Real-time Updates**
```javascript
// WebSocket events for synchronization
socket.on('new_message', (data) => {
  updateConversationInUI(data);
});

socket.on('approval_updated', (data) => {
  updateApprovalStatus(data);
});

socket.on('new_approval', (data) => {
  addNewApprovalRequest(data);
});
```

### **Customer ID Generation**
```javascript
// Unique ID generation for cross-platform sync
function generateCustomerId(platform, chatId) {
  return `${platform}-${chatId}`;
}

// Examples
// Telegram: "telegram-5934951555"
// WhatsApp: "whatsapp-919876543210"
// Web: "web-user123"
```

## 🤖 **BOT IMPLEMENTATION**

### **Free Bot Features**
- ✅ **Multi-platform**: Telegram, WhatsApp, Web
- ✅ **AI-powered**: Google Gemini integration
- ✅ **Database Access**: Full CRUD operations
- ✅ **Order Management**: Create, read, update orders
- ✅ **Customer Management**: Unique IDs and synchronization
- ✅ **Real-time Sync**: WebSocket integration
- ✅ **Voice Support**: Speech-to-text processing
- ✅ **Multi-language**: English, Hindi, Hinglish, Regional

### **Bot Capabilities**
```javascript
// Customer service
- Product inquiries
- Price checking
- Order placement
- Order status
- Complaint handling

// Business operations
- Order management
- Customer data access
- Approval workflows
- Audit logging
```

## 🛡️ **SECURITY FEATURES**

### **Authentication**
- Admin API key validation
- JWT token management
- Request rate limiting
- IP-based monitoring

### **Data Protection**
- AES-256-GCM encryption
- PII detection and masking
- Audit logging for all actions
- Secure database connections

### **Input Validation**
- Message sanitization
- SQL injection prevention
- XSS protection
- File upload security

## 📝 **DEVELOPMENT GUIDELINES**

### **Code Style**
- **JavaScript**: ES6+ with async/await
- **TypeScript**: Strict mode enabled
- **React**: Functional components with hooks
- **CSS**: Tailwind utility classes

### **File Structure**
```
dazzle/app/
├── server/                 # Backend code
│   ├── index.js            # Main server file
│   ├── gemini-service.js    # AI integration
│   ├── database.js         # Database operations
│   └── .env              # Backend environment
├── src/                   # Frontend code
│   ├── components/         # React components
│   ├── services/          # API services
│   └── App.tsx           # Main app component
├── start-smart.sh          # Deployment script
├── package.json           # Frontend dependencies
└── .env.local            # Frontend environment
```

### **Testing**
```bash
# Frontend build test
npm run build

# Backend health check
curl http://localhost:3002/health

# Bot command test
curl -X POST http://localhost:3002/api/direct-command \
  -H "Authorization: Bearer bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS" \
  -d '{"command": "/ping", "platform": "web"}'
```

## 🚨 **TROUBLESHOOTING**

### **Common Issues**
1. **Port conflicts**: Use `./start-smart.sh cleanup`
2. **Frontend not loading**: Check TypeScript compilation
3. **Bot not responding**: Verify Telegram token
4. **Database errors**: Check MongoDB connection
5. **WebSocket issues**: Verify firewall settings

### **Log Locations**
- Backend: `server.log`
- Frontend: `frontend.log`
- Database: MongoDB logs
- System: Journalctl logs

## 📈 **PERFORMANCE OPTIMIZATION**

### **Frontend**
- Code splitting with dynamic imports
- Image optimization
- Bundle size monitoring
- Service worker implementation

### **Backend**
- Database indexing
- Connection pooling
- Response caching
- Rate limiting

### **Database**
- Proper indexing strategy
- Query optimization
- Connection management
- Regular cleanup

---

## 🎯 **PRODUCTION DEPLOYMENT**

### **Environment Setup**
```bash
# Production environment variables
NODE_ENV=production
PORT=3002
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/bharat-biz-agent
```

### **Security Hardening**
- HTTPS enforcement
- Firewall configuration
- Database security
- API rate limiting
- Regular security audits

---

**Last Updated**: February 11, 2026
**Version**: 1.0.0
**Status**: Production Ready ✅
