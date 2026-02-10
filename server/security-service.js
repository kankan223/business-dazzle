/**
 * Enhanced Security Service for Bharat Biz-Agent
 * Provides advanced rate limiting, DDoS protection, and security monitoring
 */

const rateLimit = require('express-rate-limit');
let RedisStore = null;
let Redis = null;

// Try to import Redis modules, but don't fail if they're not available
try {
  RedisStore = require('rate-limit-redis');
  Redis = require('ioredis');
} catch (error) {
  console.warn('⚠️ Redis modules not available, using memory-based rate limiting:', error.message);
}
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SecurityService {
  constructor() {
    this.redis = null;
    this.securityLogs = [];
    this.blockedIPs = new Map();
    this.suspiciousActivity = new Map();
    this.rateLimiters = new Map();
    this.initializeRedis();
    this.setupSecurityMonitoring();
  }

  async initializeRedis() {
    if (!Redis) {
      console.log('🔐 Redis modules not available, using memory-based rate limiting');
      return;
    }

    try {
      // Try to connect to Redis for distributed rate limiting
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });
      
      this.redis.on('connect', () => {
        console.log('🔐 Redis connected for security service');
      });
      
      this.redis.on('error', (err) => {
        console.warn('⚠️ Redis not available, using memory-based rate limiting:', err.message);
        this.redis = null;
      });
    } catch (error) {
      console.warn('⚠️ Redis initialization failed, using memory-based rate limiting:', error.message);
      this.redis = null;
    }
  }

  /**
   * Create advanced rate limiter with multiple strategies
   */
  createRateLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000,
      max = 100,
      message = 'Rate limit exceeded',
      keyGenerator = (req) => req.ip,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      trustProxy = false
    } = options;

    const limiterOptions = {
      windowMs,
      max,
      message: { error: message, retryAfter: Math.ceil(windowMs / 1000) },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator,
      skipSuccessfulRequests,
      skipFailedRequests,
      trustProxy
    };

    // Use Redis store if available
    if (this.redis) {
      limiterOptions.store = new RedisStore({
        sendCommand: (...args) => this.redis.call(...args),
        client: this.redis
      });
    }

    return rateLimit(limiterOptions);
  }

  /**
   * Create IP-based rate limiter
   */
  createIPRateLimiter(windowMs = 15 * 60 * 1000, max = 100) {
    return this.createRateLimiter({
      windowMs,
      max,
      message: `Too many requests from this IP. Maximum ${max} requests per ${Math.ceil(windowMs / 60000)} minutes.`,
      keyGenerator: (req) => `ip:${req.ip}`,
      trustProxy: true
    });
  }

  /**
   * Create user-based rate limiter
   */
  createUserRateLimiter(windowMs = 15 * 60 * 1000, max = 200) {
    return this.createRateLimiter({
      windowMs,
      max,
      message: `Too many requests from this user. Maximum ${max} requests per ${Math.ceil(windowMs / 60000)} minutes.`,
      keyGenerator: (req) => {
        const userId = req.headers['x-user-id'] || req.body?.userId || req.query?.userId || req.ip;
        return `user:${userId}`;
      },
      trustProxy: true
    });
  }

  /**
   * Create API endpoint-specific rate limiter
   */
  createEndpointRateLimiter(endpoint, windowMs = 15 * 60 * 1000, max = 50) {
    return this.createRateLimiter({
      windowMs,
      max,
      message: `Too many requests to ${endpoint}. Maximum ${max} requests per ${Math.ceil(windowMs / 60000)} minutes.`,
      keyGenerator: (req) => `endpoint:${endpoint}:${req.ip}`,
      trustProxy: true
    });
  }

  /**
   * Create DDoS protection limiter
   */
  createDDoSProtection() {
    return this.createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 1000, // Very high limit for legitimate traffic
      message: 'DDoS protection activated. Please slow down your requests.',
      keyGenerator: (req) => `ddos:${req.ip}`,
      skipSuccessfulRequests: false,
      trustProxy: true
    });
  }

  /**
   * Create brute force protection limiter
   */
  createBruteForceProtection(windowMs = 15 * 60 * 1000, max = 5) {
    return this.createRateLimiter({
      windowMs,
      max,
      message: 'Too many failed attempts. Please try again later.',
      keyGenerator: (req) => {
        const identifier = req.body?.email || req.body?.username || req.body?.phone || req.ip;
        return `bruteforce:${identifier}`;
      },
      skipSuccessfulRequests: true,
      trustProxy: true
    });
  }

  /**
   * Check if IP is blocked
   */
  isIPBlocked(ip) {
    const blockInfo = this.blockedIPs.get(ip);
    if (!blockInfo) return false;

    // Check if block has expired
    if (blockInfo.expiresAt && Date.now() > blockInfo.expiresAt) {
      this.blockedIPs.delete(ip);
      this.logSecurityEvent('ip_block_expired', { ip, reason: blockInfo.reason });
      return false;
    }

    return true;
  }

  /**
   * Block IP temporarily or permanently
   */
  blockIP(ip, reason = 'Suspicious activity', duration = 24 * 60 * 60 * 1000) {
    const blockInfo = {
      ip,
      reason,
      blockedAt: Date.now(),
      expiresAt: duration > 0 ? Date.now() + duration : null,
      permanent: duration === 0
    };

    this.blockedIPs.set(ip, blockInfo);
    this.logSecurityEvent('ip_blocked', { ip, reason, duration });

    // Also store in Redis if available
    if (this.redis) {
      const key = `blocked_ip:${ip}`;
      if (duration > 0) {
        this.redis.setex(key, Math.ceil(duration / 1000), JSON.stringify(blockInfo));
      } else {
        this.redis.set(key, JSON.stringify(blockInfo));
      }
    }

    console.log(`🚫 IP blocked: ${ip} - Reason: ${reason}`);
  }

  /**
   * Monitor suspicious activity
   */
  trackSuspiciousActivity(ip, activity) {
    const key = `suspicious:${ip}`;
    const existing = this.suspiciousActivity.get(key) || { count: 0, activities: [], firstSeen: Date.now() };
    
    existing.count++;
    existing.activities.push({
      ...activity,
      timestamp: Date.now()
    });

    // Keep only last 10 activities
    existing.activities = existing.activities.slice(-10);

    this.suspiciousActivity.set(key, existing);

    // Auto-block if too much suspicious activity
    if (existing.count >= 10) {
      this.blockIP(ip, 'Excessive suspicious activity detected', 60 * 60 * 1000); // 1 hour
    }

    // Clean old entries periodically
    if (existing.count % 5 === 0) {
      this.cleanupSuspiciousActivity();
    }
  }

  /**
   * Clean up old suspicious activity records
   */
  cleanupSuspiciousActivity() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [key, activity] of this.suspiciousActivity.entries()) {
      if (activity.firstSeen < oneHourAgo && activity.count < 5) {
        this.suspiciousActivity.delete(key);
      }
    }
  }

  /**
   * Log security events
   */
  logSecurityEvent(event, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      data,
      id: crypto.randomUUID()
    };

    this.securityLogs.unshift(logEntry);

    // Keep only last 1000 logs in memory
    if (this.securityLogs.length > 1000) {
      this.securityLogs = this.securityLogs.slice(0, 1000);
    }

    // Log to console for immediate visibility
    console.log(`🔐 Security Event [${event}]:`, data);

    // Store in Redis if available
    if (this.redis) {
      this.redis.lpush('security_logs', JSON.stringify(logEntry));
      this.redis.ltrim('security_logs', 0, 999); // Keep last 1000 logs
    }
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const last1h = now - (60 * 60 * 1000);

    const recentLogs = this.securityLogs.filter(log => 
      new Date(log.timestamp).getTime() > last24h
    );

    const lastHourLogs = this.securityLogs.filter(log => 
      new Date(log.timestamp).getTime() > last1h
    );

    return {
      totalBlockedIPs: this.blockedIPs.size,
      totalSuspiciousActivities: this.suspiciousActivity.size,
      securityEvents24h: recentLogs.length,
      securityEvents1h: lastHourLogs.length,
      topSecurityEvents: this.getTopSecurityEvents(recentLogs),
      blockedIPs: Array.from(this.blockedIPs.entries()).map(([ip, info]) => ({
        ip,
        reason: info.reason,
        blockedAt: info.blockedAt,
        expiresAt: info.expiresAt
      }))
    };
  }

  /**
   * Get top security events
   */
  getTopSecurityEvents(logs) {
    const eventCounts = {};
    
    logs.forEach(log => {
      eventCounts[log.event] = (eventCounts[log.event] || 0) + 1;
    });

    return Object.entries(eventCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));
  }

  /**
   * Setup security monitoring
   */
  setupSecurityMonitoring() {
    // Clean up old data every hour
    setInterval(() => {
      this.cleanupSuspiciousActivity();
      
      // Clean old security logs (keep last 7 days)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      this.securityLogs = this.securityLogs.filter(log => 
        new Date(log.timestamp).getTime() > sevenDaysAgo
      );
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Create middleware for IP blocking
   */
  createIPBlockingMiddleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      
      if (this.isIPBlocked(ip)) {
        const blockInfo = this.blockedIPs.get(ip);
        this.logSecurityEvent('blocked_request_attempt', {
          ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });
        
        return res.status(403).json({
          error: 'Access denied',
          message: 'Your IP has been blocked due to suspicious activity',
          retryAfter: blockInfo.expiresAt ? Math.ceil((blockInfo.expiresAt - Date.now()) / 1000) : null
        });
      }
      
      next();
    };
  }

  /**
   * Create middleware for security headers
   */
  createSecurityHeadersMiddleware() {
    return (req, res, next) => {
      // Add security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Remove server signature
      res.removeHeader('Server');
      
      next();
    };
  }

  /**
   * Create middleware for request validation
   */
  createRequestValidationMiddleware() {
    return (req, res, next) => {
      // Check for common attack patterns
      const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /union.*select/i,
        /drop.*table/i,
        /insert.*into/i,
        /delete.*from/i
      ];

      const checkValue = (value) => {
        if (typeof value === 'string') {
          return suspiciousPatterns.some(pattern => pattern.test(value));
        }
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(v => checkValue(v));
        }
        return false;
      };

      // Check URL, query params, and body
      if (checkValue(req.url) || checkValue(req.query) || checkValue(req.body)) {
        this.trackSuspiciousActivity(req.ip, {
          type: 'xss_or_injection_attempt',
          url: req.url,
          method: req.method
        });
        
        return res.status(400).json({
          error: 'Invalid request detected',
          message: 'Your request contains suspicious content'
        });
      }
      
      next();
    };
  }
}

// Create singleton instance
const securityService = new SecurityService();

module.exports = securityService;
