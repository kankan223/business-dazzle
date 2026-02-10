const request = require('supertest');
const app = require('../index');

describe('Approval flow E2E', () => {
  const approvalId = 'test-approval-1';

  beforeAll(async () => {
    await request(app)
      .post('/api/approvals/seed')
      .send({
        id: approvalId,
        botId: 'bot-2',
        botName: 'Support Bot',
        customerName: 'Test User',
        customerPhone: '9999999999',
        action: 'generate_invoice',
        details: { amount: 6000 },
        platform: 'telegram',
        priority: 'medium',
      })
      .expect(200);
  });

  it('creates a pending approval', async () => {
    const res = await request(app)
      .get('/api/approvals')
      .expect(200);

    const approval = res.body.find(a => a.id === approvalId);
    expect(approval).toBeDefined();
    expect(approval.status).toBe('pending');
  });

  it('approves the request', async () => {
    const res = await request(app)
      .post(`/api/approvals/${approvalId}`)
      .set('x-api-key', process.env.ADMIN_API_KEY)
      .send({ approved: true })
      .expect(200);

    expect(res.body.approval.status).toBe('approved');
  });
});
