/**
 * Enhanced Invoice Service for Bharat Biz-Agent
 * PDF generation with proper business details
 */

const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');

class InvoiceService {
  constructor() {
    this.invoiceDir = './invoices';
    this.ensureInvoiceDirectory();
  }

  async ensureInvoiceDirectory() {
    try {
      await fs.mkdir(this.invoiceDir, { recursive: true });
    } catch (error) {
      console.error('Error creating invoice directory:', error);
    }
  }

  /**
   * Generate invoice PDF for an order
   */
  async generateInvoice(orderId, format = 'pdf') {
    try {
      // Get order details from database
      const OrderOperations = require('./database').OrderOperations;
      const order = await OrderOperations.getById(orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      // Get customer details
      const CustomerOperations = require('./database').CustomerOperations;
      const customer = await CustomerOperations.getById(order.customerId);
      
      // Generate unique invoice ID
      const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      // Calculate totals
      const subtotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
      const tax = subtotal * 0.18; // 18% GST
      const total = subtotal + tax;
      
      // Create invoice data
      const invoiceData = {
        invoiceId,
        orderId: order.orderId,
        customer: {
          name: customer?.name || 'Customer',
          phone: customer?.phone || 'N/A',
          email: customer?.email || 'N/A',
          address: customer?.address || 'N/A'
        },
        date: {
          issued: new Date().toISOString().split('T')[0],
          due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days
        },
        items: order.items || [{
          name: 'Sample Product',
          description: 'Product description',
          quantity: 1,
          unit: 'kg',
          price: 0,
          total: 0
        }],
        totals: {
          subtotal,
          tax,
          total,
          currency: 'INR'
        },
        payment: {
          method: 'COD',
          status: 'pending'
        },
        business: {
          name: 'Bharat Biz-Agent',
          address: '123 Business Street, Mumbai, Maharashtra 400001',
          phone: '+91-9876543210',
          email: 'support@bharatbiz.com',
          taxId: 'GSTIN123456789',
          bank: {
            name: 'State Bank of India',
            account: '123456789012345',
            ifsc: 'SBIN0001234'
          }
        },
        notes: order.notes || 'Thank you for your business!'
      };
      
      if (format === 'pdf') {
        return await this.generatePDFInvoice(invoiceData);
      } else {
        return {
          success: true,
          data: invoiceData,
          format: 'json'
        };
      }
      
    } catch (error) {
      console.error('Invoice generation error:', error);
      throw error;
    }
  }

  /**
   * Generate PDF invoice
   */
  async generatePDFInvoice(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF document
        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, right: 50, bottom: 50, left: 50 } });
        
        // Collect PDF data
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', async () => {
          try {
            const pdfData = Buffer.concat(buffers);
            
            // Save PDF
            const filename = `invoice_${invoiceData.invoiceId}.pdf`;
            const filepath = path.join(this.invoiceDir, filename);
            
            await fs.writeFile(filepath, pdfData);
            
            resolve({
              success: true,
              filename,
              filepath,
              invoiceId: invoiceData.invoiceId
            });
          } catch (error) {
            reject(error);
          }
        });
        
        // Add company header
        doc.fontSize(20).fillColor('#333333').text('Bharat Biz-Agent', { align: 'center' }).moveDown(10);
        
        // Add invoice details
        doc.fontSize(12).fillColor('#666666').text(`Invoice #: ${invoiceData.invoiceId}`, { align: 'right' }).moveDown(5);
        doc.fontSize(10).fillColor('#999999').text(`Date: ${new Date(invoiceData.date.issued).toLocaleDateString()}`, { align: 'right' }).moveDown(10);
        
        // Add customer details
        doc.fontSize(14).fillColor('#333333').text('Bill To:', { continued: true }).moveDown(5);
        doc.fontSize(12).fillColor('#000000').text(invoiceData.customer.name, { continued: false }).moveDown(5);
        doc.fontSize(10).fillColor('#666666').text(invoiceData.customer.phone || '', { continued: true }).moveDown(5);
        doc.fontSize(10).fillColor('#666666').text(invoiceData.customer.email || '', { continued: true }).moveDown(20);
        
        // Add billing address
        doc.fontSize(10).fillColor('#666666').text(invoiceData.customer.address || '', { continued: true }).moveDown(5);
        
        // Add items table
        doc.moveDown(20);
        this.addItemsTable(doc, invoiceData.items);
        
        // Add totals
        doc.moveDown(20);
        this.addTotalsSection(doc, invoiceData.totals);
        
        // Add payment and business details
        doc.moveDown(20);
        this.addPaymentSection(doc, invoiceData.payment);
        this.addBusinessDetails(doc, invoiceData.business);
        
        // Add notes
        if (invoiceData.notes) {
          doc.moveDown(20);
          doc.fontSize(10).fillColor('#666666').text('Notes:', { continued: true }).moveDown(5);
          doc.fontSize(10).fillColor('#000000').text(invoiceData.notes, { continued: false }).moveDown(20);
        }
        
        // Add footer
        doc.fontSize(8).fillColor('#999999').text('Thank you for your business!', { align: 'center' }).moveDown(30);
        
        // Finalize PDF
        doc.end();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add items table to PDF
   */
  addItemsTable(doc, items) {
    const tableTop = doc.y;
    
    // Table headers
    const headers = ['Description', 'Quantity', 'Unit', 'Price', 'Total'];
    const headerWidths = [200, 60, 60, 80, 80];
    
    // Draw headers
    let xPos = 50;
    headers.forEach((header, i) => {
      doc.fontSize(10).fillColor('#333333').text(header, { width: headerWidths[i], align: 'left' });
      xPos += headerWidths[i] + 20;
    });
    
    doc.moveTo(50, tableTop);
    doc.lineWidth(1).strokeColor('#666666');
    
    // Draw header line
    doc.lineTo(xPos - 20, tableTop);
    doc.moveTo(xPos, tableTop);
    
    // Draw items
    items.forEach((item, index) => {
      const y = tableTop + 15 + (index * 20);
      
      // Item row
      doc.fontSize(9).fillColor('#000000').text(item.name || 'Item', { width: 200, align: 'left' });
      doc.text(item.quantity.toString(), { width: 60, align: 'center' });
      doc.text(item.unit || 'kg', { width: 60, align: 'center' });
      doc.text(`₹${item.price}`, { width: 80, align: 'right' });
      doc.text(`₹${(item.price * item.quantity)}`, { width: 80, align: 'right' });
      
      // Draw row line
      const rowBottom = y + 15;
      doc.moveTo(50, rowBottom);
      doc.lineTo(xPos - 20, rowBottom);
      doc.moveTo(xPos, rowBottom);
    });
    
    doc.moveTo(50, tableTop + 15 + (items.length * 20));
  }

  /**
   * Add totals section to PDF
   */
  addTotalsSection(doc, totals) {
    const totalsY = doc.y + 20;
    
    // Draw totals line
    doc.moveTo(50, totalsY);
    doc.lineTo(540, totalsY);
    doc.moveTo(50, totalsY);
    
    // Totals text
    doc.fontSize(12).fillColor('#333333').text('Subtotal:', { width: 400, align: 'right' });
    doc.text(`₹${totals.subtotal.toFixed(2)}`, { width: 100, align: 'right' }).moveDown(10);
    
    doc.fontSize(12).fillColor('#333333').text('Tax (18% GST):', { width: 400, align: 'right' });
    doc.text(`₹${totals.tax.toFixed(2)}`, { width: 100, align: 'right' }).moveDown(10);
    
    doc.fontSize(14).fillColor('#000000').text('Total:', { width: 400, align: 'right' });
    doc.text(`₹${totals.total.toFixed(2)}`, { width: 100, align: 'right' }).moveDown(20);
  }

  /**
   * Add payment section to PDF
   */
  addPaymentSection(doc, payment) {
    const paymentY = doc.y + 20;
    
    doc.fontSize(12).fillColor('#333333').text('Payment Method:', { width: 400, align: 'left' }).moveDown(10);
    doc.fontSize(12).fillColor('#000000').text(payment.method.toUpperCase(), { width: 200, align: 'left' }).moveDown(10);
    doc.fontSize(12).fillColor('#000000').text(`Status: ${payment.status.toUpperCase()}`, { width: 200, align: 'left' }).moveDown(20);
  }

  /**
   * Add business details to PDF
   */
  addBusinessDetails(doc, business) {
    const businessY = doc.y + 20;
    
    doc.fontSize(10).fillColor('#666666').text('From:', { width: 400, align: 'left' }).moveDown(10);
    doc.fontSize(12).fillColor('#000000').text(business.name, { width: 400, align: 'left' }).moveDown(5);
    doc.fontSize(10).fillColor('#666666').text(business.address, { width: 400, align: 'left' }).moveDown(5);
    doc.fontSize(10).fillColor('#666666').text(`Phone: ${business.phone}`, { width: 400, align: 'left' }).moveDown(5);
    doc.fontSize(10).fillColor('#666666').text(`Email: ${business.email}`, { width: 400, align: 'left' }).moveDown(5);
    doc.fontSize(10).fillColor('#666666').text(`GSTIN: ${business.taxId}`, { width: 400, align: 'left' }).moveDown(10);
    doc.fontSize(10).fillColor('#666666').text(`Bank: ${business.bank.name}`, { width: 400, align: 'left' }).moveDown(5);
    doc.fontSize(10).fillColor('#666666').text(`Account: ${business.bank.account}`, { width: 400, align: 'left' }).moveDown(5);
    doc.fontSize(10).fillColor('#666666').text(`IFSC: ${business.bank.ifsc}`, { width: 400, align: 'left' }).moveDown(20);
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId) {
    try {
      const filename = `invoice_${invoiceId}.pdf`;
      const filepath = path.join(this.invoiceDir, filename);
      
      if (await fs.access(filepath).catch(() => false)) {
        const fileBuffer = await fs.readFile(filepath);
        return {
          success: true,
          filename,
          fileBuffer,
          contentType: 'application/pdf'
        };
      } else {
        return {
          success: false,
          error: 'Invoice not found'
        };
      }
    } catch (error) {
      console.error('Error getting invoice:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete invoice
   */
  async deleteInvoice(invoiceId) {
    try {
      const filename = `invoice_${invoiceId}.pdf`;
      const filepath = path.join(this.invoiceDir, filename);
      
      await fs.unlink(filepath);
      return { success: true, message: 'Invoice deleted successfully' };
    } catch (error) {
      console.error('Error deleting invoice:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all invoices
   */
  async listInvoices() {
    try {
      const files = await fs.readdir(this.invoiceDir);
      const invoices = [];
      
      for (const file of files) {
        if (file.endsWith('.pdf')) {
          const stats = await fs.stat(path.join(this.invoiceDir, file));
          invoices.push({
            filename: file,
            invoiceId: file.replace('invoice_', '').replace('.pdf', ''),
            createdAt: stats.birthtime,
            size: stats.size
          });
        }
      }
      
      return {
        success: true,
        invoices: invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      };
    } catch (error) {
      console.error('Error listing invoices:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = InvoiceService;
