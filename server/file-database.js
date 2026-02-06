/**
 * Persistent File-Based Database for Bharat Biz-Agent
 * Provides data persistence when MongoDB is not available
 */

const fs = require('fs').promises;
const path = require('path');

class FileDatabase {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  getFilePath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  async readFile(collection) {
    try {
      const filePath = this.getFilePath(collection);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted
      return [];
    }
  }

  async writeFile(collection, data) {
    const filePath = this.getFilePath(collection);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Collection operations
  collection(name) {
    return {
      find: (query = {}) => ({
        toArray: async () => {
          const data = await this.readFile(name);
          return this.filterData(data, query);
        }
      }),

      findOne: async (query = {}) => {
        const data = await this.readFile(name);
        const filtered = this.filterData(data, query);
        return filtered.length > 0 ? filtered[0] : null;
      },

      insertOne: async (doc) => {
        const data = await this.readFile(name);
        const newDoc = { 
          ...doc, 
          _id: doc._id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString()
        };
        data.push(newDoc);
        await this.writeFile(name, data);
        return { insertedId: newDoc._id };
      },

      insertMany: async (docs) => {
        const data = await this.readFile(name);
        const newDocs = docs.map(doc => ({
          ...doc,
          _id: doc._id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString()
        }));
        data.push(...newDocs);
        await this.writeFile(name, data);
        return { insertedIds: newDocs.map(doc => doc._id) };
      },

      updateOne: async (query, update) => {
        const data = await this.readFile(name);
        const index = this.findIndex(data, query);
        
        if (index !== -1) {
          if (update.$set) {
            data[index] = { ...data[index], ...update.$set, updatedAt: new Date().toISOString() };
          }
          if (update.$inc) {
            Object.keys(update.$inc).forEach(key => {
              data[index][key] = (data[index][key] || 0) + update.$inc[key];
            });
            data[index].updatedAt = new Date().toISOString();
          }
          await this.writeFile(name, data);
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      },

      deleteOne: async (query) => {
        const data = await this.readFile(name);
        const index = this.findIndex(data, query);
        
        if (index !== -1) {
          data.splice(index, 1);
          await this.writeFile(name, data);
          return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
      },

      aggregate: async (pipeline) => {
        const data = await this.readFile(name);
        
        // Simple aggregation for stats
        if (pipeline.length > 0 && pipeline[0].$group) {
          const groupStage = pipeline[0].$group;
          const grouped = {};
          
          data.forEach(item => {
            const key = this.getGroupKey(item, groupStage._id);
            if (!grouped[key]) {
              grouped[key] = [];
            }
            grouped[key].push(item);
          });
          
          // Convert groups to aggregation result format
          return Object.keys(grouped).map(key => ({
            _id: key,
            count: grouped[key].length,
            ...groupStage
          }));
        }
        
        return data;
      }
    };
  }

  findIndex(data, query) {
    if (query._id) {
      return data.findIndex(item => item._id === query._id);
    }
    if (query.id) {
      return data.findIndex(item => item.id === query.id);
    }
    if (query.customerId) {
      return data.findIndex(item => item.customerId === query.customerId);
    }
    if (query.orderId) {
      return data.findIndex(item => item.orderId === query.orderId);
    }
    return -1;
  }

  getGroupKey(item, groupId) {
    if (typeof groupId === 'string') {
      return item[groupId] || 'unknown';
    }
    if (typeof groupId === 'object' && groupId !== null) {
      return Object.keys(groupId).map(key => item[key] || 'unknown').join('_');
    }
    return 'unknown';
  }

  filterData(data, query) {
    let filtered = [...data];

    // Handle basic equality filters
    Object.keys(query).forEach(key => {
      if (key === '_id' || key === 'id' || key === 'customerId' || key === 'orderId') {
        filtered = filtered.filter(item => item[key] === query[key]);
      }
      
      // Handle date range filters
      if (key === 'createdAt' && query[key].$gte) {
        const startDate = new Date(query[key].$gte);
        const endDate = query[key].$lte ? new Date(query[key].$lte) : new Date();
        filtered = filtered.filter(item => {
          const itemDate = new Date(item.createdAt);
          return itemDate >= startDate && itemDate <= endDate;
        });
      }
      
      // Handle low stock expression
      if (key === '$expr' && query[key].$lte) {
        filtered = filtered.filter(item => item.quantity <= item.lowStockThreshold);
      }
    });

    return filtered;
  }

  // Backup and restore functionality
  async backup() {
    try {
      const backup = {};
      const collections = ['bots', 'conversations', 'approvals', 'orders', 'customers', 'audit_logs', 'inventory', 'ai_responses', 'system_config'];
      
      for (const collection of collections) {
        backup[collection] = await this.readFile(collection);
      }
      
      const backupPath = path.join(this.dataDir, `backup_${Date.now()}.json`);
      await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');
      console.log(`📦 Database backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('Backup failed:', error);
      throw error;
    }
  }

  async restore(backupPath) {
    try {
      const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      
      for (const [collection, data] of Object.entries(backup)) {
        await this.writeFile(collection, data);
      }
      
      console.log(`📦 Database restored from: ${backupPath}`);
      return true;
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }
}

module.exports = FileDatabase;
