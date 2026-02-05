/**
 * Gemini AI Service for Bharat Biz-Agent
 * Free AI API for customer interactions and task automation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { InventoryOperations } = require('./database');

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

  // Enhanced fallback responses with better context
  async getFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Dynamic product responses - sync with inventory
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('rate')) {
      try {
        // Get real inventory data
        const inventory = await InventoryOperations.getAll();
        const productKeywords = ['rice', 'wheat', 'sugar', 'oil', 'turmeric', 'chilli'];
        const mentionedProduct = productKeywords.find(product => lowerMessage.includes(product));
        
        if (mentionedProduct) {
          const product = inventory.find(item => 
            item.name.toLowerCase().includes(mentionedProduct) || 
            item.sku.toLowerCase().includes(mentionedProduct)
          );
          
          if (product) {
            return {
              response: `💰 ${product.name} Pricing:\n\n💵 Price: ₹${product.price} per ${product.unit}\n📦 Stock: ${product.quantity} ${product.unit} available\n⚠️ Low stock alert at: ${product.lowStockThreshold} ${product.unit}\n\nWould you like to place an order?`,
              approvalNeeded: false,
              confidence: 0.9,
              suggestedActions: ['process_order'],
              language: this.detectLanguage(message)
            };
          }
        }
        
        // Show all products if no specific product mentioned
        const productList = inventory.map(item => 
          `• ${item.name}: ₹${item.price}/${item.unit} (${item.quantity} ${item.unit} in stock)`
        ).join('\n');
        
        return {
          response: `🛍️ Current Products & Prices:\n\n${productList}\n\nWhich product would you like to know more about?`,
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } catch (error) {
        console.error('Error fetching inventory for price query:', error);
      }
    }
    
    // Dynamic stock check responses
    if (lowerMessage.includes('stock') || lowerMessage.includes('available') || lowerMessage.includes('quantity')) {
      try {
        const inventory = await InventoryOperations.getAll();
        const productKeywords = ['rice', 'wheat', 'sugar', 'oil', 'turmeric', 'chilli'];
        const mentionedProduct = productKeywords.find(product => lowerMessage.includes(product));
        
        if (mentionedProduct) {
          const product = inventory.find(item => 
            item.name.toLowerCase().includes(mentionedProduct) || 
            item.sku.toLowerCase().includes(mentionedProduct)
          );
          
          if (product) {
            const stockStatus = product.quantity <= product.lowStockThreshold ? '⚠️ LOW STOCK' : '✅ In Stock';
            return {
              response: `� ${product.name} Stock Status:\n\n📦 Available: ${product.quantity} ${product.unit}\n${stockStatus}\n� Last updated: ${new Date(product.updatedAt).toLocaleString()}\n\n${product.quantity <= product.lowStockThreshold ? '⚠️ Order soon - stock running low!' : '✅ Good availability'}`,
              approvalNeeded: false,
              confidence: 0.9,
              suggestedActions: product.quantity <= product.lowStockThreshold ? ['process_order'] : [],
              language: this.detectLanguage(message)
            };
          }
        }
        
        // Show low stock items
        const lowStockItems = inventory.filter(item => item.quantity <= item.lowStockThreshold);
        if (lowStockItems.length > 0) {
          const lowStockList = lowStockItems.map(item => 
            `⚠️ ${item.name}: ${item.quantity} ${item.unit} (threshold: ${item.lowStockThreshold} ${item.unit})`
          ).join('\n');
          
          return {
            response: `🚨 Low Stock Alert:\n\n${lowStockList}\n\nThese items need restocking soon!`,
            approvalNeeded: false,
            confidence: 0.9,
            suggestedActions: ['restock_alert'],
            language: this.detectLanguage(message)
          };
        }
        
        return {
          response: '📦 All products are well stocked! Is there a specific item you\'d like to check?',
          approvalNeeded: false,
          confidence: 0.8,
          suggestedActions: [],
          language: this.detectLanguage(message)
        };
      } catch (error) {
        console.error('Error fetching inventory for stock query:', error);
      }
    }
    
    // Check for order queries with better guidance
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase') || lowerMessage.includes('want')) {
      // Try to extract product and quantity
      const productMatch = message.match(/(rice|wheat|sugar|oil|turmeric|chilli)/i);
      const quantityMatch = message.match(/(\d+)\s*(kg|l|litre|grams?|packs?)/i);
      
      if (productMatch && quantityMatch) {
        const product = productMatch[1].toLowerCase();
        const quantity = quantityMatch[1];
        const unit = quantityMatch[2];
        
        return {
          response: `📦 Order detected!\n\nProduct: ${product}\nQuantity: ${quantity} ${unit}\n\nProcessing your order... Please confirm to proceed.`,
          approvalNeeded: true,
          confidence: 0.9,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      } else {
        return {
          response: '📋 To place an order, please specify:\n\n1️⃣ Product name (rice, wheat, sugar, oil, turmeric, chilli)\n2️⃣ Quantity needed (e.g., 5kg, 2L, 500g)\n3️⃣ Delivery address (if needed)\n\nExample: "I want to order 10kg rice"\n\nOr simply tell me what you need and I\'ll help!',
          approvalNeeded: false,
          confidence: 0.8,
          suggestedActions: ['process_order'],
          language: this.detectLanguage(message)
        };
      }
    }

    // Check for direct product + quantity patterns (e.g., "Rice 5kg")
    const productMatch = message.match(/(rice|wheat|sugar|oil|turmeric|chilli)/i);
    const quantityMatch = message.match(/(\d+)\s*(kg|l|litre|grams?|packs?)/i);
    
    if (productMatch && quantityMatch && !lowerMessage.includes('price') && !lowerMessage.includes('cost')) {
      const product = productMatch[1].toLowerCase();
      const quantity = quantityMatch[1];
      const unit = quantityMatch[2];
      
      return {
        response: `📦 Order detected!\n\nProduct: ${product}\nQuantity: ${quantity} ${unit}\n\nProcessing your order... Please confirm to proceed.`,
        approvalNeeded: true,
        confidence: 0.9,
        suggestedActions: ['process_order'],
        language: this.detectLanguage(message)
      };
    }
    
    // Check for delivery queries
    if (lowerMessage.includes('delivery') || lowerMessage.includes('shipping') || lowerMessage.includes('when will i get')) {
      return {
        response: '🚚 Delivery Information:\n\n📍 Within city: Same day (before 8 PM)\n📍 City outskirts: Next day\n📦 Delivery charge: ₹20-₹50 based on distance\n⏰ Order cutoff: 6 PM for same-day delivery\n\nTrack your order with the order number I provide!',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: [],
          language: this.detectLanguage(message)
        };
    }
    
    // Check for payment queries
    if (lowerMessage.includes('payment') || lowerMessage.includes('pay') || lowerMessage.includes('cash')) {
      return {
        response: '💳 Payment Options:\n\n📱 UPI: bharatbiz@upi\n🏦 Bank Transfer: Bharat Business, HDFC0001234\n💵 Cash on Delivery (COD)\n📱 PhonePe/GPay: bharatbiz@upi\n\nAll transactions are secured with encryption!',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: [],
          language: this.detectLanguage(message)
        };
    }
    
    // Check for help queries
    if (lowerMessage.includes('help') || lowerMessage.includes('menu') || lowerMessage.includes('what can you do')) {
      return {
        response: '🤖 Bharat Biz-Agent Capabilities:\n\n📦 Product Information\n• Prices, stock, availability\n• Quality details\n\n🛒 Order Management\n• Place orders\n• Track orders\n• Modify/cancel orders\n\n🚚 Delivery Services\n• Same-day delivery in city\n• Next-day to outskirts\n• Real-time tracking\n\n💳 Payment Processing\n• Multiple payment options\n• Secure transactions\n• GST invoices\n\n🌐 Multi-language Support\n• English, Hindi, Hinglish\n• Regional languages\n\nJust ask me anything in natural language!',
          approvalNeeded: false,
          confidence: 0.9,
          suggestedActions: [],
          language: this.detectLanguage(message)
        };
    }
    
    // Default intelligent responses based on message patterns
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('namaste')) {
      return {
        response: '🙏 Namaste! Welcome to Bharat Biz-Agent!\n\nI can help you with:\n📦 Product inquiries and orders\n🚚 Delivery tracking\n💳 Payment information\n📊 Business insights\n\nWhat can I help you with today?',
        approvalNeeded: false,
        confidence: 0.8,
        suggestedActions: [],
        language: this.detectLanguage(message)
      };
    }
    
    // Context-aware default response
    const contextualResponses = [
      'I understand you\'re interested in our products. Would you like to:\n1️⃣ Check prices\n2️⃣ See stock availability\n3️⃣ Place an order\n4️⃣ Know about delivery',
      'I\'m here to help with your business needs. You can ask me about:\n🌾 Products & Pricing\n📦 Orders & Delivery\n💳 Payment Options\n📊 Business Information\n\nWhat would you like to know?',
      'Thank you for contacting Bharat Biz-Agent! How can I assist you today?\n\nPopular requests:\n• Product prices and availability\n• Order placement and tracking\n• Delivery information\n• Payment options'
    ];
    
    return {
      response: contextualResponses[Math.floor(Math.random() * contextualResponses.length)],
      approvalNeeded: false,
      confidence: 0.7,
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
