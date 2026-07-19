import { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Ear, Keyboard, Contrast, Volume2, Sparkles, BookOpen } from 'lucide-react';

export default function AccessibilityCenter() {
  const [screenReaderHints, setScreenReaderHints] = useState(true);
  const [keyboardMode, setKeyboardMode] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [ttsPrompt, setTtsPrompt] = useState('Read section headings and required form guidance aloud before data entry.');
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const [wizardWorkflow, setWizardWorkflow] = useState(true);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Accessibility & Inclusivity Center</h1>
        <p className="text-muted-foreground mt-2">Configure inclusive workflow aids for screen-reader guidance, keyboard navigation, contrast, text-to-speech instructions, simplified operation, guided wizards, and dyslexia-friendly reading preferences.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Keyboard shortcuts</p><p className="mt-2 text-2xl font-semibold">{keyboardMode ? 'Enabled' : 'Off'}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Reading mode</p><p className="mt-2 text-2xl font-semibold">{dyslexiaFont ? 'Dyslexia friendly' : 'Default'}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Workflow mode</p><p className="mt-2 text-2xl font-semibold">{simplifiedMode ? 'Simplified' : 'Standard'}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>Inclusive controls</CardTitle><CardDescription>Adjust accessibility behaviors and guided-workflow preferences.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Label className="flex items-center gap-2"><Ear className="h-4 w-4" />Screen-reader support</Label><p className="text-sm text-muted-foreground">Enable assistive announcements and reading cues.</p></div><Switch checked={screenReaderHints} onCheckedChange={setScreenReaderHints} /></div>
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Label className="flex items-center gap-2"><Keyboard className="h-4 w-4" />Comprehensive keyboard shortcuts</Label><p className="text-sm text-muted-foreground">Keep power-user and accessibility shortcuts visible and active.</p></div><Switch checked={keyboardMode} onCheckedChange={setKeyboardMode} /></div>
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Label className="flex items-center gap-2"><Contrast className="h-4 w-4" />High-contrast mode</Label><p className="text-sm text-muted-foreground">Increase color contrast for low-vision accessibility.</p></div><Switch checked={highContrast} onCheckedChange={setHighContrast} /></div>
            <div className="space-y-2 rounded-lg border p-4"><Label className="flex items-center gap-2"><Volume2 className="h-4 w-4" />Text-to-speech prompt</Label><Input value={ttsPrompt} onChange={(e) => setTtsPrompt(e.target.value)} /><p className="text-sm text-muted-foreground">Use this prompt in supported assistive readers during form completion.</p></div>
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Label className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Simplified mode</Label><p className="text-sm text-muted-foreground">Reduce decision density for novice users.</p></div><Switch checked={simplifiedMode} onCheckedChange={setSimplifiedMode} /></div>
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Label className="flex items-center gap-2"><BookOpen className="h-4 w-4" />Wizard workflows</Label><p className="text-sm text-muted-foreground">Prefer guided, step-by-step task completion.</p></div><Switch checked={wizardWorkflow} onCheckedChange={setWizardWorkflow} /></div>
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Label>Dyslexia-friendly font mode</Label><p className="text-sm text-muted-foreground">Prefer letterforms that improve readability for dyslexic users.</p></div><Switch checked={dyslexiaFont} onCheckedChange={setDyslexiaFont} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Accessibility workflow guidance</CardTitle><CardDescription>Operational summary and routes into existing support and settings surfaces.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Current posture</p><div className="flex flex-wrap gap-2"><Badge variant="outline">{screenReaderHints ? 'Screen reader ready' : 'Screen reader off'}</Badge><Badge variant="outline">{keyboardMode ? 'Keyboard mode on' : 'Keyboard mode off'}</Badge><Badge variant="outline">{highContrast ? 'High contrast on' : 'High contrast off'}</Badge><Badge variant="outline">{simplifiedMode ? 'Simplified mode' : 'Standard mode'}</Badge></div></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Wizard-based workflows</p><p>{wizardWorkflow ? 'Users are guided through step-by-step sequences for novice-friendly completion.' : 'Users may use direct expert workflows.'}</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Assistive reading prompt</p><p>{ttsPrompt}</p></div>
            <div className="flex flex-wrap gap-3">
              <Button asChild><Link href="/settings">Open Settings</Link></Button>
              <Button variant="outline" asChild><Link href="/support-center">Open Support Center</Link></Button>
              <Button variant="outline" asChild><Link href="/collaboration">Open Collaboration</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
