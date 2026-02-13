/**
 * Proactive Intelligence Service for Bharat Biz-Agent
 * WHY: Transform from reactive chatbot to proactive business co-pilot
 * CHANGE: New service for context-aware follow-ups and autonomous actions
 */

const { 
  ApprovalOperations, 
  OrderOperations, 
  InventoryOperations,
  UserOperations,
  ConversationOperations,
  AuditOperations
} = require('./database');
const indianLanguageProcessor = require('./indian-language-processor');

class ProactiveIntelligenceService {
  constructor() {
    this.businessTriggers = this.initializeBusinessTriggers();
    this.followUpRules = this.initializeFollowUpRules();
    this.nudgePatterns = this.initializeNudgePatterns();
    this.timeBasedActions = this.initializeTimeBasedActions();
    this.isRunning = false;
    this.checkInterval = null;
  }

  // Initialize business triggers for proactive monitoring
  initializeBusinessTriggers() {
    return {
      // Payment triggers
      overdue_payments: {
        condition: 'payment_due_days > 30',
        urgency: 'high',
        action: 'send_payment_reminder',
        message_template: 'payment_overdue_reminder'
      },
      
      pending_payments: {
        condition: 'payment_due_days > 7',
        urgency: 'medium',
        action: 'send_payment_reminder',
        message_template: 'payment_pending_reminder'
      },
      
      // Inventory triggers
      low_stock: {
        condition: 'quantity < low_stock_threshold',
        urgency: 'high',
        action: 'suggest_reorder',
        message_template: 'low_stock_alert'
      },
      
      critical_stock: {
        condition: 'quantity < 5',
        urgency: 'critical',
        action: 'emergency_reorder',
        message_template: 'critical_stock_alert'
      },
      
      // Approval triggers
      pending_approvals: {
        condition: 'approval_count > 5',
        urgency: 'medium',
        action: 'approval_nudge',
        message_template: 'approval_backlog_alert'
      },
      
      // Customer triggers
      inactive_customers: {
        condition: 'last_interaction_days > 14',
        urgency: 'low',
        action: 'customer_re_engagement',
        message_template: 'customer_re_engagement'
      }
    };
  }

  // Initialize follow-up rules for Indian business context
  initializeFollowUpRules() {
    return {
      // Payment follow-ups
      payment_follow_up: {
        schedule: [3, 7, 14, 21, 30], // Days after due date
        escalation_rules: {
          3: { method: 'whatsapp', tone: 'gentle_reminder' },
          7: { method: 'whatsapp', tone: 'friendly_follow_up' },
          14: { method: 'call', tone: 'concerned_follow_up' },
          21: { method: 'whatsapp', tone: 'urgent_follow_up' },
          30: { method: 'call', tone: 'final_notice' }
        }
      },
      
      // Order follow-ups
      order_follow_up: {
        schedule: [1, 3], // Days after order
        escalation_rules: {
          1: { method: 'whatsapp', tone: 'order_confirmation' },
          3: { method: 'whatsapp', tone: 'delivery_update' }
        }
      },
      
      // Invoice follow-ups
      invoice_follow_up: {
        schedule: [1, 7], // Days after invoice
        escalation_rules: {
          1: { method: 'whatsapp', tone: 'invoice_sent' },
          7: { method: 'whatsapp', tone: 'payment_reminder' }
        }
      }
    };
  }

  // Initialize AI-generated nudge patterns
  initializeNudgePatterns() {
    return {
      // Business optimization nudges
      inventory_optimization: {
        trigger: 'slow_moving_items',
        nudge: 'Consider offering discount on slow-moving items to improve cash flow',
        confidence_threshold: 0.7
      },
      
      payment_optimization: {
        trigger: 'high_payment_pending',
        nudge: 'Multiple payments pending. Should I send bulk reminders?',
        confidence_threshold: 0.8
      },
      
      customer_retention: {
        trigger: 'customer_churn_risk',
        nudge: 'Customer hasn\'t ordered in 30 days. Should I send special offer?',
        confidence_threshold: 0.6
      },
      
      // Operational efficiency nudges
      batch_processing: {
        trigger: 'similar_pending_tasks',
        nudge: '3 similar invoices pending. Approve all at once?',
        confidence_threshold: 0.9
      },
      
      time_optimization: {
        trigger: 'peak_business_hours',
        nudge: 'High activity detected. Focus on urgent tasks first?',
        confidence_threshold: 0.5
      }
    };
  }

  // Initialize time-based actions for Indian business hours
  initializeTimeBasedActions() {
    return {
      // Morning actions (9 AM)
      morning_checkin: {
        time: '09:00',
        actions: [
          'check_urgent_approvals',
          'review_today_deliveries',
          'check_low_stock_items'
        ]
      },
      
      // Evening actions (6 PM)
      evening_wrapup: {
        time: '18:00',
        actions: [
          'send_daily_summary',
          'schedule_tomorrow_tasks',
          'check_pending_payments'
        ]
      },
      
      // Weekly actions (Monday morning)
      weekly_planning: {
        time: 'Monday 09:00',
        actions: [
          'review_weekly_performance',
          'identify_slow_moving_items',
          'plan_weekly_followups'
        ]
      },
      
      // Month-end actions
      monthly_closure: {
        time: 'Month-end',
        actions: [
          'generate_monthly_reports',
          'identify_overdue_accounts',
          'plan_inventory_restock'
        ]
      }
    };
  }

  // Start proactive monitoring
  async startProactiveMonitoring() {
    if (this.isRunning) {
      console.log('🔄 Proactive monitoring already running');
      return;
    }
    
    console.log('🚀 Starting proactive intelligence monitoring');
    this.isRunning = true;
    
    // Run checks every 5 minutes
    this.checkInterval = setInterval(async () => {
      await this.runProactiveChecks();
    }, 5 * 60 * 1000);
    
    // Run initial check
    await this.runProactiveChecks();
  }

  // Stop proactive monitoring
  stopProactiveMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('⏹️ Proactive monitoring stopped');
  }

  // Main proactive check routine
  async runProactiveChecks() {
    try {
      console.log('🔍 Running proactive business checks');
      
      // Check all trigger conditions
      const triggerResults = await this.checkAllTriggers();
      
      // Generate AI nudges
      const nudgeResults = await this.generateAINudges();
      
      // Process time-based actions
      const timeActions = await this.checkTimeBasedActions();
      
      // Combine and prioritize actions
      const allActions = this.prioritizeActions([
        ...triggerResults,
        ...nudgeResults,
        ...timeActions
      ]);
      
      // Execute approved actions
      for (const action of allActions) {
        if (action.requires_approval) {
          await this.createApprovalRequest(action);
        } else {
          await this.executeProactiveAction(action);
        }
      }
      
    } catch (error) {
      console.error('Proactive checks error:', error);
    }
  }

  // Check all business triggers
  async checkAllTriggers() {
    const actions = [];
    
    for (const [triggerName, trigger] of Object.entries(this.businessTriggers)) {
      const result = await this.evaluateTrigger(triggerName, trigger);
      if (result.triggered) {
        actions.push({
          type: 'trigger_based',
          trigger: triggerName,
          action: result.action,
          data: result.data,
          urgency: trigger.urgency,
          requires_approval: this.determineApprovalRequirement(trigger.action, result.data)
        });
      }
    }
    
    return actions;
  }

  // Evaluate specific trigger
  async evaluateTrigger(triggerName, trigger) {
    try {
      switch (triggerName) {
        case 'overdue_payments':
          return await this.checkOverduePayments(trigger);
          
        case 'pending_payments':
          return await this.checkPendingApprovals(trigger);
          
        case 'low_stock':
          return await this.checkLowStock(trigger);
          
        case 'pending_approvals':
          return await this.checkPendingApprovals(trigger);
          
        case 'inactive_customers':
          return await this.checkInactiveCustomers(trigger);
          
        default:
          return { triggered: false };
      }
    } catch (error) {
      console.error(`Trigger evaluation error for ${triggerName}:`, error);
      return { triggered: false, error: error.message };
    }
  }

  // Check overdue payments
  async checkOverduePayments(trigger) {
    const overduePayments = await this.getOverduePayments(30); // 30+ days overdue
    
    if (overduePayments.length > 0) {
      return {
        triggered: true,
        action: trigger.action,
        data: {
          customers: overduePayments,
          count: overduePayments.length,
          total_amount: overduePayments.reduce((sum, p) => sum + p.amount, 0)
        }
      };
    }
    
    return { triggered: false };
  }

  // Check low stock items
  async checkLowStock(trigger) {
    const lowStockItems = await InventoryOperations.getLowStock();
    
    if (lowStockItems.length > 0) {
      return {
        triggered: true,
        action: trigger.action,
        data: {
          items: lowStockItems,
          count: lowStockItems.length,
          critical_items: lowStockItems.filter(item => item.quantity < 5)
        }
      };
    }
    
    return { triggered: false };
  }

  // Check pending approvals
  async checkPendingApprovals(trigger) {
    const pendingApprovals = await ApprovalOperations.getPending();
    
    if (pendingApprovals.length > 5) {
      return {
        triggered: true,
        action: trigger.action,
        data: {
          approvals: pendingApprovals,
          count: pendingApprovals.length,
          types: this.groupApprovalsByType(pendingApprovals)
        }
      };
    }
    
    return { triggered: false };
  }

  // Generate AI-powered nudges
  async generateAINudges() {
    const nudges = [];
    
    try {
      // Get business context
      const businessContext = await this.getBusinessContext();
      
      // Check each nudge pattern
      for (const [nudgeType, nudgeConfig] of Object.entries(this.nudgePatterns)) {
        const shouldNudge = await this.evaluateNudgeCondition(nudgeType, nudgeConfig, businessContext);
        
        if (shouldNudge) {
          nudges.push({
            type: 'ai_nudge',
            nudge_type: nudgeType,
            message: nudgeConfig.nudge,
            confidence: shouldNudge.confidence,
            context: shouldNudge.context,
            requires_approval: nudgeType === 'batch_processing' // Batch approvals need confirmation
          });
        }
      }
      
    } catch (error) {
      console.error('AI nudge generation error:', error);
    }
    
    return nudges;
  }

  // Evaluate nudge condition
  async evaluateNudgeCondition(nudgeType, nudgeConfig, businessContext) {
    switch (nudgeType) {
      case 'inventory_optimization':
        const slowMovingItems = businessContext.inventory.filter(item => 
          item.days_since_sale > 30 && item.quantity > 0
        );
        return {
          should_nudge: slowMovingItems.length > 2,
          confidence: 0.8,
          context: { items: slowMovingItems }
        };
        
      case 'payment_optimization':
        const pendingPayments = businessContext.payments.filter(p => p.days_overdue > 0);
        return {
          should_nudge: pendingPayments.length > 3,
          confidence: 0.9,
          context: { payments: pendingPayments }
        };
        
      case 'batch_processing':
        const similarInvoices = businessContext.approvals.filter(a => a.type === 'invoice');
        return {
          should_nudge: similarInvoices.length > 2,
          confidence: 0.95,
          context: { invoices: similarInvoices }
        };
        
      default:
        return { should_nudge: false };
    }
  }

  // Check inactive customers
  async checkInactiveCustomers(trigger) {
    try {
      // Mock implementation for now
      const inactiveCustomers = [
        { id: 1, name: 'Priya', last_order_days: 30, phone: '+919876543212' },
        { id: 2, name: 'Vijay', last_order_days: 45, phone: '+919876543213' }
      ];
      
      if (inactiveCustomers.length > 0) {
        return {
          triggered: true,
          action: trigger.action,
          data: {
            customers: inactiveCustomers,
            count: inactiveCustomers.length
          }
        };
      }
      
      return { triggered: false };
    } catch (error) {
      console.error('Check inactive customers error:', error);
      return { triggered: false, error: error.message };
    }
  }

  // Check time-based actions
  async checkTimeBasedActions() {
    try {
      const actions = [];
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      
      // Morning actions (9 AM)
      if (hour === 9) {
        actions.push({
          type: 'morning_checkin',
          time: '09:00',
          actions: ['check_urgent_approvals', 'review_today_deliveries', 'check_low_stock_items']
        });
      }
      
      // Evening actions (6 PM)
      if (hour === 18) {
        actions.push({
          type: 'evening_wrapup',
          time: '18:00',
          actions: ['send_daily_summary', 'schedule_tomorrow_tasks', 'check_pending_payments']
        });
      }
      
      // Weekly actions (Monday morning)
      if (day === 1 && hour === 9) {
        actions.push({
          type: 'weekly_planning',
          time: 'Monday 09:00',
          actions: ['review_weekly_performance', 'identify_slow_moving_items', 'plan_weekly_followups']
        });
      }
      
      return actions;
    } catch (error) {
      console.error('Time-based actions error:', error);
      return [];
    }
  }
  // Get recent payments (for proactive intelligence)
  async getRecentPayments(days = 30) {
    try {
      // Mock implementation for now - in real implementation, this would query payment records
      const recentPayments = [
        { customer: 'Priya', amount: 1200, days_overdue: 5, phone: '+919876543212' },
        { customer: 'Vijay', amount: 3000, days_overdue: 12, phone: '+919876543213' },
        { customer: 'Amit', amount: 2500, days_overdue: 0, phone: '+919876543214' }
      ];
      
      return recentPayments.filter(payment => payment.days_overdue > 0);
    } catch (error) {
      console.error('Get recent payments error:', error);
      return [];
    }
  }

  // Get business context for AI decisions
  async getBusinessContext() {
    try {
      const [orders, inventory, approvals, payments] = await Promise.all([
        OrderOperations.getRecent(30),
        InventoryOperations.getAll(),
        ApprovalOperations.getPending(),
        this.getRecentPayments(30)
      ]);
      
      return {
        orders,
        inventory,
        approvals,
        payments,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Business context error:', error);
      return { orders: [], inventory: [], approvals: [], payments: [] };
    }
  }

  // Execute proactive action
  async executeProactiveAction(action) {
    try {
      console.log(`🎯 Executing proactive action: ${action.action}`);
      
      switch (action.action) {
        case 'send_payment_reminder':
          await this.executePaymentReminderAction(action.data);
          break;
          
        case 'suggest_reorder':
          await this.executeReorderSuggestion(action.data);
          break;
          
        case 'customer_re_engagement':
          await this.executeCustomerReEngagement(action.data);
          break;
          
        default:
          console.log(`Unknown proactive action: ${action.action}`);
      }
      
      // Log execution
      await AuditOperations.log('proactive_action_executed', {
        action: action.action,
        data: action.data,
        type: action.type,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Proactive action execution error:', error);
    }
  }

  // Execute customer re-engagement action
  async executeCustomerReEngagement(data) {
    for (const customer of data.customers) {
      const message = this.generateReEngagementMessage(customer);
      
      // Send via WhatsApp/Telegram
      await this.sendProactiveMessage(customer.phone, message, {
        type: 'customer_re_engagement',
        customer_id: customer.id,
        priority: 'medium'
      });
    }
  }

  // Execute payment reminder action
  async executePaymentReminderAction(data) {
    for (const customer of data.customers) {
      const message = this.generatePaymentReminderMessage(customer);
      
      // Send via WhatsApp/Telegram
      await this.sendProactiveMessage(customer.phone, message, {
        type: 'payment_reminder',
        customer_id: customer.id,
        urgent: customer.days_overdue > 21
      });
    }
  }

  // Generate re-engagement message (Indian context)
  generateReEngagementMessage(customer) {
    const templates = {
      30: '🌟 Namaste {name}! Hum aapko miss kiye. Kya aapka next order ready hai? Special discount available! 🎉',
      60: '💫 Hello {name}! Long time no order. New arrivals stock mein hain. Check kijiye!',
      90: '🎯 {name} ji! Aapke liye special offer hai. Next order pe extra discount milega.'
    };
    
    const daysInactive = customer.days_inactive || 30;
    const template = templates[daysInactive] || templates[30];
    
    return template
      .replace('{name}', customer.name || 'Customer')
      .replace('{days}', daysInactive);
  }

  // Generate payment reminder message (Indian context)
  generatePaymentReminderMessage(customer) {
    const templates = {
      7: '🙏 Namaste {name}, aapka ₹{amount} ka payment {days} din se pending hai. Kripya jald kar dijiye.',
      14: '⏰ Namaste {name}, aapka ₹{amount} ka payment {days} din se pending hai. Urgent hai jald kar dijiye.',
      21: '🚨 Namaste {name}, aapka ₹{amount} ka payment {days} din se pending hai. Please call us immediately.',
      30: '📞 Namaste {name}, aapka payment seriously overdue hai. Hum call kar rahe hain.'
    };
    
    const days = customer.days_overdue;
    const template = templates[days] || templates[14];
    
    return template
      .replace('{name}', customer.name)
      .replace('{amount}', customer.amount)
      .replace('{days}', days);
  }

  // Create approval request for proactive actions
  async createApprovalRequest(action) {
    const approval = {
      id: `PROACTIVE-${Date.now()}`,
      type: 'proactive_action',
      action: action.action,
      data: action.data,
      urgency: action.urgency,
      status: 'pending_approval',
      created_at: new Date().toISOString(),
      requires_approval: true,
      message: this.generateProactiveApprovalMessage(action)
    };
    
    await ApprovalOperations.create(approval);
    
    // Notify admin
    await this.notifyAdminForApproval(approval);
  }

  // Generate approval message for proactive actions
  generateProactiveApprovalMessage(action) {
    const messages = {
      send_payment_reminder: '📱 *PROACTIVE PAYMENT REMINDERS*\n\nAI detected {count} overdue payments.\n\nSend reminders to:\n{customers}',
      suggest_reorder: '📦 *PROACTIVE REORDER SUGGESTION*\n\nAI detected {count} low stock items.\n\nSuggested reorders:\n{items}',
      customer_re_engagement: '👤 *PROACTIVE CUSTOMER RE-ENGAGEMENT*\n\nAI identified {count} inactive customers.\n\nRe-engage with:\n{customers}'
    };
    
    return messages[action.action] || 'Proactive action requires approval';
  }

  // Prioritize actions based on urgency and business impact
  prioritizeActions(actions) {
    return actions.sort((a, b) => {
      // Priority order: critical > high > medium > low
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      
      const aPriority = priorityOrder[a.urgency] || 0;
      const bPriority = priorityOrder[b.urgency] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Same priority, prefer AI nudges (more intelligent)
      if (a.type === 'ai_nudge' && b.type !== 'ai_nudge') {
        return -1;
      }
      if (b.type === 'ai_nudge' && a.type !== 'ai_nudge') {
        return 1;
      }
      
      return 0;
    });
  }

  // Helper methods (would be implemented with actual database queries)
  async getOverduePayments(days) {
    // Mock implementation
    return [
      { id: 1, name: 'Rahul', amount: 2500, days_overdue: 35, phone: '+919876543210' },
      { id: 2, name: 'Amit', amount: 1800, days_overdue: 42, phone: '+919876543211' }
    ];
  }

  async getRecentPayments(days) {
    // Mock implementation
    return [
      { id: 1, customer: 'Priya', amount: 1200, days_overdue: 5, phone: '+919876543212' },
      { id: 2, customer: 'Vijay', amount: 3000, days_overdue: 12, phone: '+919876543213' }
    ];
  }

  async sendProactiveMessage(phone, message, metadata) {
    // This would integrate with WhatsApp/Telegram messaging
    console.log(`📤 Sending proactive message to ${phone}: ${message}`);
    console.log(`📊 Metadata:`, metadata);
  }

  async notifyAdminForApproval(approval) {
    // This would notify admin via WhatsApp/Telegram
    console.log(`🔔 Admin approval needed for: ${approval.id}`);
  }

  determineApprovalRequirement(action, data) {
    // Business rules for approval requirements
    const highValueActions = ['send_payment_reminder', 'emergency_reorder'];
    const bulkActions = data && data.count > 5;
    
    return highValueActions.includes(action) || bulkActions;
  }
}

module.exports = new ProactiveIntelligenceService();
