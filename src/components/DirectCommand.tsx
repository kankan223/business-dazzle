import React, { useState } from 'react';
import { Send, Command, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ApiService } from '@/services/api';

interface DirectCommandProps {
  onResponse?: (response: any) => void;
}

export const DirectCommand: React.FC<DirectCommandProps> = ({ onResponse }) => {
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<Array<{command: string, response: any, timestamp: string}>>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    setIsLoading(true);
    try {
      const response = await ApiService.directCommand(command, 'web', 'admin');
      
      if (response.success) {
        const newEntry = {
          command: command,
          response: response.response,
          timestamp: new Date().toISOString()
        };
        
        setHistory(prev => [newEntry, ...prev.slice(0, 9)]); // Keep last 10 entries
        onResponse?.(response.response);
        toast.success('Command processed successfully!');
        setCommand('');
      } else {
        toast.error('Failed to process command');
      }
    } catch (error: any) {
      console.error('Direct command error:', error);
      toast.error('Failed to process command');
    } finally {
      setIsLoading(false);
    }
  };

  const quickCommands = [
    { cmd: '/help', desc: 'Show help menu' },
    { cmd: '/ping', desc: 'Check bot status' },
    { cmd: '/language', desc: 'Language options' },
    { cmd: '/voice', desc: 'Enable voice mode' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Command className="w-5 h-5" />
            Direct Command Interface
          </CardTitle>
          <CardDescription>
            Execute commands directly or chat with the AI assistant
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Type a command or message..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !command.trim()}>
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {quickCommands.map(({ cmd, desc }) => (
              <Button
                key={cmd}
                variant="outline"
                size="sm"
                onClick={() => setCommand(cmd)}
                disabled={isLoading}
              >
                {cmd}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              Command History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {history.map((entry, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-start">
                    <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      {entry.command}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {entry.response.text || JSON.stringify(entry.response)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
