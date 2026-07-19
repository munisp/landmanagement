/**
 * AddToHomeScreenPrompt Component
 * Smart PWA installation prompt with visit and time-on-site tracking
 */

import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_KEYS = {
  VISIT_COUNT: 'pwa_visit_count',
  FIRST_VISIT: 'pwa_first_visit',
  LAST_PROMPT: 'pwa_last_prompt',
  DISMISSED_COUNT: 'pwa_dismissed_count',
  INSTALLED: 'pwa_installed',
};

const THRESHOLDS = {
  MIN_VISITS: 3,
  MIN_TIME_ON_SITE: 120000, // 2 minutes in milliseconds
  DISMISS_COOLDOWN: 7 * 24 * 60 * 60 * 1000, // 7 days
  MAX_DISMISSALS: 3,
};

export function AddToHomeScreenPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Track visits
    const visitCount = parseInt(localStorage.getItem(STORAGE_KEYS.VISIT_COUNT) || '0');
    const firstVisit = localStorage.getItem(STORAGE_KEYS.FIRST_VISIT);
    
    if (!firstVisit) {
      localStorage.setItem(STORAGE_KEYS.FIRST_VISIT, new Date().toISOString());
    }
    
    localStorage.setItem(STORAGE_KEYS.VISIT_COUNT, (visitCount + 1).toString());

    // Check if already installed or dismissed too many times
    const installed = localStorage.getItem(STORAGE_KEYS.INSTALLED) === 'true';
    const dismissedCount = parseInt(localStorage.getItem(STORAGE_KEYS.DISMISSED_COUNT) || '0');
    
    if (installed || dismissedCount >= THRESHOLDS.MAX_DISMISSALS) {
      return;
    }

    // Check cooldown period
    const lastPrompt = localStorage.getItem(STORAGE_KEYS.LAST_PROMPT);
    if (lastPrompt) {
      const timeSinceLastPrompt = Date.now() - new Date(lastPrompt).getTime();
      if (timeSinceLastPrompt < THRESHOLDS.DISMISS_COOLDOWN) {
        return;
      }
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Track analytics
      trackAnalytics('pwa_prompt_available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Time-on-site tracking
    const timeoutId = setTimeout(() => {
      const currentVisitCount = parseInt(localStorage.getItem(STORAGE_KEYS.VISIT_COUNT) || '0');
      
      if (currentVisitCount >= THRESHOLDS.MIN_VISITS && deferredPrompt) {
        setShowPrompt(true);
        trackAnalytics('pwa_prompt_shown', {
          visitCount: currentVisitCount,
          timeOnSite: THRESHOLDS.MIN_TIME_ON_SITE,
        });
      }
    }, THRESHOLDS.MIN_TIME_ON_SITE);

    // Check if app was installed
    window.addEventListener('appinstalled', () => {
      localStorage.setItem(STORAGE_KEYS.INSTALLED, 'true');
      setShowPrompt(false);
      trackAnalytics('pwa_installed');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timeoutId);
    };
  }, [deferredPrompt]);

  // Show prompt when visit count threshold is met
  useEffect(() => {
    if (!deferredPrompt) return;

    const visitCount = parseInt(localStorage.getItem(STORAGE_KEYS.VISIT_COUNT) || '0');
    if (visitCount >= THRESHOLDS.MIN_VISITS) {
      // Wait for time-on-site threshold (handled in first useEffect)
    }
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for user choice
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === 'accepted') {
      trackAnalytics('pwa_install_accepted');
      localStorage.setItem(STORAGE_KEYS.INSTALLED, 'true');
    } else {
      trackAnalytics('pwa_install_dismissed');
      handleDismiss();
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    const dismissedCount = parseInt(localStorage.getItem(STORAGE_KEYS.DISMISSED_COUNT) || '0');
    localStorage.setItem(STORAGE_KEYS.DISMISSED_COUNT, (dismissedCount + 1).toString());
    localStorage.setItem(STORAGE_KEYS.LAST_PROMPT, new Date().toISOString());
    
    trackAnalytics('pwa_prompt_dismissed', {
      dismissedCount: dismissedCount + 1,
    });
    
    setShowPrompt(false);
  };

  const trackAnalytics = (event: string, data?: any) => {
    // Analytics tracking (can be extended with actual analytics service)
    console.log('[PWA Analytics]', event, data);
    
    // Could integrate with Google Analytics, Plausible, etc.
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', event, data);
    }
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-5">
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Install IDLR-PTS</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Install the app for quick launch, offline survey capture, and automatic sync recovery when connectivity returns.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={handleInstall} className="flex-1">
            Install
          </Button>
          <Button onClick={handleDismiss} variant="outline" className="flex-1">
            Not Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
