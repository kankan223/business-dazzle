import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Eye, EyeOff, Trash2, AlertTriangle, CheckCircle, XCircle, MessageSquare, Brain, Settings, Play, Pause, Power } from 'lucide-react';

interface DebugEvent {
  type: string;
  timestamp: string;
  payload: unknown;
}

interface DebugState {
  userId: string;
  enabled: boolean;
  enabledAt?: string;
}

export function DebugPanel() {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [activeDebugUsers, setActiveDebugUsers] = useState<DebugState[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to debug stream
    const connectStream = () => {
      const eventSource = new EventSource('/api/debug/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const debugEvent: DebugEvent = JSON.parse(event.data);
          
          if (debugEvent.type === 'DEBUG_STATE_SYNC') {
            const payload = debugEvent.payload as { activeDebugUsers?: DebugState[] };
            setActiveDebugUsers(payload.activeDebugUsers || []);
          } else if (debugEvent.type === 'STREAM_CONNECTED') {
            // Initial connection, don't add to events
          } else {
            // Add debug events to timeline
            setEvents(prev => [debugEvent, ...prev].slice(0, 500)); // Keep last 500 events
          }
        } catch (error) {
          console.error('Error parsing debug event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('Debug stream error:', error);
        setIsConnected(false);
      };

      eventSource.addEventListener("close", () => {
        setIsConnected(false);
      });
    };

    connectStream();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const clearEvents = () => {
    setEvents([]);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    return event.type.toLowerCase().includes(filter.toLowerCase());
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'INCOMING_MESSAGE': return MessageSquare;
      case 'LANGUAGE_DETECTION': return Brain;
      case 'MESSAGE_PROCESSING': return Settings;
      case 'INTENT_EXTRACTION': return Brain;
      case 'APPROVAL_DECISION': return CheckCircle;
      case 'ACTION_EXECUTION': return Play;
      case 'ERROR_OCCURRED': return XCircle;
      case 'DEBUG_MODE_ENABLED': return Eye;
      case 'DEBUG_MODE_DISABLED': return EyeOff;
      default: return AlertTriangle;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'INCOMING_MESSAGE': return 'default';
      case 'LANGUAGE_DETECTION': return 'secondary';
      case 'MESSAGE_PROCESSING': return 'secondary';
      case 'INTENT_EXTRACTION': return 'secondary';
      case 'APPROVAL_DECISION': return 'default';
      case 'ACTION_EXECUTION': return 'default';
      case 'ERROR_OCCURRED': return 'destructive';
      case 'DEBUG_MODE_ENABLED': return 'default';
      case 'DEBUG_MODE_DISABLED': return 'secondary';
      default: return 'outline';
    }
  };

  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-IN', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const toggleExpanded = (eventId: string) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };

  const disableDebugMode = async (userId: string) => {
    try {
      const response = await fetch('/api/debug/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success(result.message || `Debug mode disabled for user ${userId}`);
      } else {
        toast.error(result.message || 'Failed to disable debug mode');
      }
    } catch (error) {
      console.error('Error disabling debug mode:', error);
      toast.error('Error disabling debug mode');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Debug Test Mode</h2>
          <p className="text-muted-foreground">Real-time agent behavior monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? 'default' : 'destructive'} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button variant="outline" size="sm" onClick={togglePause}>
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="outline" size="sm" onClick={clearEvents}>
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        </div>
      </div>

      {/* Active Debug Users */}
      <Card>
        <CardHeader>
          <CardTitle>Active Debug Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {activeDebugUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No users in debug mode. Type "debug test mode" in Telegram to enable.
            </p>
          ) : (
            <div className="space-y-2">
              {activeDebugUsers.map((user) => (
                <div key={user.userId} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="font-medium">User {user.userId}</p>
                    <p className="text-xs text-muted-foreground">
                      Since {formatTimestamp(user.enabledAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">Active</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disableDebugMode(user.userId)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Power className="w-4 h-4" />
                      Disable
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Filter:</label>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1 border rounded text-sm"
        >
          <option value="all">All Events</option>
          <option value="message">Messages</option>
          <option value="language">Language</option>
          <option value="intent">Intent</option>
          <option value="approval">Approval</option>
          <option value="action">Action</option>
          <option value="error">Errors</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      {/* Debug Events Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Debug Events Timeline
            <Badge variant="outline">
              {filteredEvents.length} events
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {isConnected ? 'No events yet. Send a message in debug mode to see events.' : 'Connect to debug stream to see events.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEvents.map((event, index) => {
                  const Icon = getEventIcon(event.type);
                  const isExpanded = expandedEvent === `${event.type}-${index}`;
                  
                  return (
                    <div 
                      key={`${event.type}-${index}`} 
                      className="border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <Badge variant={getEventColor(event.type)} className="text-xs">
                            {event.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-2">
                            {formatTimestamp(event.timestamp)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpanded(`${event.type}-${index}`)}
                        >
                          {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      
                      {/* Event Summary */}
                      <div className="text-sm">
                        {event.type === 'INCOMING_MESSAGE' && (() => {
                          const payload = event.payload as { text?: string };
                          return <p>Message received: <span className="font-mono bg-muted px-1 rounded">"{payload.text}"</span></p>;
                        })()}
                        {event.type === 'LANGUAGE_DETECTION' && (() => {
                          const payload = event.payload as { detectedLanguage?: string };
                          return <p>Language detected: <span className="font-medium">{payload.detectedLanguage}</span></p>;
                        })()}
                        {event.type === 'DEBUG_MODE_ENABLED' && (() => {
                          const payload = event.payload as { userId?: string };
                          return <p>Debug mode enabled for user <span className="font-medium">{payload.userId}</span></p>;
                        })()}
                        {event.type === 'DEBUG_MODE_DISABLED' && (() => {
                          const payload = event.payload as { userId?: string };
                          return <p>Debug mode disabled for user <span className="font-medium">{payload.userId}</span></p>;
                        })()}
                        {event.type === 'ERROR_OCCURRED' && (() => {
                          const payload = event.payload as { errorMessage?: string };
                          return <p className="text-red-600">
                            Error: <span className="font-medium">{payload.errorMessage}</span>
                          </p>;
                        })()}
                        {['MESSAGE_PROCESSING', 'INTENT_EXTRACTION', 'APPROVAL_DECISION', 'ACTION_EXECUTION'].includes(event.type) && (() => {
                          const payload = event.payload as { processingStep?: string; status?: string };
                          return <p>
                            Step: <span className="font-medium">{payload.processingStep}</span>
                            {payload.status && (
                              <> - Status: <span className="font-medium">{payload.status}</span></>
                            )}
                          </p>;
                        })()}
                      </div>

                      {/* Expandable Raw JSON */}
                      {isExpanded && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs">
                          <div className="font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(event.payload, null, 2)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
