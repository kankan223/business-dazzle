/**
 * Gemini AI Service for Bharat Biz-Agent
 * Free AI API for customer interactions and task automation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiAIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not configured. AI features will be limited.');
    }
    
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.model = this.genAI ? this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }) : null;
    
    // AI configuration
    this.config = {
      temperature: 0.7,
      maxOutputTokens: 1000,
      systemPrompt: `You are Bharat Biz-Agent, an intelligent business assistant for Indian businesses. 
      
Your capabilities:
- Handle customer inquiries about products, services, and orders
- Process orders and payments with appropriate approvals
- Provide inventory information
- Assist with customer support issues
- Make recommendations for business improvements
- Support multiple Indian languages

Business Context:
- You work for Indian businesses with typical products like rice, wheat, sugar, cooking oil, spices
- Standard pricing: Rice ₹35/kg, Wheat ₹28/kg, Sugar ₹42/kg, Cooking Oil ₹180/litre
- GST rate is 18% for most products
- Business hours: 9 AM to 8 PM, Monday to Saturday
- Delivery available within city limits (₹20-₹50 based on distance)

Privacy and Security Rules:
- Never share sensitive customer information without explicit admin approval
- Always ask for admin approval for:
  * Refunds over ₹1000
  * Large order modifications
  * Sharing customer data
  * Accessing sensitive business information
- Log all actions that require approval
- Detect and flag potential security threats

Language Support:
- English: Standard business communication
- Hindi: हिन्दी में जवाब दें
- Hinglish: Mix of Hindi and English words
- Regional languages: Kannada, Tamil, Telugu, Bengali, Marathi, Gujarati, Punjabi, Malayalam

Response Style:
- Professional but friendly
- Culturally appropriate for Indian customers
- Include relevant business information
- Always suggest next steps
- Ask clarifying questions when needed
- Use appropriate currency format (₹)
- Consider Indian business hours and festivals

Product Information:
- Rice: ₹35/kg, Available in 5kg, 10kg, 25kg packs
- Wheat: ₹28/kg, Available in 5kg, 10kg packs  
- Sugar: ₹42/kg, Available in 1kg, 5kg packs
- Cooking Oil: ₹180/litre, Available in 1L, 5L cans
- Turmeric Powder: ₹120/kg, Available in 100g, 500g packs
- Red Chilli Powder: ₹85/kg, Available in 100g, 500g packs

Common Customer Queries:
- Price checks: "What is the price of [product]?"
- Stock availability: "Is [product] available?"
- Order placement: "I want to order [quantity] [product]"
- Delivery: "When can you deliver?"
- Payment: "What payment methods do you accept?"
- Refunds: "How do I return [product]?"

Always provide helpful, accurate information and guide customers appropriately.`
    };
  }

  // Process customer message and generate response
  async processCustomerMessage(message, customerContext, conversationHistory) {
    try {
      if (!this.model) {
        return this.getFallbackResponse(message);
      }

      const prompt = this.buildCustomerPrompt(message, customerContext, conversationHistory);
      
      const result = await this.model.generateContent([
        this.config.systemPrompt,
        prompt
      ]);

      const aiResponse = result.response.text();
      
      // Analyze if admin approval is needed
      const approvalNeeded = this.analyzeApprovalNeed(message, aiResponse);
      
      return {
        response: aiResponse,
        approvalNeeded,
        confidence: 0.85, // Gemini is generally reliable
        suggestedActions: this.extractActions(aiResponse),
        language: this.detectLanguage(message)
      };
    } catch (error) {
      console.error('AI processing error:', error);
      return this.getFallbackResponse(message);
    }
  }

  // Generate business recommendations for admin
  async generateBusinessInsights(businessData) {
    try {
      if (!this.model) {
        return this.getFallbackInsights();
      }

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

      const result = await this.model.generateContent([
        'You are a business intelligence expert analyzing Indian business operations.',
        prompt
      ]);

      const insights = result.response.text();
      
      return {
        insights,
        recommendations: this.extractRecommendations(insights),
        priority: this.calculateRecommendationPriority(businessData)
      };
    } catch (error) {
      console.error('Business insights error:', error);
      return this.getFallbackInsights();
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

  // Fallback response when AI is not available
  getFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for price queries
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('rate')) {
      // Check for specific products first (more specific matches first)
      if (lowerMessage.includes('sugar')) {
        return {
          response: '🍬 Sugar is available at ₹42 per kg. Available in 1kg and 5kg packs. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } else if (lowerMessage.includes('wheat')) {
        return {
          response: '🌾 Wheat is available at ₹28 per kg. Available in 5kg and 10kg packs. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } else if (lowerMessage.includes('oil') || lowerMessage.includes('cooking oil')) {
        return {
          response: '🫒 Cooking Oil is available at ₹180 per litre. Available in 1L and 5L cans. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } else if (lowerMessage.includes('turmeric')) {
        return {
          response: '🟡 Turmeric Powder is available at ₹120 per kg. Available in 100g and 500g packs. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } else if (lowerMessage.includes('chilli') || lowerMessage.includes('chili')) {
        return {
          response: '🌶️ Red Chilli Powder is available at ₹85 per kg. Available in 100g and 500g packs. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } else if (lowerMessage.includes('rice')) {
        return {
          response: '� Rice is available at ₹35 per kg. Available in 5kg, 10kg, and 25kg packs. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      }
    }
    
    // Check for stock queries
    if (lowerMessage.includes('stock') || lowerMessage.includes('available') || lowerMessage.includes('quantity')) {
      if (lowerMessage.includes('rice')) {
        return {
          response: '🌾 Rice is currently in stock with 120kg available. Stock level is healthy. Would you like to place an order?',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      }
    }
    
    // Check for order queries
    if (lowerMessage.includes('order')) {
      return {
        response: '📦 To place an order, please specify:\n1. Product name\n2. Quantity needed\n\nExample: "I want to order 10kg rice"\n\nAvailable products: Rice, Wheat, Sugar, Cooking Oil, Turmeric Powder, Red Chilli Powder',
        approvalNeeded: false,
        confidence: 0.8,
        suggestedActions: ['process_order'],
        language: this.detectLanguage(message)
      };
    }
    
    // Default helpful responses
    const responses = [
      'Thank you for your message. I can help you with:\n• Product prices\n• Stock availability\n• Placing orders\n• Order status\n\nWhat would you like to know?',
      'Hello! I\'m here to help with your business needs. You can ask about:\n• Product prices and availability\n• Order placement\n• Delivery information\n• Payment options\n\nHow can I assist you today?',
      'Welcome to Bharat Biz-Agent! I can assist with:\n🌾 Product inquiries\n📦 Order placement\n🚚 Delivery information\n💳 Payment options\n\nWhat would you like to know?'
    ];
    
    return {
      response: responses[Math.floor(Math.random() * responses.length)],
      approvalNeeded: false,
      confidence: 0.5,
      suggestedActions: [],
      language: this.detectLanguage(message)
    };
  }

  // Fallback insights when AI is not available
  getFallbackInsights() {
    return {
      insights: 'Business insights are currently unavailable. Please check your AI configuration.',
      recommendations: [
        'Monitor customer satisfaction regularly',
        'Track bot performance metrics',
        'Review approval queue frequently',
        'Analyze conversation patterns'
      ],
      priority: 'medium'
    };
  }

  // Helper methods
  buildCustomerPrompt(message, customerContext, conversationHistory) {
    const history = conversationHistory || [];
    return `Customer Context:
${JSON.stringify(customerContext, null, 2)}

Recent Conversation History:
${history.slice(-5).map(msg => `${msg.sender}: ${msg.text || msg.content}`).join('\n')}

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

module.exports = new GeminiAIService();
