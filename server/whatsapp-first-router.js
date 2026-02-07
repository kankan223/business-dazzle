/**
 * WhatsApp-First Router for Bharat Biz-Agent
 * WHY: Prioritize WhatsApp/Telegram over dashboard for Indian SMBs
 * CHANGE: New router to enforce WhatsApp-first business operations
 */

const express = require('express');
const geminiService = require('./gemini-service');
const intentProcessor = require('./intent-processor');
const indianLanguageProcessor = require('./indian-language-processor');
const proactiveIntelligenceService = require('./proactive-intelligence-service');
const lowBandwidthService = require('./low-bandwidth-service');
const { 
  ApprovalOperations, 
  OrderOperations, 
  UserOperations,
  AuditOperations
} = require('./database');

class WhatsAppFirstRouter {
  constructor() {
    this.router = express.Router();
    this.setupRoutes();
    this.businessRules = this.initializeBusinessRules();
  }

  // Initialize business rules for WhatsApp-first operation
  initializeBusinessRules() {
    return {
      // Dashboard is admin-only
      dashboard_access: 'admin_only',
      
      // All customer interactions happen via WhatsApp/Telegram
      primary_interface: 'whatsapp_telegram',
      
      // Auto-approval thresholds for common actions
      auto_approve: {
        invoice_amount: 500, // Auto-approve invoices ≤ ₹500
        payment_reminder: true, // Auto-approve payment reminders
        follow_up: true, // Auto-approve follow-ups
        inventory_update: 10 // Auto-approve inventory updates ≤ 10 items
      },
      
      // Mandatory approval for sensitive actions
      manual_approve: {
        invoice_amount: 1000, // Manual approval for invoices > ₹1000
        refund: true, // Always manual approval for refunds
        data_sharing: true, // Always manual approval for data sharing
        bulk_operations: true // Manual approval for bulk operations
      }
    };
  }

  // Setup WhatsApp-first routes
  setupRoutes() {
    // WhatsApp-first message processing
    this.router.post('/whatsapp/message', this.handleWhatsAppMessage.bind(this));
    this.router.post('/telegram/message', this.handleTelegramMessage.bind(this));
    
    // Voice-first processing
    this.router.post('/voice/process', this.handleVoiceMessage.bind(this));
    
    // Intent-based actions (WhatsApp-first)
    this.router.post('/intent/invoice', this.handleIntentInvoice.bind(this));
    this.router.post('/intent/payment-reminder', this.handleIntentPaymentReminder.bind(this));
    this.router.post('/intent/follow-up', this.handleIntentFollowUp.bind(this));
    this.router.post('/intent/inventory', this.handleIntentInventory.bind(this));
    
    // Approval endpoints (mobile-first)
    this.router.post('/approve/:approvalId', this.handleMobileApproval.bind(this));
    this.router.post('/reject/:approvalId', this.handleMobileRejection.bind(this));
    
    // Status endpoints (optimized for mobile)
    this.router.get('/status/business', this.getBusinessStatus.bind(this));
    this.router.get('/status/pending', this.getPendingActions.bind(this));
  }

  // Handle WhatsApp messages with intent processing
  async handleWhatsAppMessage(req, res) {
    try {
      const { from, message, timestamp } = req.body;
      
      console.log(`📱 WhatsApp-first message from ${from.phone}: ${message}`);
      
      // Process with Indian Language Processor first
      const indianContext = indianLanguageProcessor.processIndianText(message);
      
      let intentResult;
      if (indianContext.confidence > 0.3) {
        // Use Indian context directly
        intentResult = await intentProcessor.processMessage(message, {
          id: from.id,
          name: from.name,
          phone: from.phone,
          platform: 'whatsapp'
        }, []);
        
        intentResult.processing_method = 'indian_language_first';
      } else {
        // Fallback to AI processing
        intentResult = await intentProcessor.processMessage(message, {
          id: from.id,
          name: from.name,
          phone: from.phone,
          platform: 'whatsapp'
        }, []);
        
        intentResult.processing_method = 'ai_fallback';
      }
      
      // Apply WhatsApp-first business rules
      const processedResult = this.applyWhatsAppFirstRules(intentResult, from);
      
      // Send WhatsApp-optimized response
      const response = this.generateWhatsAppResponse(processedResult);
      
      res.json({
        success: true,
        response,
        intent_result: processedResult,
        whatsapp_first: true
      });
      
    } catch (error) {
      console.error('WhatsApp message processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle Telegram messages (same logic as WhatsApp)
  async handleTelegramMessage(req, res) {
    try {
      const { from, message, timestamp } = req.body;
      
      console.log(`✈️ Telegram-first message from ${from.username}: ${message}`);
      
      // Process with Indian Language Processor first
      const indianContext = indianLanguageProcessor.processIndianText(message);
      
      let intentResult;
      if (indianContext.confidence > 0.3) {
        intentResult = await intentProcessor.processMessage(message, {
          id: from.id,
          name: from.name,
          username: from.username,
          platform: 'telegram'
        }, []);
        
        intentResult.processing_method = 'indian_language_first';
      } else {
        intentResult = await intentProcessor.processMessage(message, {
          id: from.id,
          name: from.name,
          username: from.username,
          platform: 'telegram'
        }, []);
        
        intentResult.processing_method = 'ai_fallback';
      }
      
      // Apply WhatsApp-first business rules (same for both platforms)
      const processedResult = this.applyWhatsAppFirstRules(intentResult, from);
      
      // Send Telegram-optimized response
      const response = this.generateTelegramResponse(processedResult);
      
      res.json({
        success: true,
        response,
        intent_result: processedResult,
        whatsapp_first: true
      });
      
    } catch (error) {
      console.error('Telegram message processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle voice messages
  async handleVoiceMessage(req, res) {
    try {
      const { audio, customer, platform } = req.body;
      
      console.log(`🎙️ Processing voice message from ${platform}`);
      
      // Process with Indian Voice Service
      const voiceResult = await indianVoiceService.processIndianVoice(audio, customer);
      
      // Extract voice commands or use transcription
      let intentResult;
      if (voiceResult.voice_commands && voiceResult.voice_commands.length > 0) {
        const bestCommand = voiceResult.voice_commands.find(cmd => cmd.is_valid);
        if (bestCommand) {
          intentResult = await intentProcessor.processMessage(bestCommand.phrase, customer, []);
        }
      }
      
      // Fallback to transcription if no valid commands
      if (!intentResult) {
        intentResult = await intentProcessor.processMessage(voiceResult.transcription.text, customer, []);
      }
      
      res.json({
        success: true,
        voice_result: voiceResult,
        intent_result: intentResult,
        whatsapp_first: true
      });
      
    } catch (error) {
      console.error('Voice message processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Apply WhatsApp-first business rules
  applyWhatsAppFirstRules(intentResult, customerInfo) {
    const rules = this.businessRules;
    const processed = { ...intentResult };
    
    // Check auto-approval rules
    if (intentResult.intent === 'create_invoice') {
      const amount = parseFloat(intentResult.entities?.amount || 0);
      
      if (amount <= rules.auto_approve.invoice_amount) {
        processed.requires_approval = false;
        processed.auto_approved = true;
        processed.approval_type = 'auto';
      } else if (amount >= rules.manual_approve.invoice_amount) {
        processed.requires_approval = true;
        processed.auto_approved = false;
        processed.approval_type = 'manual';
      }
    }
    
    // Payment reminders are auto-approved
    if (intentResult.intent === 'send_payment_reminder') {
      processed.requires_approval = false;
      processed.auto_approved = true;
      processed.approval_type = 'auto';
    }
    
    // Follow-ups are auto-approved
    if (intentResult.intent === 'follow_up') {
      processed.requires_approval = false;
      processed.auto_approved = true;
      processed.approval_type = 'auto';
    }
    
    // Small inventory updates are auto-approved
    if (intentResult.intent === 'update_inventory') {
      const totalQuantity = intentResult.entities?.items?.reduce((sum, item) => 
        sum + parseInt(item.quantity || 0), 0) || 0;
      
      if (totalQuantity <= rules.auto_approve.inventory_update) {
        processed.requires_approval = false;
        processed.auto_approved = true;
        processed.approval_type = 'auto';
      } else {
        processed.requires_approval = true;
        processed.auto_approved = false;
        processed.approval_type = 'manual';
      }
    }
    
    return processed;
  }

  // Generate WhatsApp-optimized response
  generateWhatsAppResponse(processedResult) {
    let response = processedResult.draft_message;
    
    // Add WhatsApp-specific formatting
    if (processedResult.requires_approval) {
      response += '\n\n👆 *Reply HAAN to approve*\n👆 *Reply NAHI to cancel*';
    }
    
    // Add Indian business context
    if (processedResult.indian_context?.hinglish_detected) {
      response = '🇮🇳 ' + response;
    }
    
    // Add quick action buttons for WhatsApp
    const quickActions = this.generateWhatsAppQuickActions(processedResult);
    if (quickActions.length > 0) {
      response += '\n\n' + quickActions.join('\n');
    }
    
    return response;
  }

  // Generate Telegram-optimized response
  generateTelegramResponse(processedResult) {
    let response = processedResult.draft_message;
    
    // Add Telegram-specific formatting
    if (processedResult.requires_approval) {
      response += '\n\n👆 *Tap HAAN to approve*\n👆 *Tap NAHI to cancel*';
    }
    
    // Add Indian business context
    if (processedResult.indian_context?.hinglish_detected) {
      response = '🇮🇳 ' + response;
    }
    
    return response;
  }

  // Generate WhatsApp quick actions
  generateWhatsAppQuickActions(processedResult) {
    const actions = [];
    
    switch (processedResult.intent) {
      case 'create_invoice':
        actions.push('💰 *SEND INVOICE*');
        actions.push('📋 *EDIT ITEMS*');
        break;
        
      case 'send_payment_reminder':
        actions.push('📱 *SEND NOW*');
        actions.push('⏰ *SCHEDULE*');
        break;
        
      case 'follow_up':
        actions.push('📞 *CALL*');
        actions.push('📬 *WHATSAPP*');
        break;
    }
    
    return actions;
  }

  // Handle intent-based payment reminder
  async handleIntentPaymentReminder(req, res) {
    try {
      const { customer, amount, platform } = req.body;
      
      const reminderData = {
        customer,
        amount,
        platform: platform || 'whatsapp',
        source: 'whatsapp_first_intent'
      };
      
      // Process through intent processor
      const result = await intentProcessor.executeBusinessAction({
        intent: 'send_payment_reminder',
        entities: reminderData
      }, { id: customer, platform });
      
      res.json({
        success: true,
        result,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle intent-based follow-up
  async handleIntentFollowUp(req, res) {
    try {
      const { customer, type, platform } = req.body;
      
      const followUpData = {
        customer,
        type,
        platform: platform || 'whatsapp',
        source: 'whatsapp_first_intent'
      };
      
      const result = await intentProcessor.executeBusinessAction({
        intent: 'follow_up',
        entities: followUpData
      }, { id: customer, platform });
      
      res.json({
        success: true,
        result,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle intent-based inventory update
  async handleIntentInventory(req, res) {
    try {
      const { items, platform } = req.body;
      
      const inventoryData = {
        items,
        platform: platform || 'whatsapp',
        source: 'whatsapp_first_intent'
      };
      
      const result = await intentProcessor.executeBusinessAction({
        intent: 'update_inventory',
        entities: inventoryData
      }, { id: items[0]?.customer || 'system', platform });
      
      res.json({
        success: true,
        result,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle intent-based invoice creation
  async handleIntentInvoice(req, res) {
    try {
      const { customer, items, amount, platform } = req.body;
      
      const invoiceData = {
        customer,
        items,
        amount,
        platform: platform || 'whatsapp',
        source: 'whatsapp_first_intent'
      };
      
      // Process through intent processor
      const result = await intentProcessor.executeBusinessAction({
        intent: 'create_invoice',
        entities: invoiceData
      }, { id: customer, platform });
      
      res.json({
        success: true,
        result,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle mobile approval (WhatsApp-first)
  async handleMobileApproval(req, res) {
    try {
      const { approvalId } = req.params;
      const { approver, notes } = req.body;
      
      console.log(`✅ Mobile approval: ${approvalId} by ${approver}`);
      
      // Execute the approved action
      const result = await this.executeApprovedAction(approvalId, approver, notes);
      
      // Send WhatsApp confirmation
      await this.sendWhatsAppConfirmation(result);
      
      res.json({
        success: true,
        result,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Handle mobile rejection
  async handleMobileRejection(req, res) {
    try {
      const { approvalId } = req.params;
      const { rejecter, reason } = req.body;
      
      console.log(`❌ Mobile rejection: ${approvalId} by ${rejecter}`);
      
      // Cancel the action
      const result = await this.cancelPendingAction(approvalId, rejecter, reason);
      
      res.json({
        success: true,
        result,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        whatsapp_first: true
      });
    }
  }

  // Get business status (optimized for mobile)
  async getBusinessStatus(req, res) {
    try {
      const status = await this.getBusinessMetrics();
      
      res.json({
        success: true,
        status,
        whatsapp_first: true,
        mobile_optimized: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get pending actions (mobile view)
  async getPendingActions(req, res) {
    try {
      const pending = await ApprovalOperations.getPending();
      
      // Optimize for mobile viewing
      const mobilePending = pending.map(action => ({
        id: action.id,
        type: action.type,
        customer: action.customerName,
        amount: action.details?.amount || 'N/A',
        urgency: action.priority,
        quick_actions: this.getMobileQuickActions(action)
      }));
      
      res.json({
        success: true,
        pending: mobilePending,
        whatsapp_first: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get mobile quick actions
  getMobileQuickActions(action) {
    const actions = [];
    
    switch (action.type) {
      case 'invoice':
        actions.push({ type: 'approve', label: '✅ Approve' });
        actions.push({ type: 'reject', label: '❌ Reject' });
        actions.push({ type: 'edit', label: '✏️ Edit' });
        break;
        
      case 'payment_reminder':
        actions.push({ type: 'send', label: '📱 Send Now' });
        actions.push({ type: 'schedule', label: '⏰ Schedule' });
        break;
    }
    
    return actions;
  }

  // Helper methods (would be implemented with actual services)
  async executeApprovedAction(approvalId, approver, notes) {
    return {
      approvalId,
      status: 'approved',
      approver,
      notes,
      executed_at: new Date().toISOString()
    };
  }

  async cancelPendingAction(approvalId, rejecter, reason) {
    return {
      approvalId,
      status: 'rejected',
      rejecter,
      reason,
      cancelled_at: new Date().toISOString()
    };
  }

  async sendWhatsAppConfirmation(result) {
    console.log('📱 Sending WhatsApp confirmation:', result);
  }

  async getBusinessMetrics() {
    return {
      total_customers: 150,
      active_conversations: 12,
      pending_approvals: 3,
      today_revenue: 25000,
      whatsapp_first: true
    };
  }

  // Get the router
  getRouter() {
    return this.router;
  }
}

module.exports = new WhatsAppFirstRouter();
