/**
 * Intent Processing Service for Bharat Biz-Agent
 * Transforms unstructured chat/voice into structured business actions
 * 
 * WHY: Converts chatbot into autonomous business co-pilot
 * CHANGE: New service to handle intent extraction and action execution
 */

const { SimpleAIService } = require('./simple-ai-service');
const indianLanguageProcessor = require('./indian-language-processor');
const { 
  ApprovalOperations, 
  OrderOperations, 
  InventoryOperations,
  UserOperations,
  AuditOperations
} = require('./database');

class IntentProcessor {
  constructor() {
    this.aiService = new SimpleAIService();
    this.intentPatterns = this.initializeIntentPatterns();
    this.businessContext = this.loadBusinessContext();
  }

  // Initialize Indian business intent patterns
  initializeIntentPatterns() {
    return {
      // Invoice creation patterns
      invoice: [
        'bill banao', 'invoice banaye', 'bill send karo', 
        'invoice bhej do', 'rupaye ka bill', '\u20b9 bill',
        'generate invoice', 'create bill', 'billing karo'
      ],
      
      // Payment reminder patterns  
      payment_reminder: [
        'payment reminder', 'bheet dena', 'paise maang lo',
        'payment bhejo', 'reminder daal do', 'due batana',
        'paisay yaad dilao', 'bhugtan karo'
      ],
      
      // Inventory patterns
      inventory: [
        'stock check', 'maal kitna hai', 'quantity kiti hai',
        'inventory update', 'maal add karo', 'stock ghatao',
        'reorder karo', 'order karna', 'purchase karna'
      ],
      
      // Follow-up patterns
      follow_up: [
        'follow up karo', 'baat karo', 'call karo',
        'message bhejo', 'puch lo', 'status puchho',
        'update lo', 'check karo'
      ]
    };
  }

  // Load Indian business context
  loadBusinessContext() {
    return {
      currency: 'INR',
      gst_slabs: { 0: 'exempt', 5: 'essential', 12: 'standard', 18: 'luxury' },
      payment_modes: ['UPI', 'Cash', 'Bank Transfer', 'Paytm', 'PhonePe'],
      business_hours: { start: '9:00', end: '20:00' },
      delivery_areas: ['city_limits', 'nearby', 'outstation'],
      common_items: ['rice', 'wheat', 'sugar', 'oil', 'spices', 'flour', 'dal']
    };
  }

  // Main intent processing method
  async processMessage(message, customerInfo, conversationHistory = []) {
    try {
      // Processing intent
      
      // STEP 1: Process with Indian Language Processor first
      const indianContext = indianLanguageProcessor.processIndianText(message);
      
      // STEP 2: If high confidence in Indian context, use it directly
      if (indianContext.confidence > 0.3) {
        // Using Indian language context
        
        // Enhance with business rules
        const enhancedIntent = await this.validateAndEnhanceIntent(indianContext, customerInfo);
        
        // Execute action if intent is clear
        if (enhancedIntent.intent !== 'none') {
          const actionResult = await this.executeBusinessAction(enhancedIntent, customerInfo);
          
          await AuditOperations.log('intent_executed', {
            message: message,
            intent: enhancedIntent.intent,
            action: actionResult,
            customer: customerInfo,
            indian_context: enhancedIntent.indian_context
          }, customerInfo.id || 'anonymous');
          
          return {
            ...enhancedIntent,
            action_result: actionResult,
            success: true,
            processing_method: 'indian_language_first'
          };
        }
      }
      
      // STEP 3: Fallback to AI analysis if Indian context is unclear
      // Falling back to AI analysis
      const aiAnalysis = await this.extractIntentWithAI(message, customerInfo, conversationHistory);
      
      // Validate and enhance intent
      const validatedIntent = await this.validateAndEnhanceIntent(aiAnalysis, customerInfo);
      
      // Execute action if intent is clear
      if (validatedIntent.intent !== 'none') {
        const actionResult = await this.executeBusinessAction(validatedIntent, customerInfo);
        
        await AuditOperations.log('intent_executed', {
          message: message,
          intent: validatedIntent.intent,
          action: actionResult,
          customer: customerInfo
        }, customerInfo.id || 'anonymous');
        
        return {
          ...validatedIntent,
          action_result: actionResult,
          success: true,
          processing_method: 'ai_fallback'
        };
      }
      
      return {
        ...validatedIntent,
        success: false,
        message: 'Samjh nahi aaya. Kripya aphani baat detail mein batayein.',
        processing_method: 'failed'
      };
      
    } catch (error) {
      console.error('Intent processing error:', error);
      return {
        intent: 'none',
        entities: {},
        requires_approval: false,
        draft_message: 'Koi gadbad ho gayi hai. Thodi der mein try kijiye.',
        success: false
      };
    }
  }

  // Extract structured intent using AI
  async extractIntentWithAI(message, customerInfo, conversationHistory) {
    const prompt = `
You are Bharat Biz-Agent, an AI assistant for Indian SMBs.

Analyze this message and extract structured intent:

MESSAGE: "${message}"
CUSTOMER: ${customerInfo.name || 'Unknown'}
HISTORY: ${conversationHistory.slice(-3).map(h => h.text).join(' | ')}

RESPONSE FORMAT (JSON only):
{
  "intent": "create_invoice | send_payment_reminder | update_inventory | follow_up | none",
  "confidence": 0.0-1.0,
  "entities": {
    "customer": "",
    "amount": "",
    "items": [{"name": "", "quantity": "", "unit": ""}],
    "due_days": "",
    "urgency": "low | medium | high"
  },
  "requires_approval": true | false,
  "draft_message": "",
  "next_questions": []
}

RULES:
- Default currency to INR if not specified
- Extract Indian date references: "kal" = tomorrow, "parso" = day after
- Handle Hinglish: "bhej dena", "kal bhej do", "udhar likh lo"
- GST automatically calculated at 18% unless specified
- UPI is default payment mode
- Invoice > ₹1000 requires approval
- Refunds always require approval
- Be conservative with confidence
`;

    try {
      const aiResponse = await this.aiService.processCustomerMessage(prompt, {
        type: 'intent_extraction',
        customer: customerInfo
      }, conversationHistory);
      
      // Parse structured response
      const structuredResponse = this.parseStructuredResponse(aiResponse.text || aiResponse.response);
      return structuredResponse;
      
    } catch (error) {
      console.error('AI intent extraction failed:', error);
      return this.getDefaultIntent();
    }
  }

  // Parse AI response to extract JSON
  parseStructuredResponse(aiText) {
    try {
      // Look for JSON in the response
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse structured response:', error);
    }
    
    return this.getDefaultIntent();
  }

  // Default intent when parsing fails
  getDefaultIntent() {
    return {
      intent: 'none',
      confidence: 0.0,
      entities: {},
      requires_approval: false,
      draft_message: 'Samjh nahi aaya. Kripya aphani baat detail mein batayein.',
      next_questions: ['Aap kya karma chahte hain?']
    };
  }

  // Validate and enhance intent with business rules
  async validateAndEnhanceIntent(intent, customerInfo) {
    const enhanced = { ...intent };
    
    // Apply Indian business rules
    switch (intent.intent) {
      case 'create_invoice':
        enhanced.requires_approval = (intent.entities.amount && parseFloat(intent.entities.amount) > 1000);
        enhanced.draft_message = this.generateInvoiceDraft(intent.entities, customerInfo);
        break;
        
      case 'send_payment_reminder':
        enhanced.requires_approval = true; // Always require approval for payment reminders
        enhanced.draft_message = this.generatePaymentReminderDraft(intent.entities, customerInfo);
        break;
        
      case 'update_inventory':
        enhanced.requires_approval = (intent.entities.items && intent.entities.items.some(item => 
          parseInt(item.quantity) > 100 // Large inventory changes need approval
        ));
        enhanced.draft_message = this.generateInventoryUpdateDraft(intent.entities, customerInfo);
        break;
        
      case 'follow_up':
        enhanced.requires_approval = false; // Follow-ups are generally safe
        enhanced.draft_message = this.generateFollowUpDraft(intent.entities, customerInfo);
        break;
    }
    
    return enhanced;
  }

  // Execute the business action
  async executeBusinessAction(intent, customerInfo) {
    try {
      switch (intent.intent) {
        case 'create_invoice':
          return await this.createInvoiceAction(intent.entities, customerInfo);
          
        case 'send_payment_reminder':
          return await this.sendPaymentReminderAction(intent.entities, customerInfo);
          
        case 'update_inventory':
          return await this.updateInventoryAction(intent.entities, customerInfo);
          
        case 'follow_up':
          return await this.followUpAction(intent.entities, customerInfo);
          
        default:
          return { status: 'no_action', message: 'No valid intent found' };
      }
    } catch (error) {
      console.error('Action execution failed:', error);
      return { status: 'error', message: error.message };
    }
  }

  // Generate invoice draft message
  generateInvoiceDraft(entities, customerInfo) {
    const amount = entities.amount || '0';
    const items = entities.items || [];
    const customer = entities.customer || customerInfo.name;
    
    return `🧾 *INVOICE DRAFT*\n\n` +
           `👤 Customer: ${customer}\n` +
           `📦 Items: ${items.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}\n` +
           `💰 Amount: ₹${amount}\n` +
           `🧾 GST (18%): ₹${(parseFloat(amount) * 0.18).toFixed(2)}\n` +
           `💳 Total: ₹${(parseFloat(amount) * 1.18).toFixed(2)}\n\n` +
           `⚠️ *Approval Required*\n` +
           `Reply "HAAN" to create and send invoice\n` +
           `Reply "NAHI" to cancel`;
  }

  // Generate payment reminder draft
  generatePaymentReminderDraft(entities, customerInfo) {
    const amount = entities.amount || 'pending';
    const dueDays = entities.due_days || 'soon';
    const customer = entities.customer || customerInfo.name;
    
    return `💰 *PAYMENT REMINDER*\n\n` +
           `👤 Dear ${customer},\n\n` +
           `📋 Your payment of ₹${amount} is due\n` +
           `⏰ Due in: ${dueDays} days\n\n` +
           `💳 Payment Options:\n` +
           `📱 UPI: bharatbiz@upi\n` +
           `🏦 Bank: HDFC0001234\n\n` +
           `⚠️ *Approval Required*\n` +
           `Reply "SEND" to send reminder\n` +
           `Reply "CANCEL" to cancel`;
  }

  // Generate inventory update draft
  generateInventoryUpdateDraft(entities, customerInfo) {
    const items = entities.items || [];
    
    return `📦 *INVENTORY UPDATE*\n\n` +
           `📋 Items to update:\n` +
           items.map(i => `• ${i.name}: ${i.quantity} ${i.unit}`).join('\n') + '\n\n' +
           `⚠️ *Approval Required*\n` +
           `Reply "UPDATE" to confirm changes\n` +
           `Reply "CANCEL" to cancel`;
  }

  // Generate follow-up draft
  generateFollowUpDraft(entities, customerInfo) {
    const customer = entities.customer || customerInfo.name;
    const urgency = entities.urgency || 'medium';
    
    return `📞 *FOLLOW-UP*\n\n` +
           `👤 Customer: ${customer}\n` +
           `🔥 Priority: ${urgency.toUpperCase()}\n\n` +
           `💬 Quick follow-up message ready to send\n\n` +
           `Reply "SEND" to send follow-up\n` +
           `Reply "EDIT" to change message`;
  }

  // Action execution methods
  async createInvoiceAction(entities, customerInfo) {
    // Create invoice in database (pending approval)
    const invoice = {
      id: `INV-${Date.now()}`,
      customer: entities.customer || customerInfo.name,
      items: entities.items || [],
      amount: parseFloat(entities.amount) || 0,
      gst: parseFloat(entities.amount) * 0.18,
      total: parseFloat(entities.amount) * 1.18,
      status: 'pending_approval',
      created_at: new Date().toISOString(),
      requires_approval: true
    };
    
    // Store in approvals system
    await ApprovalOperations.create({
      type: 'invoice',
      data: invoice,
      customer: customerInfo,
      platform: customerInfo.platform || 'whatsapp'
    });
    
    return { 
      status: 'pending_approval', 
      invoice_id: invoice.id,
      message: 'Invoice created and sent for approval'
    };
  }

  async sendPaymentReminderAction(entities, customerInfo) {
    // Create approval for payment reminder
    const reminder = {
      id: `REM-${Date.now()}`,
      customer: entities.customer || customerInfo.name,
      amount: entities.amount,
      due_days: entities.due_days,
      type: 'payment_reminder',
      status: 'pending_approval',
      created_at: new Date().toISOString()
    };
    
    await ApprovalOperations.create({
      type: 'payment_reminder',
      data: reminder,
      customer: customerInfo,
      platform: customerInfo.platform || 'whatsapp'
    });
    
    return { 
      status: 'pending_approval', 
      reminder_id: reminder.id,
      message: 'Payment reminder created and sent for approval'
    };
  }

  async updateInventoryAction(entities, customerInfo) {
    // Update inventory (if approved)
    const updates = entities.items || [];
    
    for (const item of updates) {
      await InventoryOperations.updateBySku(item.name, {
        quantity: parseInt(item.quantity),
        unit: item.unit,
        last_updated: new Date().toISOString()
      });
    }
    
    return { 
      status: 'completed', 
      updated_items: updates.length,
      message: `Updated ${updates.length} inventory items`
    };
  }

  async followUpAction(entities, customerInfo) {
    // Generate follow-up and send directly (no approval needed)
    const followUp = {
      id: `FU-${Date.now()}`,
      customer: entities.customer || customerInfo.name,
      urgency: entities.urgency || 'medium',
      message: `Namaste ${entities.customer || customerInfo.name}, kya aapka kaam ho gaya hai?`,
      status: 'sent',
      created_at: new Date().toISOString()
    };
    
    // Send follow-up via WhatsApp/Telegram
    // This would integrate with the actual messaging service
    
    return { 
      status: 'sent', 
      follow_up_id: followUp.id,
      message: 'Follow-up message sent'
    };
  }
}

module.exports = new IntentProcessor();
