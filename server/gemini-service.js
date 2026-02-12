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
    
    // Model fallback priority - using correct model names
    this.MODEL_PRIORITY = [
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro'
    ];
    
    // Use stable model only
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.model = null;
    this.currentModelIndex = 0;
    
    // Initialize with fallback strategy
    this.initializeModelWithFallback();
    
    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000
    };
    
    // AI configuration
    this.config = {
      systemPrompt: `You are Bharat Biz-Agent, an AI assistant for Indian businesses.

CRITICAL: Always respond with valid JSON only. No extra text.

JSON Structure:
{
  "intent": "create_order|generate_invoice|payment_reminder|check_inventory|general_query",
  "entities": {
    "products": ["product names"],
    "amounts": [numbers],
    "people": ["names"],
    "quantities": [numbers]
  },
  "language": "en|hi|hinglish",
  "confidence": 0.0-1.0,
  "requiresApproval": true|false,
  "proposedAction": "specific action to take"
}

Business Rules:
- Orders over ₹1000 require approval
- Refunds always require approval  
- Data exports require approval
- GST is 18% for most products
- Standard prices: Rice ₹35/kg, Wheat ₹28/kg, Sugar ₹42/kg, Oil ₹180/L

Language Support:
- English: Standard business
- Hindi: हिन्दी में बात करें
- Hinglish: Mix like "bana do", "kal bhej dena"

If confidence < 0.6, set requiresApproval: true and proposedAction: "ask_clarification".

Respond with JSON only.`
    };
  }

  // Initialize model with fallback strategy
  async initializeModelWithFallback() {
    if (!this.genAI) {
      console.warn('⚠️ No Gemini API key available, using fallback mode');
      return;
    }

    for (let i = 0; i < this.MODEL_PRIORITY.length; i++) {
      try {
        const modelName = this.MODEL_PRIORITY[i];
        console.log(`🤖 Trying model: ${modelName}`);
        
        this.model = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            temperature: 0.3, // Lower for consistency
            maxOutputTokens: 800,
            candidateCount: 1
          }
        });
        
        // Test the model with a simple request
        const result = await Promise.race([
          this.model.generateContent('test'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000) ) // 10 second timeout
        ]);
        
        this.currentModelIndex = i;
        console.log(`✅ Successfully initialized model: ${modelName}`);
        return;
        
      } catch (error) {
        console.warn(`❌ Model ${this.MODEL_PRIORITY[i]} failed:`, error.message);
        continue;
      }
    }
    
    console.error('🚫 All Gemini models failed, using fallback mode');
    this.model = null;
  }

  // Get available model with fallback
  async getAvailableModel() {
    if (!this.genAI) {
      throw new Error('No Gemini API available');
    }

    // Try current model first
    if (this.model) {
      try {
        await this.model.generateContent('test');
        return this.model;
      } catch (error) {
        console.warn(`Current model failed, trying fallback:`, error.message);
      }
    }

    // Try all models from current position
    for (let i = this.currentModelIndex; i < this.MODEL_PRIORITY.length; i++) {
      try {
        const modelName = this.MODEL_PRIORITY[i];
        console.log(`🔄 Switching to model: ${modelName}`);
        
        this.model = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
            candidateCount: 1
          }
        });
        
        await this.model.generateContent('test');
        this.currentModelIndex = i;
        console.log(`✅ Switched to model: ${modelName}`);
        return this.model;
        
      } catch (error) {
        console.warn(`❌ Model ${modelName} failed:`, error.message);
        continue;
      }
    }
    
    throw new Error('No valid Gemini model available');
  }

  // Retry logic with exponential backoff
  async retryWithBackoff(operation, context = '') {
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.warn(`AI operation attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.retryConfig.maxRetries) {
          throw new Error(`AI operation failed after ${this.retryConfig.maxRetries} attempts: ${error.message}`);
        }
        
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        console.log(`Retrying in ${delay}ms... (attempt ${attempt}/${this.retryConfig.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Process customer message with structured response
  async processCustomerMessage(message, customerContext = null, conversationHistory = null) {
    try {
      console.log('🤖 Processing AI request:', {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        hasContext: !!customerContext,
        historyLength: conversationHistory?.length || 0
      });

      if (!this.model) {
        console.warn('⚠️ AI model not initialized, attempting to reinitialize...');
        try {
          this.model = await this.getAvailableModel();
        } catch (error) {
          console.warn('AI models unavailable, using fallback:', error.message);
          return this.getFallbackStructuredResponse(message);
        }
      }

      const prompt = `${this.config.systemPrompt}

Customer Message: "${message}"
Context: ${JSON.stringify(customerContext || {})}
History: ${JSON.stringify((conversationHistory || []).slice(-3))}

Respond with JSON only.`;

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text().trim();
      
      console.log('📝 AI Raw Response:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
      
      // Parse JSON response
      let structuredResponse;
      try {
        // Extract JSON from response (handle potential extra text)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structuredResponse = JSON.parse(jsonMatch[0]);
        } else {
          structuredResponse = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error('❌ Failed to parse AI JSON response:', parseError.message);
        console.error('📄 Raw response:', responseText);
        return this.getFallbackStructuredResponse(message);
      }

      // Validate required fields
      const validatedResponse = this.validateStructuredResponse(structuredResponse, message);
      
      console.log('✅ AI Processing Complete:', {
        intent: validatedResponse.intent,
        confidence: validatedResponse.confidence,
        requiresApproval: validatedResponse.requiresApproval
      });
      
      return validatedResponse;

    } catch (error) {
      console.error('💥 AI processing error:', {
        message: error.message,
        stack: error.stack?.substring(0, 200)
      });
      
      // If it's a model error, try to reinitialize
      if (error.message.includes('model') || error.message.includes('API')) {
        console.log('🔄 Reinitializing AI models due to error...');
        await this.initializeModelWithFallback();
      }
      
      return this.getFallbackStructuredResponse(message);
    }
  }

  // Validate structured response has required fields
  validateStructuredResponse(response, originalMessage) {
    try {
      const defaults = {
        intent: 'general_query',
        entities: { products: [], amounts: [], people: [], quantities: [] },
        language: 'en',
        confidence: 0.5,
        requiresApproval: false,
        proposedAction: 'respond_to_query'
      };

      // Merge with defaults for missing fields
      const validated = {
        ...defaults,
        ...response
      };

      // Validate intent is a string
      if (typeof validated.intent !== 'string' || !validated.intent.trim()) {
        console.warn('Invalid intent detected, using default:', validated.intent);
        validated.intent = defaults.intent;
      }

      // Validate entities is an object
      if (typeof validated.entities !== 'object' || validated.entities === null) {
        console.warn('Invalid entities detected, using defaults');
        validated.entities = defaults.entities;
      }

      // Ensure entities have required arrays
      ['products', 'amounts', 'people', 'quantities'].forEach(key => {
        if (!Array.isArray(validated.entities[key])) {
          console.warn(`Invalid entities.${key}, using empty array`);
          validated.entities[key] = [];
        }
      });

      // Ensure confidence is within bounds
      if (typeof validated.confidence !== 'number' || validated.confidence < 0 || validated.confidence > 1) {
        console.warn('Invalid confidence detected, normalizing to 0.5:', validated.confidence);
        validated.confidence = 0.5;
      }

      // Auto-require approval for certain conditions
      if (validated.confidence < 0.6) {
        validated.requiresApproval = true;
        validated.proposedAction = 'ask_clarification';
      }

      // Check for high-value operations
      const hasHighAmount = validated.entities.amounts?.some(amount => amount > 1000);
      const isRefundIntent = validated.intent === 'refund' || validated.proposedAction?.includes('refund');
      const isDataExport = validated.intent === 'data_export' || validated.proposedAction?.includes('export');

      if (hasHighAmount || isRefundIntent || isDataExport) {
        validated.requiresApproval = true;
      }

      // Log validation for debugging
      console.log('🔍 AI Response Validation:', {
        intent: validated.intent,
        confidence: validated.confidence,
        requiresApproval: validated.requiresApproval,
        entitiesCount: {
          products: validated.entities.products?.length || 0,
          amounts: validated.entities.amounts?.length || 0,
          people: validated.entities.people?.length || 0,
          quantities: validated.entities.quantities?.length || 0
        }
      });

      return validated;
    } catch (error) {
      console.error('❌ Error in validateStructuredResponse:', error);
      return this.getFallbackStructuredResponse(originalMessage);
    }
  }

  // Fallback structured response when AI fails
  getFallbackStructuredResponse(message) {
    const language = this.detectLanguage(message);
    const lowerMessage = message.toLowerCase();
    
    // Basic pattern matching for common requests
    let intent = 'general_query';
    let proposedAction = 'human_assistance_needed';
    let requiresApproval = false;
    
    // Detect order-related messages
    if (lowerMessage.includes('order') || lowerMessage.includes('bill') || lowerMessage.includes('invoice')) {
      intent = 'create_order';
      proposedAction = 'Create order - requires human assistance';
      requiresApproval = true;
    }
    
    // Detect payment-related messages
    if (lowerMessage.includes('payment') || lowerMessage.includes('pay') || lowerMessage.includes('reminder')) {
      intent = 'payment_reminder';
      proposedAction = 'Send payment reminder';
    }
    
    // Detect inventory-related messages
    if (lowerMessage.includes('stock') || lowerMessage.includes('inventory') || lowerMessage.includes('check')) {
      intent = 'check_inventory';
      proposedAction = 'Check inventory status';
    }
    
    // Detect greeting messages
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('namaste')) {
      intent = 'general_query';
      proposedAction = 'Provide greeting and assistance';
    }
    
    return {
      intent: intent,
      entities: { 
        products: this.extractProducts(message),
        amounts: this.extractAmounts(message),
        people: this.extractPeople(message),
        quantities: this.extractQuantities(message)
      },
      language: language,
      confidence: 0.6, // Higher confidence for pattern matching
      requiresApproval: requiresApproval,
      proposedAction: proposedAction
    };
  }
  
  // Simple pattern extraction methods
  extractProducts(message) {
    const products = [];
    const productPatterns = ['rice', 'sugar', 'wheat', 'oil', 'dal', 'atta', 'milk', 'bread'];
    const lowerMessage = message.toLowerCase();
    
    productPatterns.forEach(product => {
      if (lowerMessage.includes(product)) {
        products.push(product);
      }
    });
    
    return products;
  }
  
  extractAmounts(message) {
    const amounts = [];
    const amountPattern = /₹?(\d+(?:,\d+)*(?:\.\d+)?)/g;
    const matches = message.match(amountPattern);
    
    if (matches) {
      amounts.push(...matches.map(m => m.replace('₹', '').replace(',', '')));
    }
    
    return amounts;
  }
  
  extractPeople(message) {
    const people = [];
    const namePattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g;
    const matches = message.match(namePattern);
    
    if (matches) {
      people.push(...matches);
    }
    
    return people;
  }
  
  extractQuantities(message) {
    const quantities = [];
    const quantityPattern = /(\d+(?:\.\d+)?)\s*(kg|lit|pcs|grams|ml|units?)/gi;
    const matches = message.match(quantityPattern);
    
    if (matches) {
      quantities.push(...matches);
    }
    
    return quantities;
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

// DISABLED - Using Simple AI Service instead
module.exports = {
  processCustomerMessage: async () => ({ error: 'Gemini service disabled' }),
  generateBusinessInsights: async () => ({ error: 'Gemini service disabled' })
};
