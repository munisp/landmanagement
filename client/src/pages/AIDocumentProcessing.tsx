import { useEffect, useMemo, useRef, useState } from 'react';
import { AIChatBox, type Message } from '@/components/AIChatBox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Sparkles, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc';

type AssistantSuggestion = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const RECENT_PROMPTS_KEY = 'ai-assistant-recent-prompts';

function loadRecentPrompts(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_PROMPTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function persistRecentPrompt(prompt: string) {
  if (typeof window === 'undefined') return;
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const next = [trimmed, ...loadRecentPrompts().filter((item) => item !== trimmed)].slice(0, 6);
  window.localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(next));
}

function buildAssistantReply(input: string, recentPrompts: string[], serviceStatus: { ocr?: string; fraud?: string }) {
  const normalized = input.toLowerCase();

  if (normalized.includes('ocr') || normalized.includes('document')) {
    return `The document workflow is ready. OCR service status is **${serviceStatus.ocr || 'unknown'}** and you can continue with document extraction, verification review, or signature validation from this platform.`;
  }

  if (normalized.includes('fraud') || normalized.includes('risk')) {
    return `Fraud-analysis tooling is available. Fraud service status is **${serviceStatus.fraud || 'unknown'}**. You can use the security and transaction workflows to review suspicious activity, anomaly signals, and incident-response actions.`;
  }

  if (normalized.includes('search') || normalized.includes('parcel')) {
    return 'Use the search and geospatial modules for parcel discovery, batch actions, and advanced map-based review. The assistant can help you frame the next query or workflow step.';
  }

  if (recentPrompts.length > 1) {
    return `Based on your recent activity, you often ask about **${recentPrompts[0]}** and **${recentPrompts[1]}**. A practical next step is to continue with the closest operational workflow and verify statuses before exporting or escalating.`;
  }

  return 'I can help summarize platform workflows, guide document processing, frame parcel-search queries, or point you to the right operational workspace. Try asking about OCR, fraud review, parcel search, privacy export, or support analytics.';
}

export default function AIDocumentProcessing() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'You are an operational land-platform assistant that helps users navigate document processing, search, compliance, and support workflows.',
    },
    {
      role: 'assistant',
      content: 'Welcome to the AI Assistant workspace. You can type or dictate a request, and I will guide you to the right workflow using the services already available in this platform.',
    },
  ]);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const { data: ocrStatus } = trpc.ai.getOCRStatus.useQuery(undefined, { retry: false });
  const { data: fraudStatus } = trpc.ai.getFraudDetectionStatus.useQuery(undefined, { retry: false });

  useEffect(() => {
    setRecentPrompts(loadRecentPrompts());
  }, []);

  const suggestions = useMemo<AssistantSuggestion[]>(() => {
    const historySuggestions = recentPrompts.slice(0, 3).map((prompt, index) => ({
      id: `recent-${index}`,
      label: `Resume: ${prompt.slice(0, 42)}${prompt.length > 42 ? '…' : ''}`,
      prompt,
      reason: 'Suggested from your recent assistant activity.',
    }));

    const operationalSuggestions: AssistantSuggestion[] = [
      {
        id: 'ocr-health',
        label: 'Check document processing readiness',
        prompt: 'Summarize the OCR and document-processing readiness of the platform.',
        reason: 'Helpful before submitting new document review work.',
      },
      {
        id: 'fraud-follow-up',
        label: 'Review fraud and threat posture',
        prompt: 'What fraud-analysis and security-response capabilities are available right now?',
        reason: 'Suggested for security and compliance workflows.',
      },
      {
        id: 'search-guidance',
        label: 'Frame a parcel discovery query',
        prompt: 'Help me form a natural-language parcel discovery query for high-priority registry work.',
        reason: 'Useful when moving into search and geospatial review.',
      },
    ];

    return [...historySuggestions, ...operationalSuggestions].slice(0, 6);
  }, [recentPrompts]);

  const sendPrompt = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    persistRecentPrompt(trimmed);
    const nextRecent = loadRecentPrompts();
    setRecentPrompts(nextRecent);
    setIsGenerating(true);

    const reply = buildAssistantReply(trimmed, nextRecent, {
      ocr: ocrStatus?.status,
      fraud: fraudStatus?.status,
    });

    window.setTimeout(() => {
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      setIsGenerating(false);
    }, 350);
  };

  const toggleVoiceCapture = () => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setVoiceTranscript('Voice dictation is not supported in this browser.');
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new RecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results || [])
          .map((result: any) => result?.[0]?.transcript || '')
          .join(' ')
          .trim();
        setVoiceTranscript(transcript || 'Voice note captured.');
        if (transcript) {
          sendPrompt(transcript);
        }
      };
      recognition.onerror = () => {
        setVoiceTranscript('Voice capture failed. Please try again or type your request.');
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    setVoiceTranscript('Listening for a hands-free request…');
    setIsListening(true);
    recognitionRef.current.start();
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Assistant Workspace</h1>
          <p className="mt-2 text-muted-foreground">
            Multi-turn assistant guidance with hands-free voice capture, workflow-aware suggestions, and live AI service readiness signals.
          </p>
        </div>
        <Button type="button" variant={isListening ? 'destructive' : 'outline'} className="gap-2 self-start" onClick={toggleVoiceCapture}>
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isListening ? 'Stop voice capture' : 'Start voice request'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />OCR service</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={ocrStatus?.status === 'online' ? 'default' : 'outline'}>{ocrStatus?.status || 'unknown'}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Fraud service</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={fraudStatus?.status === 'online' ? 'default' : 'outline'}>{fraudStatus?.status || 'unknown'}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Behavior-driven prompts</CardTitle>
            <CardDescription>Suggestions adapt to your recent assistant activity in this browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{suggestions.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <AIChatBox
          messages={messages}
          onSendMessage={sendPrompt}
          isLoading={isGenerating}
          height="680px"
          emptyStateMessage="Ask the assistant about documents, fraud review, parcel search, privacy, or support workflows."
          suggestedPrompts={suggestions.map((item) => item.prompt)}
        />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hands-free voice request</CardTitle>
              <CardDescription>Use browser speech recognition for quick field or operations prompts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{voiceTranscript || 'No voice request captured yet.'}</p>
              <Button type="button" variant="secondary" className="w-full" onClick={toggleVoiceCapture}>
                {isListening ? 'Stop listening' : 'Capture voice request'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Proactive suggestions</CardTitle>
              <CardDescription>Generated from recent assistant activity and current operational workflows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => sendPrompt(item.prompt)}
                  className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/40"
                >
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
