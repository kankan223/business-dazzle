import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, TrendingUp, TrendingDown, DollarSign, 
  Activity, Target, AlertTriangle
} from 'lucide-react';
import { apiService } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface CustomerAnalytics {
  overview: {
    totalCustomers: number;
    activeCustomers: number;
    totalConversations: number;
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    customerGrowthRate: number;
    orderGrowthRate: number;
  };
  customerMetrics: Array<{
    customerId: string;
    name: string;
    phone: string;
    email: string;
    registeredAt: string;
    lastActiveAt: string;
    totalConversations: number;
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
  }>;
  engagementMetrics: {
    totalConversations: number;
    totalMessages: number;
    averageMessagesPerConversation: number;
    engagedCustomers: number;
    engagementRate: number;
    averageResponseTime: number;
  };
  revenueMetrics: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    revenueByStatus: Record<string, number>;
    revenueByDay: Record<string, number>;
    revenueByMonth: Record<string, number>;
    pendingRevenue: number;
    completedRevenue: number;
  };
  behaviorAnalytics: {
    hourlyActivity: Array<{ hour: number; count: number }>;
    conversationPatterns: {
      shortConversations: number;
      longConversations: number;
      averageLength: number;
    };
    approvalPatterns: {
      totalApprovals: number;
      approvedRate: number;
      rejectionRate: number;
    };
    orderPatterns: {
      averageOrderValue: number;
      mostCommonStatus: string;
      orderFrequency: number;
    };
    peakHours: Array<{ hour: number; count: number }>;
    averageSessionDuration: number;
  };
  geographicData: {
    locationDistribution: Record<string, number>;
    topLocations: Array<{ location: string; count: number }>;
  };
  conversionMetrics: {
    totalConversations: number;
    totalOrders: number;
    conversionRate: number;
    conversionByPlatform: Record<string, number>;
    conversionFunnel: {
      conversations: number;
      orders: number;
      conversionRate: number;
    };
  };
  customerSegments: {
    new: Array<any>;
    active: Array<any>;
    at_risk: Array<any>;
    vip: Array<any>;
    inactive: Array<any>;
  };
  topCustomers: Array<{
    customerId: string;
    name: string;
    revenue: number;
    orders: number;
  }>;
  trends: {
    conversations: any[];
    orders: any[];
    revenue: any[];
  };
}

interface CustomerAnalyticsProps {
  className?: string;
}

export const CustomerAnalytics: React.FC<CustomerAnalyticsProps> = ({ className = '' }) => {
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.getCustomerAnalytics(timeRange);
      setAnalytics(response);
    } catch (error) {
      console.error('Failed to fetch customer analytics:', error);
      toast.error('Failed to load customer analytics');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getGrowthIcon = (rate: number) => {
    return rate >= 0 ? TrendingUp : TrendingDown;
  };

  const getGrowthColor = (rate: number) => {
    return rate >= 0 ? 'text-green-600' : 'text-red-600';
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${className}`}>
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No analytics data available</p>
          <Button onClick={fetchAnalytics} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customer Analytics</h2>
          <p className="text-gray-600">Comprehensive customer insights and behavior analysis</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchAnalytics} variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Customers</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalCustomers.toLocaleString()}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              {React.createElement(getGrowthIcon(analytics.overview.customerGrowthRate), { className: "w-4 h-4" })}
              <span className={`text-sm ${getGrowthColor(analytics.overview.customerGrowthRate)}`}>
                {formatPercentage(analytics.overview.customerGrowthRate)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Customers</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.overview.activeCustomers.toLocaleString()}</p>
              </div>
              <Activity className="w-8 h-8 text-green-600" />
            </div>
            <div className="mt-2">
              <Progress 
                value={(analytics.overview.activeCustomers / analytics.overview.totalCustomers) * 100} 
                className="w-full" 
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.overview.totalRevenue)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              {React.createElement(getGrowthIcon(analytics.overview.orderGrowthRate), { className: "w-4 h-4" })}
              <span className={`text-sm ${getGrowthColor(analytics.overview.orderGrowthRate)}`}>
                {formatPercentage(analytics.overview.orderGrowthRate)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.overview.averageOrderValue)}</p>
              </div>
              <Target className="w-8 h-8 text-orange-600" />
            </div>
            <div className="mt-2">
              <Badge variant="secondary">
                {analytics.overview.totalOrders} orders
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['overview', 'segments', 'top-customers', 'revenue', 'engagement', 'behavior'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Engagement Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Conversations</span>
                  <span className="font-semibold">{analytics.engagementMetrics.totalConversations.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Engagement Rate</span>
                  <span className="font-semibold">{formatPercentage(analytics.engagementMetrics.engagementRate)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Avg Response Time</span>
                  <span className="font-semibold">{analytics.engagementMetrics.averageResponseTime} min</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Avg Messages/Conversation</span>
                  <span className="font-semibold">{analytics.engagementMetrics.averageMessagesPerConversation.toFixed(1)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Conversion Rate</span>
                  <span className="font-semibold">{formatPercentage(analytics.conversionMetrics.conversionRate)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Conversations</span>
                  <span className="font-semibold">{analytics.conversionMetrics.totalConversations.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Orders</span>
                  <span className="font-semibold">{analytics.conversionMetrics.totalOrders.toLocaleString()}</span>
                </div>
                <div className="mt-4">
                  <div className="text-sm text-gray-600 mb-2">Conversion Funnel</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-blue-100 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${analytics.conversionMetrics.conversionRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{formatPercentage(analytics.conversionMetrics.conversionRate)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'segments' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(analytics.customerSegments).map(([segment, customers]) => (
              <Card key={segment}>
                <CardHeader>
                  <CardTitle className="capitalize">{segment.replace('_', ' ')}</CardTitle>
                  <CardDescription>{customers.length} customers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {customers.slice(0, 3).map((customer, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{customer.name}</span>
                        <span className="text-gray-500">{customer.totalOrders} orders</span>
                      </div>
                    ))}
                    {customers.length > 3 && (
                      <div className="text-sm text-gray-500 text-center">
                        +{customers.length - 3} more
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'top-customers' && (
          <Card>
            <CardHeader>
              <CardTitle>Top Customers by Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.topCustomers.map((customer, index) => (
                  <div key={customer.customerId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-600">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-gray-500">{customer.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(customer.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'revenue' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Revenue</span>
                  <span className="font-semibold">{formatCurrency(analytics.revenueMetrics.totalRevenue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Completed Revenue</span>
                  <span className="font-semibold text-green-600">{formatCurrency(analytics.revenueMetrics.completedRevenue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Pending Revenue</span>
                  <span className="font-semibold text-yellow-600">{formatCurrency(analytics.revenueMetrics.pendingRevenue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Average Order Value</span>
                  <span className="font-semibold">{formatCurrency(analytics.revenueMetrics.averageOrderValue)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(analytics.revenueMetrics.revenueByStatus).map(([status, amount]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="capitalize">{status}</span>
                      <span className="font-semibold">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'engagement' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Conversations</span>
                  <span className="font-semibold">{analytics.engagementMetrics.totalConversations.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Messages</span>
                  <span className="font-semibold">{analytics.engagementMetrics.totalMessages.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Engaged Customers</span>
                  <span className="font-semibold">{analytics.engagementMetrics.engagedCustomers.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Engagement Rate</span>
                  <span className="font-semibold">{formatPercentage(analytics.engagementMetrics.engagementRate)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversation Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Short Conversations</span>
                  <span className="font-semibold">{analytics.behaviorAnalytics.conversationPatterns.shortConversations}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Long Conversations</span>
                  <span className="font-semibold">{analytics.behaviorAnalytics.conversationPatterns.longConversations}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Average Length</span>
                  <span className="font-semibold">{analytics.behaviorAnalytics.conversationPatterns.averageLength.toFixed(1)} messages</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Avg Session Duration</span>
                  <span className="font-semibold">{analytics.behaviorAnalytics.averageSessionDuration} min</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'behavior' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Peak Activity Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.behaviorAnalytics.peakHours.map((hour) => (
                    <div key={hour.hour} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{hour.hour}:00</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${(hour.count / Math.max(...analytics.behaviorAnalytics.hourlyActivity.map(h => h.count))) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{hour.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Approval Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Approvals</span>
                  <span className="font-semibold">{analytics.behaviorAnalytics.approvalPatterns.totalApprovals}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Approved Rate</span>
                  <span className="font-semibold text-green-600">{formatPercentage(analytics.behaviorAnalytics.approvalPatterns.approvedRate)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Rejection Rate</span>
                  <span className="font-semibold text-red-600">{formatPercentage(analytics.behaviorAnalytics.approvalPatterns.rejectionRate)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerAnalytics;
