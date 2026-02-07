/**
 * Indian Language & Cultural Context Processor
 * WHY: Handle Hinglish, Hindi, and Indian business phrasing for autonomous co-pilot
 * CHANGE: New service for India-first language understanding
 */

class IndianLanguageProcessor {
  constructor() {
    this.hinglishDictionary = this.initializeHinglishDictionary();
    this.dateMappings = this.initializeDateMappings();
    this.currencyMappings = this.initializeCurrencyMappings();
    this.businessPhrases = this.initializeBusinessPhrases();
    this.gstSlabs = this.initializeGSTSlabs();
  }

  // Initialize Hinglish to English mappings
  initializeHinglishDictionary() {
    return {
      // Common verbs
      'bhej dena': 'send',
      'bhej do': 'send',
      'bhej dijiye': 'send',
      'dena': 'give',
      'de do': 'give',
      'likh lo': 'write',
      'likh dijiye': 'write',
      'karna': 'do',
      'kar do': 'do',
      'kar dijiye': 'do',
      'banana': 'create',
      'banaye': 'create',
      'banaiye': 'create',
      'check karo': 'check',
      'check kijiye': 'check',
      'puch lo': 'ask',
      'puchiye': 'ask',
      'bat karo': 'talk',
      'bat kijiye': 'talk',
      
      // Business terms
      'bill': 'invoice',
      'bills': 'invoices',
      'invoice': 'invoice',
      'invoice banao': 'create_invoice',
      'invoice banaye': 'create_invoice',
      'bill banao': 'create_invoice',
      'bill banaye': 'create_invoice',
      'payment': 'payment',
      'paisay': 'payment',
      'paise': 'payment',
      'rupaye': 'money',
      'rupay': 'money',
      'bhugtan': 'payment',
      'bhugtan karo': 'send_payment_reminder',
      'reminder': 'reminder',
      'reminder daal do': 'send_payment_reminder',
      'reminder bhej do': 'send_payment_reminder',
      'yaad dilao': 'send_payment_reminder',
      'paisay yaad dilao': 'send_payment_reminder',
      
      // Inventory terms
      'maal': 'stock',
      'stock': 'stock',
      'inventory': 'inventory',
      'maal kitna hai': 'check_inventory',
      'stock check karo': 'check_inventory',
      'quantity': 'quantity',
      'quantity kiti hai': 'check_quantity',
      'quantity kitna hai': 'check_quantity',
      'add karo': 'add',
      'add kijiye': 'add',
      'ghatao': 'reduce',
      'ghataiye': 'reduce',
      'reorder': 'reorder',
      'reorder karo': 'reorder',
      'purchase karo': 'purchase',
      'purchase kijiye': 'purchase',
      'order karo': 'order',
      'order kijiye': 'order',
      
      // Follow-up terms
      'follow up': 'follow_up',
      'followup': 'follow_up',
      'follow up karo': 'follow_up',
      'followup karo': 'follow_up',
      'baat karo': 'follow_up',
      'call karo': 'follow_up',
      'call kijiye': 'follow_up',
      'message bhejo': 'follow_up',
      'puch lo': 'follow_up',
      'puchiye': 'follow_up',
      'status puchho': 'follow_up',
      'update lo': 'follow_up',
      'check karo': 'follow_up',
      
      // Time expressions
      'kal': 'tomorrow',
      'parso': 'day_after_tomorrow',
      'aaj': 'today',
      'abhi': 'now',
      'thodi der mein': 'in_few_minutes',
      'deri se': 'late',
      'jaldi': 'urgent',
      'turant': 'immediately',
      'fatafat': 'immediately'
    };
  }

  // Initialize Indian date mappings
  initializeDateMappings() {
    return {
      'kal': 1,
      'parso': 2,
      'tarso': 2,
      'aaj': 0,
      'aj': 0,
      'abhi': 0,
      'next week': 7,
      'agla hafta': 7,
      'month end': 30,
      'mahina end': 30,
      '2 din mein': 2,
      '3 din mein': 3,
      '5 din mein': 5,
      '1 week mein': 7,
      '2 week mein': 14
    };
  }

  // Initialize currency mappings
  initializeCurrencyMappings() {
    return {
      '₹': 'INR',
      'rs': 'INR',
      'rupaye': 'INR',
      'rupay': 'INR',
      'rupaiya': 'INR',
      'takka': 'INR',
      'paise': 'INR',
      'paisay': 'INR',
      'lac': '100000',
      'lakh': '100000',
      'crore': '10000000'
    };
  }

  // Initialize Indian business phrases
  initializeBusinessPhrases() {
    return {
      // Invoice creation phrases
      'bill bana do': { intent: 'create_invoice', urgency: 'medium' },
      'invoice banao': { intent: 'create_invoice', urgency: 'medium' },
      'rupaye ka bill': { intent: 'create_invoice', urgency: 'medium' },
      '500 ka bill': { intent: 'create_invoice', urgency: 'medium', amount: '500' },
      '₹500 ka bill': { intent: 'create_invoice', urgency: 'medium', amount: '500' },
      'rahul ko bill bhejo': { intent: 'create_invoice', urgency: 'medium', customer: 'Rahul' },
      
      // Payment reminder phrases
      'payment bhej do': { intent: 'send_payment_reminder', urgency: 'high' },
      'bhugtan karo': { intent: 'send_payment_reminder', urgency: 'high' },
      'paisay maang lo': { intent: 'send_payment_reminder', urgency: 'high' },
      'paisay yaad dilao': { intent: 'send_payment_reminder', urgency: 'medium' },
      'due batana': { intent: 'send_payment_reminder', urgency: 'medium' },
      'payment due hai': { intent: 'send_payment_reminder', urgency: 'medium' },
      
      // Inventory phrases
      'rice kitna hai': { intent: 'update_inventory', item: 'rice' },
      'sugar stock': { intent: 'update_inventory', item: 'sugar' },
      'maal add karo': { intent: 'update_inventory', action: 'add' },
      'stock ghatao': { intent: 'update_inventory', action: 'reduce' },
      'reorder karo': { intent: 'update_inventory', action: 'reorder' },
      
      // Follow-up phrases
      'rahul se baat karo': { intent: 'follow_up', customer: 'Rahul' },
      'customer ko call karo': { intent: 'follow_up', urgency: 'medium' },
      'follow up karo': { intent: 'follow_up', urgency: 'medium' },
      'status check karo': { intent: 'follow_up', urgency: 'low' },
      
      // Time-based phrases
      'kal bhej dena': { intent: 'create_invoice', urgency: 'medium', due_date: 'tomorrow' },
      'parso tak delivery': { intent: 'create_invoice', urgency: 'low', due_date: 'day_after_tomorrow' },
      'jaldi bhejo': { intent: 'create_invoice', urgency: 'high' },
      'urgent hai': { intent: 'create_invoice', urgency: 'high' }
    };
  }

  // Initialize GST slabs for Indian business
  initializeGSTSlabs() {
    return {
      'essential': { rate: 5, items: ['rice', 'wheat', 'flour', 'dal', 'vegetables'] },
      'standard': { rate: 12, items: ['sugar', 'oil', 'spices', 'tea'] },
      'luxury': { rate: 18, items: ['biscuits', 'namkeen', 'cold_drinks', 'processed_food'] },
      'exempt': { rate: 0, items: ['fresh_fruits', 'vegetables', 'milk'] }
    };
  }

  // Main processing method
  processIndianText(text) {
    try {
      console.log(`🇮🇳 Processing Indian text: ${text}`);
      
      // Convert to lowercase for processing
      const lowerText = text.toLowerCase();
      
      // Extract entities
      const entities = this.extractEntities(lowerText);
      
      // Detect intent from phrases
      const detectedIntent = this.detectIntentFromPhrases(lowerText);
      
      // Determine urgency
      const urgency = this.detectUrgency(lowerText);
      
      // Extract customer names
      const customer = this.extractCustomerName(lowerText);
      
      return {
        intent: detectedIntent.intent,
        confidence: detectedIntent.confidence,
        entities: {
          ...entities,
          customer: customer,
          urgency: urgency
        },
        requires_approval: this.determineApprovalRequirement(detectedIntent.intent, entities),
        indian_context: {
          hinglish_detected: this.hasHinglish(lowerText),
          hindi_detected: this.hasHindi(lowerText),
          business_phrases: this.getBusinessPhrases(lowerText)
        }
      };
      
    } catch (error) {
      console.error('Indian language processing error:', error);
      return this.getDefaultResponse();
    }
  }

  // Extract entities from text
  extractEntities(text) {
    const entities = {
      amount: this.extractAmount(text),
      items: this.extractItems(text),
      due_days: this.extractDueDays(text),
      quantity: this.extractQuantity(text)
    };
    
    return entities;
  }

  // Extract amount from Indian text
  extractAmount(text) {
    // Look for currency patterns
    const amountPatterns = [
      /₹(\d+(?:\.\d{2})?)/g,
      /(\d+(?:\.\d{2})?)\s*rupee/gi,
      /(\d+(?:\.\d{2})?)\s*rs/gi,
      /(\d+(?:\.\d{2})?)\s*rupaye/gi,
      /(\d+)\s*lakh/gi,
      /(\d+)\s*lac/gi
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        let amount = parseFloat(match[1]);
        
        // Handle lakhs
        if (text.includes('lakh') || text.includes('lac')) {
          amount = amount * 100000;
        }
        
        return amount.toString();
      }
    }
    
    return null;
  }

  // Extract items from text
  extractItems(text) {
    const commonItems = ['rice', 'wheat', 'sugar', 'oil', 'flour', 'dal', 'spices', 'tea', 'biscuits', 'namkeen'];
    const items = [];
    
    for (const item of commonItems) {
      if (text.includes(item)) {
        // Try to extract quantity
        const quantityPattern = new RegExp(`(\\d+)\\s*(kg|liters|kg|ltr|pcs|packs)\\s*${item}`, 'gi');
        const quantityMatch = text.match(quantityPattern);
        
        items.push({
          name: item,
          quantity: quantityMatch ? quantityMatch[1] : '1',
          unit: quantityMatch ? quantityMatch[2] : 'kg'
        });
      }
    }
    
    return items;
  }

  // Extract due days from Indian text
  extractDueDays(text) {
    for (const [indianTerm, days] of Object.entries(this.dateMappings)) {
      if (text.includes(indianTerm)) {
        return days.toString();
      }
    }
    
    return null;
  }

  // Extract quantity
  extractQuantity(text) {
    const quantityPatterns = [
      /(\d+)\s*(kg|kilogram|liters|liter|pcs|pieces|packets)/gi
    ];
    
    for (const pattern of quantityPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  // Detect intent from business phrases
  detectIntentFromPhrases(text) {
    let bestMatch = { intent: 'none', confidence: 0.0 };
    
    for (const [phrase, data] of Object.entries(this.businessPhrases)) {
      if (text.includes(phrase)) {
        const confidence = phrase.length / text.length; // Simple confidence scoring
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            intent: data.intent,
            confidence: confidence,
            extracted_data: data
          };
        }
      }
    }
    
    return bestMatch;
  }

  // Detect urgency from text
  detectUrgency(text) {
    if (text.includes('jaldi') || text.includes('urgent') || text.includes('turant') || text.includes('fatafat')) {
      return 'high';
    }
    if (text.includes('kal') || text.includes('tomorrow')) {
      return 'medium';
    }
    return 'low';
  }

  // Extract customer name
  extractCustomerName(text) {
    // Simple pattern: "name se baat karo" or "name ko bhejo"
    const namePatterns = [
      /(\w+)\s+se\s+baat\s+karo/gi,
      /(\w+)\s+ko\s+bhej/gi,
      /(\w+)\s+ko\s+bill/gi,
      /(\w+)\s+ko\s+message/gi
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  // Check if text contains Hinglish
  hasHinglish(text) {
    const hinglishWords = ['bhej', 'dena', 'karo', 'kijiye', 'banana', 'likh', 'puch', 'maal', 'paisay', 'kal', 'aaj'];
    return hinglishWords.some(word => text.includes(word));
  }

  // Check if text contains Hindi
  hasHindi(text) {
    const hindiRegex = /[\u0900-\u097F]/;
    return hindiRegex.test(text);
  }

  // Get business phrases found in text
  getBusinessPhrases(text) {
    const foundPhrases = [];
    for (const phrase of Object.keys(this.businessPhrases)) {
      if (text.includes(phrase)) {
        foundPhrases.push(phrase);
      }
    }
    return foundPhrases;
  }

  // Determine if approval is required
  determineApprovalRequirement(intent, entities) {
    // Business rules for Indian SMB
    switch (intent) {
      case 'create_invoice':
        return (entities.amount && parseFloat(entities.amount) > 1000);
      case 'send_payment_reminder':
        return true; // Always require approval for payment reminders
      case 'update_inventory':
        return (entities.items && entities.items.some(item => 
          parseInt(item.quantity) > 100 // Large inventory changes
        ));
      case 'refund':
        return true; // Refunds always require approval
      default:
        return false;
    }
  }

  // Default response when processing fails
  getDefaultResponse() {
    return {
      intent: 'none',
      confidence: 0.0,
      entities: {},
      requires_approval: false,
      indian_context: {
        hinglish_detected: false,
        hindi_detected: false,
        business_phrases: []
      }
    };
  }

  // Convert Indian dates to standard format
  convertIndianDate(indianDateText) {
    return this.dateMappings[indianDateText] || 0;
  }

  // Get GST rate for item
  getGSTRate(item) {
    for (const [category, data] of Object.entries(this.gstSlabs)) {
      if (data.items.includes(item.toLowerCase())) {
        return data.rate;
      }
    }
    return 18; // Default GST rate
  }

  // Format currency for Indian context
  formatIndianCurrency(amount) {
    const num = parseFloat(amount);
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} lakh`;
    }
    return `₹${num.toFixed(2)}`;
  }
}

module.exports = new IndianLanguageProcessor();
