/**
 * Database Configuration for Bharat Biz-Agent
 * MongoDB integration for real-time data synchronization
 */

const { MongoClient } = require('mongodb');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'bharat_biz_agent';

let db = null;
let client = null;

// Database collections
const COLLECTIONS = {
  BOTS: 'bots',
  CONVERSATIONS: 'conversations',
  APPROVALS: 'approvals',
  ORDERS: 'orders',
  CUSTOMERS: 'customers',
  USERS: 'users',
  AUDIT_LOGS: 'audit_logs',
  AI_RESPONSES: 'ai_responses',
  SYSTEM_CONFIG: 'system_config',
  INVENTORY: 'inventory',
  INVOICES: 'invoices'
};

// In-memory fallback database
let inMemoryDb = new Map();

function createInMemoryFallback() {
  console.log('🗄️ Creating in-memory database fallback');
  return {
    collection: (name) => ({
      find: (query = {}) => ({
        toArray: async () => {
          const collection = inMemoryDb.get(name) || [];
          return collection.filter(item => {
            // Simple query matching
            for (const [key, value] of Object.entries(query)) {
              if (item[key] !== value) return false;
            }
            return true;
          });
        },
        findOne: async (query) => {
          const collection = inMemoryDb.get(name) || [];
          return collection.find(item => {
            for (const [key, value] of Object.entries(query)) {
              if (item[key] !== value) return false;
            }
            return true;
          });
        },
        sort: (sortObj) => ({
          toArray: async () => {
            const collection = inMemoryDb.get(name) || [];
            return [...collection];
          }
        })
      }),
      insertOne: async (doc) => {
        const collection = inMemoryDb.get(name) || [];
        const newDoc = { ...doc, _id: doc.id || Math.random().toString(36) };
        collection.push(newDoc);
        inMemoryDb.set(name, collection);
        return { insertedId: newDoc._id };
      },
      updateOne: async (query, update) => {
        const collection = inMemoryDb.get(name) || [];
        const index = collection.findIndex(item => {
          for (const [key, value] of Object.entries(query)) {
            if (item[key] !== value) return false;
          }
          return true;
        });
        if (index !== -1) {
          collection[index] = { ...collection[index], ...update.$set };
          inMemoryDb.set(name, collection);
        }
        return { modifiedCount: index !== -1 ? 1 : 0 };
      },
      deleteOne: async (query) => {
        const collection = inMemoryDb.get(name) || [];
        const index = collection.findIndex(item => {
          for (const [key, value] of Object.entries(query)) {
            if (item[key] !== value) return false;
          }
          return true;
        });
        if (index !== -1) {
          collection.splice(index, 1);
          inMemoryDb.set(name, collection);
        }
        return { deletedCount: index !== -1 ? 1 : 0 };
      }
    })
  };
}

async function initializeDefaultData() {
  console.log('🔧 Initializing default data in memory database');
  
  // Initialize with some default data
  const defaultUsers = [
    {
      id: 'admin_user',
      name: 'Admin User',
      phone: '+910000000000',
      platform: 'telegram',
      telegramId: '0',
      isActive: true,
      registeredAt: new Date(),
      lastActiveAt: new Date()
    }
  ];
  
  inMemoryDb.set('users', defaultUsers);
  inMemoryDb.set('approvals', []);
  inMemoryDb.set('orders', []);
  inMemoryDb.set('conversations', []);
  inMemoryDb.set('inventory', []);
  
  console.log('✅ Default data initialized');
}

// Connect to MongoDB (optional)
async function connectDatabase() {
  if (process.env.SKIP_DATABASE === 'true') {
    console.log('⚠️ Database connection skipped (SKIP_DATABASE=true)');
    return;
  }

  const maxRetries = 5;
  const retryDelay = 3000; // 3 seconds
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`🔗 Attempting to connect to MongoDB (attempt ${attempt + 1}/${maxRetries})...`);
      
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // Increased timeout
        connectTimeoutMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 5000,
        retryWrites: true,
        retryReads: true,
        heartbeatFrequencyMS: 10000
      });
      
      await client.connect();
      db = client.db(DB_NAME);
      
      // Test the connection
      await db.admin().ping();
      console.log('✅ Connected to MongoDB:', DB_NAME);
      
      // Set up connection monitoring
      client.on('serverHeartbeatFailed', (event) => {
        console.warn('⚠️ MongoDB heartbeat failed:', event);
      });
      
      client.on('serverOpening', (event) => {
        console.log('🔗 MongoDB server opening:', event.address);
      });
      
      client.on('serverClosed', (event) => {
        console.warn('⚠️ MongoDB server closed:', event.address);
      });
      
      return db;
      
    } catch (error) {
      attempt++;
      console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
      
      if (attempt >= maxRetries) {
        console.error('💥 Max connection attempts reached. Using in-memory fallback.');
        break;
      }
      
      console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.log('⚠️ Using in-memory fallback database (data will be lost on restart)');
  
  // Initialize in-memory fallback
  db = createInMemoryFallback();
  await initializeDefaultData();
  
  return db;
}

// Create in-memory fallback database
function createInMemoryFallback() {
  const collections = {
    bots: [],
    conversations: [],
    approvals: [],
    orders: [],
    customers: [],
    audit_logs: [],
    ai_responses: [],
    system_config: [],
    inventory: []
  };
  
  return {
    collection: (name) => ({
      find: (query = {}) => ({
        toArray: async () => {
          let data = collections[name] || [];
          if (query._id) {
            data = data.filter(item => item._id === query._id);
          }
          if (query.customerId) {
            data = data.filter(item => item.customerId === query.customerId);
          }
          if (query.lastMessageAt && query.lastMessageAt.$gte) {
            const startDate = new Date(query.lastMessageAt.$gte);
            const endDate = query.lastMessageAt.$lte ? new Date(query.lastMessageAt.$lte) : new Date();
            data = data.filter(item => {
              const itemDate = new Date(item.lastMessageAt || item.createdAt);
              return itemDate >= startDate && itemDate <= endDate;
            });
          }
          if (query.createdAt && query.createdAt.$gte) {
            const startDate = new Date(query.createdAt.$gte);
            const endDate = query.createdAt.$lte ? new Date(query.createdAt.$lte) : new Date();
            data = data.filter(item => {
              const itemDate = new Date(item.createdAt);
              return itemDate >= startDate && itemDate <= endDate;
            });
          }
          if (query.requestedAt && query.requestedAt.$gte) {
            const startDate = new Date(query.requestedAt.$gte);
            const endDate = query.requestedAt.$lte ? new Date(query.requestedAt.$lte) : new Date();
            data = data.filter(item => {
              const itemDate = new Date(item.requestedAt);
              return itemDate >= startDate && itemDate <= endDate;
            });
          }
          if (query.$expr && query.$expr.$lte) {
            data = data.filter(item => item.quantity <= item.lowStockThreshold);
          }
          return data;
        },
        sort: () => ({ toArray: async () => collections[name] || [] }),
        limit: () => ({ toArray: async () => (collections[name] || []).slice(0, 10) }),
        skip: () => ({ toArray: async () => collections[name] || [] })
      }),
      findOne: async (query = {}) => {
        let data = collections[name] || [];
        if (query._id) {
          data = data.filter(item => item._id === query._id);
        }
        if (query.id) {
          data = data.filter(item => item.id === query.id);
        }
        if (query.key) {
          data = data.filter(item => item.key === query.key);
        }
        return data.length > 0 ? data[0] : null;
      },
      insertOne: async (doc) => {
        if (!collections[name]) collections[name] = [];
        const newDoc = { ...doc, _id: doc._id || Date.now().toString() };
        collections[name].push(newDoc);
        return { insertedId: newDoc._id };
      },
      insertMany: async (docs) => {
        if (!collections[name]) collections[name] = [];
        const newDocs = docs.map(doc => ({ ...doc, _id: doc._id || Date.now().toString() + Math.random() }));
        collections[name].push(...newDocs);
        return { insertedIds: newDocs.map(doc => doc._id) };
      },
      updateOne: async (query, update) => {
        if (!collections[name]) collections[name] = [];
        const index = collections[name].findIndex(item => 
          (query._id && item._id === query._id) ||
          (query.id && item.id === query.id) ||
          (query.customerId && item.customerId === query.customerId && query.botId && item.botId === query.botId)
        );
        if (index !== -1) {
          if (update.$set) {
            collections[name][index] = { ...collections[name][index], ...update.$set };
          }
          if (update.$push) {
            Object.keys(update.$push).forEach(key => {
              if (!collections[name][index][key]) collections[name][index][key] = [];
              collections[name][index][key].push(...update.$push[key]);
            });
          }
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      },
      deleteOne: async (query) => {
        if (!collections[name]) collections[name] = [];
        const index = collections[name].findIndex(item => 
          (query._id && item._id === query._id) ||
          (query.id && item.id === query.id)
        );
        if (index !== -1) {
          collections[name].splice(index, 1);
          return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
      },
      aggregate: async (pipeline) => {
        let data = collections[name] || [];
        
        // Simple aggregation for stats
        if (pipeline.length > 0 && pipeline[0].$group) {
          const groupStage = pipeline[0].$group;
          const result = {};
          
          data.forEach(item => {
            const key = item[groupStage._id] || 'unknown';
            if (!result[key]) {
              result[key] = { _id: key, count: 0, totalAmount: 0 };
            }
            result[key].count++;
            if (item.totalAmount) {
              result[key].totalAmount += item.totalAmount;
            }
          });
          
          return Object.values(result);
        }
        
        return data;
      }
    })
  };
}

// Create database indexes
async function createIndexes() {
  try {
    // Only create indexes if using real MongoDB
    if (client) {
      // Bots collection indexes
      await db.collection(COLLECTIONS.BOTS).createIndex({ botId: 1 }, { unique: true });
      await db.collection(COLLECTIONS.BOTS).createIndex({ status: 1 });
      
      // Conversations collection indexes
      await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ customerId: 1, botId: 1 });
      await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ lastMessageAt: -1 });
      
      // Approvals collection indexes
      await db.collection(COLLECTIONS.APPROVALS).createIndex({ requestedAt: -1 });
      await db.collection(COLLECTIONS.APPROVALS).createIndex({ status: 1 });
      
      // Orders collection indexes
      await db.collection(COLLECTIONS.ORDERS).createIndex({ orderId: 1 }, { unique: true });
      await db.collection(COLLECTIONS.ORDERS).createIndex({ customerId: 1 });
      await db.collection(COLLECTIONS.ORDERS).createIndex({ createdAt: -1 });
      
      // Customers collection indexes
      await db.collection(COLLECTIONS.CUSTOMERS).createIndex({ customerId: 1 }, { unique: true });
      await db.collection(COLLECTIONS.CUSTOMERS).createIndex({ phone: 1 });
      
      // Inventory collection indexes
      await db.collection(COLLECTIONS.INVENTORY).createIndex({ sku: 1 }, { unique: true });
      await db.collection(COLLECTIONS.INVENTORY).createIndex({ name: 1 });
      
      console.log('✅ Database indexes created successfully');
    }
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    // Continue without indexes for fallback mode
  }
}

// Initialize default data
async function initializeDefaultData() {
  try {
    // Check if system config exists
    const configExists = await db.collection(COLLECTIONS.SYSTEM_CONFIG).findOne({ key: 'initialized' });
    
    if (!configExists) {
      // Initialize default bots
      await db.collection(COLLECTIONS.BOTS).insertMany([
        {
          botId: 'whatsapp-bot-001',
          name: 'WhatsApp Assistant',
          platform: 'whatsapp',
          status: 'active',
          connectedCustomers: 0,
          totalMessages: 0,
          capabilities: ['order_processing', 'customer_support', 'inventory_check'],
          createdAt: new Date(),
          lastActive: new Date()
        },
        {
          botId: 'telegram-bot-001',
          name: 'Telegram Assistant',
          platform: 'telegram',
          status: 'active',
          connectedCustomers: 0,
          totalMessages: 0,
          capabilities: ['order_processing', 'customer_support', 'inventory_check'],
          createdAt: new Date(),
          lastActive: new Date()
        }
      ]);
      
      // Mark as initialized
      await db.collection(COLLECTIONS.SYSTEM_CONFIG).insertOne({
        key: 'initialized',
        value: true,
        createdAt: new Date()
      });
      
      console.log('✅ Default data initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing default data:', error);
  }
}

// Get database instance
function getDatabase() {
  if (!db) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return db;
}

// Close database connection
async function closeDatabase() {
  try {
    if (client) {
      await client.close();
      console.log('✅ Database connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
}

// Check database health
async function checkDatabaseHealth() {
  try {
    if (!db || !client) {
      return { status: 'disconnected', error: 'Database not initialized' };
    }
    
    // Ping the database - check if it's MongoDB (has admin method)
    if (db.admin && typeof db.admin === 'function') {
      await db.admin().ping();
    } else {
      // In-memory fallback is always "healthy"
      return { status: 'healthy', timestamp: new Date(), type: 'in-memory' };
    }
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date() };
  }
}

// Helper functions for common operations
const BotOperations = {
  // Get all bots
  async getAll() {
    return await db.collection(COLLECTIONS.BOTS).find({}).toArray();
  },
  
  // Get bot by botId (alias for getById for compatibility)
  async getByBotId(botId) {
    return await this.getById(botId);
  },

  // Create new bot
  async create(botData) {
    try {
      const botId = `BOT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const newBot = {
        botId,
        name: botData.name || 'New Bot',
        platform: botData.platform || 'telegram',
        status: botData.status || 'active',
        config: botData.config || {},
        settings: botData.settings || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        metrics: {
          messagesProcessed: 0,
          ordersCreated: 0,
          conversations: 0
        }
      };
      
      const result = await db.collection(COLLECTIONS.BOTS).insertOne(newBot);
      console.log(`✅ Bot created: ${botId}`);
      return { ...newBot, _id: result.insertedId };
    } catch (error) {
      console.error('Error creating bot:', error);
      throw error;
    }
  },

  // Update bot
  async update(botId, updateData) {
    try {
      const updates = {
        ...updateData,
        updatedAt: new Date().toISOString()
      };
      
      const result = await db.collection(COLLECTIONS.BOTS).findOneAndUpdate(
        { botId },
        { $set: updates },
        { returnDocument: 'after' }
      );
      
      console.log(`✅ Bot updated: ${botId}`);
      return result;
    } catch (error) {
      console.error('Error updating bot:', error);
      throw error;
    }
  },

  // Delete bot
  async delete(botId) {
    try {
      await db.collection(COLLECTIONS.BOTS).deleteOne({ botId });
      console.log(`✅ Bot deleted: ${botId}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting bot:', error);
      throw error;
    }
  },
  async updateStatus(botId, status) {
    return await db.collection(COLLECTIONS.BOTS).updateOne(
      { botId },
      { 
        $set: { 
          status, 
          lastActive: new Date() 
        } 
      }
    );
  },
  
  // Increment bot metrics
  async incrementMetrics(botId, metrics = {}) {
    const updates = {};
    for (const [key, value] of Object.entries(metrics)) {
      updates[key] = value;
    }
    
    return await db.collection(COLLECTIONS.BOTS).updateOne(
      { botId },
      { 
        $inc: updates,
        $set: { lastActive: new Date() }
      }
    );
  }
};

// Conversation Operations - Production-Grade with User Identity
const ConversationOperations = {
  // Generate unique conversation ID: CONV-XXXX (8 chars)
  generateConversationId() {
    return `CONV-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  },

  // Get all conversations with user lookup
  async getAll(limit = 100, offset = 0) {
    try {
      const conversations = await db.collection(COLLECTIONS.CONVERSATIONS)
        .find({})
        .sort({ lastMessageAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
      
      // Enrich with user data
      for (const conv of conversations) {
        if (conv.userId) {
          conv.user = await UserOperations.getByUserId(conv.userId);
        }
      }
      
      return conversations;
    } catch (error) {
      console.error('Error getting all conversations:', error);
      throw error;
    }
  },

  // Get conversation by userId (replaces getByCustomerId)
  async getByUserId(userId) {
    try {
      return await db.collection(COLLECTIONS.CONVERSATIONS)
        .find({ userId })
        .sort({ lastMessageAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error getting conversations by userId:', error);
      throw error;
    }
  },

  // Get conversation by conversationId
  async getByConversationId(conversationId) {
    try {
      return await db.collection(COLLECTIONS.CONVERSATIONS)
        .findOne({ conversationId });
    } catch (error) {
      console.error('Error getting conversation by ID:', error);
      throw error;
    }
  },

  // Find or create conversation for user
  async findOrCreate(userId, platform, botId) {
    try {
      // Look for existing active conversation
      let conversation = await db.collection(COLLECTIONS.CONVERSATIONS).findOne({
        userId,
        status: { $in: ['active', 'waiting_approval'] }
      });

      if (conversation) {
        return conversation;
      }

      // Create new conversation with proper schema
      const conversationId = this.generateConversationId();
      const newConversation = {
        conversationId,
        userId,
        platform: platform || 'telegram',
        botId: botId || null,
        messages: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        metadata: {}
      };

      const result = await db.collection(COLLECTIONS.CONVERSATIONS).insertOne(newConversation);
      console.log(`✅ New conversation created: ${conversationId} for user ${userId}`);
      
      return { ...newConversation, _id: result.insertedId };
    } catch (error) {
      console.error('Error in findOrCreate conversation:', error);
      throw error;
    }
  },

  // Add message to conversation
  async addMessage(conversationId, messageData) {
    try {
      const { sender, content, metadata = {} } = messageData;
      
      const message = {
        messageId: `MSG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        sender: sender || 'user', // 'user' | 'bot' | 'admin'
        content,
        timestamp: new Date().toISOString(),
        metadata
      };

      const result = await db.collection(COLLECTIONS.CONVERSATIONS).findOneAndUpdate(
        { conversationId },
        {
          $push: { messages: message },
          $set: {
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        },
        { returnDocument: 'after' }
      );

      return { message, conversation: result.value };
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  },

  // Update conversation status
  async updateStatus(conversationId, status) {
    try {
      const result = await db.collection(COLLECTIONS.CONVERSATIONS).findOneAndUpdate(
        { conversationId },
        {
          $set: {
            status,
            updatedAt: new Date().toISOString()
          }
        },
        { returnDocument: 'after' }
      );
      
      return result.value;
    } catch (error) {
      console.error('Error updating conversation status:', error);
      throw error;
    }
  },

  // Get conversations by date range
  async getByDateRange(startDate, endDate) {
    try {
      return await db.collection(COLLECTIONS.CONVERSATIONS)
        .find({
          lastMessageAt: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ lastMessageAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error getting conversations by date range:', error);
      throw error;
    }
  },

  // Reset conversations (clear messages but keep structure)
  async resetAll() {
    try {
      // Delete all conversations but NOT users
      const result = await db.collection(COLLECTIONS.CONVERSATIONS).deleteMany({});
      console.log(`🗑️ Reset conversations: ${result.deletedCount} conversations deleted`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error resetting conversations:', error);
      throw error;
    }
  },

  // Get conversation statistics
  async getStats() {
    try {
      const total = await db.collection(COLLECTIONS.CONVERSATIONS).countDocuments();
      const active = await db.collection(COLLECTIONS.CONVERSATIONS).countDocuments({ 
        status: 'active' 
      });
      const waitingApproval = await db.collection(COLLECTIONS.CONVERSATIONS).countDocuments({ 
        status: 'waiting_approval' 
      });

      return { total, active, waitingApproval };
    } catch (error) {
      console.error('Error getting conversation stats:', error);
      throw error;
    }
  }
};

// Approval Operations - Production-Grade Transactional Workflow
const ApprovalOperations = {
  // Generate unique approval ID: APR-YYYYMMDD-XXXX
  generateApprovalId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `APR-${date}-${random}`;
  },

  // Get all approvals with pagination
  async getAll(limit = 100, offset = 0) {
    try {
      const approvals = await db.collection(COLLECTIONS.APPROVALS)
        .find({})
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
      
      // Enrich with user data and map to frontend format
      const mappedApprovals = [];
      for (const approval of approvals) {
        let user = null;
        if (approval.userId) {
          user = await UserOperations.getByUserId(approval.userId);
        }
        
        // Map to frontend expected format
        mappedApprovals.push({
          id: approval.approvalId || approval._id.toString(),
          approvalId: approval.approvalId,
          userId: approval.userId,
          customerName: user?.name || approval.customerName || 'Unknown User',
          action: approval.actionType || approval.action,
          actionType: approval.actionType,
          status: approval.status,
          priority: approval.priority || 'medium',
          details: approval.payload || approval.details || {},
          payload: approval.payload,
          requestedAt: approval.createdAt || approval.requestedAt,
          createdAt: approval.createdAt,
          resolvedAt: approval.resolvedAt,
          resolvedBy: approval.resolvedBy,
          user: user
        });
      }
      
      return mappedApprovals;
    } catch (error) {
      console.error('Error getting all approvals:', error);
      throw error;
    }
  },

  // Get pending approvals (for dashboard)
  async getPending(limit = 50) {
    try {
      const approvals = await db.collection(COLLECTIONS.APPROVALS)
        .find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      // Enrich with user data and map to frontend format
      const mappedApprovals = [];
      for (const approval of approvals) {
        let user = null;
        if (approval.userId) {
          user = await UserOperations.getByUserId(approval.userId);
        }
        
        // Map to frontend expected format
        mappedApprovals.push({
          id: approval.approvalId || approval._id.toString(),
          approvalId: approval.approvalId,
          userId: approval.userId,
          customerName: user?.name || approval.customerName || 'Unknown User',
          action: approval.actionType || approval.action,
          actionType: approval.actionType,
          status: approval.status,
          priority: approval.priority || 'medium',
          details: approval.payload || approval.details || {},
          payload: approval.payload,
          requestedAt: approval.createdAt || approval.requestedAt,
          createdAt: approval.createdAt,
          resolvedAt: approval.resolvedAt,
          resolvedBy: approval.resolvedBy,
          user: user
        });
      }
      
      return mappedApprovals;
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      throw error;
    }
  },

  // Get recent approvals for dashboard
  async getRecent(limit = 10) {
    try {
      return await this.getPending(limit);
    } catch (error) {
      console.error('Error getting recent approvals:', error);
      throw error;
    }
  },

  // Create approval request - part of transactional workflow
  async create(approvalData) {
    try {
      const { userId, conversationId, actionType, payload, priority = 1 } = approvalData;
      
      if (!userId || !actionType) {
        throw new Error('userId and actionType are required');
      }

      const approvalId = this.generateApprovalId();
      const newApproval = {
        approvalId,
        userId,
        conversationId: conversationId || null,
        actionType, // 'generate_invoice' | 'create_order' | 'refund' | etc.
        payload: payload || {},
        status: 'pending',
        priority,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
        metadata: {}
      };

      const result = await db.collection(COLLECTIONS.APPROVALS).insertOne(newApproval);
      
      // Fetch user data for enrichment
      const user = await UserOperations.getByUserId(userId);
      
      console.log(`✅ Approval created: ${approvalId} for user ${userId} - ${actionType}`);
      
      return { 
        ...newApproval, 
        _id: result.insertedId,
        user 
      };
    } catch (error) {
      console.error('Error creating approval:', error);
      throw error;
    }
  },

  // Resolve approval - completes the transactional workflow
  async resolve(approvalId, resolution, resolvedBy) {
    try {
      const { status, notes = '' } = resolution;
      
      if (!['approved', 'rejected'].includes(status)) {
        throw new Error('Status must be approved or rejected');
      }

      const result = await db.collection(COLLECTIONS.APPROVALS).findOneAndUpdate(
        { approvalId },
        {
          $set: {
            status,
            resolvedBy,
            resolvedAt: new Date().toISOString(),
            notes,
            updatedAt: new Date().toISOString()
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        throw new Error(`Approval ${approvalId} not found`);
      }

      console.log(`✅ Approval ${approvalId} ${status} by ${resolvedBy}`);
      
      return result.value;
    } catch (error) {
      console.error('Error resolving approval:', error);
      throw error;
    }
  },

  // Execute approval action (called after approval)
  async executeApproval(approvalId) {
    try {
      const approval = await this.getByApprovalId(approvalId);
      
      if (!approval) {
        throw new Error('Approval not found');
      }
      
      if (approval.status !== 'approved') {
        throw new Error('Approval must be approved before execution');
      }

      // Execute based on actionType
      const { actionType, payload, userId } = approval;
      let result;

      switch (actionType) {
        case 'create_order':
          result = await this.executeCreateOrder(userId, payload);
          break;
        case 'generate_invoice':
          result = await this.executeGenerateInvoice(userId, payload);
          break;
        case 'refund':
          result = await this.executeRefund(userId, payload);
          break;
        default:
          throw new Error(`Unknown actionType: ${actionType}`);
      }

      // Mark as executed
      await db.collection(COLLECTIONS.APPROVALS).updateOne(
        { approvalId },
        {
          $set: {
            executedAt: new Date().toISOString(),
            executionResult: result,
            updatedAt: new Date().toISOString()
          }
        }
      );

      return result;
    } catch (error) {
      console.error('Error executing approval:', error);
      throw error;
    }
  },

  // Execute create order action
  async executeCreateOrder(userId, payload) {
    try {
      const { items, totalAmount } = payload;
      
      // Create order using OrderOperations
      const order = await OrderOperations.create({
        userId,
        items,
        totalAmount,
        status: 'confirmed',
        source: 'approval'
      });

      return { orderId: order.orderId, status: 'created' };
    } catch (error) {
      console.error('Error executing create order:', error);
      throw error;
    }
  },

  // Execute generate invoice action
  async executeGenerateInvoice(userId, payload) {
    try {
      const { orderId, amount } = payload;
      const user = await UserOperations.getByUserId(userId);
      
      // Create invoice using InvoiceOperations
      const invoice = await InvoiceOperations.create({
        userId,
        orderId,
        amount,
        platform: user?.platform || 'telegram',
        platformHandle: user?.telegramId || user?.phoneNumber,
        status: 'pending'
      });

      return { invoiceId: invoice.invoiceId, status: 'created' };
    } catch (error) {
      console.error('Error executing generate invoice:', error);
      throw error;
    }
  },

  // Execute refund action
  async executeRefund(userId, payload) {
    try {
      const { orderId, amount, reason } = payload;
      
      // Update order status
      await OrderOperations.updateStatus(orderId, 'refunded', 'approval_system');

      return { orderId, status: 'refunded', amount, reason };
    } catch (error) {
      console.error('Error executing refund:', error);
      throw error;
    }
  },

  // Get approval by approvalId
  async getByApprovalId(approvalId) {
    try {
      const approval = await db.collection(COLLECTIONS.APPROVALS).findOne({ approvalId });
      
      if (approval && approval.userId) {
        approval.user = await UserOperations.getByUserId(approval.userId);
      }
      
      return approval;
    } catch (error) {
      console.error('Error getting approval by ID:', error);
      throw error;
    }
  },

  // Get approvals by userId
  async getByUserId(userId, limit = 50) {
    try {
      return await db.collection(COLLECTIONS.APPROVALS)
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting approvals by userId:', error);
      throw error;
    }
  },

  // Get approvals by date range
  async getByDateRange(startDate, endDate = new Date()) {
    try {
      return await db.collection(COLLECTIONS.APPROVALS)
        .find({
          createdAt: {
            $gte: startDate instanceof Date ? startDate.toISOString() : startDate,
            $lte: endDate instanceof Date ? endDate.toISOString() : endDate
          }
        })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error getting approvals by date range:', error);
      throw error;
    }
  },

  // Get approval statistics
  async getStats() {
    try {
      const total = await db.collection(COLLECTIONS.APPROVALS).countDocuments();
      const pending = await db.collection(COLLECTIONS.APPROVALS).countDocuments({ status: 'pending' });
      const approved = await db.collection(COLLECTIONS.APPROVALS).countDocuments({ status: 'approved' });
      const rejected = await db.collection(COLLECTIONS.APPROVALS).countDocuments({ status: 'rejected' });

      return { total, pending, approved, rejected };
    } catch (error) {
      console.error('Error getting approval stats:', error);
      throw error;
    }
  }
};

const CustomerOperations = {
  // Get or create customer
  async upsert(customer) {
    const { phone } = customer;
    
    return await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
      { phone },
      {
        $set: {
          ...customer,
          lastSeen: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  },
  
  // Get customer by phone
  async getByPhone(phone) {
    return await db.collection(COLLECTIONS.CUSTOMERS).findOne({ phone });
  }
};

const AuditOperations = {
  // Log action
  async log(action, details, userId = 'system') {
    const logEntry = {
      action,
      details,
      userId,
      timestamp: new Date(),
      ip: details.ip || 'unknown'
    };
    
    await db.collection(COLLECTIONS.AUDIT_LOGS).insertOne(logEntry);
    return logEntry;
  },
  
  // Get recent logs
  async getRecent(limit = 100) {
    return await db.collection(COLLECTIONS.AUDIT_LOGS)
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
};

const InventoryOperations = {
  // Get all inventory items
  async getAll() {
    return await db.collection(COLLECTIONS.INVENTORY)
      .find({})
      .sort({ name: 1 })
      .toArray();
  },
  
  // Get inventory item by ID
  async getById(id) {
    return await db.collection(COLLECTIONS.INVENTORY).findOne({ id });
  },
  
  // Get inventory item by SKU
  async getBySku(sku) {
    return await db.collection(COLLECTIONS.INVENTORY).findOne({ sku: sku.toUpperCase() });
  },
  
  // Create new inventory item
  async create(item) {
    const now = new Date();
    const dateStr = now.getFullYear() + 
      String(now.getMonth() + 1).padStart(2, '0') + 
      String(now.getDate()).padStart(2, '0');
    const randomSuffix = Math.random().toString(36).substr(2, 9).toUpperCase();
    
    const newItem = {
      ...item,
      id: `INV-${dateStr}-${randomSuffix}`,
      createdAt: now,
      updatedAt: now
    };
    
    await db.collection(COLLECTIONS.INVENTORY).insertOne(newItem);
    return newItem;
  },
  
  // Update inventory item
  async update(id, updateData) {
    const result = await db.collection(COLLECTIONS.INVENTORY).updateOne(
      { id },
      { $set: { ...updateData, updatedAt: new Date() } }
    );
    
    if (result.matchedCount > 0) {
      return await this.getById(id);
    }
    return null;
  },
  
  // Delete inventory item
  async delete(id) {
    try {
      const result = await db.collection(COLLECTIONS.INVENTORY).deleteOne({ _id: id });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  },
  
  // Get low stock items
  async getLowStock() {
    return await db.collection(COLLECTIONS.INVENTORY)
      .find({ $expr: { $lt: ['$quantity', '$lowStockThreshold'] } })
      .sort({ quantity: 1 })
      .toArray();
  },
  
  // Update inventory quantity
  async updateQuantity(id, quantity, operation = 'set') {
    const update = operation === 'add' 
      ? { $inc: { quantity }, $set: { updatedAt: new Date() } }
      : { $set: { quantity, updatedAt: new Date() } };
    
    const result = await db.collection(COLLECTIONS.INVENTORY).updateOne({ id }, update);
    return result.matchedCount > 0;
  }
};

const OrderOperations = {
  // Get all orders with optional filters
  async getAll(filters = {}) {
    const query = {};
    if (filters.customerId) query.customerId = filters.customerId;
    if (filters.status) query.status = filters.status;
    if (filters.platform) query.platform = filters.platform;
    
    return await db.collection(COLLECTIONS.ORDERS)
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
  },
  
  // Get order by ID
  async getById(orderId) {
    return await db.collection(COLLECTIONS.ORDERS).findOne({ orderId });
  },
  
  // Get orders by customer ID
  async getByCustomerId(customerId) {
    return await db.collection(COLLECTIONS.ORDERS)
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();
  },
  
  // Get orders by date range
  async getByDateRange(startDate, endDate = new Date()) {
    return await db.collection(COLLECTIONS.ORDERS)
      .find({
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ createdAt: -1 })
      .toArray();
  },

  // Get recent orders (for proactive intelligence)
  async getRecent(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await db.collection(COLLECTIONS.ORDERS)
      .find({
        createdAt: {
          $gte: startDate
        }
      })
      .sort({ createdAt: -1 })
      .toArray();
  },
  
  // Create new order
  async create(order) {
    const newOrder = {
      ...order,
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection(COLLECTIONS.ORDERS).insertOne(newOrder);
    return newOrder;
  },
  
  // Update order status
  async updateStatus(orderId, status, updatedBy = 'system') {
    const result = await db.collection(COLLECTIONS.ORDERS).updateOne(
      { orderId },
      { 
        $set: { 
          status, 
          updatedAt: new Date(),
          updatedBy
        } 
      }
    );
    
    if (result.matchedCount > 0) {
      return await this.getById(orderId);
    }
    return null;
  },
  
  // Update order
  async update(orderId, updateData) {
    const result = await db.collection(COLLECTIONS.ORDERS).updateOne(
      { orderId },
      { $set: { ...updateData, updatedAt: new Date() } }
    );
    
    if (result.matchedCount > 0) {
      return await this.getById(orderId);
    }
    return null;
  },
  
  // Delete order
  async delete(orderId) {
    const result = await db.collection(COLLECTIONS.ORDERS).deleteOne({ orderId });
    return result.deletedCount > 0;
  },
  
  // Get order statistics
  async getStats(startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
    const matchStage = startDate ? { createdAt: { $gte: startDate } } : {};
    
    const stats = await db.collection(COLLECTIONS.ORDERS)
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' }
          }
        }
      ])
      .toArray();
    
    return stats.reduce((acc, stat) => {
      acc[stat._id] = { count: stat.count, totalAmount: stat.totalAmount };
      return acc;
    }, {});
  },

  // Get order by ID
  async getById(orderId) {
    try {
      const order = await db.collection(COLLECTIONS.ORDERS).findOne({ 
        $or: [
          { _id: orderId },
          { id: orderId },
          { orderId: orderId }
        ]
      });
      return order;
    } catch (error) {
      console.error('Error getting order by ID:', error);
      throw error;
    }
  },

  // Update order status
  async updateStatus(orderId, status, updatedBy = 'admin') {
    try {
      const result = await db.collection(COLLECTIONS.ORDERS).findOneAndUpdate(
        { 
          $or: [
            { _id: orderId },
            { id: orderId },
            { orderId: orderId }
          ]
        },
        { 
          $set: { 
            status, 
            updatedAt: new Date().toISOString(),
            updatedBy
          }
        },
        { returnDocument: 'after' }
      );
      return result.value;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  },

  // Get orders by customer ID
  async getByCustomerId(customerId) {
    try {
      const orders = await db.collection(COLLECTIONS.ORDERS)
        .find({ customerId })
        .sort({ createdAt: -1 })
        .toArray();
      return orders;
    } catch (error) {
      console.error('Error getting orders by customer ID:', error);
      throw error;
    }
  }
};

// User Operations with Production-Grade User Identity
const UserOperations = {
  // Generate unique user ID: USR-YYYYMMDD-XXXX
  generateUserId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `USR-${date}-${random}`;
  },

  // Find or create user by platform handle (telegramId or phoneNumber)
  async findOrCreateUser(platformData) {
    try {
      const { telegramId, phoneNumber, platform, name, language = 'en' } = platformData;
      
      // Build query based on available identifiers
      const query = {};
      if (telegramId) query.telegramId = telegramId.toString();
      if (phoneNumber) query.phoneNumber = phoneNumber;
      
      if (Object.keys(query).length === 0) {
        throw new Error('No platform identifier provided (telegramId or phoneNumber required)');
      }

      // Check if user exists
      let user = await db.collection(COLLECTIONS.USERS).findOne({
        $or: [
          ...(telegramId ? [{ telegramId: telegramId.toString() }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : [])
        ]
      });

      if (user) {
        // Update last seen and any changed fields
        const updateData = {
          updatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          ...(name && { name }),
          ...(platform && { platform }),
          ...(language && { language })
        };
        
        await db.collection(COLLECTIONS.USERS).updateOne(
          { _id: user._id },
          { $set: updateData }
        );
        
        // Return updated user
        return { ...user, ...updateData };
      }

      // Create new user with proper schema
      const userId = this.generateUserId();
      const newUser = {
        userId,
        name: name || 'Unknown User',
        telegramId: telegramId ? telegramId.toString() : null,
        phoneNumber: phoneNumber || null,
        platform: platform || 'telegram',
        language: language || 'en',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        isActive: true,
        metadata: {}
      };

      const result = await db.collection(COLLECTIONS.USERS).insertOne(newUser);
      console.log(`✅ New user created: ${userId} (${name || 'Unknown'})`);
      
      return { ...newUser, _id: result.insertedId };
    } catch (error) {
      console.error('Error in findOrCreateUser:', error);
      throw error;
    }
  },

  // Get user by userId
  async getByUserId(userId) {
    try {
      return await db.collection(COLLECTIONS.USERS).findOne({ userId });
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  },

  // Get user by Telegram ID
  async getByTelegramId(telegramId) {
    try {
      return await db.collection(COLLECTIONS.USERS).findOne({ 
        telegramId: telegramId.toString() 
      });
    } catch (error) {
      console.error('Error getting user by Telegram ID:', error);
      throw error;
    }
  },

  // Get user by phone number
  async getByPhoneNumber(phoneNumber) {
    try {
      return await db.collection(COLLECTIONS.USERS).findOne({ phoneNumber });
    } catch (error) {
      console.error('Error getting user by phone number:', error);
      throw error;
    }
  },

  // Get all users with pagination
  async getAll(limit = 100, offset = 0) {
    try {
      return await db.collection(COLLECTIONS.USERS)
        .find({})
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting all users:', error);
      throw error;
    }
  },

  // Update user
  async update(userId, updateData) {
    try {
      const result = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
        { userId },
        { 
          $set: {
            ...updateData,
            updatedAt: new Date().toISOString()
          }
        },
        { returnDocument: 'after' }
      );
      return result.value;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  // Delete user and associated records (but preserve for analytics)
  async delete(userId) {
    try {
      // Soft delete - mark as inactive rather than removing
      const result = await db.collection(COLLECTIONS.USERS).updateOne(
        { userId },
        { 
          $set: {
            isActive: false,
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      );
      
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  // Search users by name or userId
  async search(query) {
    try {
      const searchRegex = new RegExp(query, 'i');
      return await db.collection(COLLECTIONS.USERS)
        .find({
          $or: [
            { name: searchRegex },
            { userId: searchRegex },
            { phoneNumber: searchRegex }
          ],
          isActive: { $ne: false }
        })
        .limit(20)
        .toArray();
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }
};

// Invoice Operations with Production-Grade ID Generation and Linking
const InvoiceOperations = {
  // Generate unique invoice ID: INV-YYYYMMDD-XXXX
  generateInvoiceId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INV-${date}-${random}`;
  },

  // Create new invoice linked to user and order
  async create(invoiceData) {
    try {
      const { userId, orderId, items, totalAmount, tax = 0, discount = 0, notes = '', dueDate } = invoiceData;
      
      // Validate required fields
      if (!userId) throw new Error('userId is required');
      if (!items || !Array.isArray(items)) throw new Error('items array is required');
      
      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
      const calculatedTotal = subtotal + tax - discount;
      
      const invoiceId = this.generateInvoiceId();
      const newInvoice = {
        invoiceId,
        userId,
        orderId: orderId || null,
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.quantity * item.price
        })),
        subtotal,
        tax,
        discount,
        totalAmount: totalAmount || calculatedTotal,
        status: 'pending',
        notes,
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection(COLLECTIONS.INVOICES).insertOne(newInvoice);
      return { ...newInvoice, _id: result.insertedId };
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  },

  // Get invoice by invoiceId
  async getByInvoiceId(invoiceId) {
    try {
      return await db.collection(COLLECTIONS.INVOICES).findOne({ invoiceId });
    } catch (error) {
      console.error('Error getting invoice:', error);
      throw error;
    }
  },

  // Get all invoices with pagination
  async getAll(limit = 100, offset = 0) {
    try {
      return await db.collection(COLLECTIONS.INVOICES)
        .find({})
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting invoices:', error);
      throw error;
    }
  },

  // Get invoices by userId
  async getByUserId(userId) {
    try {
      return await db.collection(COLLECTIONS.INVOICES)
        .find({ userId })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error getting user invoices:', error);
      throw error;
    }
  },

  // Get invoices by orderId
  async getByOrderId(orderId) {
    try {
      return await db.collection(COLLECTIONS.INVOICES)
        .find({ orderId })
        .sort({ createdAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error getting order invoices:', error);
      throw error;
    }
  },

  // Update invoice status
  async updateStatus(invoiceId, status, updatedBy = 'system') {
    try {
      const validStatuses = ['pending', 'paid', 'overdue', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }
      
      const result = await db.collection(COLLECTIONS.INVOICES).findOneAndUpdate(
        { invoiceId },
        { 
          $set: { 
            status: status,
            updatedAt: new Date(),
            ...(status === 'paid' ? { paidAt: new Date(), paidBy: updatedBy } : {})
          }
        },
        { returnDocument: 'after' }
      );
      
      return result.value;
    } catch (error) {
      console.error('Error updating invoice status:', error);
      throw error;
    }
  },

  // Update invoice
  async update(invoiceId, updateData) {
    try {
      const { items, totalAmount, tax, discount, notes, dueDate } = updateData;
      
      // Recalculate totals if items changed
      let subtotal, calculatedTotal;
      if (items) {
        subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        calculatedTotal = subtotal + (tax || 0) - (discount || 0);
      }
      
      const result = await db.collection(COLLECTIONS.INVOICES).findOneAndUpdate(
        { invoiceId },
        { 
          $set: { 
            ...(items && { 
              items: items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                total: item.quantity * item.price
              })),
              subtotal,
              totalAmount: calculatedTotal
            }),
            ...(tax !== undefined && { tax }),
            ...(discount !== undefined && { discount }),
            ...(notes && { notes }),
            ...(dueDate && { dueDate: new Date(dueDate) }),
            ...(totalAmount && { totalAmount }),
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      return result.value;
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  },

  // Delete invoice
  async delete(invoiceId) {
    try {
      const result = await db.collection(COLLECTIONS.INVOICES).deleteOne({ invoiceId });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting invoice:', error);
      throw error;
    }
  },

  // Get invoice statistics
  async getStats(startDate) {
    try {
      const matchStage = startDate ? { createdAt: { $gte: startDate } } : {};
      
      const stats = await db.collection(COLLECTIONS.INVOICES)
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalAmount: { $sum: '$totalAmount' }
            }
          }
        ])
        .toArray();
      
      const totals = await db.collection(COLLECTIONS.INVOICES)
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalInvoices: { $sum: 1 },
              totalRevenue: { $sum: '$totalAmount' },
              avgInvoiceValue: { $avg: '$totalAmount' }
            }
          }
        ])
        .toArray();
      
      return {
        byStatus: stats.reduce((acc, s) => ({ ...acc, [s._id]: { count: s.count, total: s.totalAmount } }), {}),
        totals: totals[0] || { totalInvoices: 0, totalRevenue: 0, avgInvoiceValue: 0 }
      };
    } catch (error) {
      console.error('Error getting invoice stats:', error);
      throw error;
    }
  },

  // Get overdue invoices
  async getOverdue() {
    try {
      return await db.collection(COLLECTIONS.INVOICES)
        .find({ 
          status: 'pending',
          dueDate: { $lt: new Date() }
        })
        .sort({ dueDate: 1 })
        .toArray();
    } catch (error) {
      console.error('Error getting overdue invoices:', error);
      throw error;
    }
  }
};

module.exports = {
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
};
