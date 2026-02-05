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
  SYSTEM_CONFIG: 'system_config',
  INVENTORY: 'inventory'
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
    console.log('⚠️ Using in-memory fallback database (data will be lost on restart)');
    
    // Initialize in-memory fallback
    db = createInMemoryFallback();
    await initializeDefaultData();
    
    return db;
  }
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
  },

  // Get conversations by date range
  async getByDateRange(startDate, endDate) {
    return await db.collection(COLLECTIONS.CONVERSATIONS)
      .find({
        lastMessageAt: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ lastMessageAt: -1 })
      .toArray();
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
  },

  // Get approvals by date range
  async getByDateRange(startDate, endDate = new Date()) {
    return await db.collection(COLLECTIONS.APPROVALS)
      .find({
        requestedAt: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ requestedAt: -1 })
      .toArray();
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
    const newItem = {
      ...item,
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date()
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

module.exports = {
  connectDatabase,
  getDatabase,
  closeDatabase,
  BotOperations,
  ConversationOperations,
  ApprovalOperations,
  CustomerOperations,
  AuditOperations,
  InventoryOperations,
  OrderOperations,
  COLLECTIONS
};
