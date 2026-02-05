/**
 * Security and Privacy Enhancements for Bharat Biz-Agent
 * Fixes for exploits, message synchronization, and AI improvements
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// Enhanced security middleware
const securityMiddleware = {
  // Prevent XSS attacks
  sanitizeInput: (input) => {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  },

  // Validate and sanitize phone numbers
  validatePhone: (phone) => {
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    return cleanPhone.length >= 10 && cleanPhone.length <= 12 ? cleanPhone : null;
  },

  // Validate email addresses
  validateEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Encrypt sensitive data
  encryptSensitiveData: (data, key) => {
    const cipher = crypto.createCipher('aes-256-gcm', key);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      encrypted,
      tag: cipher.getAuthTag()
    };
  },

  // Decrypt sensitive data
  decryptSensitiveData: (encryptedData, key) => {
    const decipher = crypto.createDecipher('aes-256-gcm', key);
    decipher.setAuthTag(encryptedData.tag);
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
};

// Enhanced rate limiting
const createEnhancedRateLimit = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100, // 100 requests default
    message: options.message || { error: 'Rate limit exceeded' },
    standardHeaders: true,
    legacyHeaders: false,
    // Enhanced security features
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    },
    // Custom key generator for better rate limiting
    keyGenerator: (req) => {
      return req.ip + ':' + (req.headers['user-agent'] || '');
    }
  });
};

// Input validation schemas
const validationSchemas = {
  customerMessage: {
    max: 1000,
    required: true,
    sanitize: true
  },
  orderDetails: {
    amount: { type: 'number', min: 0, max: 100000 },
    quantity: { type: 'number', min: 1, max: 1000 },
    customerName: { type: 'string', max: 100, required: true },
    customerPhone: { type: 'string', validate: 'phone' },
    customerEmail: { type: 'string', validate: 'email' }
  },
  botCommand: {
    max: 500,
    allowedCommands: ['/help', '/ping', '/status', '/language', '/voice', '/price', '/stock', '/order'],
    sanitize: true
  }
};

// Validate input against schema
const validateInput = (data, schema) => {
  const errors = [];
  
  Object.keys(schema).forEach(field => {
    const rules = schema[field];
    const value = data[field];
    
    // Required field validation
    if (rules.required && (!value || value === '')) {
      errors.push(`${field} is required`);
      return;
    }
    
    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
      return;
    }
    
    // Length validation
    if (rules.max && value && value.length > rules.max) {
      errors.push(`${field} exceeds maximum length of ${rules.max}`);
    }
    
    // Number validation
    if (rules.min && typeof value === 'number' && value < rules.min) {
      errors.push(`${field} must be at least ${rules.min}`);
    }
    
    if (rules.max && typeof value === 'number' && value > rules.max) {
      errors.push(`${field} must be at most ${rules.max}`);
    }
    
    // Custom validation
    if (rules.validate === 'phone' && value && !securityMiddleware.validatePhone(value)) {
      errors.push(`${field} is not a valid phone number`);
    }
    
    if (rules.validate === 'email' && value && !securityMiddleware.validateEmail(value)) {
      errors.push(`${field} is not a valid email address`);
    }
    
    // Allowed commands validation
    if (rules.allowedCommands && value && !rules.allowedCommands.includes(value.toLowerCase())) {
      errors.push(`Command ${value} is not allowed`);
    }
    
    // Sanitization
    if (rules.sanitize && typeof value === 'string') {
      data[field] = securityMiddleware.sanitizeInput(value);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: data
  };
};

// Privacy controls
const privacyControls = {
  // Mask sensitive information in logs
  maskSensitiveData: (data) => {
    const sensitiveFields = ['phone', 'email', 'address', 'password', 'account', 'pan', 'aadhar'];
    const masked = { ...data };
    
    sensitiveFields.forEach(field => {
      if (masked[field]) {
        const value = masked[field].toString();
        if (value.length > 4) {
          masked[field] = value.substring(0, 2) + '***' + value.substring(value.length - 2);
        } else {
          masked[field] = '***';
        }
      }
    });
    
    return masked;
  },

  // Check if data contains PII
  containsPII: (text) => {
    const piiPatterns = [
      /\b\d{10,12}\b/g, // Phone numbers
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, // PAN
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // Credit card
      /\b[A-Z]{2}\d{4}\s?\d{4}\s?\d{4}\b/g // Aadhar
    ];
    
    return piiPatterns.some(pattern => pattern.test(text));
  },

  // Anonymize data for analytics
  anonymizeForAnalytics: (data) => {
    const anonymized = { ...data };
    
    // Remove direct identifiers
    delete anonymized.customerId;
    delete anonymized.userId;
    delete anonymized.phone;
    delete anonymized.email;
    
    // Replace names with hashes
    if (anonymized.customerName) {
      anonymized.customerName = crypto
        .createHash('sha256')
        .update(anonymized.customerName)
        .digest('hex')
        .substring(0, 8);
    }
    
    return anonymized;
  }
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self' ws: wss:;"
  );
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // HSTS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  next();
};

module.exports = {
  securityMiddleware,
  createEnhancedRateLimit,
  validationSchemas,
  validateInput,
  privacyControls,
  securityHeaders
};
