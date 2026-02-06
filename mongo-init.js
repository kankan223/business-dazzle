// MongoDB initialization script for Bharat Biz-Agent
// This script runs when MongoDB container starts for the first time

db = db.getSiblingDB('bharat_biz_agent');

// Create application user
db.createUser({
  user: 'bizagent_app',
  pwd: 'bizagent_password',
  roles: [
    {
      role: 'readWrite',
      db: 'bharat_biz_agent'
    }
  ]
});

// Create collections and indexes
// Orders collection
db.createCollection('orders');
db.orders.createIndex({ orderId: 1 }, { unique: true });
db.orders.createIndex({ customerId: 1 });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ createdAt: -1 });

// Customers collection
db.createCollection('customers');
db.customers.createIndex({ phone: 1 }, { unique: true });
db.customers.createIndex({ email: 1 });

// Inventory collection
db.createCollection('inventory');
db.inventory.createIndex({ sku: 1 }, { unique: true });
db.inventory.createIndex({ name: 1 });

// Audit logs collection
db.createCollection('audit_logs');
db.audit_logs.createIndex({ timestamp: -1 });
db.audit_logs.createIndex({ eventType: 1 });

// Bots collection
db.createCollection('bots');
db.bots.createIndex({ botId: 1 }, { unique: true });
db.bots.createIndex({ status: 1 });

// Conversations collection
db.createCollection('conversations');
db.conversations.createIndex({ customerId: 1 });
db.conversations.createIndex({ lastMessageAt: -1 });

// Approvals collection
db.createCollection('approvals');
db.approvals.createIndex({ id: 1 }, { unique: true });

// AI responses collection
db.createCollection('ai_responses');
db.ai_responses.createIndex({ timestamp: -1 });

// System config collection
db.createCollection('system_config');
db.system_config.createIndex({ key: 1 }, { unique: true });

// Insert initial data
db.inventory.insertMany([
  {
    sku: 'RICE-001',
    name: 'Basmati Rice',
    quantity: 1000,
    unit: 'kg',
    price: 80,
    lowStockThreshold: 100,
    description: 'Premium quality Basmati rice',
    category: 'grains',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    sku: 'WHEAT-001',
    name: 'Whole Wheat',
    quantity: 500,
    unit: 'kg',
    price: 40,
    lowStockThreshold: 50,
    description: 'Fresh whole wheat grains',
    category: 'grains',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    sku: 'SUGAR-001',
    name: 'Refined Sugar',
    quantity: 750,
    unit: 'kg',
    price: 45,
    lowStockThreshold: 75,
    description: 'Premium refined sugar',
    category: 'sugar',
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

// Insert system configuration
db.system_config.insertMany([
  {
    key: 'app_version',
    value: '1.0.0',
    description: 'Application version',
    updatedAt: new Date()
  },
  {
    key: 'ai_model',
    value: 'gemini-1.5-flash',
    description: 'Default AI model',
    updatedAt: new Date()
  },
  {
    key: 'order_prefix',
    value: 'ORD',
    description: 'Order ID prefix',
    updatedAt: new Date()
  }
]);

print('MongoDB initialization completed successfully!');
