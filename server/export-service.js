/**
 * Data Export & Reporting Service for Bharat Biz-Agent
 * Provides comprehensive data export, reporting, and analytics capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ExportService {
  constructor() {
    this.exportDir = './exports';
    this.supportedFormats = ['json', 'csv', 'xlsx', 'pdf'];
    this.initializeExportDirectory();
  }

  /**
   * Initialize export directory
   */
  async initializeExportDirectory() {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
      console.log('📁 Export directory initialized');
    } catch (error) {
      console.error('Failed to create export directory:', error);
    }
  }

  /**
   * Export data in specified format
   */
  async exportData(collection, format = 'json', filters = {}, options = {}) {
    try {
      const { getDatabase } = require('./database');
      const db = getDatabase();
      
      if (!db) {
        throw new Error('Database not available');
      }

      // Fetch data from collection
      const collectionData = await this.fetchCollectionData(db, collection, filters);
      
      // Process data based on format
      let exportData;
      let filename;
      let mimeType;

      switch (format) {
        case 'json':
          exportData = await this.exportToJSON(collectionData, collection);
          filename = `${collection}_export_${Date.now()}.json`;
          mimeType = 'application/json';
          break;
          
        case 'csv':
          exportData = await this.exportToCSV(collectionData, collection);
          filename = `${collection}_export_${Date.now()}.csv`;
          mimeType = 'text/csv';
          break;
          
        case 'xlsx':
          exportData = await this.exportToXLSX(collectionData, collection);
          filename = `${collection}_export_${Date.now()}.xlsx`;
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
          
        case 'pdf':
          exportData = await this.exportToPDF(collectionData, collection, options);
          filename = `${collection}_export_${Date.now()}.pdf`;
          mimeType = 'application/pdf';
          break;
          
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Save export file
      const filePath = path.join(this.exportDir, filename);
      await fs.writeFile(filePath, exportData);

      return {
        success: true,
        filename,
        filePath,
        mimeType,
        size: Buffer.byteLength(exportData),
        recordCount: collectionData.length,
        format,
        collection,
        exportedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  /**
   * Fetch collection data with filters
   */
  async fetchCollectionData(db, collection, filters) {
    try {
      const collectionRef = db.collection(collection);
      let query = {};

      // Apply filters
      if (filters.dateRange) {
        const now = new Date();
        const startDate = new Date(now.getTime() - (filters.dateRange * 24 * 60 * 60 * 1000));
        query.createdAt = { $gte: startDate };
      }

      if (filters.status && filters.status.length > 0) {
        query.status = { $in: filters.status };
      }

      if (filters.platform && filters.platform.length > 0) {
        query.platform = { $in: filters.platform };
      }

      if (filters.amountRange) {
        query.totalAmount = {
          $gte: filters.amountRange.min,
          $lte: filters.amountRange.max
        };
      }

      const documents = await collectionRef.find(query).toArray();
      
      // Process documents for export
      return documents.map(doc => this.processDocumentForExport(doc, collection));

    } catch (error) {
      console.error(`Error fetching ${collection} data:`, error);
      throw error;
    }
  }

  /**
   * Process document for export
   */
  processDocumentForExport(doc, collection) {
    // Remove sensitive fields and format for export
    const processed = { ...doc };

    // Remove MongoDB internal fields
    delete processed._id;

    // Format dates
    Object.keys(processed).forEach(key => {
      if (processed[key] instanceof Date) {
        processed[key] = processed[key].toISOString();
      }
    });

    // Collection-specific processing
    switch (collection) {
      case 'customers':
        processed.customerId = processed.customerId || processed._id;
        break;
      case 'orders':
        processed.orderId = processed.orderId || processed._id;
        processed.totalAmount = processed.totalAmount || 0;
        break;
      case 'invoices':
        processed.invoiceId = processed.invoiceId || processed._id;
        processed.totalAmount = processed.totalAmount || 0;
        break;
      case 'conversations':
        processed.conversationId = processed.conversationId || processed._id;
        processed.messageCount = processed.messages ? processed.messages.length : 0;
        break;
    }

    return processed;
  }

  /**
   * Export to JSON format
   */
  async exportToJSON(data, collection) {
    const exportData = {
      metadata: {
        collection,
        exportedAt: new Date().toISOString(),
        recordCount: data.length,
        format: 'json'
      },
      data
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export to CSV format
   */
  async exportToCSV(data, collection) {
    if (data.length === 0) {
      return 'No data available';
    }

    // Get headers from first document
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csv += values.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Export to XLSX format
   */
  async exportToXLSX(data, collection) {
    try {
      // For now, return CSV as fallback (would need xlsx library for true XLSX)
      const csvData = await this.exportToCSV(data, collection);
      return csvData;
    } catch (error) {
      console.error('XLSX export error:', error);
      throw error;
    }
  }

  /**
   * Export to PDF format
   */
  async exportToPDF(data, collection, options = {}) {
    try {
      // For now, return JSON as fallback (would need PDF library for true PDF)
      const jsonData = await this.exportToJSON(data, collection);
      return jsonData;
    } catch (error) {
      console.error('PDF export error:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(reportType, timeRange = '30d', format = 'json') {
    try {
      const { analyticsService } = require('./analytics-service');
      const analytics = await analyticsService.getCustomerAnalytics(timeRange);

      let reportData;

      switch (reportType) {
        case 'customer-analytics':
          reportData = this.generateCustomerAnalyticsReport(analytics);
          break;
        case 'business-summary':
          reportData = this.generateBusinessSummaryReport(analytics);
          break;
        case 'revenue-report':
          reportData = this.generateRevenueReport(analytics);
          break;
        case 'engagement-report':
          reportData = this.generateEngagementReport(analytics);
          break;
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }

      // Format report
      let exportData;
      let filename;
      let mimeType;

      switch (format) {
        case 'json':
          exportData = JSON.stringify(reportData, null, 2);
          filename = `${reportType}_report_${Date.now()}.json`;
          mimeType = 'application/json';
          break;
        case 'pdf':
          exportData = await this.generatePDFReport(reportData, reportType);
          filename = `${reportType}_report_${Date.now()}.pdf`;
          mimeType = 'application/pdf';
          break;
        default:
          throw new Error(`Unsupported report format: ${format}`);
      }

      // Save report file
      const filePath = path.join(this.exportDir, filename);
      await fs.writeFile(filePath, exportData);

      return {
        success: true,
        filename,
        filePath,
        mimeType,
        size: Buffer.byteLength(exportData),
        format,
        reportType,
        timeRange,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Report generation error:', error);
      throw error;
    }
  }

  /**
   * Generate customer analytics report
   */
  generateCustomerAnalyticsReport(analytics) {
    return {
      title: 'Customer Analytics Report',
      generatedAt: new Date().toISOString(),
      overview: analytics.overview,
      customerMetrics: analytics.customerMetrics,
      customerSegments: analytics.customerSegments,
      topCustomers: analytics.topCustomers,
      geographicData: analytics.geographicData,
      conversionMetrics: analytics.conversionMetrics,
      trends: analytics.trends
    };
  }

  /**
   * Generate business summary report
   */
  generateBusinessSummaryReport(analytics) {
    return {
      title: 'Business Summary Report',
      generatedAt: new Date().toISOString(),
      keyMetrics: {
        totalCustomers: analytics.overview.totalCustomers,
        activeCustomers: analytics.overview.activeCustomers,
        totalRevenue: analytics.overview.totalRevenue,
        totalOrders: analytics.overview.totalOrders,
        averageOrderValue: analytics.overview.averageOrderValue,
        customerGrowthRate: analytics.overview.customerGrowthRate,
        orderGrowthRate: analytics.overview.orderGrowthRate
      },
      engagement: analytics.engagementMetrics,
      revenue: analytics.revenueMetrics,
      conversion: analytics.conversionMetrics
    };
  }

  /**
   * Generate revenue report
   */
  generateRevenueReport(analytics) {
    return {
      title: 'Revenue Report',
      generatedAt: new Date().toISOString(),
      totalRevenue: analytics.revenueMetrics.totalRevenue,
      revenueByStatus: analytics.revenueMetrics.revenueByStatus,
      revenueByDay: analytics.revenueMetrics.revenueByDay,
      revenueByMonth: analytics.revenueMetrics.revenueByMonth,
      averageOrderValue: analytics.revenueMetrics.averageOrderValue,
      topCustomers: analytics.topCustomers,
      revenueTrends: analytics.trends.revenue
    };
  }

  /**
   * Generate engagement report
   */
  generateEngagementReport(analytics) {
    return {
      title: 'Customer Engagement Report',
      generatedAt: new Date().toISOString(),
      totalConversations: analytics.engagementMetrics.totalConversations,
      totalMessages: analytics.engagementMetrics.totalMessages,
      averageMessagesPerConversation: analytics.engagementMetrics.averageMessagesPerConversation,
      engagedCustomers: analytics.engagementMetrics.engagedCustomers,
      engagementRate: analytics.engagementMetrics.engagementRate,
      behaviorAnalytics: analytics.behaviorAnalytics,
      hourlyActivity: analytics.behaviorAnalytics.hourlyActivity,
      peakHours: analytics.behaviorAnalytics.peakHours
    };
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(reportData, reportType) {
    // For now, return JSON as fallback (would need PDF library)
    return JSON.stringify(reportData, null, 2);
  }

  /**
   * Get list of available exports
   */
  async getExports() {
    try {
      const files = await fs.readdir(this.exportDir);
      const exports = [];

      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = await fs.stat(filePath);
        
        exports.push({
          filename: file,
          filePath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        });
      }

      return exports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    } catch (error) {
      console.error('Error getting exports:', error);
      return [];
    }
  }

  /**
   * Delete export file
   */
  async deleteExport(filename) {
    try {
      const filePath = path.join(this.exportDir, filename);
      await fs.unlink(filePath);
      
      return {
        success: true,
        message: `Export ${filename} deleted successfully`
      };
    } catch (error) {
      console.error('Error deleting export:', error);
      throw error;
    }
  }

  /**
   * Get export statistics
   */
  getExportStats() {
    return {
      supportedFormats: this.supportedFormats,
      availableReports: [
        'customer-analytics',
        'business-summary', 
        'revenue-report',
        'engagement-report'
      ],
      availableCollections: [
        'customers',
        'conversations',
        'orders',
        'invoices',
        'approvals',
        'inventory',
        'users'
      ]
    };
  }

  /**
   * Clean up old exports
   */
  async cleanupOldExports(daysOld = 30) {
    try {
      const files = await fs.readdir(this.exportDir);
      const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.birthtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return {
        success: true,
        deletedCount,
        message: `Cleaned up ${deletedCount} old exports`
      };
    } catch (error) {
      console.error('Error cleaning up exports:', error);
      throw error;
    }
  }
}

// Create singleton instance
const exportService = new ExportService();

module.exports = exportService;
