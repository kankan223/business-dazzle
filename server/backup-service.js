/**
 * Automated Backup Service for Bharat Biz-Agent
 * Provides scheduled backups, data export, and recovery capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class BackupService {
  constructor() {
    this.backupDir = './backups';
    this.backupSchedule = {
      daily: true,
      weekly: true,
      monthly: true
    };
    this.backupRetention = {
      daily: 7,      // Keep 7 daily backups
      weekly: 4,     // Keep 4 weekly backups
      monthly: 12    // Keep 12 monthly backups
    };
    this.isBackupRunning = false;
    this.backupStats = {
      lastBackup: null,
      totalBackups: 0,
      successfulBackups: 0,
      failedBackups: 0,
      averageBackupSize: 0,
      nextScheduledBackup: null
    };
    
    this.initializeBackupService();
  }

  async initializeBackupService() {
    try {
      // Create backup directory
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Load existing backup stats
      await this.loadBackupStats();
      
      // Schedule automated backups
      this.scheduleAutomatedBackups();
      
      console.log('🔄 Backup service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize backup service:', error);
    }
  }

  /**
   * Create a full backup of all data
   */
  async createBackup(type = 'manual') {
    if (this.isBackupRunning) {
      throw new Error('Backup is already running');
    }

    this.isBackupRunning = true;
    const backupId = `backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Starting ${type} backup: ${backupId}`);
      
      const backupPath = path.join(this.backupDir, backupId);
      await fs.mkdir(backupPath, { recursive: true });
      
      // Backup MongoDB data
      const mongodbBackup = await this.backupMongoDB(backupPath);
      
      // Backup configuration files
      const configBackup = await this.backupConfiguration(backupPath);
      
      // Backup logs
      const logsBackup = await this.backupLogs(backupPath);
      
      // Create backup metadata
      const metadata = {
        id: backupId,
        type,
        timestamp: new Date().toISOString(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        components: {
          mongodb: mongodbBackup,
          configuration: configBackup,
          logs: logsBackup
        },
        size: await this.calculateBackupSize(backupPath),
        status: 'success'
      };
      
      // Save metadata
      await fs.writeFile(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      // Update stats
      this.updateBackupStats(metadata);
      
      console.log(`✅ Backup completed: ${backupId} (${metadata.duration}ms)`);
      
      return metadata;
      
    } catch (error) {
      console.error(`❌ Backup failed: ${backupId}`, error);
      
      // Update failure stats
      this.backupStats.failedBackups++;
      
      // Create error metadata
      const errorMetadata = {
        id: backupId,
        type,
        timestamp: new Date().toISOString(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
      
      // Save error metadata
      try {
        await fs.writeFile(
          path.join(this.backupDir, `${backupId}_error.json`),
          JSON.stringify(errorMetadata, null, 2)
        );
      } catch (writeError) {
        console.error('Failed to write error metadata:', writeError);
      }
      
      throw error;
    } finally {
      this.isBackupRunning = false;
    }
  }

  /**
   * Backup MongoDB data
   */
  async backupMongoDB(backupPath) {
    try {
      const mongodbPath = path.join(backupPath, 'mongodb');
      await fs.mkdir(mongodbPath, { recursive: true });
      
      // Get MongoDB connection details
      const { MONGODB_URI } = process.env;
      if (!MONGODB_URI) {
        throw new Error('MongoDB URI not configured');
      }
      
      // Use mongodump for backup
      const dumpCommand = `mongodump --uri="${MONGODB_URI}" --out="${mongodbPath}"`;
      
      console.log('📦 Creating MongoDB backup...');
      const { stdout, stderr } = await execAsync(dumpCommand);
      
      if (stderr && !stderr.includes('done')) {
        console.warn('MongoDB backup warning:', stderr);
      }
      
      return {
        success: true,
        path: mongodbPath,
        collections: await this.countDumpedCollections(mongodbPath)
      };
      
    } catch (error) {
      console.error('MongoDB backup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Backup configuration files
   */
  async backupConfiguration(backupPath) {
    try {
      const configPath = path.join(backupPath, 'config');
      await fs.mkdir(configPath, { recursive: true });
      
      const configFiles = [
        '.env',
        '.env.production',
        'package.json',
        'package-lock.json'
      ];
      
      const backedUpFiles = [];
      
      for (const file of configFiles) {
        try {
          const sourcePath = path.join(process.cwd(), file);
          const destPath = path.join(configPath, file);
          
          // Check if file exists
          await fs.access(sourcePath);
          
          // Copy file
          await fs.copyFile(sourcePath, destPath);
          backedUpFiles.push(file);
          
        } catch (error) {
          console.warn(`Could not backup ${file}:`, error.message);
        }
      }
      
      return {
        success: true,
        path: configPath,
        files: backedUpFiles
      };
      
    } catch (error) {
      console.error('Configuration backup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Backup log files
   */
  async backupLogs(backupPath) {
    try {
      const logsPath = path.join(backupPath, 'logs');
      await fs.mkdir(logsPath, { recursive: true });
      
      const logFiles = [
        'server.log',
        'frontend.log',
        'error.log'
      ];
      
      const backedUpFiles = [];
      
      for (const file of logFiles) {
        try {
          const sourcePath = path.join(process.cwd(), file);
          const destPath = path.join(logsPath, file);
          
          // Check if file exists
          await fs.access(sourcePath);
          
          // Copy file
          await fs.copyFile(sourcePath, destPath);
          backedUpFiles.push(file);
          
        } catch (error) {
          // Log files might not exist, that's okay
          console.debug(`Could not backup log ${file}:`, error.message);
        }
      }
      
      return {
        success: true,
        path: logsPath,
        files: backedUpFiles
      };
      
    } catch (error) {
      console.error('Logs backup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Count dumped collections
   */
  async countDumpedCollections(dumpPath) {
    try {
      const dbPath = path.join(dumpPath, 'bharat_biz_agent');
      const collections = await fs.readdir(dbPath);
      
      const collectionCount = collections.filter(item => {
        return item.endsWith('.bson') || item.endsWith('.json');
      }).length;
      
      return collectionCount;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate backup size
   */
  async calculateBackupSize(backupPath) {
    try {
      const { stdout } = await execAsync(`du -sb "${backupPath}"`);
      const size = parseInt(stdout.split('\t')[0]);
      return size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupId) {
    try {
      const backupPath = path.join(this.backupDir, backupId);
      const metadataPath = path.join(backupPath, 'metadata.json');
      
      // Check if backup exists
      await fs.access(backupPath);
      
      // Load metadata
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      
      if (metadata.status !== 'success') {
        throw new Error('Cannot restore from failed backup');
      }
      
      console.log(`🔄 Starting restore from backup: ${backupId}`);
      
      // Restore MongoDB
      if (metadata.components.mongodb.success) {
        await this.restoreMongoDB(path.join(backupPath, 'mongodb'));
      }
      
      // Restore configuration (optional - usually not recommended)
      // await this.restoreConfiguration(path.join(backupPath, 'config'));
      
      console.log(`✅ Restore completed: ${backupId}`);
      
      return {
        success: true,
        backupId,
        restoredAt: new Date().toISOString(),
        components: metadata.components
      };
      
    } catch (error) {
      console.error(`❌ Restore failed: ${backupId}`, error);
      throw error;
    }
  }

  /**
   * Restore MongoDB data
   */
  async restoreMongoDB(mongodbPath) {
    try {
      const { MONGODB_URI } = process.env;
      if (!MONGODB_URI) {
        throw new Error('MongoDB URI not configured');
      }
      
      // Use mongorestore for restore
      const restoreCommand = `mongorestore --uri="${MONGODB_URI}" --drop "${mongodbPath}"`;
      
      console.log('📦 Restoring MongoDB data...');
      const { stdout, stderr } = await execAsync(restoreCommand);
      
      if (stderr && !stderr.includes('done')) {
        console.warn('MongoDB restore warning:', stderr);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('MongoDB restore failed:', error);
      throw error;
    }
  }

  /**
   * List all backups
   */
  async listBackups() {
    try {
      const backups = [];
      const files = await fs.readdir(this.backupDir);
      
      for (const file of files) {
        if (file.startsWith('backup_') && !file.includes('_error')) {
          const backupPath = path.join(this.backupDir, file);
          const metadataPath = path.join(backupPath, 'metadata.json');
          
          try {
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
            backups.push(metadata);
          } catch (error) {
            // Skip corrupted backups
            console.warn(`Corrupted backup metadata: ${file}`);
          }
        }
      }
      
      // Sort by timestamp (newest first)
      backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return backups;
      
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId) {
    try {
      const backupPath = path.join(this.backupDir, backupId);
      
      // Check if backup exists
      await fs.access(backupPath);
      
      // Remove backup directory recursively
      await fs.rm(backupPath, { recursive: true, force: true });
      
      console.log(`🗑️ Backup deleted: ${backupId}`);
      
      return { success: true };
      
    } catch (error) {
      console.error(`Failed to delete backup: ${backupId}`, error);
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      const now = new Date();
      
      const retentionGroups = {
        daily: [],
        weekly: [],
        monthly: []
      };
      
      // Group backups by type
      for (const backup of backups) {
        const backupDate = new Date(backup.timestamp);
        const daysDiff = Math.floor((now - backupDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 7) {
          retentionGroups.daily.push(backup);
        } else if (daysDiff <= 30) {
          retentionGroups.weekly.push(backup);
        } else {
          retentionGroups.monthly.push(backup);
        }
      }
      
      // Keep only the required number of backups in each group
      const toDelete = [];
      
      // Keep latest daily backups
      if (retentionGroups.daily.length > this.backupRetention.daily) {
        toDelete.push(...retentionGroups.daily.slice(this.backupRetention.daily));
      }
      
      // Keep latest weekly backups
      if (retentionGroups.weekly.length > this.backupRetention.weekly) {
        toDelete.push(...retentionGroups.weekly.slice(this.backupRetention.weekly));
      }
      
      // Keep latest monthly backups
      if (retentionGroups.monthly.length > this.backupRetention.monthly) {
        toDelete.push(...retentionGroups.monthly.slice(this.backupRetention.monthly));
      }
      
      // Delete old backups
      for (const backup of toDelete) {
        await this.deleteBackup(backup.id);
      }
      
      console.log(`🧹 Cleaned up ${toDelete.length} old backups`);
      
      return { deleted: toDelete.length };
      
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
      return { deleted: 0, error: error.message };
    }
  }

  /**
   * Schedule automated backups
   */
  scheduleAutomatedBackups() {
    // Daily backup at 2 AM
    if (this.backupSchedule.daily) {
      setInterval(async () => {
        try {
          await this.createBackup('daily');
          await this.cleanupOldBackups();
        } catch (error) {
          console.error('Daily backup failed:', error);
        }
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }
    
    // Weekly backup on Sunday at 3 AM
    if (this.backupSchedule.weekly) {
      setInterval(async () => {
        const now = new Date();
        if (now.getDay() === 0 && now.getHours() === 3) {
          try {
            await this.createBackup('weekly');
          } catch (error) {
            console.error('Weekly backup failed:', error);
          }
        }
      }, 60 * 60 * 1000); // Check every hour
    }
    
    // Monthly backup on 1st at 4 AM
    if (this.backupSchedule.monthly) {
      setInterval(async () => {
        const now = new Date();
        if (now.getDate() === 1 && now.getHours() === 4) {
          try {
            await this.createBackup('monthly');
          } catch (error) {
            console.error('Monthly backup failed:', error);
          }
        }
      }, 60 * 60 * 1000); // Check every hour
    }
    
    console.log('⏰ Automated backup scheduling configured');
  }

  /**
   * Update backup statistics
   */
  updateBackupStats(metadata) {
    this.backupStats.lastBackup = metadata.timestamp;
    this.backupStats.totalBackups++;
    this.backupStats.successfulBackups++;
    
    // Update average size
    if (metadata.size > 0) {
      const totalSize = this.backupStats.averageBackupSize * (this.backupStats.successfulBackups - 1) + metadata.size;
      this.backupStats.averageBackupSize = Math.round(totalSize / this.backupStats.successfulBackups);
    }
    
    // Save stats
    this.saveBackupStats();
  }

  /**
   * Save backup statistics
   */
  async saveBackupStats() {
    try {
      const statsPath = path.join(this.backupDir, 'backup-stats.json');
      await fs.writeFile(statsPath, JSON.stringify(this.backupStats, null, 2));
    } catch (error) {
      console.error('Failed to save backup stats:', error);
    }
  }

  /**
   * Load backup statistics
   */
  async loadBackupStats() {
    try {
      const statsPath = path.join(this.backupDir, 'backup-stats.json');
      const stats = JSON.parse(await fs.readFile(statsPath, 'utf8'));
      this.backupStats = { ...this.backupStats, ...stats };
    } catch (error) {
      // Stats file doesn't exist, use defaults
      console.log('No existing backup stats found, using defaults');
    }
  }

  /**
   * Get backup statistics
   */
  getBackupStats() {
    return {
      ...this.backupStats,
      isBackupRunning: this.isBackupRunning,
      backupRetention: this.backupRetention,
      backupSchedule: this.backupSchedule
    };
  }

  /**
   * Export data to JSON format
   */
  async exportData(format = 'json') {
    try {
      const { getDatabase } = require('./database');
      const db = getDatabase();
      
      const collections = ['bots', 'conversations', 'approvals', 'customers', 'users', 'inventory', 'orders', 'invoices'];
      const exportData = {};
      
      for (const collectionName of collections) {
        try {
          const collection = db.collection(collectionName);
          const documents = await collection.find({}).toArray();
          exportData[collectionName] = documents;
        } catch (error) {
          console.warn(`Failed to export ${collectionName}:`, error.message);
          exportData[collectionName] = [];
        }
      }
      
      const exportId = `export_${Date.now()}`;
      const exportPath = path.join(this.backupDir, `${exportId}.${format}`);
      
      if (format === 'json') {
        await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
      }
      
      return {
        success: true,
        exportId,
        path: exportPath,
        size: (await fs.stat(exportPath)).size,
        recordCounts: Object.keys(exportData).reduce((acc, key) => {
          acc[key] = exportData[key].length;
          return acc;
        }, {})
      };
      
    } catch (error) {
      console.error('Data export failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
const backupService = new BackupService();

module.exports = backupService;
