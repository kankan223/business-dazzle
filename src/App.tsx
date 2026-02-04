import { useState, useCallback, useMemo } from 'react';
import { getTimeAgo } from '@/hooks/use-time-ago';
import { SidebarItem } from '@/components/sidebar-item';
import {
  Bot, MessageSquare, FileText, Package, Shield, Bell,
  Settings, BarChart3, CheckCircle, XCircle,
  Filter, Phone, Mic, Send, RefreshCw, Lock,
  Database, Activity, CheckCheck,
  Menu, Plus,
  Eye, Download, Play, Pause, Key, Fingerprint,
  AlertTriangle, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './App.css';
import { useEffect } from 'react';
import { useRef } from 'react';

// ==================== TYPES ====================

interface BotInstance {
  id: string;
  name: string;
  platform: 'whatsapp' | 'telegram';
  status: 'active' | 'paused' | 'error' | 'connecting';
  phoneNumber?: string;
  apiKey: string;
  connectedCustomers: number;
  pendingApprovals: number;
  lastActivity: string;
  encryptionEnabled: boolean;
  autoApproveThreshold: number;
  voiceEnabled: boolean;
}

interface PendingApproval {
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

interface CustomerConversation {
  id: string;
  customerName: string;
  customerPhone: string;
  botId: string;
  botName: string;
  platform: 'whatsapp' | 'telegram';
  messages: Message[];
  lastMessageAt: string;
  status: 'active' | 'closed' | 'waiting_approval';
  tags: string[];
}

interface Message {
  id: string;
  type: 'customer' | 'bot' | 'admin' | 'system';
  content: string;
  timestamp: string;
  mediaUrl?: string;
  requiresApproval?: boolean;
  translated?: boolean;
  originalContent?: string;
  language?: 'en' | 'hi' | 'hinglish';
}

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  gstAmount: number;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  botHandled: boolean;
  invoiceGenerated?: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  price: number;
  lowStockThreshold: number;
  inquiries: number;
}

interface SecurityLog {
  id: string;
  event: string;
  user: string;
  ip: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  details: string;
}

// ==================== LANGUAGE DETECTION ====================

function detectLanguage(text: string): 'en' | 'hi' | 'hinglish' {
  const hindiRegex = /[\u0900-\u097F]/;
  const hinglishWords = ['hai', 'hoon', 'aap', 'kaise', 'karo', 'bhejo', 'dena', 'lena', 'rupee', 'rupey', 'kal', 'aaj', 'mujhe', 'chahiye', 'karna', 'karo', 'batao', 'bataiye', 'kitna', 'kitne'];
  
  if (hindiRegex.test(text)) return 'hi';
  const lowerText = text.toLowerCase();
  if (hinglishWords.some(word => lowerText.includes(word))) return 'hinglish';
  return 'en';
}

// ==================== MOCK DATA ====================

const mockBots: BotInstance[] = [
  { id: 'bot-1', name: 'Sales Bot - Primary', platform: 'whatsapp', status: 'active', phoneNumber: '+91-98765-43210', apiKey: 'wa_api_****1234', connectedCustomers: 156, pendingApprovals: 3, lastActivity: new Date().toISOString(), encryptionEnabled: true, autoApproveThreshold: 5000, voiceEnabled: true },
  { id: 'bot-2', name: 'Support Bot', platform: 'telegram', status: 'active', apiKey: 'tg_api_****5678', connectedCustomers: 89, pendingApprovals: 1, lastActivity: new Date(Date.now() - 1000 * 60 * 5).toISOString(), encryptionEnabled: true, autoApproveThreshold: 10000, voiceEnabled: true },
  { id: 'bot-3', name: 'Order Bot', platform: 'whatsapp', status: 'paused', phoneNumber: '+91-98765-43211', apiKey: 'wa_api_****9012', connectedCustomers: 45, pendingApprovals: 0, lastActivity: new Date(Date.now() - 1000 * 60 * 30).toISOString(), encryptionEnabled: false, autoApproveThreshold: 3000, voiceEnabled: false },
];

const mockApprovals: PendingApproval[] = [
  { id: 'app-1', botId: 'bot-1', botName: 'Sales Bot - Primary', customerName: 'Rahul Sharma', customerPhone: '+91-98765-11111', action: 'generate_invoice', details: { amount: 15400, items: ['Rice 100kg', 'Sugar 50kg'] }, requestedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(), priority: 'medium', status: 'pending' },
  { id: 'app-2', botId: 'bot-1', botName: 'Sales Bot - Primary', customerName: 'Priya Patel', customerPhone: '+91-98765-22222', action: 'process_payment', details: { amount: 8500, method: 'UPI' }, requestedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), priority: 'high', status: 'pending' },
  { id: 'app-3', botId: 'bot-2', botName: 'Support Bot', customerName: 'Amit Kumar', customerPhone: '+91-98765-33333', action: 'share_data', details: { dataType: 'order_history', reason: 'Customer dispute' }, requestedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(), priority: 'urgent', status: 'pending' },
];

const mockConversations: CustomerConversation[] = [
  {
    id: 'conv-1',
    customerName: 'Rahul Sharma',
    customerPhone: '+91-98765-11111',
    botId: 'bot-1',
    botName: 'Sales Bot - Primary',
    platform: 'whatsapp',
    messages: [
      { id: 'm1', type: 'customer', content: 'Namaste, mujhe 100kg chawal chahiye', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), language: 'hinglish' },
      { id: 'm2', type: 'bot', content: 'Namaste Rahul ji! 100kg Basmati Rice ka rate ₹120/kg hai. Total ₹12,000 + GST. Kya confirm karna hai?', timestamp: new Date(Date.now() - 1000 * 60 * 29).toISOString(), language: 'hinglish' },
      { id: 'm3', type: 'customer', content: 'Haan bhej do, aur 50kg cheeni bhi', timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(), language: 'hinglish' },
      { id: 'm4', type: 'system', content: '⚠️ Admin approval required for invoice ₹15,400', timestamp: new Date(Date.now() - 1000 * 60 * 24).toISOString(), requiresApproval: true },
    ],
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    status: 'waiting_approval',
    tags: ['order', 'pending-approval']
  },
  {
    id: 'conv-2',
    customerName: 'Priya Patel',
    customerPhone: '+91-98765-22222',
    botId: 'bot-1',
    botName: 'Sales Bot - Primary',
    platform: 'whatsapp',
    messages: [
      { id: 'm1', type: 'customer', content: 'Mera payment status kya hai?', timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), language: 'hinglish' },
      { id: 'm2', type: 'bot', content: 'Priya ji, aapka ₹8,500 payment pending hai. Due date 15 Jan 2024. Payment karna hai?', timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(), language: 'hinglish' },
      { id: 'm3', type: 'customer', content: 'Haan abhi karta hoon UPI se', timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(), language: 'hinglish' },
    ],
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    status: 'active',
    tags: ['payment', 'upi']
  },
  {
    id: 'conv-3',
    customerName: 'Sunita Devi',
    customerPhone: '+91-98765-44444',
    botId: 'bot-2',
    botName: 'Support Bot',
    platform: 'telegram',
    messages: [
      { id: 'm1', type: 'customer', content: 'नमस्ते, चावल का रेट बताइए', timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), language: 'hi' },
      { id: 'm2', type: 'bot', content: 'नमस्ते सुनीता जी! चावल (बासमती) की कीमत ₹120 प्रति किलो है। और जानकारी चाहिए?', timestamp: new Date(Date.now() - 1000 * 60 * 44).toISOString(), language: 'hi', translated: true },
    ],
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 44).toISOString(),
    status: 'active',
    tags: ['price-inquiry']
  },
];

const mockOrders: Order[] = [
  { id: 'ORD-001', customerName: 'Rahul Sharma', customerPhone: '+91-98765-11111', items: [{ name: 'Rice (Basmati)', quantity: 100, price: 120 }, { name: 'Sugar', quantity: 50, price: 42 }], total: 14100, gstAmount: 1300, status: 'pending', createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), botHandled: true, invoiceGenerated: false },
  { id: 'ORD-002', customerName: 'Priya Patel', customerPhone: '+91-98765-22222', items: [{ name: 'Wheat Flour', quantity: 150, price: 45 }], total: 6750, gstAmount: 750, status: 'confirmed', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), botHandled: true, invoiceGenerated: true },
  { id: 'ORD-003', customerName: 'Amit Kumar', customerPhone: '+91-98765-33333', items: [{ name: 'Cooking Oil', quantity: 20, price: 180 }], total: 3600, gstAmount: 400, status: 'processing', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), botHandled: false, invoiceGenerated: true },
];

const mockInventory: InventoryItem[] = [
  { id: 'inv-1', name: 'Rice (Basmati)', sku: 'RICE-BAS-001', quantity: 150, unit: 'kg', price: 120, lowStockThreshold: 50, inquiries: 45 },
  { id: 'inv-2', name: 'Wheat Flour', sku: 'FLOUR-WHT-001', quantity: 25, unit: 'kg', price: 45, lowStockThreshold: 100, inquiries: 32 },
  { id: 'inv-3', name: 'Sugar', sku: 'SUGAR-001', quantity: 80, unit: 'kg', price: 42, lowStockThreshold: 60, inquiries: 28 },
  { id: 'inv-4', name: 'Cooking Oil', sku: 'OIL-001', quantity: 12, unit: 'litre', price: 180, lowStockThreshold: 20, inquiries: 15 },
];

const mockSecurityLogs: SecurityLog[] = [
  { id: 'log-1', event: 'Bot API Key Rotated', user: 'admin@bharatbiz.com', ip: '203.192.12.45', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), severity: 'info', details: 'WhatsApp bot API key rotated successfully' },
  { id: 'log-2', event: 'Failed Login Attempt', user: 'unknown', ip: '185.220.101.33', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), severity: 'warning', details: '3 failed login attempts from unknown IP' },
  { id: 'log-3', event: 'Data Export Request', user: 'admin@bharatbiz.com', ip: '203.192.12.45', timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), severity: 'info', details: 'Customer data export approved and downloaded' },
  { id: 'log-4', event: 'Suspicious Activity', user: 'bot-2', ip: 'internal', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), severity: 'critical', details: 'Unusual pattern detected in message volume' },
];

const chartData = [
  { name: 'Mon', messages: 120, orders: 15, approvals: 3 },
  { name: 'Tue', messages: 145, orders: 22, approvals: 5 },
  { name: 'Wed', messages: 180, orders: 28, approvals: 4 },
  { name: 'Thu', messages: 165, orders: 20, approvals: 6 },
  { name: 'Fri', messages: 220, orders: 35, approvals: 8 },
  { name: 'Sat', messages: 280, orders: 42, approvals: 10 },
  { name: 'Sun', messages: 240, orders: 38, approvals: 7 },
];

const platformData = [
  { name: 'WhatsApp', value: 245, color: '#25D366' },
  { name: 'Telegram', value: 89, color: '#0088cc' },
];

// ==================== MAIN COMPONENT ====================

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bots, setBots] = useState<BotInstance[]>(mockBots);
  const [approvals, setApprovals] = useState<PendingApproval[]>(mockApprovals);
  const [conversations, setConversations] = useState<CustomerConversation[]>(mockConversations);
  const [orders] = useState<Order[]>(mockOrders);
  const [inventory] = useState<InventoryItem[]>(mockInventory);
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>(mockSecurityLogs);
  const [selectedConversation, setSelectedConversation] = useState<CustomerConversation | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [showBotConfig, setShowBotConfig] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotInstance | null>(null);
  const [showEncryptionKey, setShowEncryptionKey] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('••••••••••••••••');
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isRecording, setIsRecording] = useState(false);
  const [showAddBotDialog, setShowAddBotDialog] = useState(false);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(5000);
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation]);
  

  useEffect(() => {
    fetch('/api/approvals')
      .then(res => res.json())
      .then(data => setApprovals(data))
      .catch((error) => console.error('Error fetching approvals:', error));
  }, []);

  useEffect(() => {
    const closeDialogs = () => {
      setShowApprovalDialog(false);
      setShowBotConfig(false);
      setShowAddBotDialog(false);
      setShowOrderDialog(false);
      setShowProductDialog(false);
      setSelectedApproval(null);
      setSelectedBot(null);
    };
    closeDialogs();
  }, [activeTab]);

  // Stats calculation
  const stats = useMemo(() => ({
    totalBots: bots.length,
    activeBots: bots.filter(b => b.status === 'active').length,
    pendingApprovals: approvals.filter(a => a.status === 'pending').length,
    totalCustomers: bots.reduce((sum, b) => sum + b.connectedCustomers, 0),
    totalMessages: conversations.reduce((sum, c) => sum + c.messages.length, 0),
    botHandledOrders: orders.filter(o => o.botHandled).length,
    totalRevenue: orders.reduce((sum, o) => sum + o.total + o.gstAmount, 0),
  }), [bots, approvals, conversations, orders]);


  // Handle approval with notification
  const handleApproval = useCallback(async (approvalId: string, approved: boolean) => {
  if (processingApprovalId) return;
  setProcessingApprovalId(approvalId);

  const approval = approvals.find(a => a.id === approvalId);
  if (!approval) return;

  // 🔒 SERVER IS SOURCE OF TRUTH
  await fetch(`/api/approvals/${approvalId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ADMIN_API_KEY,
    },
    body: JSON.stringify({ approved }),
  });

  // Update approvals
  setApprovals(prev =>
    prev.map(a =>
      a.id === approvalId
        ? { ...a, status: approved ? 'approved' : 'rejected', resolvedAt: new Date().toISOString() }
        : a
    )
  );

  // Unlock conversation AFTER approval
  if (approved) {
    setConversations(prev =>
      prev.map(conv =>
        conv.customerPhone === approval.customerPhone
          ? { ...conv, status: 'active' }
          : conv
      )
    );
  }

  toast.success(
    approved
      ? `Approved: ${approval.customerName}`
      : `Rejected: ${approval.customerName}`
  );

  setProcessingApprovalId(null);
}, [approvals, processingApprovalId]);



  // Toggle bot status
  const toggleBotStatus = useCallback((botId: string) => {
    setBots(prev => prev.map(b => {
      if (b.id === botId) {
        const newStatus = b.status === 'active' ? 'paused' : 'active';
        toast.success(`Bot "${b.name}" ${newStatus === 'active' ? 'activated' : 'paused'}`);
        return { ...b, status: newStatus };
      }
      return b;
    }));
  }, []);

  // Send message in conversation
  const sendMessage = useCallback(() => {
    if (!newMessage.trim() || !selectedConversation) return;

    const message: Message = {
      id: `msg-${Date.now()}`,
      type: 'admin',
      content: newMessage,
      timestamp: new Date().toISOString(),
      language: detectLanguage(newMessage)
    };

    setConversations(prev => prev.map(conv => 
      conv.id === selectedConversation.id 
        ? { ...conv, messages: [...conv.messages, message], lastMessageAt: new Date().toISOString() }
        : conv
    ));

    setSelectedConversation(prev => prev ? { ...prev, messages: [...prev.messages, message], lastMessageAt: new Date().toISOString() } : null);
    setNewMessage('');
    toast.success('Message sent');
  }, [newMessage, selectedConversation]);

  // Simulate voice recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      setNewMessage(prev => prev + ' [Voice message recorded]');
      toast.success('Voice message recorded');
    } else {
      setIsRecording(true);
      toast.info('Recording... Click again to stop');
      setTimeout(() => {
        setIsRecording(false);
        setNewMessage(prev => prev + ' [Voice: "Bhej do bhai, jaldi" ]');
      }, 3000);
    }
  }, [isRecording]);

  // Rotate encryption key
  const rotateEncryptionKey = useCallback(() => {
    const newKey = Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    setEncryptionKey(newKey);
    
    const newLog: SecurityLog = {
      id: `log-${Date.now()}`,
      event: 'Encryption Key Rotated',
      user: 'admin@bharatbiz.com',
      ip: '203.192.12.45',
      timestamp: new Date().toISOString(),
      severity: 'info',
      details: 'Master encryption key rotated successfully'
    };
    setSecurityLogs(prev => [newLog, ...prev]);
    toast.success('🔐 Encryption key rotated successfully');
  }, []);

  // Export security logs
  const exportSecurityLogs = useCallback(() => {
    const data = JSON.stringify(securityLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success('Security logs exported');
  }, [securityLogs]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'connecting': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Filtered approvals
  const filteredApprovals = useMemo(() => {
    return approvals.filter(a =>
      approvalFilter === 'all' ? true : a.status === approvalFilter
    );
  }, [approvals, approvalFilter]);

  // Filtered conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter(c =>
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customerPhone.includes(searchQuery)
    );
  }, [conversations, searchQuery]);

  const navigate = useCallback((tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, []);


  return (
    <div className="flex h-screen bg-background">
      <Toaster position="top-right" richColors />

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold">Bharat Biz-Agent</span>
                <p className="text-xs text-muted-foreground">Admin Dashboard</p>
              </div>
            </SheetTitle>
          </SheetHeader>
          <nav className="p-4 space-y-1">
            <SidebarItem id="dashboard" icon={BarChart3} label="Dashboard" activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="bots" icon={Bot} label="Bot Management" activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="approvals" icon={CheckCheck} label="Approvals" badge={stats.pendingApprovals} activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="conversations" icon={MessageSquare} label="Conversations" badge={conversations.length} activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="orders" icon={FileText} label="Orders" badge={approvals.filter(a => a.status === 'pending').length} activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="inventory" icon={Package} label="Inventory" activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="security" icon={Shield} label="Security & Privacy" activeTab={activeTab} navigate={navigate} />
            <SidebarItem id="settings" icon={Settings} label="Settings" activeTab={activeTab} navigate={navigate} />
          </nav>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r bg-card">
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Bharat Biz-Agent</h1>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>

          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-green-800">System Secure</span>
              </div>
              <p className="text-xs text-green-700">AES-256 encryption active</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-600">{stats.activeBots} bots online</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <SidebarItem id="dashboard" icon={BarChart3} label="Dashboard" activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="bots" icon={Bot} label="Bot Management" activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="approvals" icon={CheckCheck} label="Approvals" badge={stats.pendingApprovals} activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="conversations" icon={MessageSquare} label="Conversations" badge={conversations.length} activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="orders" icon={FileText} label="Orders" badge={approvals.filter(a => a.status === 'pending').length} activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="inventory" icon={Package} label="Inventory" activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="security" icon={Shield} label="Security & Privacy" activeTab={activeTab} navigate={navigate} />
          <SidebarItem id="settings" icon={Settings} label="Settings" activeTab={activeTab} navigate={navigate} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-4 lg:px-6 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="font-semibold capitalize">{activeTab.replace('-', ' ')}</h2>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-green-700">All Systems Operational</span>
            </div>
            <Button variant="ghost" size="icon" className="relative" onClick={() => navigate('approvals')}>
              <Bell className="w-5 h-5" />
              {stats.pendingApprovals > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {stats.pendingApprovals}
                </span>
              )}
            </Button>
            <Avatar className="h-9 w-9 cursor-pointer" onClick={() => toast.info('Profile settings coming soon')}>
              <AvatarFallback className="bg-gradient-to-br from-orange-500 to-orange-600 text-white text-sm">AD</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 lg:p-6">

              {/* DASHBOARD */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('bots')}>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-blue-700 flex items-center gap-2">
                          <Bot className="w-4 h-4" /> Active Bots
                        </CardDescription>
                        <CardTitle className="text-3xl text-blue-800">{stats.activeBots}/{stats.totalBots}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-blue-600">{stats.totalCustomers} customers connected</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('approvals')}>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-orange-700 flex items-center gap-2">
                          <CheckCheck className="w-4 h-4" /> Pending Approvals
                        </CardDescription>
                        <CardTitle className="text-3xl text-orange-800">{stats.pendingApprovals}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-orange-600">Require admin action</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('orders')}>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-green-700 flex items-center gap-2">
                          <FileText className="w-4 h-4" /> Bot-Handled Orders
                        </CardDescription>
                        <CardTitle className="text-3xl text-green-800">{stats.botHandledOrders}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-green-600">{formatCurrency(stats.totalRevenue)} revenue</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-purple-700 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" /> Total Messages
                        </CardDescription>
                        <CardTitle className="text-3xl text-purple-800">{stats.totalMessages.toLocaleString()}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-purple-600">+12% from last week</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Charts */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Activity Overview</CardTitle>
                        <CardDescription>Messages, orders, and approvals</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Line type="monotone" dataKey="messages" stroke="#8884d8" strokeWidth={2} name="Messages" />
                              <Line type="monotone" dataKey="orders" stroke="#82ca9d" strokeWidth={2} name="Orders" />
                              <Line type="monotone" dataKey="approvals" stroke="#ffc658" strokeWidth={2} name="Approvals" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Platform Distribution</CardTitle>
                        <CardDescription>Customer connections by platform</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={platformData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {platformData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                          {platformData.map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-sm">{item.name}: {item.value}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recent Approvals */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Recent Approval Requests</CardTitle>
                        <CardDescription>Pending bot action approvals</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate('approvals')}>
                        View All
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {approvals.filter(a => a.status === 'pending').slice(0, 3).map((approval) => (
                            <TableRow key={approval.id}>
                              <TableCell className="font-medium">{approval.customerName}</TableCell>
                              <TableCell>{approval.action.replace(/_/g, ' ')}</TableCell>
                              <TableCell>{approval.details.amount ? formatCurrency(approval.details.amount) : '-'}</TableCell>
                              <TableCell>
                                <Badge className={getPriorityColor(approval.priority)}>{approval.priority}</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {getTimeAgo(approval.requestedAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setSelectedApproval(approval); setShowApprovalDialog(true); }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={processingApprovalId === approval.id}
                                    className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                                    onClick={() => handleApproval(approval.id, true)}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={processingApprovalId === approval.id}
                                    onClick={() => handleApproval(approval.id, false)}
                                  >

                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* BOT MANAGEMENT */}
              {activeTab === 'bots' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Bot Management</h2>
                      <p className="text-muted-foreground">Configure and monitor your WhatsApp/Telegram bots</p>
                    </div>
                    <Button onClick={() => setShowAddBotDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Bot
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {bots.map((bot) => (
                      <Card key={bot.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bot.platform === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'}`}>
                                {bot.platform === 'whatsapp' ? <Phone className="w-5 h-5 text-green-600" /> : <Send className="w-5 h-5 text-blue-600" />}
                              </div>
                              <div>
                                <CardTitle className="text-base">{bot.name}</CardTitle>
                                <p className="text-xs text-muted-foreground capitalize">{bot.platform}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(bot.status)}`} />
                              <span className="text-xs capitalize">{bot.status}</span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Customers</p>
                              <p className="font-medium">{bot.connectedCustomers}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Pending</p>
                              <p className="font-medium">{bot.pendingApprovals}</p>
                            </div>
                          </div>
                          {bot.phoneNumber && (
                            <div>
                              <p className="text-muted-foreground text-xs">Phone</p>
                              <p className="font-medium text-sm">{bot.phoneNumber}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Lock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{bot.encryptionEnabled ? 'Encryption On' : 'Encryption Off'}</span>
                          </div>
                        </CardContent>
                        <CardFooter className="flex gap-2">
                          <Button 
                            variant={bot.status === 'active' ? 'destructive' : 'default'} 
                            size="sm" 
                            className="flex-1"
                            onClick={() => toggleBotStatus(bot.id)}
                          >
                            {bot.status === 'active' ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                            {bot.status === 'active' ? 'Pause' : 'Activate'}
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedBot(bot); setShowBotConfig(true); }}>
                            <Settings className="w-4 h-4 mr-1" />
                            Configure
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* APPROVALS */}
              {activeTab === 'approvals' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Approval Requests</h2>
                      <p className="text-muted-foreground">Review and approve bot actions</p>
                    </div>
                    <div className="flex gap-2">
                      <Select value={approvalFilter} onValueChange={(v: "all" | "pending" | "approved" | "rejected") => setApprovalFilter(v)}>
                        <SelectTrigger className="w-32">
                          <Filter className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredApprovals.length === 0 ? (
                      <Card className="p-8 text-center">
                        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                        <p className="text-muted-foreground">No {approvalFilter !== 'all' ? approvalFilter : ''} approvals found</p>
                      </Card>
                    ) : (
                      filteredApprovals.map((approval) => (
                        <Card key={approval.id} className={`hover:shadow-md transition-shadow ${approval.status === 'pending' ? 'border-orange-300' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between flex-wrap gap-4">
                              <div className="flex items-center gap-4">
                                <Avatar className="h-12 w-12">
                                  <AvatarFallback className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                                    {approval.customerName.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold">{approval.customerName}</p>
                                  <p className="text-sm text-muted-foreground">{approval.customerPhone}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline">{approval.action.replace(/_/g, ' ')}</Badge>
                                    <Badge className={getPriorityColor(approval.priority)}>{approval.priority}</Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-lg">{approval.details.amount ? formatCurrency(approval.details.amount) : '-'}</p>
                                <p className="text-xs text-muted-foreground">{approval.botName}</p>
                                <p className="text-xs text-muted-foreground">{getTimeAgo(approval.requestedAt)}</p>
                              </div>
                              {approval.status === 'pending' && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    disabled={processingApprovalId === approval.id}
                                    onClick={() => handleApproval(approval.id, true)}
                                  >

                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleApproval(approval.id, false)}>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                              {approval.status !== 'pending' && (
                                <div className="text-right">
                                  <Badge variant={approval.status === 'approved' ? 'default' : 'destructive'} className="capitalize">
                                    {approval.status}
                                  </Badge>
                                  {approval.resolvedAt && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {getTimeAgo(approval.resolvedAt)}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            {approval.details.items && (
                              <div className="mt-3 p-3 bg-muted rounded-lg">
                                <p className="text-sm font-medium mb-1">Items:</p>
                                <ul className="text-sm text-muted-foreground">
                                  {approval.details.items.map((item: string, idx: number) => (
                                    <li key={idx}>• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* CONVERSATIONS */}
              {activeTab === 'conversations' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Customer Conversations</h2>
                      <p className="text-muted-foreground">Monitor and manage bot conversations</p>
                    </div>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Search conversations..." 
                        className="w-64" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <Button variant="outline" onClick={() => setSearchQuery('')}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-4 h-[calc(100vh-280px)]">
                    {/* Conversation List */}
                    <Card className="lg:col-span-1 overflow-hidden">
                      <ScrollArea className="h-full">
                        <div className="p-2 space-y-1">
                          {filteredConversations.map((conv) => (
                            <button
                              key={conv.id}
                              onClick={() => setSelectedConversation(conv)}
                              className={`w-full p-3 rounded-lg text-left transition-colors ${
                                selectedConversation?.id === conv.id 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'hover:bg-muted'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{conv.customerName}</span>
                                {conv.status === 'waiting_approval' && (
                                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                )}
                              </div>
                              <p className={`text-sm truncate ${selectedConversation?.id === conv.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                {conv.messages[conv.messages.length - 1]?.content}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={`text-xs ${selectedConversation?.id === conv.id ? 'border-primary-foreground/30' : ''}`}>
                                  {conv.platform}
                                </Badge>
                                {conv.messages[conv.messages.length - 1]?.language && (
                                  <Badge variant="outline" className={`text-xs ${selectedConversation?.id === conv.id ? 'border-primary-foreground/30' : ''}`}>
                                    {conv.messages[conv.messages.length - 1]?.language}
                                  </Badge>
                                )}
                                <span className={`text-xs ${selectedConversation?.id === conv.id ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>
                                  {getTimeAgo(conv.lastMessageAt)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </Card>

                    {/* Chat View */}
                    <Card className="lg:col-span-2 flex flex-col">
                      {selectedConversation ? (
                        <>
                          <CardHeader className="border-b pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Avatar>
                                  <AvatarFallback className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                                    {selectedConversation.customerName.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <CardTitle className="text-base">{selectedConversation.customerName}</CardTitle>
                                  <p className="text-xs text-muted-foreground">{selectedConversation.customerPhone}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={selectedConversation.status === 'waiting_approval' ? 'destructive' : 'default'}>
                                  {selectedConversation.status.replace(/-/g, ' ')}
                                </Badge>
                                <Button variant="ghost" size="icon" onClick={() => toast.info('Calling...')}>
                                  <Phone className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="flex-1 overflow-hidden p-0">
                            <ScrollArea className="h-[calc(100vh-420px)] p-4">
                              <div className="space-y-4">
                                {selectedConversation.messages.map((msg) => (
                                  <div key={msg.id} className={`flex ${msg.type === 'customer' ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                      msg.type === 'customer' 
                                        ? 'bg-muted' 
                                        : msg.type === 'bot'
                                        ? 'bg-primary text-primary-foreground'
                                        : msg.type === 'admin'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      <p className="text-sm">{msg.content}</p>
                                      {msg.translated && (
                                        <p className="text-xs opacity-70 mt-1">🌐 Translated from Hindi</p>
                                      )}
                                      <p className={`text-xs mt-1 ${msg.type === 'customer' ? 'text-muted-foreground' : 'opacity-70'}`}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], { 
                                          hour: '2-digit', 
                                          minute: '2-digit' 
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                                <div ref={chatEndRef} />
                              </div>
                            </ScrollArea>
                          </CardContent>
                          <CardFooter className="border-t p-3">
                            <div className="flex w-full gap-2">
                              <Button 
                                variant={isRecording ? "destructive" : "outline"} 
                                size="icon"
                                onClick={toggleRecording}
                                className={isRecording ? 'animate-pulse' : ''}
                              >
                                <Mic className="w-4 h-4" />
                              </Button>
                              <Input 
                                placeholder="Type a message..." 
                                className="flex-1" 
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !isRecording) sendMessage();
                                }}

                              />
                              <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                                <Send className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardFooter>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Select a conversation to view</p>
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              )}

              {/* ORDERS */}
              {activeTab === 'orders' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Orders</h2>
                      <p className="text-muted-foreground">Manage customer orders</p>
                    </div>
                    <Button onClick={() => setShowOrderDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Order
                    </Button>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.id}</TableCell>
                              <TableCell>
                                <div>
                                  <p>{order.customerName}</p>
                                  <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                                </div>
                              </TableCell>
                              <TableCell>{order.items.length} items</TableCell>
                              <TableCell>{formatCurrency(order.total + order.gstAmount)}</TableCell>
                              <TableCell>
                                <Badge variant={order.status === 'delivered' ? 'default' : order.status === 'cancelled' ? 'destructive' : 'secondary'} className="capitalize">
                                  {order.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {order.botHandled ? (
                                  <div className="flex items-center gap-1">
                                    <Bot className="w-3 h-3" />
                                    <span className="text-xs">Bot</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Manual</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => toast.info(`Order ${order.id} details`)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* INVENTORY */}
              {activeTab === 'inventory' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Inventory Management</h2>
                      <p className="text-muted-foreground">Track stock and bot inquiries</p>
                    </div>
                    <Button onClick={() => setShowProductDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Product
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Products</CardDescription>
                        <CardTitle className="text-2xl">{inventory.length}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Low Stock Items</CardDescription>
                        <CardTitle className="text-2xl text-red-600">
                          {inventory.filter(i => i.quantity < i.lowStockThreshold).length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Bot Inquiries</CardDescription>
                        <CardTitle className="text-2xl">
                          {inventory.reduce((sum, i) => sum + i.inquiries, 0)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Stock Value</CardDescription>
                        <CardTitle className="text-2xl">
                          {formatCurrency(inventory.reduce((sum, i) => sum + (i.quantity * i.price), 0))}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Inquiries</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                              <TableCell>{item.quantity} {item.unit}</TableCell>
                              <TableCell>{formatCurrency(item.price)}</TableCell>
                              <TableCell>{item.inquiries}</TableCell>
                              <TableCell>
                                {item.quantity < item.lowStockThreshold ? (
                                  <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                    <AlertTriangle className="w-3 h-3" />
                                    Low Stock
                                  </Badge>
                                ) : (
                                  <Badge variant="default" className="bg-green-500">OK</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* SECURITY & PRIVACY */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">Security & Privacy</h2>
                    <p className="text-muted-foreground">Manage encryption, access control, and audit logs</p>
                  </div>

                  {/* Encryption Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5" />
                        End-to-End Encryption
                      </CardTitle>
                      <CardDescription>All customer messages are encrypted at rest and in transit</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Key className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Master Encryption Key</p>
                            <p className="text-sm text-muted-foreground">AES-256 encryption for all data</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input 
                            type={showEncryptionKey ? 'text' : 'password'} 
                            value={encryptionKey} 
                            readOnly 
                            className="w-48 font-mono text-sm"
                          />
                          <Button variant="outline" size="sm" onClick={() => setShowEncryptionKey(!showEncryptionKey)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={rotateEncryptionKey}>
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4" />
                            <span className="text-sm">Data Encryption</span>
                          </div>
                          <Switch checked={true} onCheckedChange={() => toast.info('Encryption cannot be disabled')} />
                        </div>
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="w-4 h-4" />
                            <span className="text-sm">2FA Required</span>
                          </div>
                          <Switch checked={true} />
                        </div>
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            <span className="text-sm">Audit Logging</span>
                          </div>
                          <Switch checked={true} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Security Logs */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Security Audit Logs</CardTitle>
                        <CardDescription>Recent security events and activities</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={exportSecurityLogs}>
                        <Download className="w-4 h-4 mr-1" />
                        Export
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>IP Address</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Severity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {securityLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="font-medium">{log.event}</TableCell>
                              <TableCell>{log.user}</TableCell>
                              <TableCell className="text-muted-foreground font-mono text-xs">{log.ip}</TableCell>
                              <TableCell>{getTimeAgo(log.timestamp)}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant={log.severity === 'critical' ? 'destructive' : log.severity === 'warning' ? 'secondary' : 'default'}
                                  className="capitalize"
                                >
                                  {log.severity}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Data Privacy */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Data Privacy Controls</CardTitle>
                      <CardDescription>GDPR and data protection compliance</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Auto-Delete Old Messages</p>
                          <p className="text-sm text-muted-foreground">Delete messages older than 90 days</p>
                        </div>
                        <Switch />
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Customer Data Export</p>
                          <p className="text-sm text-muted-foreground">Allow customers to request their data</p>
                        </div>
                        <Switch checked={true} />
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">Anonymize Analytics</p>
                          <p className="text-sm text-muted-foreground">Remove PII from analytics data</p>
                        </div>
                        <Switch checked={true} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* SETTINGS */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">Settings</h2>
                    <p className="text-muted-foreground">Configure system preferences</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Phone className="w-5 h-5 text-green-600" />
                          WhatsApp API Configuration
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">API Key</label>
                          <Input type="password" value="wa_api_key_********" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Webhook URL</label>
                          <Input value="https://api.bharatbiz.com/webhooks/whatsapp" className="mt-1" readOnly />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone Number ID</label>
                          <Input value="1234567890" className="mt-1" />
                        </div>
                        <Button className="w-full" onClick={() => toast.success('WhatsApp configuration saved')}>
                          <Check className="w-4 h-4 mr-2" />
                          Save Configuration
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Send className="w-5 h-5 text-blue-600" />
                          Telegram Bot Configuration
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Bot Token</label>
                          <Input type="password" value="tg_bot_token_********" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Webhook URL</label>
                          <Input value="https://api.bharatbiz.com/webhooks/telegram" className="mt-1" readOnly />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Bot Username</label>
                          <Input value="@BharatBizBot" className="mt-1" />
                        </div>
                        <Button className="w-full" onClick={() => toast.success('Telegram configuration saved')}>
                          <Check className="w-4 h-4 mr-2" />
                          Save Configuration
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Approval Settings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Auto-approve invoices below</p>
                            <p className="text-sm text-muted-foreground">Skip approval for small amounts</p>
                          </div>
                          <Switch checked={autoApproveEnabled} onCheckedChange={setAutoApproveEnabled} />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Threshold Amount (₹)</label>
                          <Input 
                            type="number" 
                            value={autoApproveThreshold} 
                            onChange={(e) => setAutoApproveThreshold(Number(e.target.value))}
                            className="mt-1" 
                            disabled={!autoApproveEnabled}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Require approval for data export</p>
                          </div>
                          <Switch checked={true} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Notification Settings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Email notifications</p>
                            <p className="text-sm text-muted-foreground">Send alerts to admin email</p>
                          </div>
                          <Switch checked={true} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">SMS alerts for urgent</p>
                            <p className="text-sm text-muted-foreground">Critical approval requests</p>
                          </div>
                          <Switch />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Push notifications</p>
                          </div>
                          <Switch checked={true} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

            </div>
          </ScrollArea>
        </div>
      </main>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approval Request</DialogTitle>
            <DialogDescription>Review and approve this bot action</DialogDescription>
          </DialogHeader>
          {selectedApproval && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedApproval.customerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedApproval.customerPhone}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Action</p>
                <p className="font-medium capitalize">{selectedApproval.action.replace(/_/g, ' ')}</p>
              </div>
              {selectedApproval.details.amount && (
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-xl">{formatCurrency(selectedApproval.details.amount)}</p>
                </div>
              )}
              {selectedApproval.details.items && (
                <div>
                  <p className="text-sm text-muted-foreground">Items</p>
                  <ul className="mt-1 space-y-1">
                    {selectedApproval.details.items.map((item: string, idx: number) => (
                      <li key={idx} className="text-sm">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Priority</p>
                <Badge className={getPriorityColor(selectedApproval.priority)}>{selectedApproval.priority}</Badge>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedApproval && handleApproval(selectedApproval.id, false)}>
              <XCircle className="w-4 h-4 mr-1" />
              Reject
            </Button>
            <Button
              disabled={processingApprovalId === selectedApproval?.id}
              onClick={() => selectedApproval && handleApproval(selectedApproval.id, true)}
            >

              <CheckCircle className="w-4 h-4 mr-1" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bot Config Dialog */}
      <Dialog open={showBotConfig} onOpenChange={setShowBotConfig}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bot Configuration</DialogTitle>
            <DialogDescription>Configure bot settings and behavior</DialogDescription>
          </DialogHeader>
          {selectedBot && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Bot Name</label>
                <Input defaultValue={selectedBot.name} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Platform</label>
                <Select defaultValue={selectedBot.platform}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">End-to-End Encryption</p>
                  <p className="text-sm text-muted-foreground">Encrypt all messages</p>
                </div>
                <Switch checked={selectedBot.encryptionEnabled} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Auto-approve small orders</p>
                  <p className="text-sm text-muted-foreground">Below ₹{selectedBot.autoApproveThreshold}</p>
                </div>
                <Switch checked={selectedBot.autoApproveThreshold > 0} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Voice messages</p>
                  <p className="text-sm text-muted-foreground">Allow audio communication</p>
                </div>
                <Switch checked={selectedBot.voiceEnabled} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBotConfig(false)}>Cancel</Button>
            <Button onClick={() => { toast.success('Configuration saved'); setShowBotConfig(false); }}>
              <Check className="w-4 h-4 mr-1" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Bot Dialog */}
      <Dialog open={showAddBotDialog} onOpenChange={setShowAddBotDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Bot</DialogTitle>
            <DialogDescription>Configure a new WhatsApp or Telegram bot</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Bot Name</label>
              <Input placeholder="e.g., Sales Bot - Mumbai" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Platform</label>
              <Select defaultValue="whatsapp">
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp Business</SelectItem>
                  <SelectItem value="telegram">Telegram Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">API Key / Bot Token</label>
              <Input type="password" placeholder="Enter your API key" className="mt-1" />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Enable Encryption</p>
                <p className="text-sm text-muted-foreground">AES-256 for all messages</p>
              </div>
              <Switch checked={true} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBotDialog(false)}>Cancel</Button>
            <Button onClick={() => { 
              toast.success('New bot added successfully'); 
              setShowAddBotDialog(false);
              setBots(prev => [...prev, { 
                id: `bot-${Date.now()}`, 
                name: 'New Bot', 
                platform: 'whatsapp', 
                status: 'connecting', 
                apiKey: '****', 
                connectedCustomers: 0, 
                pendingApprovals: 0, 
                lastActivity: new Date().toISOString(), 
                encryptionEnabled: true,
                autoApproveThreshold: 5000,
                voiceEnabled: true 
              }]);
            }}>
              <Plus className="w-4 h-4 mr-1" />
              Add Bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Order</DialogTitle>
            <DialogDescription>Manually create an order for a customer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Customer Name</label>
              <Input placeholder="Enter customer name" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Phone Number</label>
              <Input placeholder="+91-98765-XXXXX" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Product</label>
              <Select>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name} - {formatCurrency(item.price)}/{item.unit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Quantity</label>
              <Input type="number" placeholder="Enter quantity" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrderDialog(false)}>Cancel</Button>
            <Button onClick={() => { 
              toast.success('Order created successfully'); 
              setShowOrderDialog(false);
            }}>
              <Plus className="w-4 h-4 mr-1" />
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>Add a new product to inventory</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Product Name</label>
              <Input placeholder="e.g., Organic Rice" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">SKU</label>
              <Input placeholder="e.g., RICE-ORG-001" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Price (₹)</label>
                <Input type="number" placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Unit</label>
                <Select defaultValue="kg">
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="litre">litre</SelectItem>
                    <SelectItem value="packet">packet</SelectItem>
                    <SelectItem value="piece">piece</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Initial Stock</label>
                <Input type="number" placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Low Stock Alert</label>
                <Input type="number" placeholder="10" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductDialog(false)}>Cancel</Button>
            <Button onClick={() => { 
              toast.success('Product added to inventory'); 
              setShowProductDialog(false);
            }}>
              <Plus className="w-4 h-4 mr-1" />
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
