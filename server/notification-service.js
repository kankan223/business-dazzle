/**
 * Real-time Notifications Service for Bharat Biz-Agent
 * Handles system notifications, alerts, and user notifications
 */

class NotificationService {
  constructor() {
    this.notifications = [];
    this.userPreferences = new Map();
    this.notificationTypes = {
      INFO: 'info',
      SUCCESS: 'success',
      WARNING: 'warning',
      ERROR: 'error',
      APPROVAL: 'approval',
      ORDER: 'order',
      INVOICE: 'invoice',
      SYSTEM: 'system'
    };
  }

  /**
   * Create a new notification
   */
  createNotification(type, title, message, data = {}, priority = 'normal') {
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      data,
      priority,
      timestamp: new Date(),
      read: false,
      userId: data.userId || 'system',
      category: this.getCategoryFromType(type)
    };

    this.notifications.unshift(notification);
    
    // Keep only last 100 notifications in memory
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }

    // Broadcast to connected clients
    this.broadcastNotification(notification);

    console.log(`🔔 Notification created: [${type.toUpperCase()}] ${title}`);
    
    return notification;
  }

  /**
   * Get category from notification type
   */
  getCategoryFromType(type) {
    const categories = {
      info: 'general',
      success: 'success',
      warning: 'warning',
      error: 'error',
      approval: 'business',
      order: 'business',
      invoice: 'business',
      system: 'system'
    };
    return categories[type] || 'general';
  }

  /**
   * Broadcast notification to all connected clients
   */
  broadcastNotification(notification) {
    // This will be called from the main server with socket.io
    // The function is available in the global scope when required
    try {
      if (typeof global.broadcastToAdmins === 'function') {
        global.broadcastToAdmins('notification.new', notification);
      } else {
        console.warn('⚠️ broadcastToAdmins function not available');
      }
    } catch (error) {
      console.error('❌ Error broadcasting notification:', error);
    }
  }

  /**
   * Get notifications for a specific user
   */
  getUserNotifications(userId, limit = 50) {
    return this.notifications
      .filter(n => n.userId === userId || n.userId === 'system')
      .slice(0, limit);
  }

  /**
   * Get unread notifications count
   */
  getUnreadCount(userId) {
    return this.notifications
      .filter(n => (n.userId === userId || n.userId === 'system') && !n.read)
      .length;
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId, userId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification && (notification.userId === userId || notification.userId === 'system')) {
      notification.read = true;
      return true;
    }
    return false;
  }

  /**
   * Mark all notifications as read for a user
   */
  markAllAsRead(userId) {
    let markedCount = 0;
    this.notifications.forEach(notification => {
      if ((notification.userId === userId || notification.userId === 'system') && !notification.read) {
        notification.read = true;
        markedCount++;
      }
    });
    return markedCount;
  }

  /**
   * Delete notification
   */
  deleteNotification(notificationId, userId) {
    const index = this.notifications.findIndex(n => 
      n.id === notificationId && (n.userId === userId || n.userId === 'system')
    );
    if (index !== -1) {
      this.notifications.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear old notifications (older than 7 days)
   */
  clearOldNotifications() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const beforeCount = this.notifications.length;
    
    this.notifications = this.notifications.filter(n => n.timestamp > sevenDaysAgo);
    
    const clearedCount = beforeCount - this.notifications.length;
    if (clearedCount > 0) {
      console.log(`🧹 Cleared ${clearedCount} old notifications`);
    }
    
    return clearedCount;
  }

  /**
   * Get notification statistics
   */
  getStatistics() {
    const stats = {
      total: this.notifications.length,
      unread: this.notifications.filter(n => !n.read).length,
      byType: {},
      byPriority: {},
      recent: this.notifications.filter(n => 
        new Date() - n.timestamp < 24 * 60 * 60 * 1000
      ).length
    };

    // Count by type
    Object.values(this.notificationTypes).forEach(type => {
      stats.byType[type] = this.notifications.filter(n => n.type === type).length;
    });

    // Count by priority
    ['low', 'normal', 'high', 'critical'].forEach(priority => {
      stats.byPriority[priority] = this.notifications.filter(n => n.priority === priority).length;
    });

    return stats;
  }

  /**
   * Create business-specific notifications
   */
  createBusinessNotification(event, data) {
    const { type, title, message } = this.getBusinessNotificationDetails(event, data);
    return this.createNotification(type, title, message, data, 'normal');
  }

  /**
   * Get notification details for business events
   */
  getBusinessNotificationDetails(event, data) {
    const notifications = {
      'order.created': {
        type: this.notificationTypes.ORDER,
        title: '📦 New Order Created',
        message: `Order ${data.orderId || data.id} created for ${data.customerName || 'Customer'}`
      },
      'order.approved': {
        type: this.notificationTypes.SUCCESS,
        title: '✅ Order Approved',
        message: `Order ${data.orderId || data.id} has been approved`
      },
      'approval.pending': {
        type: this.notificationTypes.APPROVAL,
        title: '⏳ Approval Required',
        message: `New approval request: ${data.requestType || 'Unknown'}`
      },
      'invoice.generated': {
        type: this.notificationTypes.INVOICE,
        title: '🧾 Invoice Generated',
        message: `Invoice ${data.invoiceId} generated for ₹${data.amount}`
      },
      'system.error': {
        type: this.notificationTypes.ERROR,
        title: '❌ System Error',
        message: data.error || 'An unexpected error occurred'
      },
      'system.warning': {
        type: this.notificationTypes.WARNING,
        title: '⚠️ System Warning',
        message: data.warning || 'System warning'
      }
    };

    return notifications[event] || {
      type: this.notificationTypes.INFO,
      title: '📢 System Update',
      message: 'System update occurred'
    };
  }
}

// Create singleton instance
const notificationService = new NotificationService();

// Auto-cleanup old notifications every hour
setInterval(() => {
  notificationService.clearOldNotifications();
}, 60 * 60 * 1000);

module.exports = notificationService;
