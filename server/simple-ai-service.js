/**
 * Simple Rule-Based AI Service
 * Works without external APIs - reliable and fast
 */

class SimpleAIService {
  constructor() {
    this.isWorking = true;
    console.log('✅ Simple AI Service initialized (rule-based)');
  }

  // Process customer message with structured response
  async processCustomerMessage(message, customerContext = null, conversationHistory = null) {
    try {
      console.log('🤖 Processing message with Simple AI:', message.substring(0, 50) + '...');
      
      const language = this.detectLanguage(message);
      const lowerMessage = message.toLowerCase().trim();
      
      // Extract entities
      const entities = this.extractEntities(message);
      
      // Determine intent
      const intent = this.detectIntent(lowerMessage, entities);
      
      // Generate response
      const response = this.generateResponse(intent, entities, language, message);
      
      return {
        intent: intent,
        entities: entities,
        language: language,
        confidence: 0.9, // High confidence for rule-based
        requiresApproval: this.requiresApproval(intent, entities),
        proposedAction: response.action,
        responseText: response.text
      };
      
    } catch (error) {
      console.error('❌ Simple AI processing error:', error);
      return this.getFallbackResponse(message);
    }
  }

  detectLanguage(message) {
    const hindiWords = ['है', 'हूं', 'कर', 'सकते', 'दो', 'कीजिए', 'नमस्ते', 'धन्यवाद', 'बनाओ', 'भेजो', '�ेक', 'करो'];
    const hinglishWords = ['banao', 'karo', 'do', 'please', 'thank', 'hello', 'namaste'];
    
    if (hindiWords.some(word => message.includes(word))) return 'hi';
    if (hinglishWords.some(word => message.toLowerCase().includes(word))) return 'hinglish';
    return 'en';
  }

  extractEntities(message) {
    const entities = {
      products: [],
      amounts: [],
      people: [],
      quantities: []
    };

    // Extract products
    const products = ['rice', 'sugar', 'wheat', 'oil', 'dal', 'atta', 'milk', 'bread', 'tea', 'coffee', 'biscuit'];
    products.forEach(product => {
      if (message.toLowerCase().includes(product)) {
        entities.products.push(product);
      }
    });

    // Extract amounts (₹ symbol and numbers)
    const amountPattern = /₹?(\d+(?:,\d+)*(?:\.\d+)?)/g;
    const amountMatches = message.match(amountPattern);
    if (amountMatches) {
      entities.amounts.push(...amountMatches.map(m => m.replace('₹', '').replace(',', '')));
    }

    // Extract people (capitalized words)
    const peoplePattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g;
    const peopleMatches = message.match(peoplePattern);
    if (peopleMatches) {
      entities.people.push(...peopleMatches);
    }

    // Extract quantities
    const quantityPattern = /(\d+(?:\.\d+)?)\s*(kg|lit|pcs|grams|ml|units?)/gi;
    const quantityMatches = message.match(quantityPattern);
    if (quantityMatches) {
      entities.quantities.push(...quantityMatches);
    }

    return entities;
  }

  detectIntent(message, entities) {
    // Order creation intent
    if (message.includes('order') || message.includes('bill') || message.includes('invoice') || 
        message.includes('banao') || message.includes('banaye') || message.includes('create')) {
      return 'create_order';
    }

    // Payment related intent
    if (message.includes('payment') || message.includes('pay') || message.includes('reminder') ||
        message.includes('bhugtan') || message.includes('den')) {
      return 'payment_reminder';
    }

    // Inventory check intent
    if (message.includes('stock') || message.includes('inventory') || message.includes('check') ||
        message.includes('dekh') || message.includes('maloom')) {
      return 'check_inventory';
    }

    // Greeting intent
    if (message.includes('hello') || message.includes('hi') || message.includes('namaste') ||
        message.includes('pranam') || message.includes('good morning')) {
      return 'greeting';
    }

    // Help intent
    if (message.includes('help') || message.includes('madad') || message.includes('kya kar sakte')) {
      return 'help_request';
    }

    // Default
    return 'general_query';
  }

  requiresApproval(intent, entities) {
    // High-risk actions require approval
    if (intent === 'create_order' && entities.amounts.some(amount => parseInt(amount) > 1000)) {
      return true;
    }
    
    if (intent === 'payment_reminder' && entities.people.length === 0) {
      return true;
    }
    
    return false;
  }

  generateResponse(intent, entities, language, originalMessage) {
    const responses = {
      en: {
        greeting: {
          action: 'Provide greeting and assistance',
          text: '👋 Hello! I\'m your Bharat Biz-Agent. I can help you with:\n\n• Creating orders and invoices\n• Payment reminders\n• Inventory checks\n• Business queries\n\nWhat would you like to do today?'
        },
        create_order: {
          action: 'Create order with extracted details',
          text: this.generateOrderResponse(entities, 'en')
        },
        payment_reminder: {
          action: 'Send payment reminder',
          text: this.generatePaymentResponse(entities, 'en')
        },
        check_inventory: {
          action: 'Check inventory status',
          text: '📦 Checking inventory... I can help you check stock levels. Please specify which product you want to check (e.g., "check rice stock").'
        },
        help_request: {
          action: 'Provide help information',
          text: '🤖 I can help you with:\n\n• Orders: "Create order for [name] [product] [amount]"\n• Payments: "Send payment reminder to [name]"\n• Inventory: "Check [product] stock"\n• General: Just ask me anything!\n\nTry sending a command!'
        },
        general_query: {
          action: 'Provide general assistance',
          text: '🤖 I\'m here to help! Try:\n• "Create order"\n• "Payment reminder"\n• "Check inventory"\n• Or just tell me what you need!'
        }
      },
      hi: {
        greeting: {
          action: 'Provide greeting and assistance in Hindi',
          text: '👋 नमस्ते! मैं आपका भारत बिज़-एजेंट हूँ। मैं आपकी मदद कर सकता हूँ:\n\n• ऑर्डर और इनवॉइस बनाना\n• पेमेंट रिमाइंडर\n• इन्वेंट्री चेक\n• व्यापारिक प्रश्न\n\nआज आप क्या करना चाहते हैं?'
        },
        create_order: {
          action: 'Create order with extracted details in Hindi',
          text: this.generateOrderResponse(entities, 'hi')
        },
        payment_reminder: {
          action: 'Send payment reminder in Hindi',
          text: this.generatePaymentResponse(entities, 'hi')
        },
        check_inventory: {
          action: 'Check inventory status in Hindi',
          text: '📦 इन्वेंट्री चेक कर रहा हूँ... कृपया बताएं कि आप कौन सा प्रोडक्ट चेक करना चाहते हैं (जैसे, "चावल स्टॉक चेक करो")।'
        },
        help_request: {
          action: 'Provide help information in Hindi',
          text: '🤖 मैं आपकी मदद कर सकता हूँ:\n\n• ऑर्डर: "[नाम] के लिए [प्रोडक्ट] [राशि] बनाओ"\n• पेमेंट: "[नाम] को पेमेंट रिमाइंडर भेजो"\n• इन्वेंट्री: "[प्रोडक्ट] स्टॉक चेक करो"\n• सामान्य: बस मुझसे पूछें!\n\nकोई कमांड ट्राई करें!'
        },
        general_query: {
          action: 'Provide general assistance in Hindi',
          text: '🤖 मैं आपकी मदद के लिए यहां हूँ! ट्राई करें:\n• "ऑर्डर बनाओ"\n• "पेमेंट रिमाइंडर"\n• "इन्वेंट्री चेक करो"\n• या बस बताएं कि आपको क्या चाहिए!'
        }
      },
      hinglish: {
        greeting: {
          action: 'Provide greeting and assistance in Hinglish',
          text: '👋 Namaste! Main aapka Bharat Biz-Agent hoon. Main aapki help kar sakta hoon:\n\n• Orders aur invoices banana\n• Payment reminders\n• Inventory check\n• Business queries\n\nAaj aap kya karna chahte hain?'
        },
        create_order: {
          action: 'Create order with extracted details in Hinglish',
          text: this.generateOrderResponse(entities, 'hinglish')
        },
        payment_reminder: {
          action: 'Send payment reminder in Hinglish',
          text: this.generatePaymentResponse(entities, 'hinglish')
        },
        check_inventory: {
          action: 'Check inventory status in Hinglish',
          text: '📦 Inventory check kar raha hoon... Kripya bataiye ki aap kaunsa product check karna chahte hain (jaise, "rice stock check karo").'
        },
        help_request: {
          action: 'Provide help information in Hinglish',
          text: '🤖 Main aapki help kar sakta hoon:\n\n• Orders: "[name] ke liye [product] [amount] order banao"\n• Payments: "[name] ko payment reminder bhejo"\n• Inventory: "[product] stock check karo"\n• General: Bas mujhe batayein aapko kya chahiye!\n\nKoi command try kariye!'
        },
        general_query: {
          action: 'Provide general assistance in Hinglish',
          text: '🤖 Main aapki help ke liye yahan hoon! Try kariye:\n• "Order banao"\n• "Payment reminder"\n• "Inventory check"\n• Ya bas batayein aapko kya chahiye!'
        }
      }
    };

    return responses[language]?.[intent] || responses.en.general_query;
  }

  generateOrderResponse(entities, language) {
    const product = entities.products[0] || 'item';
    const amount = entities.amounts[0] || '0';
    const person = entities.people[0] || 'customer';
    const quantity = entities.quantities[0] || '';

    const responses = {
      en: `📋 Creating order:\n• Product: ${product}\n• Amount: ₹${amount}\n• Customer: ${person}\n• Quantity: ${quantity}\n\n✅ Order will be processed and sent for approval!`,
      hi: `📋 ऑर्डर बना रहा हूँ:\n• प्रोडक्ट: ${product}\n• राशि: ₹${amount}\n• ग्राहक: ${person}\n• मात्रा: ${quantity}\n\n✅ ऑर्डर प्रोसेस किया जाएगा और अनुमति के लिए भेजा जाएगा!`,
      hinglish: `📋 Order bana raha hoon:\n• Product: ${product}\n• Amount: ₹${amount}\n• Customer: ${person}\n• Quantity: ${quantity}\n\n✅ Order process kiya jayega aur approval ke liye bheja jayega!`
    };

    return responses[language] || responses.en;
  }

  generatePaymentResponse(entities, language) {
    const person = entities.people[0] || 'customer';
    const amount = entities.amounts[0] || '';

    const responses = {
      en: `💰 Payment reminder:\n• Send reminder to: ${person}\n• Amount: ₹${amount}\n\n✅ Payment reminder will be sent!`,
      hi: `💰 पेमेंट रिमाइंडर:\n• भेजने वाले: ${person}\n• राशि: ₹${amount}\n\n✅ पेमेंट रिमाइंडर भेजा जाएगा!`,
      hinglish: `💰 Payment reminder:\n• Bhejne wala: ${person}\n• Amount: ₹${amount}\n\n✅ Payment reminder bheja jayega!`
    };

    return responses[language] || responses.en;
  }

  getFallbackResponse(message) {
    return {
      intent: 'general_query',
      entities: { products: [], amounts: [], people: [], quantities: [] },
      language: 'en',
      confidence: 0.5,
      requiresApproval: false,
      proposedAction: 'Provide general assistance',
      responseText: '🤖 I\'m here to help! Please try commands like "create order", "payment reminder", or "check inventory".'
    };
  }

  // Generate business insights for admin dashboard
  async generateBusinessInsights(businessData) {
    try {
      const totalOrders = businessData.totalOrders || 0;
      const revenue = businessData.revenue || 0;
      const activeCustomers = businessData.activeCustomers || 0;
      
      return {
        performance: {
          status: totalOrders > 50 ? 'Excellent' : totalOrders > 20 ? 'Good' : 'Needs Improvement',
          ordersPerDay: Math.round(totalOrders / 30, 1),
          avgOrderValue: totalOrders > 0 ? Math.round(revenue / totalOrders, 2) : 0
        },
        recommendations: [
          revenue > 1000 ? 'Revenue is strong - consider expanding product line' : 'Focus on increasing order frequency',
          activeCustomers > 10 ? 'Customer engagement is good' : 'Implement customer retention strategies',
          totalOrders > 30 ? 'Order volume is healthy' : 'Run promotional campaigns to boost orders'
        ],
        insights: {
          topMetric: totalOrders > 20 ? 'Order Volume' : 'Customer Acquisition',
          trend: 'Steady growth pattern detected',
          action: 'Continue current business strategy'
        }
      };
    } catch (error) {
      console.error('Error generating insights:', error);
      return {
        performance: { status: 'Unknown' },
        recommendations: ['Check data sources for accuracy'],
        insights: { action: 'Verify business metrics' }
      };
    }
  }
}

module.exports = { SimpleAIService };
