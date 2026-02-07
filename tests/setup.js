/**
 * Test Setup for Bharat Biz-Agent
 * Configures test environment and global utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3004'; // Use different port for tests
process.env.MONGODB_URI = 'mongodb://localhost:27017/bharat_biz_agent_test';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test utilities
global.testUtils = {
  // Generate test user data
  generateTestUser: (overrides = {}) => ({
    name: 'Test User',
    phone: '+919876543210',
    platform: 'telegram',
    telegramId: '123456789',
    ...overrides
  }),

  // Generate test approval data
  generateTestApproval: (overrides = {}) => ({
    customerId: 'test_customer_123',
    customerName: 'Test Customer',
    requestData: {
      intent: 'create_order',
      confidence: 0.8,
      entities: {
        products: ['rice'],
        amounts: [500]
      }
    },
    originalMessage: 'Create order for rice worth 500',
    riskLevel: 'medium',
    ...overrides
  }),

  // Generate test order data
  generateTestOrder: (overrides = {}) => ({
    customerId: 'test_customer_123',
    customerName: 'Test Customer',
    customerPhone: '+919876543210',
    items: [{
      name: 'Rice',
      quantity: 5,
      unit: 'kg',
      price: 500
    }],
    platform: 'telegram',
    status: 'pending',
    totalAmount: 500,
    ...overrides
  }),

  // Wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  // Clean up test data
  cleanup: async () => {
    // Add cleanup logic here if needed
    console.log('Test cleanup completed');
  }
};

// Mock external services
jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 'test_message_id' }),
    sendPhoto: jest.fn().mockResolvedValue({ message_id: 'test_photo_id' }),
    sendVoice: jest.fn().mockResolvedValue({ message_id: 'test_voice_id' })
  }));
});

// Mock WebSocket for tests
jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    close: jest.fn()
  }))
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    connected: true,
    disconnect: jest.fn()
  }))
}));

// Global test cleanup
afterEach(async () => {
  // Restore console methods
  Object.assign(console, originalConsole);
  
  // Clear all mocks
  jest.clearAllMocks();
});

afterAll(async () => {
  // Final cleanup
  await global.testUtils.cleanup();
  
  // Close database connection if open
  const { closeDatabase } = require('../server/database.js');
  try {
    await closeDatabase();
  } catch (error) {
    console.log('Database already closed or not connected');
  }
});
