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
  AUDIT_LOGS: 'audit_logs',
  AI_RESPONSES: 'ai_responses',
  SYSTEM_CONFIG: 'system_config'
};

// Connect to MongoDB
async function connectDatabase() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    console.log('✅ Connected to MongoDB database');
    
    // Create indexes for better performance
    await createIndexes();
    
    // Initialize default data
    await initializeDefaultData();
    
    return db;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    throw error;
  }
}

// Create database indexes
async function createIndexes() {
  try {
    // Bots collection indexes
    await db.collection(COLLECTIONS.BOTS).createIndex({ botId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.BOTS).createIndex({ status: 1 });
    
    // Conversations collection indexes
    await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ customerId: 1 });
    await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ botId: 1 });
    await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ lastMessageAt: -1 });
    
    // Approvals collection indexes
    await db.collection(COLLECTIONS.APPROVALS).createIndex({ status: 1 });
    await db.collection(COLLECTIONS.APPROVALS).createIndex({ priority: 1 });
    await db.collection(COLLECTIONS.APPROVALS).createIndex({ requestedAt: -1 });
    
    // Orders collection indexes
    await db.collection(COLLECTIONS.ORDERS).createIndex({ orderId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.ORDERS).createIndex({ botId: 1 });
    await db.collection(COLLECTIONS.ORDERS).createIndex({ status: 1 });
    
    // Customers collection indexes
    await db.collection(COLLECTIONS.CUSTOMERS).createIndex({ phone: 1 }, { unique: true });
    await db.collection(COLLECTIONS.CUSTOMERS).createIndex({ email: 1 });
    
    // Audit logs collection indexes
    await db.collection(COLLECTIONS.AUDIT_LOGS).createIndex({ timestamp: -1 });
    await db.collection(COLLECTIONS.AUDIT_LOGS).createIndex({ action: 1 });
    
    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
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
  if (client) {
    await client.close();
    console.log('✅ Database connection closed');
  }
}

// Helper functions for common operations
const BotOperations = {
  // Get all bots
  async getAll() {
    return await db.collection(COLLECTIONS.BOTS).find({}).toArray();
  },
  
  // Get bot by ID
  async getById(botId) {
    return await db.collection(COLLECTIONS.BOTS).findOne({ botId });
  },
  
  // Update bot status
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

const ConversationOperations = {
  // Get all conversations
  async getAll() {
    return await db.collection(COLLECTIONS.CONVERSATIONS)
      .find({})
      .sort({ lastMessageAt: -1 })
      .toArray();
  },
  
  // Get conversation by customer ID
  async getByCustomerId(customerId) {
    return await db.collection(COLLECTIONS.CONVERSATIONS)
      .find({ customerId })
      .sort({ lastMessageAt: -1 })
      .toArray();
  },
  
  // Create or update conversation
  async upsert(conversation) {
    const { customerId, botId } = conversation;
    
    return await db.collection(COLLECTIONS.CONVERSATIONS).updateOne(
      { customerId, botId },
      {
        $set: {
          ...conversation,
          lastMessageAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  },
  
  // Add message to conversation
  async addMessage(customerId, botId, message) {
    return await db.collection(COLLECTIONS.CONVERSATIONS).updateOne(
      { customerId, botId },
      {
        $push: {
          messages: {
            ...message,
            timestamp: new Date()
          }
        },
        $set: {
          lastMessageAt: new Date()
        }
      }
    );
  }
};

const ApprovalOperations = {
  // Get all approvals
  async getAll() {
    return await db.collection(COLLECTIONS.APPROVALS)
      .find({})
      .sort({ requestedAt: -1 })
      .toArray();
  },
  
  // Get pending approvals
  async getPending() {
    return await db.collection(COLLECTIONS.APPROVALS)
      .find({ status: 'pending' })
      .sort({ priority: -1, requestedAt: -1 })
      .toArray();
  },
  
  // Create approval request
  async create(approval) {
    const newApproval = {
      ...approval,
      id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestedAt: new Date(),
      status: 'pending'
    };
    
    await db.collection(COLLECTIONS.APPROVALS).insertOne(newApproval);
    return newApproval;
  },
  
  // Update approval status
  async updateStatus(id, status, resolvedBy) {
    return await db.collection(COLLECTIONS.APPROVALS).updateOne(
      { id },
      {
        $set: {
          status,
          resolvedBy,
          resolvedAt: new Date()
        }
      }
    );
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

module.exports = {
  connectDatabase,
  getDatabase,
  closeDatabase,
  BotOperations,
  ConversationOperations,
  ApprovalOperations,
  CustomerOperations,
  AuditOperations,
  COLLECTIONS
};
