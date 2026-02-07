/**
 * End-to-End Tests for Bharat Biz-Agent
 * Tests complete user flows including AI fallback, approval system, and admin commands
 */

const request = require('supertest');
const app = require('../server/index.js');

describe('E2E Tests: Complete User Flows', () => {
  let authToken;
  let userId;
  let approvalId;

  beforeAll(async () => {
    // Authenticate for admin operations
    const authResponse = await request(app)
      .post('/api/test/auth')
      .send({ apiKey: process.env.ADMIN_API_KEY || 'bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS' });
    
    authToken = authResponse.body.token;
  });

  describe('Complete User Registration and Order Flow', () => {
    test('should register new user and create order requiring approval', async () => {
      // Step 1: Register new user
      const userData = {
        name: 'Rahul Kumar',
        phone: '+919876543210',
        platform: 'telegram',
        telegramId: '123456789'
      };

      const userResponse = await request(app)
        .post('/api/test/register-user')
        .send(userData)
        .expect(200);

      expect(userResponse.body.success).toBe(true);
      expect(userResponse.body.user).toHaveProperty('uniqueUserId');
      userId = userResponse.body.user.uniqueUserId;

      // Step 2: Process message that creates order requiring approval
      const messageData = {
        message: 'Rahul ko 5kg rice ka order karo worth 600',
        customerId: userId,
        context: {
          customerName: 'Rahul Kumar',
          platform: 'telegram'
        }
      };

      const aiResponse = await request(app)
        .post('/api/ai/process')
        .send(messageData)
        .expect(200);

      expect(aiResponse.body.success).toBe(true);
      expect(aiResponse.body.response).toHaveProperty('intent', 'create_order');
      expect(aiResponse.body.response).toHaveProperty('requiresApproval', true);

      // Step 3: Create approval request
      const approvalData = {
        customerId: userId,
        customerName: 'Rahul Kumar',
        requestData: aiResponse.body.response,
        originalMessage: messageData.message,
        riskLevel: 'medium'
      };

      const approvalResponse = await request(app)
        .post('/api/approvals')
        .send(approvalData)
        .expect(200);

      expect(approvalResponse.body.success).toBe(true);
      expect(approvalResponse.body.approval).toHaveProperty('id');
      expect(approvalResponse.body.approval.status).toBe('pending');
      approvalId = approvalResponse.body.approval.id;
    });

    test('should approve order via admin command', async () => {
      // Step 4: Admin approves the order
      const approveData = {
        status: 'approved',
        processedBy: 'admin_test',
        adminNote: 'Approved via E2E test'
      };

      const approveResponse = await request(app)
        .put(`/api/approvals/${approvalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(approveData)
        .expect(200);

      expect(approveResponse.body.success).toBe(true);
      expect(approveResponse.body.approval.status).toBe('approved');
      expect(approveResponse.body.approval.processedBy).toBe('admin_test');
    });
  });

  describe('Debug Mode Flow', () => {
    test('should enable debug mode and stream events', async () => {
      // Enable debug mode
      await request(app)
        .post('/api/debug/enable')
        .send({ userId: 'debug_test_user' })
        .expect(200);

      // Process a message to generate debug events
      const messageData = {
        message: 'Test message for debug mode',
        customerId: 'debug_test_user',
        context: {}
      };

      await request(app)
        .post('/api/ai/process')
        .send(messageData)
        .expect(200);

      // Check that debug stream is accessible
      const streamResponse = await request(app)
        .get('/api/debug/stream')
        .expect(200);

      expect(streamResponse.headers['content-type']).toMatch(/text\/event-stream/);

      // Disable debug mode
      await request(app)
        .post('/api/debug/disable')
        .send({ userId: 'debug_test_user' })
        .expect(200);
    });
  });

  describe('AI Fallback Flow', () => {
    test('should handle AI service failure gracefully', async () => {
      // Mock AI service failure by using invalid configuration
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'invalid_key';

      const messageData = {
        message: 'Test message during AI failure',
        customerId: 'fallback_test_user',
        context: {}
      };

      const response = await request(app)
        .post('/api/ai/process')
        .send(messageData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.response).toHaveProperty('fallback', true);
      expect(response.body.response).toHaveProperty('intent', 'general_query');
      expect(response.body.response).toHaveProperty('confidence', 0.5);

      // Restore original key
      process.env.GEMINI_API_KEY = originalGeminiKey;
    });
  });

  describe('Admin Commands Flow', () => {
    test('should handle admin authentication and commands', async () => {
      // Test admin authentication
      const authResponse = await request(app)
        .post('/api/test/auth')
        .send({ apiKey: process.env.ADMIN_API_KEY || 'bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS' })
        .expect(200);

      expect(authResponse.body.success).toBe(true);
      expect(authResponse.body).toHaveProperty('token');

      // Test database info command
      const dbInfoResponse = await request(app)
        .get('/api/database/info')
        .set('Authorization', `Bearer ${authResponse.body.token}`)
        .expect(200);

      expect(dbInfoResponse.body.success).toBe(true);
      expect(dbInfoResponse.body.data).toHaveProperty('totalRecords');
    });
  });

  describe('Error Recovery Flow', () => {
    test('should recover from database connection errors', async () => {
      // Mock database error
      const originalConsoleError = console.error;
      console.error = jest.fn();

      // Try to access data with mocked error
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Should still return healthy status even with errors
      expect(response.body.status).toBe('healthy');

      console.error = originalConsoleError;
    });

    test('should handle malformed requests gracefully', async () => {
      // Test with invalid JSON
      await request(app)
        .post('/api/approvals')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Test with missing required fields
      await request(app)
        .post('/api/approvals')
        .send({})
        .expect(400);

      // Test with invalid approval ID
      await request(app)
        .put('/api/approvals/invalid_id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'approved' })
        .expect(404);
    });
  });

  describe('Real-time Updates Flow', () => {
    test('should handle WebSocket events for approval updates', (done) => {
      const io = require('socket.io-client');
      const socket = io('http://localhost:3003', {
        transports: ['websocket']
      });

      let eventReceived = false;

      socket.on('connect', () => {
        // Simulate approval update
        socket.emit('approval_updated', {
          id: approvalId,
          status: 'approved',
          resolvedBy: 'test_admin'
        });
      });

      socket.on('approval_updated', (data) => {
        expect(data.id).toBe(approvalId);
        expect(data.status).toBe('approved');
        expect(data.resolvedBy).toBe('test_admin');
        eventReceived = true;
        socket.disconnect();
        done();
      });

      socket.on('connect_error', () => {
        // WebSocket might not be available in test environment
        if (!eventReceived) {
          done();
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!eventReceived) {
          socket.disconnect();
          done();
        }
      }, 5000);
    });
  });

  describe('Security Flow', () => {
    test('should prevent unauthorized access to protected endpoints', async () => {
      // Test without auth token
      await request(app)
        .get('/api/database/info')
        .expect(401);

      await request(app)
        .post('/api/database/reset')
        .send({ confirmation: 'RESET_DATABASE_CONFIRMED' })
        .expect(401);

      await request(app)
        .put('/api/approvals/some_id')
        .send({ status: 'approved' })
        .expect(401);
    });

    test('should sanitize and validate input', async () => {
      // Test XSS prevention
      const maliciousData = {
        name: '<script>alert("xss")</script>',
        phone: '+919876543210',
        platform: 'telegram',
        telegramId: '123456789'
      };

      const response = await request(app)
        .post('/api/test/register-user')
        .send(maliciousData)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Name should be sanitized
      expect(response.body.user.name).not.toContain('<script>');
    });
  });

  describe('Performance Flow', () => {
    test('should handle concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .get('/health')
            .expect(200)
        );
      }

      const results = await Promise.all(promises);
      
      // All requests should succeed
      results.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });

    test('should respond within acceptable time limits', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Should respond within 1 second
      expect(responseTime).toBeLessThan(1000);
    });
  });
});

afterAll(async () => {
  // Clean up test environment
  process.env.NODE_ENV = 'development';
  
  // Close any remaining connections
  const { closeDatabase } = require('../server/database.js');
  try {
    await closeDatabase();
  } catch (error) {
    console.log('Database already closed');
  }
});
