/**
 * Enhanced Database Security Module for Bharat Biz-Agent
 * Provides additional database security features and protections
 */

const crypto = require('crypto');
const { MongoClient } = require('mongodb');

class DatabaseSecurity {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    this.queryCache = new Map();
    this.suspiciousQueries = new Set();
    this.queryTimeout = 30000; // 30 seconds
  }

  /**
   * Encrypt sensitive data before storing
   */
  encrypt(data) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data after retrieval
   */
  decrypt(encryptedData) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    const algorithm = 'aes-256-gcm';
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipher(algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Sanitize database queries to prevent injection
   */
  sanitizeQuery(query) {
    if (typeof query !== 'object' || query === null) {
      return query;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(query)) {
      // Remove dangerous operators
      if (typeof value === 'string') {
        sanitized[key] = value
          .replace(/\$where/gi, '')
          .replace(/\$regex/gi, '')
          .replace(/\$expr/gi, '')
          .replace(/\javascript:/gi, '')
          .replace(/\0/g, ''); // Remove null bytes
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeQuery(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate query parameters
   */
  validateQuery(query, collection) {
    const dangerousPatterns = [
      /\$where/,
      /\$regex/,
      /\$expr/,
      /\$function/,
      /\$accumulator/,
      /\$map/,
      /\$reduce/,
      /\$filter/,
      /javascript:/,
      /\0/,
      /eval\s*\(/,
      /Function\s*\(/,
      /setTimeout/,
      /setInterval/
    ];

    const queryStr = JSON.stringify(query);
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(queryStr)) {
        throw new Error(`Dangerous query pattern detected: ${pattern}`);
      }
    }

    // Validate field names
    const allowedFields = this.getAllowedFields(collection);
    this.validateFieldNames(query, allowedFields);

    return true;
  }

  /**
   * Get allowed fields for each collection
   */
  getAllowedFields(collection) {
    const fieldMaps = {
      orders: ['_id', 'orderId', 'customerId', 'items', 'status', 'totalAmount', 'createdAt', 'updatedAt', 'platform'],
      customers: ['_id', 'id', 'name', 'phone', 'email', 'address', 'platform', 'createdAt'],
      inventory: ['_id', 'sku', 'name', 'quantity', 'unit', 'price', 'category', 'description'],
      audit_logs: ['_id', 'action', 'details', 'userId', 'timestamp', 'ip'],
      bots: ['_id', 'botId', 'name', 'platform', 'status'],
      conversations: ['_id', 'customerId', 'messages', 'lastMessageAt'],
      approvals: ['_id', 'id', 'type', 'data', 'status', 'createdAt']
    };

    return fieldMaps[collection] || [];
  }

  /**
   * Validate field names in query
   */
  validateFieldNames(obj, allowedFields, path = '') {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.validateFieldNames(obj[key], allowedFields, `${path}.${key}`);
      } else if (!allowedFields.includes(key) && !key.startsWith('$')) {
        throw new Error(`Invalid field name: ${path}.${key}`);
      }
    }
  }

  /**
   * Add query timeout and monitoring
   */
  async executeWithTimeout(operation, timeout = this.queryTimeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Database query timeout'));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Monitor database performance
   */
  monitorQuery(collection, operation, query, startTime) {
    const duration = Date.now() - startTime;
    
    if (duration > 5000) { // 5 seconds threshold
      console.warn(`Slow query detected: ${collection}.${operation} took ${duration}ms`);
    }

    // Log query metrics
    const metrics = {
      collection,
      operation,
      duration,
      timestamp: new Date(),
      querySize: JSON.stringify(query).length
    };

    // Store metrics for analysis
    this.storeQueryMetrics(metrics);
  }

  /**
   * Store query metrics for analysis
   */
  storeQueryMetrics(metrics) {
    // In production, this would store in a monitoring system
    // For now, just keep in memory with size limit
    if (this.queryCache.size > 1000) {
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }
    
    this.queryCache.set(Date.now(), metrics);
  }

  /**
   * Create secure database connection
   */
  async createSecureConnection(mongoUri) {
    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
      readPreference: 'primary',
      writeConcern: { w: 'majority', j: true },
      readConcern: { level: 'majority' },
      compressors: ['snappy', 'zstd'],
      ssl: process.env.NODE_ENV === 'production',
      sslValidate: process.env.NODE_ENV === 'production',
      authSource: 'admin'
    };

    try {
      const client = new MongoClient(mongoUri, options);
      await client.connect();
      
      // Enable authentication
      await client.db('admin').command({ ping: 1 });
      
      console.log('✅ Secure database connection established');
      return client;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Create database indexes with security considerations
   */
  async createSecureIndexes(db) {
    const indexes = [
      // Orders collection
      { collection: 'orders', index: { orderId: 1 }, options: { unique: true } },
      { collection: 'orders', index: { customerId: 1 } },
      { collection: 'orders', index: { status: 1 } },
      { collection: 'orders', index: { createdAt: -1 } },
      { collection: 'orders', index: { platform: 1 } },
      
      // Customers collection
      { collection: 'customers', index: { phone: 1 }, options: { unique: true } },
      { collection: 'customers', index: { email: 1 }, options: { sparse: true } },
      { collection: 'customers', index: { platform: 1 } },
      
      // Audit logs collection
      { collection: 'audit_logs', index: { timestamp: -1 } },
      { collection: 'audit_logs', index: { eventType: 1 } },
      { collection: 'audit_logs', index: { userId: 1 } },
      
      // Inventory collection
      { collection: 'inventory', index: { sku: 1 }, options: { unique: true } },
      { collection: 'inventory', index: { name: 1 } },
      { collection: 'inventory', index: { category: 1 } },
      
      // Security indexes
      { collection: 'audit_logs', index: { 'details.ip': 1 } },
      { collection: 'audit_logs', index: { 'details.severity': 1 } },
      { collection: 'audit_logs', index: { eventType: 1, timestamp: -1 } }
    ];

    for (const { collection, index, options = {} } of indexes) {
      try {
        await db.collection(collection).createIndex(index, options);
        console.log(`✅ Created index on ${collection}: ${JSON.stringify(index)}`);
      } catch (error) {
        console.warn(`⚠️ Failed to create index on ${collection}:`, error.message);
      }
    }
  }

  /**
   * Backup sensitive data
   */
  async backupSensitiveData(db, outputPath) {
    const sensitiveCollections = ['customers'];
    const backup = {};

    for (const collectionName of sensitiveCollections) {
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      backup[collectionName] = documents.map(doc => {
        const encrypted = { ...doc };
        
        // Encrypt sensitive fields
        if (encrypted.phone) {
          encrypted.phone = this.encrypt(encrypted.phone);
        }
        if (encrypted.email) {
          encrypted.email = this.encrypt(encrypted.email);
        }
        if (encrypted.address) {
          encrypted.address = this.encrypt(encrypted.address);
        }
        
        return encrypted;
      });
    }

    // Write backup to file
    const fs = require('fs').promises;
    await fs.writeFile(outputPath, JSON.stringify(backup, null, 2));
    
    console.log(`✅ Sensitive data backed up to ${outputPath}`);
  }

  /**
   * Restore sensitive data
   */
  async restoreSensitiveData(db, inputPath) {
    const fs = require('fs').promises;
    const backup = JSON.parse(await fs.readFile(inputPath, 'utf8'));

    for (const [collectionName, documents] of Object.entries(backup)) {
      const collection = db.collection(collectionName);
      
      for (const doc of documents) {
        // Decrypt sensitive fields
        if (doc.phone && doc.phone.encrypted) {
          doc.phone = this.decrypt(doc.phone);
        }
        if (doc.email && doc.email.encrypted) {
          doc.email = this.decrypt(doc.email);
        }
        if (doc.address && doc.address.encrypted) {
          doc.address = this.decrypt(doc.address);
        }
        
        // Upsert document
        await collection.replaceOne(
          { _id: doc._id },
          doc,
          { upsert: true }
        );
      }
    }

    console.log(`✅ Sensitive data restored from ${inputPath}`);
  }

  /**
   * Audit database access
   */
  async auditDatabaseAccess(operation, collection, query, userId, ip) {
    const auditEntry = {
      operation,
      collection,
      query: this.sanitizeQuery(query),
      userId,
      ip,
      timestamp: new Date(),
      success: true
    };

    // Store audit log
    try {
      const db = global.db;
      if (db) {
        await db.collection('security_audit').insertOne(auditEntry);
      }
    } catch (error) {
      console.error('Failed to log database audit:', error);
    }
  }

  /**
   * Get database security metrics
   */
  getSecurityMetrics() {
    return {
      queryCacheSize: this.queryCache.size,
      suspiciousQueriesCount: this.suspiciousQueries.size,
      encryptionEnabled: !!this.encryptionKey,
      queryTimeout: this.queryTimeout,
      recentQueries: Array.from(this.queryCache.values()).slice(-10)
    };
  }
}

module.exports = DatabaseSecurity;
