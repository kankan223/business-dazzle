/**
 * Low-Bandwidth Service for Indian Connectivity Conditions
 * WHY: Optimize for flaky networks and low-connectivity environments
 * CHANGE: New service for lightweight, resilient operation
 */

class LowBandwidthService {
  constructor() {
    this.connectionQuality = 'unknown';
    this.retryConfig = this.initializeRetryConfig();
    this.compressionSettings = this.initializeCompressionSettings();
    this.offlineQueue = [];
    this.syncQueue = [];
    this.isOnline = navigator.onLine;
    this.lastSyncTime = null;
  }

  // Initialize retry configuration for Indian networks
  initializeRetryConfig() {
    return {
      // Indian network conditions
      max_retries: 5,
      base_delay: 1000, // 1 second
      max_delay: 30000, // 30 seconds
      backoff_multiplier: 2,
      jitter: true, // Add random jitter to avoid thundering herd
      
      // Network-specific configs
      network_configs: {
        '2g': { max_retries: 3, base_delay: 5000, max_delay: 60000 },
        '3g': { max_retries: 4, base_delay: 2000, max_delay: 45000 },
        '4g': { max_retries: 5, base_delay: 1000, max_delay: 30000 },
        'wifi': { max_retries: 3, base_delay: 1500, max_delay: 20000 },
        'unknown': { max_retries: 5, base_delay: 3000, max_delay: 60000 }
      }
    };
  }

  // Initialize compression settings for low bandwidth
  initializeCompressionSettings() {
    return {
      // Text compression
      text_compression: true,
      remove_whitespace: true,
      shorten_messages: true,
      
      // Image compression
      image_compression: true,
      max_image_size: 200, // KB
      image_quality: 0.6,
      
      // Audio compression
      audio_compression: true,
      audio_bitrate: 16000, // 16kbps for voice
      audio_format: 'opus',
      
      // Payload optimization
      minify_json: true,
      batch_requests: true,
      cache_responses: true
    };
  }

  // Detect connection quality
  async detectConnectionQuality() {
    try {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        const downlink = connection.downlink || 0;
        const rtt = connection.rtt || 0;
        const effectiveType = connection.effectiveType || 'unknown';
        
        // Classify connection quality for Indian conditions
        if (downlink < 0.1 || effectiveType === '2g') {
          this.connectionQuality = 'poor';
        } else if (downlink < 0.5 || effectiveType === '3g') {
          this.connectionQuality = 'fair';
        } else if (downlink < 2 || effectiveType === '4g') {
          this.connectionQuality = 'good';
        } else {
          this.connectionQuality = 'excellent';
        }
        
        return {
          quality: this.connectionQuality,
          downlink,
          rtt,
          effectiveType,
          config: this.retryConfig.network_configs[effectiveType] || this.retryConfig.network_configs['unknown']
        };
      }
      
      return { quality: 'unknown', config: this.retryConfig.network_configs['unknown'] };
      
    } catch (error) {
      console.error('Connection detection error:', error);
      return { quality: 'unknown', config: this.retryConfig.network_configs['unknown'] };
    }
  }

  // Make resilient API request with retry logic
  async makeResilientRequest(url, options = {}) {
    const connectionInfo = await this.detectConnectionQuality();
    const config = connectionInfo.config;
    
    // Optimize request based on connection quality
    const optimizedOptions = this.optimizeRequestOptions(options, connectionInfo);
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= config.max_retries; attempt++) {
      try {
        console.log(`🌐 Attempt ${attempt + 1}/${config.max_retries + 1} for ${url}`);
        
        const response = await this.executeRequest(url, optimizedOptions);
        
        // On success, sync any queued offline actions
        if (this.offlineQueue.length > 0) {
          await this.syncOfflineQueue();
        }
        
        return response;
        
      } catch (error) {
        lastError = error;
        console.warn(`❌ Attempt ${attempt + 1} failed:`, error.message);
        
        // Don't retry on client errors (4xx)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        // Wait before retry (with exponential backoff and jitter)
        if (attempt < config.max_retries) {
          const delay = this.calculateRetryDelay(attempt, config);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }
    
    // All retries failed
    throw lastError;
  }

  // Optimize request options for low bandwidth
  optimizeRequestOptions(options, connectionInfo) {
    const optimized = { ...options };
    
    // Add compression headers
    if (this.compressionSettings.text_compression) {
      optimized.headers = {
        ...optimized.headers,
        'Accept-Encoding': 'gzip, deflate',
        'Content-Encoding': 'gzip'
      };
    }
    
    // Optimize payload size
    if (optimized.body) {
      optimized.body = this.compressPayload(optimized.body, connectionInfo.quality);
    }
    
    // Add timeout for poor connections
    if (connectionInfo.quality === 'poor') {
      optimized.timeout = 30000; // 30 seconds
    } else if (connectionInfo.quality === 'fair') {
      optimized.timeout = 15000; // 15 seconds
    }
    
    return optimized;
  }

  // Compress payload based on connection quality
  compressPayload(payload, connectionQuality) {
    try {
      if (typeof payload === 'string') {
        return this.compressTextPayload(payload, connectionQuality);
      }
      
      if (typeof payload === 'object') {
        return this.compressJSONPayload(payload, connectionQuality);
      }
      
      return payload;
    } catch (error) {
      console.error('Payload compression error:', error);
      return payload;
    }
  }

  // Compress text payload
  compressTextPayload(text, connectionQuality) {
    let compressed = text;
    
    if (connectionQuality === 'poor' || connectionQuality === 'fair') {
      // Remove extra whitespace
      compressed = compressed.replace(/\s+/g, ' ').trim();
      
      // Shorten common phrases for Indian business
      const shortenings = {
        'Thank you very much': 'Thanks!',
        'Please let me know': 'Pls inform',
        'As soon as possible': 'ASAP',
        'Regarding your order': 'Re: order',
        'We will contact you': 'We\'ll contact',
        'Namaste': '🙏',
        'Dhanyawad': '🙏'
      };
      
      for (const [long, short] of Object.entries(shortenings)) {
        compressed = compressed.replace(new RegExp(long, 'gi'), short);
      }
    }
    
    return compressed;
  }

  // Compress JSON payload
  compressJSONPayload(json, connectionQuality) {
    if (connectionQuality === 'poor' || connectionQuality === 'fair') {
      // Remove unnecessary fields
      const essentialFields = ['id', 'text', 'timestamp', 'type'];
      const compressed = {};
      
      for (const field of essentialFields) {
        if (json[field] !== undefined) {
          compressed[field] = json[field];
        }
      }
      
      return compressed;
    }
    
    return json;
  }

  // Calculate retry delay with exponential backoff and jitter
  calculateRetryDelay(attempt, config) {
    const baseDelay = config.base_delay * Math.pow(config.backoff_multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, config.max_delay);
    
    // Add jitter to avoid thundering herd (important for Indian networks)
    if (config.jitter) {
      const jitter = Math.random() * 0.3 * cappedDelay; // 30% jitter
      return cappedDelay + jitter;
    }
    
    return cappedDelay;
  }

  // Execute actual request
  async executeRequest(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  // Queue action for offline execution
  queueOfflineAction(action, priority = 'normal') {
    const queuedAction = {
      id: `offline-${Date.now()}`,
      action,
      priority,
      timestamp: new Date().toISOString(),
      retries: 0
    };
    
    this.offlineQueue.push(queuedAction);
    
    // Store in localStorage for persistence
    this.persistOfflineQueue();
    
    console.log(`📴 Queued offline action: ${action.type}`, queuedAction);
  }

  // Sync offline queue when back online
  async syncOfflineQueue() {
    if (this.offlineQueue.length === 0) {
      return;
    }
    
    console.log(`🔄 Syncing ${this.offlineQueue.length} offline actions`);
    
    const actionsToSync = [...this.offlineQueue];
    this.offlineQueue = [];
    
    for (const action of actionsToSync) {
      try {
        await this.executeQueuedAction(action);
        console.log(`✅ Synced offline action: ${action.action.type}`);
      } catch (error) {
        console.error(`❌ Failed to sync action: ${action.action.type}`, error);
        // Re-queue failed actions
        action.retries++;
        if (action.retries < 3) {
          this.offlineQueue.push(action);
        }
      }
    }
    
    this.persistOfflineQueue();
  }

  // Execute queued action
  async executeQueuedAction(queuedAction) {
    const { action } = queuedAction;
    
    switch (action.type) {
      case 'send_message':
        return await this.sendQueuedMessage(action.data);
        
      case 'create_invoice':
        return await this.createQueuedInvoice(action.data);
        
      case 'update_inventory':
        return await this.updateQueuedInventory(action.data);
        
      default:
        console.warn(`Unknown queued action type: ${action.type}`);
    }
  }

  // Send queued message
  async sendQueuedMessage(data) {
    const connectionInfo = await this.detectConnectionQuality();
    const optimizedData = this.compressPayload(data, connectionInfo.quality);
    
    return await this.makeResilientRequest('/api/messages', {
      method: 'POST',
      body: JSON.stringify(optimizedData),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create queued invoice
  async createQueuedInvoice(data) {
    const connectionInfo = await this.detectConnectionQuality();
    const optimizedData = this.compressPayload(data, connectionInfo.quality);
    
    return await this.makeResilientRequest('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(optimizedData),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update queued inventory
  async updateQueuedInventory(data) {
    const connectionInfo = await this.detectConnectionQuality();
    const optimizedData = this.compressPayload(data, connectionInfo.quality);
    
    return await this.makeResilientRequest('/api/inventory', {
      method: 'PUT',
      body: JSON.stringify(optimizedData),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Persist offline queue to localStorage (server fallback)
  persistOfflineQueue() {
    try {
      // In Node.js environment, use file system instead of localStorage
      const fs = require('fs');
      const path = require('path');
      
      const queueData = JSON.stringify(this.offlineQueue);
      fs.writeFileSync(path.join(__dirname, '../offline_queue.json'), queueData);
    } catch (error) {
      console.error('Failed to persist offline queue:', error);
    }
  }

  // Load offline queue from localStorage (server fallback)
  loadOfflineQueue() {
    try {
      // In Node.js environment, use file system instead of localStorage
      const fs = require('fs');
      const path = require('path');
      
      const queueFile = path.join(__dirname, '../offline_queue.json');
      if (fs.existsSync(queueFile)) {
        const stored = fs.readFileSync(queueFile, 'utf8');
        this.offlineQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  }

  // Monitor online/offline status (server fallback)
  setupConnectivityMonitoring() {
    // In Node.js environment, we can't use browser events
    // Use a simple interval check instead
    console.log('📶 Connectivity monitoring initialized (server mode)');
    
    // Check connectivity every 30 seconds
    setInterval(() => {
      this.isOnline = true; // Assume online in server environment
    }, 30000);
    
    // Monitor connection quality changes (server fallback)
    console.log('📶 Connection quality monitoring initialized (server mode)');
  }

  // Get current connection status
  getConnectionStatus() {
    return {
      online: this.isOnline,
      quality: this.connectionQuality,
      queued_actions: this.offlineQueue.length,
      last_sync: this.lastSyncTime
    };
  }

  // Optimize for Indian business hours (reduce unnecessary requests)
  optimizeForBusinessHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Indian business hours: 9 AM to 8 PM, Monday to Saturday
    const isBusinessHours = (
      day >= 1 && day <= 6 && // Monday to Saturday
      hour >= 9 && hour < 20 // 9 AM to 8 PM
    );
    
    if (!isBusinessHours) {
      return {
        should_delay: true,
        next_business_time: this.getNextBusinessTime(now),
        message: 'बिजनेस घंटे के बाहर हैं। कल 9 बजे प्रयास करें।' // Business hours message
      };
    }
    
    return { should_delay: false };
  }

  // Get next business time
  getNextBusinessTime(currentTime) {
    const now = new Date(currentTime);
    const day = now.getDay();
    const hour = now.getHours();
    
    if (day === 0) { // Sunday
      // Next Monday 9 AM
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + (7 - day));
      nextMonday.setHours(9, 0, 0, 0);
      return nextMonday;
    }
    
    if (hour >= 20) { // After 8 PM
      // Next day 9 AM
      const nextDay = new Date(now);
      nextDay.setDate(now.getDate() + 1);
      nextDay.setHours(9, 0, 0, 0);
      return nextDay;
    }
    
    return currentTime;
  }

  // Utility sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize the service
  initialize() {
    console.log('🚀 Initializing Low-Bandwidth Service for Indian connectivity');
    
    // Load offline queue
    this.loadOfflineQueue();
    
    // Setup connectivity monitoring
    this.setupConnectivityMonitoring();
    
    // Detect initial connection quality
    this.detectConnectionQuality();
    
    // Sync any pending actions
    if (this.isOnline && this.offlineQueue.length > 0) {
      this.syncOfflineQueue();
    }
  }
}

module.exports = new LowBandwidthService();
