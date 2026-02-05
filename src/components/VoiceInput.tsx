import React, { useState, useRef } from 'react';
import { Mic, MicOff, Volume2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ApiService } from '@/services/api';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [supportedLanguages, setSupportedLanguages] = useState<any[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  React.useEffect(() => {
    // Load supported languages
    ApiService.getSpeechLanguages().then((data: any) => {
      if (data.success) {
        setSupportedLanguages(data.languages);
      }
    }).catch((err: any) => {
      console.error('Failed to load languages:', err);
    });
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        
        setIsProcessing(true);
        try {
          const result = await ApiService.speechToText(audioFile, selectedLanguage);
          
          if (result.success) {
            onTranscript(result.transcription);
            toast.success('Voice transcribed successfully!');
          } else {
            toast.error('Failed to transcribe voice');
          }
        } catch (error: any) {
          console.error('Speech-to-text error:', error);
          toast.error('Failed to transcribe voice');
        } finally {
          setIsProcessing(false);
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info('Recording started... Speak now!');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.info('Recording stopped. Processing...');
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
        <SelectTrigger className="w-[180px]">
          <Globe className="w-4 h-4 mr-2" />
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
          {supportedLanguages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Button
        onClick={toggleRecording}
        disabled={disabled || isProcessing}
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
      >
        {isRecording ? (
          <>
            <MicOff className="w-4 h-4 mr-2" />
            Stop Recording
          </>
        ) : (
          <>
            <Mic className="w-4 h-4 mr-2" />
            {isProcessing ? 'Processing...' : 'Voice Input'}
          </>
        )}
      </Button>
      
      {isRecording && (
        <div className="flex items-center gap-1">
          <Volume2 className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="text-sm text-red-500">Recording...</span>
        </div>
      )}
    </div>
  );
};
