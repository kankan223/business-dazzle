/**
 * API Service for Bharat Biz-Agent Frontend
 * Handles communication with backend server and WebSocket connections
 */

import { io, Socket } from 'socket.io-client';

// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3003';
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

// Validate required environment variables
if (!ADMIN_API_KEY) {
  console.error('❌ VITE_ADMIN_API_KEY is not configured. Please set it in your .env file.');
  throw new Error('Admin API key is required. Please configure VITE_ADMIN_API_KEY in your environment.');
}

// Types
export interface Bot {
  botId: string;
  id: string; // For backward compatibility
  name: string;
  platform: 'whatsapp' | 'telegram';
  status: 'active' | 'inactive' | 'error' | 'paused' | 'connecting';
  connectedCustomers: number;
  totalMessages: number;
  capabilities: string[];
  createdAt: string;
  lastActive: string;
  phoneNumber?: string;
  apiKey?: string;
  pendingApprovals?: number;
  lastActivity?: string;
  encryptionEnabled?: boolean;
  autoApproveThreshold?: number;
  voiceEnabled?: boolean;
}

export interface Conversation {
  id: string;
  customerId: string;
  botId: string;
  customerName: string;
  customerPhone: string;
  messages: Message[];
  lastMessageAt: string;
  createdAt: string;
  status?: 'active' | 'waiting_approval' | 'closed';
  platform?: 'whatsapp' | 'telegram';
}

export interface Message {
  id: string;
  sender: 'customer' | 'bot' | 'admin';
  text: string;
  content: string; // For backward compatibility
  timestamp: string;
  type?: 'text' | 'image' | 'document' | 'customer' | 'bot' | 'admin';
  translated?: boolean;
  language?: string;
}

export interface Approval {
  id: string;
  botId: string;
  botName: string;
  customerName: string;
  customerPhone: string;
  action: 'generate_invoice' | 'process_payment' | 'update_inventory' | 'share_data' | 'refund';
  details: {
    amount?: number;
    items?: string[];
    reason?: string;
    [key: string]: unknown;
  };
  requestedAt: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'approved' | 'rejected';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface Stats {
  totalBots: number;
  activeBots: number;
  pendingApprovals: number;
  totalCustomers: number;
  totalMessages: number;
  botHandledOrders: number;
  revenue: number;
  totalRevenue: number; // For backward compatibility
}

export interface AIInsights {
  insights: string;
  recommendations: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface SecurityLog {
  action: string;
  details: Record<string, unknown>;
  userId: string;
  timestamp: string;
  ip: string;
}

// WebSocket service
class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(WS_URL, {
          transports: ['websocket'],
          autoConnect: true
        });

        this.socket.on('connect', () => {
          console.log('🔌 Connected to server WebSocket');
          resolve();
        });

        this.socket.on('disconnect', () => {
          console.log('🔌 Disconnected from server WebSocket');
        });

        this.socket.on('connect_error', (error) => {
          console.error('🔌 WebSocket connection error:', error);
          reject(error);
        });

        // Set up event listeners
        this.setupEventListeners();
      } catch (error) {
        reject(error);
      }
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Listen for real-time updates
    this.socket.on('approval_updated', (data) => {
      this.emit('approval_updated', data);
    });

    this.socket.on('approval.created', (data) => {
      this.emit('approval_created', data);
    });

    this.socket.on('order.created', (data) => {
      this.emit('order_created', data);
    });

    this.socket.on('conversation.updated', (data) => {
      this.emit('conversation_updated', data);
    });

    this.socket.on('new_message', (data) => {
      this.emit('new_message', data);
    });

    this.socket.on('bot_status_changed', (data) => {
      this.emit('bot_status_changed', data);
    });

    this.socket.on('new_approval', (data) => {
      this.emit('new_approval', data);
    });

    this.socket.on('debug.event', (data) => {
      this.emit('debug_event', data);
    });
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }

  // Public method to emit events to server
  emitToServer(event: string, data: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// API Service
export class ApiService {
  public wsService = new WebSocketService();

  // Initialize WebSocket connection
  async initializeWebSocket(): Promise<void> {
    try {
      await this.wsService.connect();
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      // Don't throw error, allow app to work without WebSocket
    }
  }

  // WebSocket event listeners
  onApprovalUpdate(callback: (data: { id: string; status: string; resolvedBy: string }) => void) {
    this.wsService.on('approval_updated', callback);
  }

  onApprovalCreated(callback: (data: any) => void) {
    this.wsService.on('approval_created', callback);
  }

  onOrderCreated(callback: (data: any) => void) {
    this.wsService.on('order_created', callback);
  }

  onConversationUpdated(callback: (data: any) => void) {
    this.wsService.on('conversation_updated', callback);
  }

  onDebugEvent(callback: (data: any) => void) {
    this.wsService.on('debug_event', callback);
  }

  onNewMessage(callback: (data: any) => void) {
    this.wsService.on('new_message', callback);
  }

  onConversationUpdate(callback: (data: any) => void) {
    this.wsService.on('conversation_update', callback);
  }

  onBotUpdate(callback: (data: any) => void) {
    this.wsService.on('bot_update', callback);
  }

  onOrderUpdate(callback: (data: any) => void) {
    this.wsService.on('order_update', callback);
  }

  onError(callback: (error: any) => void) {
    this.wsService.on('error', callback);
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.wsService.on('connection_change', callback);
  }

  // Send admin message via WebSocket
  sendAdminMessage(message: string, conversationId?: string) {
    this.wsService.emitToServer('admin_message', {
      message,
      conversationId,
      timestamp: new Date().toISOString(),
      sender: 'admin'
    });
  }

  // Update conversation status
  updateConversationStatus(conversationId: string, status: string) {
    this.wsService.emitToServer('conversation_status', {
      conversationId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  // API endpoints
  async getBots(): Promise<Bot[]> {
    const response = await fetch(`${API_BASE_URL}/api/bots`);
    if (!response.ok) throw new Error('Failed to fetch bots');
    return response.json();
  }

  async getConversations(): Promise<Conversation[]> {
    const response = await fetch(`${API_BASE_URL}/api/conversations`);
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return response.json();
  }

  async getApprovals(): Promise<Approval[]> {
    const response = await fetch(`${API_BASE_URL}/api/approvals`);
    if (!response.ok) throw new Error('Failed to fetch approvals');
    return response.json();
  }

  async updateApproval(id: string, status: 'approved' | 'rejected', resolvedBy: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/approvals/${id}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, resolvedBy }),
    });
    if (!response.ok) throw new Error('Failed to update approval');
  }

  async getStats(): Promise<Stats> {
    const response = await fetch(`${API_BASE_URL}/api/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  }

  async getInsights(): Promise<AIInsights> {
    const response = await fetch(`${API_BASE_URL}/api/insights`);
    if (!response.ok) throw new Error('Failed to fetch insights');
    return response.json();
  }

  async getSecurityLogs(): Promise<SecurityLog[]> {
    const response = await fetch(`${API_BASE_URL}/api/security/logs`);
    if (!response.ok) throw new Error('Failed to fetch security logs');
    return response.json();
  }

  // AI chat endpoint
  async sendAIMessage(message: string, customerContext: Record<string, any>, conversationHistory: Message[]): Promise<{
    response: string;
    approvalNeeded: boolean;
    confidence: number;
    suggestedActions: string[];
    language: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, customerContext, conversationHistory }),
    });
    if (!response.ok) throw new Error('Failed to process AI message');
    return response.json();
  }

  static async aiChat(message: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      },
      body: JSON.stringify({ message })
    });
    return response.json();
  }

  static async speechToText(audioFile: File, language: string = 'en-IN'): Promise<any> {
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('language', language);

    const response = await fetch(`${API_BASE_URL}/api/speech-to-text`, {
      method: 'POST',
      body: formData
    });
    return response.json();
  }

  static async directCommand(command: string, platform: string = 'web', userId?: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}//api/direct-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      },
      body: JSON.stringify({ command, platform, userId })
    });
    return response.json();
  }

  static async getSpeechLanguages(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/speech-languages`);
    return response.json();
  }

  // Inventory API methods
  async getInventory(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/inventory`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch inventory');
    const result = await response.json();
    return result.data;
  }

  async addInventoryItem(item: {
    name: string;
    sku: string;
    quantity: number;
    unit: string;
    price: number;
    lowStockThreshold?: number;
  }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      },
      body: JSON.stringify(item)
    });
    if (!response.ok) throw new Error('Failed to add inventory item');
    const result = await response.json();
    return result.data;
  }

  async updateInventoryItem(id: string, updateData: {
    name?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    lowStockThreshold?: number;
  }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/inventory/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      },
      body: JSON.stringify(updateData)
    });
    if (!response.ok) throw new Error('Failed to update inventory item');
    const result = await response.json();
    return result.data;
  }

  async deleteInventoryItem(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/inventory/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to delete inventory item');
  }

  // Orders API methods
  async getOrders(filters?: {
    customerId?: string;
    status?: string;
    platform?: string;
  }): Promise<any[]> {
    const params = new URLSearchParams(filters as any).toString();
    const response = await fetch(`${API_BASE_URL}/api/orders${params ? '?' + params : ''}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch orders');
    const result = await response.json();
    return result.data;
  }

  async createOrder(order: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    items: Array<{
      product: string;
      quantity: number;
      price: number;
      unit: string;
    }>;
    platform?: string;
  }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      },
      body: JSON.stringify(order)
    });
    if (!response.ok) throw new Error('Failed to create order');
    const result = await response.json();
    return result.data;
  }

  // Activity API method
  async getActivity(timeRange: string = '24h'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/activity?timeRange=${timeRange}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch activity data');
    const result = await response.json();
    return result.data;
  }

  // WebSocket event listeners for new features
  onInventoryUpdate(callback: (data: any) => void) {
    this.wsService.on('inventory_updated', callback);
  }

  onLowStockWarning(callback: (data: any) => void) {
    this.wsService.on('low_stock_warning', callback);
  }

  onNewOrder(callback: (data: any) => void) {
    this.wsService.on('new_order', callback);
  }

  onNewApproval(callback: (data: any) => void) {
    this.wsService.on('new_approval', callback);
  }

  // Order tracking methods
  async getOrderById(orderId: string) {
    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch order');
    const result = await response.json();
    return result.data;
  }

  async updateOrderStatus(orderId: string, status: string, updatedBy?: string) {
    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status, updatedBy })
    });
    if (!response.ok) throw new Error('Failed to update order status');
    const result = await response.json();
    return result.data;
  }

  async getOrdersByCustomerId(customerId: string) {
    const response = await fetch(`${API_BASE_URL}/api/orders/customer/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch customer orders');
    const result = await response.json();
    return result.data;
  }

  async getTrackingInfo(trackingId: string) {
    const response = await fetch(`${API_BASE_URL}/api/orders/tracking/${trackingId}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch tracking info');
    const result = await response.json();
    return result.data;
  }

  onOrderStatusUpdate(callback: (data: any) => void) {
    this.wsService.on('order_status_updated', callback);
  }

  // Low stock warning methods
  async getLowStockItems() {
    const response = await fetch(`${API_BASE_URL}/api/inventory/low-stock`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch low stock items');
    const result = await response.json();
    return result.data;
  }

  async checkLowStock() {
    const response = await fetch(`${API_BASE_URL}/api/inventory/check-low-stock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to check low stock');
    const result = await response.json();
    return result.data;
  }

  // Users API methods
  async getUsers(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    const result = await response.json();
    return result.data;
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to delete user');
  }

  // Database management methods
  async getDatabaseInfo(): Promise<{ collections: Record<string, number>; totalRecords: number }> {
    const response = await fetch(`${API_BASE_URL}/api/database/info`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`
      }
    });
    if (!response.ok) throw new Error('Failed to get database info');
    const result = await response.json();
    return result.data;
  }

  async resetDatabase(confirmation: string): Promise<{ message: string; deletedRecords: Record<string, number>; totalDeleted: number }> {
    const response = await fetch(`${API_BASE_URL}/api/database/reset`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ confirmation })
    });
    if (!response.ok) throw new Error('Failed to reset database');
    return response.json();
  }

  // Health check
  async healthCheck(): Promise<{ status: string; services: Record<string, string> }> {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  }

  // Cleanup
  disconnect() {
    this.wsService.disconnect();
  }

  // Notification API methods
  async getNotifications(userId?: string, limit: number = 50, unreadOnly: boolean = false): Promise<any> {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    params.append('limit', limit.toString());
    if (unreadOnly) params.append('unreadOnly', 'true');
    
    const response = await fetch(`${API_BASE_URL}/api/notifications?${params}`);
    if (!response.ok) throw new Error('Failed to fetch notifications');
    return response.json();
  }

  async getUnreadNotificationsCount(userId?: string): Promise<number> {
    const params = userId ? `?userId=${userId}` : '';
    const response = await fetch(`${API_BASE_URL}/api/notifications/unread-count${params}`);
    if (!response.ok) throw new Error('Failed to fetch unread count');
    const result = await response.json();
    return result.unreadCount;
  }

  async markNotificationAsRead(notificationId: string, userId?: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId || 'system' })
    });
    if (!response.ok) throw new Error('Failed to mark notification as read');
  }

  async markAllNotificationsAsRead(userId?: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId || 'system' })
    });
    if (!response.ok) throw new Error('Failed to mark all notifications as read');
  }

  async deleteNotification(notificationId: string, userId?: string): Promise<void> {
    const params = userId ? `?userId=${userId}` : '';
    const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}${params}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete notification');
  }

  async getNotificationStats(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/stats`);
    if (!response.ok) throw new Error('Failed to fetch notification stats');
    const result = await response.json();
    return result.data;
  }

  async createNotification(type: string, title: string, message: string, data: any = {}, priority: string = 'normal'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, message, data, priority })
    });
    if (!response.ok) throw new Error('Failed to create notification');
    const result = await response.json();
    return result.data;
  }

  // Analytics API methods
  async getCustomerAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/customers?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch customer analytics');
    const result = await response.json();
    return result.data;
  }

  async getCustomerSegments(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/segments?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch customer segments');
    const result = await response.json();
    return result.data;
  }

  async getTopCustomers(timeRange: string = '30d', limit: number = 10): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/top-customers?timeRange=${timeRange}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch top customers');
    const result = await response.json();
    return result.data;
  }

  async getRevenueAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/revenue?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch revenue analytics');
    const result = await response.json();
    return result.data;
  }

  async getEngagementAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/engagement?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch engagement analytics');
    const result = await response.json();
    return result.data;
  }

  async getBehaviorAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/behavior?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch behavior analytics');
    const result = await response.json();
    return result.data;
  }

  async getGeographicAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/geographic?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch geographic analytics');
    const result = await response.json();
    return result.data;
  }

  async getConversionAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/conversion?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch conversion analytics');
    const result = await response.json();
    return result.data;
  }

  async getTrendsAnalytics(timeRange: string = '30d'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/trends?timeRange=${timeRange}`);
    if (!response.ok) throw new Error('Failed to fetch trends analytics');
    const result = await response.json();
    return result.data;
  }

  async generateAnalyticsReport(timeRange: string = '30d', format: string = 'json'): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/analytics/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeRange, format })
    });
    if (!response.ok) throw new Error('Failed to generate analytics report');
    const result = await response.json();
    return result.data;
  }

  // Search API methods
  async performSearch(searchParams: {
    query: string;
    collections?: string[];
    filters?: any;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchParams)
    });
    if (!response.ok) throw new Error('Search failed');
    const result = await response.json();
    return result.data;
  }

  async getSearchSuggestions(query: string, limit: number = 10): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/search/suggestions?query=${encodeURIComponent(query)}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to get search suggestions');
    const result = await response.json();
    return result.data;
  }

  async getSearchStats(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/search/stats`);
    if (!response.ok) throw new Error('Failed to get search stats');
    const result = await response.json();
    return result.data;
  }

  async rebuildSearchIndex(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/search/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to rebuild search index');
    const result = await response.json();
    return result;
  }

  async getPopularSearchTerms(limit: number = 10): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/search/popular?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to get popular search terms');
    const result = await response.json();
    return result.data;
  }

  async searchByCollection(collection: string, params: {
    query: string;
    filters?: any;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    queryParams.append('query', params.query);
    
    if (params.filters) {
      queryParams.append('filters', JSON.stringify(params.filters));
    }
    if (params.sortBy) {
      queryParams.append('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      queryParams.append('sortOrder', params.sortOrder);
    }
    if (params.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params.offset) {
      queryParams.append('offset', params.offset.toString());
    }
    
    const response = await fetch(`${API_BASE_URL}/api/search/${collection}?${queryParams}`);
    if (!response.ok) throw new Error('Collection search failed');
    const result = await response.json();
    return result.data;
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Export types
export type { WebSocketService };
