/**
 * Customer Analytics Service for Bharat Biz-Agent
 * Provides comprehensive customer insights, behavior analysis, and business metrics
 */

class AnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get comprehensive customer analytics
   */
  async getCustomerAnalytics(timeRange = '30d') {
    const cacheKey = `customer_analytics_${timeRange}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const { getDatabase } = require('./database');
      const db = getDatabase();
      
      // Calculate time range
      const now = new Date();
      const startDate = this.calculateStartDate(timeRange, now);
      
      // Fetch data from collections
      const [customers, conversations, orders, approvals, invoices] = await Promise.all([
        this.fetchCustomers(db, startDate),
        this.fetchConversations(db, startDate),
        this.fetchOrders(db, startDate),
        this.fetchApprovals(db, startDate),
        this.fetchInvoices(db, startDate)
      ]);

      // Process analytics
      const analytics = {
        overview: this.calculateOverview(customers, conversations, orders, timeRange),
        customerMetrics: this.calculateCustomerMetrics(customers, conversations, orders),
        engagementMetrics: this.calculateEngagementMetrics(conversations, customers),
        revenueMetrics: this.calculateRevenueMetrics(orders, invoices),
        behaviorAnalytics: this.calculateBehaviorAnalytics(conversations, orders, approvals),
        geographicData: this.calculateGeographicData(customers),
        timeBasedMetrics: this.calculateTimeBasedMetrics(conversations, orders, timeRange),
        topCustomers: this.identifyTopCustomers(customers, orders),
        conversionMetrics: this.calculateConversionMetrics(conversations, orders),
        customerSegments: this.segmentCustomers(customers, orders, conversations),
        trends: this.calculateTrends(conversations, orders, timeRange)
      };

      // Cache results
      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        data: analytics
      });

      return analytics;
      
    } catch (error) {
      console.error('Error generating customer analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate start date based on time range
   */
  calculateStartDate(timeRange, now) {
    const ranges = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    
    const days = ranges[timeRange] || 30;
    return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  }

  /**
   * Fetch customers data
   */
  async fetchCustomers(db, startDate) {
    try {
      const collection = db.collection('customers');
      return await collection.find({
        createdAt: { $gte: startDate }
      }).toArray();
    } catch (error) {
      console.warn('Failed to fetch customers:', error.message);
      return [];
    }
  }

  /**
   * Fetch conversations data
   */
  async fetchConversations(db, startDate) {
    try {
      const collection = db.collection('conversations');
      return await collection.find({
        createdAt: { $gte: startDate }
      }).toArray();
    } catch (error) {
      console.warn('Failed to fetch conversations:', error.message);
      return [];
    }
  }

  /**
   * Fetch orders data
   */
  async fetchOrders(db, startDate) {
    try {
      const collection = db.collection('orders');
      return await collection.find({
        createdAt: { $gte: startDate }
      }).toArray();
    } catch (error) {
      console.warn('Failed to fetch orders:', error.message);
      return [];
    }
  }

  /**
   * Fetch approvals data
   */
  async fetchApprovals(db, startDate) {
    try {
      const collection = db.collection('approvals');
      return await collection.find({
        createdAt: { $gte: startDate }
      }).toArray();
    } catch (error) {
      console.warn('Failed to fetch approvals:', error.message);
      return [];
    }
  }

  /**
   * Fetch invoices data
   */
  async fetchInvoices(db, startDate) {
    try {
      const collection = db.collection('invoices');
      return await collection.find({
        createdAt: { $gte: startDate }
      }).toArray();
    } catch (error) {
      console.warn('Failed to fetch invoices:', error.message);
      return [];
    }
  }

  /**
   * Calculate overview metrics
   */
  calculateOverview(customers, conversations, orders, timeRange) {
    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => 
      c.lastActiveAt && new Date(c.lastActiveAt) > this.calculateStartDate('7d', new Date())
    ).length;
    
    const totalConversations = conversations.length;
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    
    return {
      totalCustomers,
      activeCustomers,
      totalConversations,
      totalOrders,
      totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      customerGrowthRate: this.calculateGrowthRate(customers, timeRange),
      orderGrowthRate: this.calculateGrowthRate(orders, timeRange)
    };
  }

  /**
   * Calculate customer-specific metrics
   */
  calculateCustomerMetrics(customers, conversations, orders) {
    const customerStats = new Map();
    
    // Initialize customer stats
    customers.forEach(customer => {
      customerStats.set(customer.customerId || customer.id, {
        customerId: customer.customerId || customer.id,
        name: customer.name || 'Unknown',
        phone: customer.phone || 'Unknown',
        email: customer.email || 'Unknown',
        registeredAt: customer.createdAt,
        lastActiveAt: customer.lastActiveAt,
        totalConversations: 0,
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        conversationFrequency: 0,
        orderFrequency: 0
      });
    });
    
    // Add conversation data
    conversations.forEach(conv => {
      const customerId = conv.customerId;
      if (customerStats.has(customerId)) {
        const stats = customerStats.get(customerId);
        stats.totalConversations++;
        stats.lastActiveAt = conv.lastMessageAt || conv.createdAt;
      }
    });
    
    // Add order data
    orders.forEach(order => {
      const customerId = order.customerId;
      if (customerStats.has(customerId)) {
        const stats = customerStats.get(customerId);
        stats.totalOrders++;
        stats.totalSpent += order.totalAmount || 0;
        stats.averageOrderValue = stats.totalSpent / stats.totalOrders;
      }
    });
    
    // Calculate frequencies
    const now = new Date();
    customerStats.forEach(stats => {
      const daysSinceRegistration = stats.registeredAt ? 
        Math.max(1, (now - new Date(stats.registeredAt)) / (1000 * 60 * 60 * 24)) : 1;
      
      stats.conversationFrequency = stats.totalConversations / daysSinceRegistration;
      stats.orderFrequency = stats.totalOrders / daysSinceRegistration;
    });
    
    return Array.from(customerStats.values());
  }

  /**
   * Calculate engagement metrics
   */
  calculateEngagementMetrics(conversations, customers) {
    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, conv) => 
      sum + (conv.messages ? conv.messages.length : 0), 0);
    
    const averageMessagesPerConversation = totalConversations > 0 ? 
      totalMessages / totalConversations : 0;
    
    const engagedCustomers = conversations.reduce((set, conv) => {
      set.add(conv.customerId);
      return set;
    }, new Set()).size;
    
    const engagementRate = customers.length > 0 ? 
      (engagedCustomers / customers.length) * 100 : 0;
    
    // Calculate response times (mock data for now)
    const averageResponseTime = 15; // minutes
    
    return {
      totalConversations,
      totalMessages,
      averageMessagesPerConversation,
      engagedCustomers,
      engagementRate,
      averageResponseTime
    };
  }

  /**
   * Calculate revenue metrics
   */
  calculateRevenueMetrics(orders, invoices) {
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalOrders = orders.length;
    
    const revenueByStatus = orders.reduce((acc, order) => {
      const status = order.status || 'unknown';
      acc[status] = (acc[status] || 0) + (order.totalAmount || 0);
      return acc;
    }, {});
    
    const revenueByDay = this.groupRevenueByDay(orders);
    const revenueByMonth = this.groupRevenueByMonth(orders);
    
    return {
      totalRevenue,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      revenueByStatus,
      revenueByDay,
      revenueByMonth,
      pendingRevenue: revenueByStatus.pending || 0,
      completedRevenue: revenueByStatus.completed || 0
    };
  }

  /**
   * Calculate behavior analytics
   */
  calculateBehaviorAnalytics(conversations, orders, approvals) {
    // Peak activity hours
    const hourlyActivity = this.calculateHourlyActivity(conversations);
    
    // Common conversation patterns
    const conversationPatterns = this.analyzeConversationPatterns(conversations);
    
    // Approval patterns
    const approvalPatterns = this.analyzeApprovalPatterns(approvals);
    
    // Order patterns
    const orderPatterns = this.analyzeOrderPatterns(orders);
    
    return {
      hourlyActivity,
      conversationPatterns,
      approvalPatterns,
      orderPatterns,
      peakHours: hourlyActivity.sort((a, b) => b.count - a.count).slice(0, 3),
      averageSessionDuration: this.calculateAverageSessionDuration(conversations)
    };
  }

  /**
   * Calculate geographic data
   */
  calculateGeographicData(customers) {
    const locationData = customers.reduce((acc, customer) => {
      // Extract location from phone number (simplified)
      const phone = customer.phone || '';
      let location = 'Unknown';
      
      if (phone.startsWith('+91')) {
        location = 'India';
      } else if (phone.startsWith('+1')) {
        location = 'United States';
      } else if (phone.startsWith('+44')) {
        location = 'United Kingdom';
      }
      
      acc[location] = (acc[location] || 0) + 1;
      return acc;
    }, {});
    
    return {
      locationDistribution: locationData,
      topLocations: Object.entries(locationData)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([location, count]) => ({ location, count }))
    };
  }

  /**
   * Calculate time-based metrics
   */
  calculateTimeBasedMetrics(conversations, orders, timeRange) {
    const dailyMetrics = this.calculateDailyMetrics(conversations, orders, timeRange);
    const weeklyMetrics = this.calculateWeeklyMetrics(conversations, orders, timeRange);
    
    return {
      dailyMetrics,
      weeklyMetrics,
      growthTrends: this.calculateGrowthTrends(conversations, orders, timeRange)
    };
  }

  /**
   * Identify top customers
   */
  identifyTopCustomers(customers, orders) {
    const customerRevenue = new Map();
    
    orders.forEach(order => {
      const customerId = order.customerId;
      const revenue = customerRevenue.get(customerId) || 0;
      customerRevenue.set(customerId, revenue + (order.totalAmount || 0));
    });
    
    return Array.from(customerRevenue.entries())
      .map(([customerId, revenue]) => {
        const customer = customers.find(c => (c.customerId || c.id) === customerId);
        return {
          customerId,
          name: customer?.name || 'Unknown',
          revenue,
          orders: orders.filter(o => o.customerId === customerId).length
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  /**
   * Calculate conversion metrics
   */
  calculateConversionMetrics(conversations, orders) {
    const totalConversations = conversations.length;
    const totalOrders = orders.length;
    
    // Simple conversion: conversation to order
    const conversionRate = totalConversations > 0 ? (totalOrders / totalConversations) * 100 : 0;
    
    // Calculate conversion by platform
    const conversionByPlatform = this.calculateConversionByPlatform(conversations, orders);
    
    return {
      totalConversations,
      totalOrders,
      conversionRate,
      conversionByPlatform,
      conversionFunnel: {
        conversations: totalConversations,
        orders: totalOrders,
        conversionRate
      }
    };
  }

  /**
   * Segment customers
   */
  segmentCustomers(customers, orders, conversations) {
    const segments = {
      new: [],
      active: [],
      at_risk: [],
      vip: [],
      inactive: []
    };
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    customers.forEach(customer => {
      const customerOrders = orders.filter(o => o.customerId === (customer.customerId || customer.id));
      const customerConversations = conversations.filter(c => c.customerId === (customer.customerId || customer.id));
      const totalSpent = customerOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
      const lastActivity = customer.lastActiveAt || customer.createdAt;
      
      // VIP: High value customers
      if (totalSpent > 10000 || customerOrders.length > 10) {
        segments.vip.push({
          ...customer,
          totalOrders: customerOrders.length,
          totalSpent,
          lastActivity
        });
      }
      // Active: Recent activity
      else if (lastActivity && new Date(lastActivity) > thirtyDaysAgo) {
        segments.active.push({
          ...customer,
          totalOrders: customerOrders.length,
          totalSpent,
          lastActivity
        });
      }
      // New: Recently registered
      else if (customer.createdAt && new Date(customer.createdAt) > thirtyDaysAgo) {
        segments.new.push({
          ...customer,
          totalOrders: customerOrders.length,
          totalSpent,
          lastActivity
        });
      }
      // At risk: No recent activity but was previously active
      else if (lastActivity && new Date(lastActivity) > ninetyDaysAgo) {
        segments.at_risk.push({
          ...customer,
          totalOrders: customerOrders.length,
          totalSpent,
          lastActivity
        });
      }
      // Inactive: No recent activity
      else {
        segments.inactive.push({
          ...customer,
          totalOrders: customerOrders.length,
          totalSpent,
          lastActivity
        });
      }
    });
    
    return segments;
  }

  /**
   * Calculate trends
   */
  calculateTrends(conversations, orders, timeRange) {
    const trends = {
      conversations: this.calculateTrendData(conversations, timeRange),
      orders: this.calculateTrendData(orders, timeRange),
      revenue: this.calculateRevenueTrend(orders, timeRange)
    };
    
    return trends;
  }

  /**
   * Helper methods
   */
  calculateGrowthRate(data, timeRange) {
    // Simplified growth calculation
    const midPoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, midPoint);
    const secondHalf = data.slice(midPoint);
    
    if (firstHalf.length === 0) return 0;
    
    return ((secondHalf.length - firstHalf.length) / firstHalf.length) * 100;
  }

  groupRevenueByDay(orders) {
    return orders.reduce((acc, order) => {
      const date = new Date(order.createdAt).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + (order.totalAmount || 0);
      return acc;
    }, {});
  }

  groupRevenueByMonth(orders) {
    return orders.reduce((acc, order) => {
      const date = new Date(order.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      acc[monthKey] = (acc[monthKey] || 0) + (order.totalAmount || 0);
      return acc;
    }, {});
  }

  calculateHourlyActivity(conversations) {
    const hourlyData = Array(24).fill(0).map((_, hour) => ({ hour, count: 0 }));
    
    conversations.forEach(conv => {
      const hour = new Date(conv.createdAt).getHours();
      hourlyData[hour].count++;
    });
    
    return hourlyData;
  }

  analyzeConversationPatterns(conversations) {
    // Simplified pattern analysis
    const patterns = {
      shortConversations: conversations.filter(c => c.messages && c.messages.length <= 3).length,
      longConversations: conversations.filter(c => c.messages && c.messages.length > 10).length,
      averageLength: conversations.reduce((sum, c) => sum + (c.messages ? c.messages.length : 0), 0) / conversations.length
    };
    
    return patterns;
  }

  analyzeApprovalPatterns(approvals) {
    const patterns = {
      totalApprovals: approvals.length,
      approvedRate: approvals.length > 0 ? 
        (approvals.filter(a => a.status === 'approved').length / approvals.length) * 100 : 0,
      rejectionRate: approvals.length > 0 ? 
        (approvals.filter(a => a.status === 'rejected').length / approvals.length) * 100 : 0
    };
    
    return patterns;
  }

  analyzeOrderPatterns(orders) {
    const patterns = {
      averageOrderValue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0) / orders.length,
      mostCommonStatus: this.getMostCommonStatus(orders),
      orderFrequency: orders.length / 30 // orders per day
    };
    
    return patterns;
  }

  getMostCommonStatus(orders) {
    const statusCounts = orders.reduce((acc, order) => {
      const status = order.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(statusCounts).sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
  }

  calculateAverageSessionDuration(conversations) {
    // Simplified calculation
    return 25; // minutes
  }

  calculateDailyMetrics(conversations, orders, timeRange) {
    // Implementation for daily metrics
    return {};
  }

  calculateWeeklyMetrics(conversations, orders, timeRange) {
    // Implementation for weekly metrics
    return {};
  }

  calculateGrowthTrends(conversations, orders, timeRange) {
    // Implementation for growth trends
    return {};
  }

  calculateConversionByPlatform(conversations, orders) {
    // Implementation for platform-specific conversion
    return {};
  }

  calculateTrendData(data, timeRange) {
    // Implementation for trend data
    return [];
  }

  calculateRevenueTrend(orders, timeRange) {
    // Implementation for revenue trend
    return [];
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

module.exports = analyticsService;
