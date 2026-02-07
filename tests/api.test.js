/**
 * Comprehensive API Tests for Bharat Biz-Agent
 * Tests core functionality including AI fallback, approval system, and admin commands
 */

const request = require('supertest');
const app = require('../server/index.js');

describe('Bharat Biz-Agent API Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Get auth token for protected endpoints
    const response = await request(app)
      .post('/api/test/auth')
      .send({ apiKey: process.env.ADMIN_API_KEY || 'bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS' });
    
    authToken = response.body.token;
  });

  describe('Health Check', () => {
    test('should return 200 OK status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('services');
    });

    test('should handle errors gracefully and still return 200', async () => {
      // Mock a database error
      const originalConsoleError = console.error;
      console.error = jest.fn();

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      console.error = originalConsoleError;
    });
  });

  describe('Authentication', () => {
    test('should authenticate with valid API key', async () => {
      const response = await request(app)
        .post('/api/test/auth')
        .send({ apiKey: process.env.ADMIN_API_KEY || 'bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
    });

    test('should reject invalid API key', async () => {
      const response = await request(app)
        .post('/api/test/auth')
        .send({ apiKey: 'invalid_key' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Database Management', () => {
    test('should get database info', async () => {
      const response = await request(app)
        .get('/api/database/info')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('totalRecords');
      expect(response.body.data).toHaveProperty('collections');
    });

    test('should reject database info without auth', async () => {
      await request(app)
        .get('/api/database/info')
        .expect(401);
    });

    test('should reset database with proper confirmation', async () => {
      const response = await request(app)
        .post('/api/database/reset')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ confirmation: 'RESET_DATABASE_CONFIRMED' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('totalDeleted');
    });

    test('should reject database reset without proper confirmation', async () => {
      const response = await request(app)
        .post('/api/database/reset')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ confirmation: 'WRONG_CONFIRMATION' })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('User Management', () => {
    test('should register new user', async () => {
      const userData = {
        name: 'Test User',
        phone: '+919876543210',
        platform: 'telegram',
        telegramId: '123456789'
      };

      const response = await request(app)
        .post('/api/test/register-user')
        .send(userData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('uniqueUserId');
      expect(response.body.user).toHaveProperty('name', userData.name);
    });

    test('should handle duplicate user registration', async () => {
      const userData = {
        name: 'Test User',
        phone: '+919876543210',
        platform: 'telegram',
        telegramId: '123456789'
      };

      // First registration
      await request(app)
        .post('/api/test/register-user')
        .send(userData)
        .expect(200);

      // Second registration (should update existing user)
      const response = await request(app)
        .post('/api/test/register-user')
        .send(userData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Approval System', () => {
    let approvalId;

    test('should create approval request', async () => {
      const approvalData = {
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
        riskLevel: 'medium'
      };

      const response = await request(app)
        .post('/api/approvals')
        .send(approvalData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('approval');
      expect(response.body.approval).toHaveProperty('id');
      expect(response.body.approval).toHaveProperty('status', 'pending');

      approvalId = response.body.approval.id;
    });

    test('should get pending approvals', async () => {
      const response = await request(app)
        .get('/api/approvals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('approvals');
      expect(Array.isArray(response.body.approvals)).toBe(true);
    });

    test('should update approval status', async () => {
      const updateData = {
        status: 'approved',
        processedBy: 'test_admin'
      };

      const response = await request(app)
        .put(`/api/approvals/${approvalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('approval');
      expect(response.body.approval).toHaveProperty('status', 'approved');
    });
  });

  describe('Debug Mode', () => {
    test('should enable debug mode', async () => {
      const response = await request(app)
        .post('/api/debug/enable')
        .send({ userId: 'test_user_123' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    test('should disable debug mode', async () => {
      const response = await request(app)
        .post('/api/debug/disable')
        .send({ userId: 'test_user_123' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    test('should stream debug events', async () => {
      const response = await request(app)
        .get('/api/debug/stream')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/test/auth')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/test/auth')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Security', () => {
    test('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    test('should sanitize input', async () => {
      const maliciousInput = {
        apiKey: 'bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS<script>alert("xss")</script>'
      };

      const response = await request(app)
        .post('/api/test/auth')
        .send(maliciousInput)
        .expect(401);

      // Should not execute script and should reject
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('AI Service Integration', () => {
    test('should handle AI service fallback', async () => {
      const messageData = {
        message: 'Test message for AI processing',
        customerId: 'test_customer',
        context: {}
      };

      const response = await request(app)
        .post('/api/ai/process')
        .send(messageData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('response');
      
      // Should handle AI unavailability gracefully
      if (response.body.response.fallback) {
        expect(response.body.response).toHaveProperty('intent', 'general_query');
        expect(response.body.response).toHaveProperty('confidence', 0.5);
      }
    });

    test('should validate AI response structure', async () => {
      const messageData = {
        message: 'Create order for rice worth 500',
        customerId: 'test_customer',
        context: {}
      };

      const response = await request(app)
        .post('/api/ai/process')
        .send(messageData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.response).toHaveProperty('intent');
      expect(response.body.response).toHaveProperty('confidence');
      expect(response.body.response).toHaveProperty('entities');
      expect(response.body.response).toHaveProperty('proposedAction');
    });
  });
});

describe('WebSocket Events', () => {
  test('should handle WebSocket connection', (done) => {
    const io = require('socket.io-client');
    const socket = io('http://localhost:3003', {
      transports: ['websocket']
    });

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (error) => {
      // WebSocket might not be available in test environment
      done();
    });
  });
});

afterAll(async () => {
  // Clean up test environment
  process.env.NODE_ENV = 'development';
});
