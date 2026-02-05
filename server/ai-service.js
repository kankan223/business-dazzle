/**
 * AI Service for Bharat Biz-Agent
 * Handles customer interactions, task automation, and admin recommendations
 */

const axios = require('axios');

class AIService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
    
    // AI configuration
    this.config = {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: `You are Bharat Biz-Agent, an intelligent business assistant for Indian businesses. 
      
Your capabilities:
- Handle customer inquiries about products, services, and orders
- Process orders and payments with appropriate approvals
- Provide inventory information
- Assist with customer support issues
- Make recommendations for business improvements

Privacy and Security Rules:
- Never share sensitive customer information without explicit admin approval
- Always ask for admin approval for:
  * Refunds over ₹1000
  * Large order modifications
  * Sharing customer data
  * Accessing sensitive business information
- Log all actions that require approval

Business Context:
- You work for Indian businesses
- Support multiple languages (English, Hindi, Hinglish)
- Understand Indian business practices
- Handle GST, taxes, and compliance queries

Response Style:
- Professional but friendly
- Concise and helpful
- Always suggest next steps
- Ask clarifying questions when needed`
    };
  }

  // Process customer message and generate response
  async processCustomerMessage(message, customerContext, conversationHistory) {
    try {
      const prompt = this.buildCustomerPrompt(message, customerContext, conversationHistory);
      
      const response = await this.callAI({
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          { role: 'user', content: prompt }
        ]
      });

      const aiResponse = response.choices[0].message.content;
      
      // Analyze if admin approval is needed
      const approvalNeeded = this.analyzeApprovalNeed(message, aiResponse);
      
      return {
        response: aiResponse,
        approvalNeeded,
        confidence: response.choices[0].finish_reason === 'stop' ? 0.9 : 0.6,
        suggestedActions: this.extractActions(aiResponse),
        language: this.detectLanguage(message)
      };
    } catch (error) {
      console.error('AI processing error:', error);
      return {
        response: 'I apologize, but I\'m having trouble processing your request right now. Please try again or contact our support team.',
        approvalNeeded: false,
        confidence: 0.1,
        suggestedActions: [],
        language: 'en'
      };
    }
  }

  // Generate business recommendations for admin
  async generateBusinessInsights(businessData) {
    try {
      const prompt = `Based on the following business data, provide actionable insights and recommendations:

Business Metrics:
- Total Orders: ${businessData.totalOrders || 0}
- Revenue: ₹${businessData.revenue || 0}
- Active Customers: ${businessData.activeCustomers || 0}
- Bot Performance: ${JSON.stringify(businessData.botPerformance || {})}
- Recent Issues: ${JSON.stringify(businessData.recentIssues || [])}

Please provide:
1. Performance insights
2. Customer service recommendations
3. Efficiency improvements
4. Revenue optimization suggestions
5. Risk areas to monitor`;

      const response = await this.callAI({
        messages: [
          { 
            role: 'system', 
            content: 'You are a business intelligence expert analyzing Indian business operations.' 
          },
          { role: 'user', content: prompt }
        ]
      });

      return {
        insights: response.choices[0].message.content,
        recommendations: this.extractRecommendations(response.choices[0].message.content),
        priority: this.calculateRecommendationPriority(businessData)
      };
    } catch (error) {
      console.error('Business insights error:', error);
      return {
        insights: 'Unable to generate insights at this time.',
        recommendations: [],
        priority: 'low'
      };
    }
  }

  // Analyze order and determine if approval is needed
  async analyzeOrder(orderDetails) {
    const rules = {
      highValueThreshold: 10000, // ₹10,000
      refundThreshold: 1000, // ₹1,000
      bulkOrderThreshold: 50, // 50 items
      newCustomerThreshold: 3 // 3 orders
    };

    const approvalNeeded = 
      orderDetails.amount > rules.highValueThreshold ||
      (orderDetails.type === 'refund' && orderDetails.amount > rules.refundThreshold) ||
      orderDetails.quantity > rules.bulkOrderThreshold ||
      (orderDetails.customerOrderCount < rules.newCustomerThreshold && orderDetails.amount > 5000);

    const riskLevel = this.calculateRiskLevel(orderDetails);
    
    return {
      approvalNeeded,
      riskLevel,
      reasons: this.getApprovalReasons(orderDetails, rules),
      suggestedActions: this.getOrderActions(orderDetails, riskLevel)
    };
  }

  // Call OpenAI API
  async callAI(payload) {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await axios.post(`${this.baseURL}/chat/completions`, {
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages: payload.messages
    }, {
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  // Helper methods
  buildCustomerPrompt(message, customerContext, conversationHistory) {
    return `Customer Context:
${JSON.stringify(customerContext, null, 2)}

Recent Conversation History:
${conversationHistory.slice(-5).map(msg => `${msg.sender}: ${msg.text}`).join('\n')}

Current Message: ${message}

Please respond appropriately and determine if any admin approval is needed.`;
  }

  analyzeApprovalNeed(message, aiResponse) {
    const highRiskKeywords = [
      'refund', 'return', 'cancel', 'discount', 'complaint',
      'legal', 'police', 'court', 'sue', 'money back',
      'senior', 'manager', 'supervisor', 'escalate'
    ];

    const sensitiveDataKeywords = [
      'personal', 'private', 'confidential', 'secret',
      'address', 'phone', 'email', 'account', 'password'
    ];

    const messageLower = message.toLowerCase();
    const responseLower = aiResponse.toLowerCase();

    const hasHighRisk = highRiskKeywords.some(keyword => 
      messageLower.includes(keyword) || responseLower.includes(keyword)
    );

    const hasSensitiveData = sensitiveDataKeywords.some(keyword => 
      messageLower.includes(keyword) || responseLower.includes(keyword)
    );

    return hasHighRisk || hasSensitiveData;
  }

  extractActions(response) {
    const actions = [];
    
    // Extract order-related actions
    if (response.toLowerCase().includes('order')) {
      actions.push('process_order');
    }
    
    // Extract refund actions
    if (response.toLowerCase().includes('refund')) {
      actions.push('process_refund');
    }
    
    // Extract escalation actions
    if (response.toLowerCase().includes('escalate') || response.toLowerCase().includes('manager')) {
      actions.push('escalate_to_admin');
    }
    
    return actions;
  }

  detectLanguage(message) {
    const hindiWords = ['hai', 'hain', 'kya', 'kaise', 'kidhar', 'kab', 'kyun', 'main', 'tum', 'aap'];
    const hinglishWords = ['bhai', 'yaar', 'acha', 'theek', 'hai', 'nahi', 'ji'];
    
    const messageLower = message.toLowerCase();
    
    if (hindiWords.some(word => messageLower.includes(word))) {
      return 'hi';
    } else if (hinglishWords.some(word => messageLower.includes(word))) {
      return 'hi-en';
    }
    
    return 'en';
  }

  calculateRiskLevel(orderDetails) {
    let riskScore = 0;
    
    // Amount-based risk
    if (orderDetails.amount > 10000) riskScore += 3;
    else if (orderDetails.amount > 5000) riskScore += 2;
    else if (orderDetails.amount > 1000) riskScore += 1;
    
    // Customer history risk
    if (orderDetails.customerOrderCount < 3) riskScore += 2;
    else if (orderDetails.customerOrderCount < 10) riskScore += 1;
    
    // Order type risk
    if (orderDetails.type === 'refund') riskScore += 2;
    if (orderDetails.urgent) riskScore += 1;
    
    if (riskScore >= 4) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  getApprovalReasons(orderDetails, rules) {
    const reasons = [];
    
    if (orderDetails.amount > rules.highValueThreshold) {
      reasons.push(`High value order (₹${orderDetails.amount})`);
    }
    
    if (orderDetails.type === 'refund' && orderDetails.amount > rules.refundThreshold) {
      reasons.push(`High value refund (₹${orderDetails.amount})`);
    }
    
    if (orderDetails.quantity > rules.bulkOrderThreshold) {
      reasons.push(`Bulk order quantity (${orderDetails.quantity} items)`);
    }
    
    if (orderDetails.customerOrderCount < rules.newCustomerThreshold) {
      reasons.push(`New customer (${orderDetails.customerOrderCount} previous orders)`);
    }
    
    return reasons;
  }

  getOrderActions(orderDetails, riskLevel) {
    const actions = ['process_order'];
    
    if (riskLevel === 'high') {
      actions.push('require_admin_approval', 'additional_verification');
    } else if (riskLevel === 'medium') {
      actions.push('notify_admin');
    }
    
    if (orderDetails.type === 'refund') {
      actions.push('check_refund_policy');
    }
    
    return actions;
  }

  extractRecommendations(insights) {
    const recommendations = [];
    const lines = insights.split('\n');
    
    lines.forEach(line => {
      if (line.includes('recommend') || line.includes('suggest') || line.includes('should')) {
        recommendations.push(line.trim());
      }
    });
    
    return recommendations;
  }

  calculateRecommendationPriority(businessData) {
    let priorityScore = 0;
    
    // Low performance metrics increase priority
    if (businessData.totalOrders < 10) priorityScore += 2;
    if (businessData.activeCustomers < 5) priorityScore += 2;
    if (businessData.revenue < 10000) priorityScore += 1;
    
    // Recent issues increase priority
    if (businessData.recentIssues && businessData.recentIssues.length > 0) {
      priorityScore += businessData.recentIssues.length;
    }
    
    if (priorityScore >= 4) return 'high';
    if (priorityScore >= 2) return 'medium';
    return 'low';
  }
}

module.exports = new AIService();
