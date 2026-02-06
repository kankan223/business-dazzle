/**
 * Security Middleware and Input Validation for Bharat Biz-Agent
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const Joi = require('joi');
const crypto = require('crypto');

// Rate limiting configuration
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input validation schemas
const schemas = {
  order: Joi.object({
    customerId: Joi.string().required(),
    items: Joi.array().items(
      Joi.object({
        product: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unit: Joi.string().valid('kg', 'liters', 'pcs', 'packs').default('kg'),
        price: Joi.number().positive().required(),
        notes: Joi.string().optional()
      })
    ).min(1).required(),
    platform: Joi.string().valid('web', 'telegram', 'whatsapp').default('web'),
    deliveryAddress: Joi.string().optional(),
    notes: Joi.string().max(500).optional()
  }),

  inventory: Joi.object({
    name: Joi.string().required().max(100),
    sku: Joi.string().required().max(50),
    quantity: Joi.number().positive().required(),
    unit: Joi.string().valid('kg', 'liters', 'pcs', 'packs').required(),
    price: Joi.number().positive().required(),
    lowStockThreshold: Joi.number().positive().default(10),
    description: Joi.string().max(500).optional()
  }),

  customer: Joi.object({
    name: Joi.string().required().max(100),
    phone: Joi.string().pattern(/^[+]?[0-9]{10,15}$/).required(),
    email: Joi.string().email().optional(),
    address: Joi.string().max(500).optional(),
    platform: Joi.string().valid('web', 'telegram', 'whatsapp').default('web')
  }),

  message: Joi.object({
    content: Joi.string().required().max(1000),
    type: Joi.string().valid('text', 'image', 'voice', 'document').default('text'),
    platform: Joi.string().valid('web', 'telegram', 'whatsapp').required()
  }),

  userMessage: Joi.object({
    message: Joi.string().required().max(1000),
    subject: Joi.string().max(200).optional(),
    sendVia: Joi.array().items(Joi.string().valid('telegram', 'email', 'web', 'all')).default(['all'])
  }),

  orderStatus: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'processing', 'shipped', 'delivered', 'cancelled').required(),
    notes: Joi.string().max(500).optional()
  })
};

// Input validation middleware
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errorDetails
      });
    }
    
    req.validatedBody = value;
    next();
  };
}

// Sanitization functions
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function sanitizePhoneNumber(phone) {
  // Remove all non-digit characters except +
  return phone.replace(/[^\d+]/g, '');
}

function sanitizeEmail(email) {
  return email.toLowerCase().trim();
}

// Security event logging
async function logSecurityEvent(eventType, userId, severity, details, ip = null) {
  try {
    const AuditOperations = require('./database').AuditOperations;
    
    await AuditOperations.log('security_event', {
      eventType,
      userId,
      severity, // 'low', 'medium', 'high', 'critical'
      details,
      ip,
      timestamp: new Date(),
      userAgent: null // Will be set from request
    });
  } catch (error) {
    console.error('Security event logging error:', error);
  }
}

// IP-based security checks
function checkSuspiciousActivity(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /scanner/i,
    /sqlmap/i,
    /nikto/i,
    /nmap/i
  ];
  
  const isSuspiciousUA = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspiciousUA) {
    logSecurityEvent('suspicious_user_agent', null, 'medium', {
      userAgent,
      ip: clientIp
    });
    
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }
  
  // Check for common attack patterns in URL
  const attackPatterns = [
    /union.*select/i,
    /select.*from/i,
    /insert.*into/i,
    /delete.*from/i,
    /drop.*table/i,
    /script.*alert/i,
    /javascript.*alert/i
  ];
  
  const url = req.originalUrl;
  const isAttack = attackPatterns.some(pattern => pattern.test(url));
  
  if (isAttack) {
    logSecurityEvent('potential_attack', null, 'high', {
      url,
      method: req.method,
      ip: clientIp
    });
    
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }
  
  next();
}

// API key validation with security checks
function validateApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logSecurityEvent('missing_api_key', null, 'medium', {
      ip: req.ip,
      endpoint: req.path
    });
    
    return res.status(401).json({ 
      success: false, 
      error: 'Authorization header required' 
    });
  }
  
  const apiKey = authHeader.substring(7);
  const validApiKey = process.env.ADMIN_API_KEY;
  
  if (!validApiKey) {
    logSecurityEvent('api_key_not_configured', null, 'high', {
      ip: req.ip
    });
    
    return res.status(500).json({
      success: false,
      error: 'Server configuration error'
    });
  }
  
  if (apiKey !== validApiKey) {
    logSecurityEvent('invalid_api_key', null, 'high', {
      ip: req.ip,
      endpoint: req.path,
      providedKey: apiKey.substring(0, 8) + '***'
    });
    
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid API key' 
    });
  }
  
  // Log successful API usage
  logSecurityEvent('api_access', null, 'low', {
    ip: req.ip,
    endpoint: req.path,
    method: req.method
  });
  
  next();
}

// File upload security
function validateFileUpload(req, res, next) {
  const file = req.file;
  
  if (!file) {
    return next();
  }
  
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return res.status(413).json({
      success: false,
      error: 'File too large. Maximum size is 10MB'
    });
  }
  
  // Check file type
  const allowedMimeTypes = [
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/mp4',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf'
  ];
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type'
    });
  }
  
  // Generate secure filename
  const fileExtension = file.originalname.split('.').pop();
  const secureFilename = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
  
  req.file.originalname = secureFilename;
  next();
}

// CORS security
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

module.exports = {
  rateLimiter,
  securityHeaders,
  schemas,
  validate,
  sanitizeInput,
  sanitizePhoneNumber,
  sanitizeEmail,
  logSecurityEvent,
  checkSuspiciousActivity,
  validateApiKey,
  validateFileUpload,
  corsOptions
};
