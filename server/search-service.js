/**
 * Advanced Search Service for Bharat Biz-Agent
 * Provides comprehensive search and filtering capabilities across all data
 */

class SearchService {
  constructor() {
    this.searchIndex = new Map();
    this.initializeSearchIndex();
  }

  /**
   * Initialize search index with all searchable data
   */
  async initializeSearchIndex() {
    try {
      const { getDatabase } = require('./database');
      const db = getDatabase();
      
      // Check if database is available
      if (!db) {
        console.warn('⚠️ Database not available, skipping search index initialization');
        return;
      }
      
      // Index all collections for search
      const collections = [
        'customers',
        'conversations', 
        'orders',
        'invoices',
        'approvals',
        'inventory',
        'users'
      ];

      let totalIndexed = 0;
      
      for (const collectionName of collections) {
        try {
          const collection = db.collection(collectionName);
          const documents = await collection.find({}).toArray();
          
          if (documents.length > 0) {
            documents.forEach(doc => {
              this.indexDocument(collectionName, doc);
            });
            
            console.log(`📚 Indexed ${documents.length} documents from ${collectionName}`);
            totalIndexed += documents.length;
          } else {
            console.log(`📚 No documents found in ${collectionName}`);
          }
        } catch (error) {
          console.warn(`Failed to index ${collectionName}:`, error.message);
        }
      }
      
      console.log(`✅ Search index initialized with ${totalIndexed} total documents`);
    } catch (error) {
      console.error('❌ Failed to initialize search index:', error);
    }
  }

  /**
   * Index a document for search
   */
  indexDocument(collection, document) {
    const id = document._id || document.id;
    const searchableText = this.extractSearchableText(document);
    
    this.searchIndex.set(`${collection}:${id}`, {
      collection,
      id,
      document,
      searchableText: searchableText.toLowerCase(),
      indexedAt: new Date()
    });
  }

  /**
   * Extract searchable text from document
   */
  extractSearchableText(document) {
    const fields = [
      document.name,
      document.email,
      document.phone,
      document.title,
      document.description,
      document.message,
      document.content,
      document.notes,
      document.status,
      document.platform,
      document.productName,
      document.customerName,
      document.totalAmount?.toString(),
      document.quantity?.toString(),
      document.price?.toString()
    ];

    return fields.filter(Boolean).join(' ');
  }

  /**
   * Perform advanced search with filters
   */
  async search(query, options = {}) {
    const {
      collections = [],
      filters = {},
      sortBy = 'relevance',
      sortOrder = 'desc',
      limit = 50,
      offset = 0
    } = options;

    try {
      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
      const results = [];

      // Search through indexed documents
      for (const [key, indexedDoc] of this.searchIndex.entries()) {
        // Filter by collections if specified
        if (collections.length > 0 && !collections.includes(indexedDoc.collection)) {
          continue;
        }

        // Apply filters
        if (!this.matchesFilters(indexedDoc.document, filters)) {
          continue;
        }

        // Calculate relevance score
        const score = this.calculateRelevanceScore(indexedDoc.searchableText, searchTerms);
        
        if (score > 0) {
          results.push({
            ...indexedDoc.document,
            collection: indexedDoc.collection,
            score,
            highlights: this.generateHighlights(indexedDoc.searchableText, searchTerms)
          });
        }
      }

      // Sort results
      const sortedResults = this.sortResults(results, sortBy, sortOrder);
      
      // Apply pagination
      const paginatedResults = sortedResults.slice(offset, offset + limit);

      return {
        results: paginatedResults,
        total: results.length,
        query,
        filters,
        hasMore: offset + limit < results.length
      };

    } catch (error) {
      console.error('Search error:', error);
      return {
        results: [],
        total: 0,
        query,
        filters,
        hasMore: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate relevance score for search results
   */
  calculateRelevanceScore(text, searchTerms) {
    let score = 0;
    
    searchTerms.forEach(term => {
      // Exact match gets highest score
      if (text.includes(term)) {
        score += 10;
      }
      
      // Partial match gets lower score
      const words = text.split(' ');
      words.forEach(word => {
        if (word.includes(term) || term.includes(word)) {
          score += 5;
        }
      });
    });

    return score;
  }

  /**
   * Generate search highlights
   */
  generateHighlights(text, searchTerms) {
    const highlights = [];
    
    searchTerms.forEach(term => {
      if (text.includes(term)) {
        // Find context around the match
        const index = text.indexOf(term);
        const start = Math.max(0, index - 20);
        const end = Math.min(text.length, index + term.length + 20);
        const context = text.substring(start, end).trim();
        
        highlights.push({
          term,
          context: context.replace(term, `**${term}**`)
        });
      }
    });

    return highlights;
  }

  /**
   * Check if document matches filters
   */
  matchesFilters(document, filters) {
    // Date range filter
    if (filters.dateRange) {
      const docDate = new Date(document.createdAt || document.timestamp);
      const now = new Date();
      const daysAgo = filters.dateRange;
      const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      
      if (docDate < cutoffDate) {
        return false;
      }
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(document.status)) {
        return false;
      }
    }

    // Platform filter
    if (filters.platform && filters.platform.length > 0) {
      if (!filters.platform.includes(document.platform)) {
        return false;
      }
    }

    // Amount range filter
    if (filters.amountRange) {
      const amount = document.totalAmount || document.price || 0;
      if (amount < filters.amountRange.min || amount > filters.amountRange.max) {
        return false;
      }
    }

    // Custom field filters
    if (filters.customFields) {
      for (const [field, value] of Object.entries(filters.customFields)) {
        if (document[field] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Sort search results
   */
  sortResults(results, sortBy, sortOrder) {
    const sorted = [...results].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'relevance':
          comparison = b.score - a.score;
          break;
        case 'date':
          const dateA = new Date(a.createdAt || a.timestamp || 0);
          const dateB = new Date(b.createdAt || b.timestamp || 0);
          comparison = dateB.getTime() - dateA.getTime();
          break;
        case 'amount':
          const amountA = a.totalAmount || a.price || 0;
          const amountB = b.totalAmount || b.price || 0;
          comparison = amountB - amountA;
          break;
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'desc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(query, limit = 10) {
    try {
      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
      const suggestions = new Set();

      // Extract common terms from indexed documents
      for (const indexedDoc of this.searchIndex.values()) {
        const words = indexedDoc.searchableText.split(' ');
        
        words.forEach(word => {
          if (word.length > 2 && searchTerms.some(term => word.includes(term))) {
            suggestions.add(word);
          }
        });
      }

      return Array.from(suggestions).slice(0, limit);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * Get search statistics
   */
  getSearchStats() {
    const stats = {
      totalDocuments: this.searchIndex.size,
      collections: {},
      lastIndexed: null
    };

    for (const indexedDoc of this.searchIndex.values()) {
      stats.collections[indexedDoc.collection] = (stats.collections[indexedDoc.collection] || 0) + 1;
      
      if (!stats.lastIndexed || indexedDoc.indexedAt > stats.lastIndexed) {
        stats.lastIndexed = indexedDoc.indexedAt;
      }
    }

    return stats;
  }

  /**
   * Rebuild search index
   */
  async rebuildIndex() {
    console.log('🔄 Rebuilding search index...');
    this.searchIndex.clear();
    await this.initializeSearchIndex();
    console.log('✅ Search index rebuilt');
  }

  /**
   * Add or update document in search index
   */
  updateDocument(collection, document) {
    const id = document._id || document.id;
    this.indexDocument(collection, document);
  }

  /**
   * Remove document from search index
   */
  removeDocument(collection, id) {
    this.searchIndex.delete(`${collection}:${id}`);
  }

  /**
   * Get popular search terms
   */
  getPopularTerms(limit = 10) {
    const terms = new Map();
    
    // This would typically come from search logs
    // For now, return some common business terms
    const commonTerms = [
      'order', 'invoice', 'customer', 'product', 'payment',
      'refund', 'support', 'help', 'status', 'delivery'
    ];

    return commonTerms.slice(0, limit).map((term, index) => ({
      term,
      count: Math.floor(Math.random() * 100) + 1 // Mock count
    }));
  }
}

// Create singleton instance
const searchService = new SearchService();

module.exports = searchService;
