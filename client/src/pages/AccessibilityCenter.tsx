import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BookOpen, Contrast, Ear, Gauge, Keyboard, Sparkles, Volume2 } from 'lucide-react';
import { applyAccessibilityPreferences, getAccessibilityPreferences, saveAccessibilityPreferences, type AccessibilityPreferences } from '@/lib/accessibilityPreferences';

export default function AccessibilityCenter() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => getAccessibilityPreferences());

  useEffect(() => {
    applyAccessibilityPreferences(preferences);
  }, [preferences]);

  const update = <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveAccessibilityPreferences(next);
  };

  const Toggle = ({ preference, icon: Icon, label, description }: { preference: keyof Pick<AccessibilityPreferences, 'screenReaderHints' | 'keyboardMode' | 'highContrast' | 'simplifiedMode' | 'wizardWorkflow' | 'dyslexiaFont' | 'lowBandwidth'>; icon: typeof Ear; label: string; description: string }) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <div><Label className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</Label><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      <Switch checked={preferences[preference]} onCheckedChange={(value) => update(preference, value)} aria-label={label} />
    </div>
  );

  return <main className="container space-y-6 py-8">
    <header className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Inclusive service delivery</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Accessibility & connectivity preferences</h1><p className="mt-3 text-muted-foreground">These browser-local choices improve reading, navigation, and bandwidth use across the PWA. They never remove a required review, verification, consent, or statutory service step.</p></header>

    <section className="grid gap-4 md:grid-cols-4"><Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Keyboard navigation</p><p className="mt-2 text-xl font-semibold">{preferences.keyboardMode ? 'Enabled' : 'Standard'}</p></CardContent></Card><Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Reading mode</p><p className="mt-2 text-xl font-semibold">{preferences.dyslexiaFont ? 'Reader friendly' : 'Default'}</p></CardContent></Card><Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Workflow density</p><p className="mt-2 text-xl font-semibold">{preferences.simplifiedMode ? 'Simplified' : 'Standard'}</p></CardContent></Card><Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Connectivity mode</p><p className="mt-2 text-xl font-semibold">{preferences.lowBandwidth ? 'Low bandwidth' : 'Full experience'}</p></CardContent></Card></section>

    <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]"><Card><CardHeader><CardTitle>Personal interface controls</CardTitle><CardDescription>Preferences are saved on this device. Use the assisted-service path when a person needs human or non-digital support.</CardDescription></CardHeader><CardContent className="space-y-4"><Toggle preference="screenReaderHints" icon={Ear} label="Screen-reader guidance" description="Announce state changes and use clearer assistive cues." /><Toggle preference="keyboardMode" icon={Keyboard} label="Keyboard-first navigation" description="Keep shortcut affordances and focus treatment visible." /><Toggle preference="highContrast" icon={Contrast} label="High-contrast preference" description="Use stronger surface and text distinction in addition to system contrast settings." /><Toggle preference="simplifiedMode" icon={Sparkles} label="Simplified workflow density" description="Reduce decorative detail and emphasize the next safe action." /><Toggle preference="wizardWorkflow" icon={BookOpen} label="Guided task steps" description="Prefer staged instructions for complex tasks where supported." /><Toggle preference="dyslexiaFont" icon={BookOpen} label="Reader-friendly letter spacing" description="Increase spacing and avoid overly condensed text." /><Toggle preference="lowBandwidth" icon={Gauge} label="Low-bandwidth mode" description="Reduce animation and decorative imagery; map and document operations still require their governed online connection." /><div className="space-y-2 rounded-xl border p-4"><Label className="flex items-center gap-2"><Volume2 className="h-4 w-4" />Assistive reading prompt</Label><Input value={preferences.ttsPrompt} onChange={(event) => update('ttsPrompt', event.target.value)} aria-describedby="tts-prompt-help" /><p id="tts-prompt-help" className="text-sm text-muted-foreground">Used as contextual text for supported assistive-reader workflows. Do not enter personal or case information here.</p></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Service continuity and support</CardTitle><CardDescription>Accessibility settings improve the interface, while assisted service provides accountable human support when digital completion is not appropriate.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm text-muted-foreground"><div className="rounded-xl border p-4"><p className="font-medium text-foreground">Current interface posture</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{preferences.screenReaderHints ? 'Screen-reader cues' : 'Reader cues off'}</Badge><Badge variant="outline">{preferences.highContrast ? 'High contrast' : 'System contrast'}</Badge><Badge variant="outline">{preferences.lowBandwidth ? 'Low bandwidth' : 'Full experience'}</Badge><Badge variant="outline">{preferences.wizardWorkflow ? 'Guided steps' : 'Expert workflow'}</Badge></div></div><div className="rounded-xl border p-4"><p className="font-medium text-foreground">When to use assisted service</p><p className="mt-2">Choose in-person, phone, kiosk, outreach, or accessibility assistance for connectivity barriers, accessibility needs, identity support, or any task that should not be completed independently.</p></div><div className="flex flex-wrap gap-3"><Button asChild><Link href="/support-center">Open Support Center</Link></Button><Button variant="outline" asChild><Link href="/admin/nationwide-rollout">Open assisted-service controls</Link></Button><Button variant="outline" asChild><Link href="/getting-started">Return to guided onboarding</Link></Button></div></CardContent></Card></section>
  </main>;
}
