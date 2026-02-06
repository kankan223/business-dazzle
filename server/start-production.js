#!/usr/bin/env node

/**
 * Production Startup Script for Bharat Biz-Agent
 * Handles graceful shutdowns and proper initialization
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  // Close server
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      
      // Close database connections
      if (global.db) {
        global.db.close(() => {
          console.log('Database connections closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  }
};

// Handle signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Create necessary directories
const ensureDirectories = () => {
  const dirs = ['data', 'uploads', 'invoices', 'logs'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
};

// Validate environment
const validateEnvironment = () => {
  const required = ['ENCRYPTION_KEY', 'ADMIN_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    process.exit(1);
  }
  
  // Validate encryption key format
  if (!/^[a-f0-9]{32}$/i.test(process.env.ENCRYPTION_KEY)) {
    console.error('ENCRYPTION_KEY must be a 32-character hex string');
    process.exit(1);
  }
  
  console.log('Environment validation passed');
};

// Health check endpoint
const setupHealthCheck = (app) => {
  app.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {}
      };

      // Check database
      try {
        const { OrderOperations } = require('./database');
        await OrderOperations.getAll();
        health.services.database = { status: 'healthy' };
      } catch (error) {
        health.services.database = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }

      // Check AI service
      try {
        const ProductionGeminiService = require('./gemini-service-production');
        const geminiService = new ProductionGeminiService();
        const aiHealth = await geminiService.healthCheck();
        health.services.ai = aiHealth;
        if (aiHealth.status !== 'healthy') {
          health.status = 'degraded';
        }
      } catch (error) {
        health.services.ai = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
};

// Metrics endpoint
const setupMetrics = (app) => {
  app.get('/metrics', (req, res) => {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
    
    res.set('Content-Type', 'application/json');
    res.send(metrics);
  });
};

// Start application
const startApplication = async () => {
  try {
    console.log('Starting Bharat Biz-Agent Production Server...');
    
    // Validate environment
    validateEnvironment();
    
    // Ensure directories
    ensureDirectories();
    
    // Load the main application
    const app = require('./index.js');
    
    // Setup additional endpoints
    setupHealthCheck(app);
    setupMetrics(app);
    
    // Get port from environment
    const PORT = process.env.PORT || 3002;
    const HOST = process.env.HOST || '0.0.0.0';
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });
    
    // Start listening
    server.listen(PORT, HOST, () => {
      console.log(`\n🚀 Bharat Biz-Agent Production Server Started!`);
      console.log(`📍 Server: http://${HOST}:${PORT}`);
      console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
      console.log(`📊 Metrics: http://${HOST}:${PORT}/metrics`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);
      console.log(`\n📝 Press Ctrl+C to gracefully shutdown\n`);
      
      // Notify process manager
      if (process.send) {
        process.send('ready');
      }
    });
    
    // Store server reference for graceful shutdown
    global.server = server;
    
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
};

// Start the application
startApplication();
