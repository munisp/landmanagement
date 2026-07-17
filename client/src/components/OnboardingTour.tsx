/**
 * User Onboarding Tour Component
 * Provides interactive product tour for new users
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string; // CSS selector for the element to highlight
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to IDLR Property Title System',
    description: 'Let\'s take a quick tour to help you get started with managing land parcels, transactions, and documents.',
    target: 'body',
    position: 'bottom',
  },
  {
    id: 'navigation',
    title: 'Navigation Menu',
    description: 'Access all major features from the sidebar. You can navigate to Parcels, Transactions, Documents, and more.',
    target: '[data-tour="navigation"]',
    position: 'right',
  },
  {
    id: 'parcels',
    title: 'Land Parcels',
    description: 'View and manage all registered land parcels. You can search, filter, and register new parcels here.',
    target: '[data-tour="parcels-link"]',
    position: 'right',
  },
  {
    id: 'register-parcel',
    title: 'Register New Parcel',
    description: 'Click here to register a new land parcel. You\'ll need to provide details like location, area, and ownership information.',
    target: '[data-tour="register-parcel"]',
    position: 'bottom',
  },
  {
    id: 'transactions',
    title: 'Transactions',
    description: 'Initiate and track property transactions including transfers, mortgages, and leases.',
    target: '[data-tour="transactions-link"]',
    position: 'right',
  },
  {
    id: 'documents',
    title: 'Document Management',
    description: 'Upload and manage important documents like title deeds, survey plans, and certificates.',
    target: '[data-tour="documents-link"]',
    position: 'right',
  },
  {
    id: 'blockchain',
    title: 'Blockchain Verification',
    description: 'Verify the authenticity of property records on the blockchain for added security and transparency.',
    target: '[data-tour="blockchain-link"]',
    position: 'right',
  },
  {
    id: 'profile',
    title: 'User Profile',
    description: 'Access your profile settings, notification preferences, and account information here.',
    target: '[data-tour="user-profile"]',
    position: 'left',
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'You\'ve completed the tour. Start exploring the system and managing your property records. You can restart this tour anytime from your profile settings.',
    target: 'body',
    position: 'bottom',
  },
];

export function OnboardingTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompletedOnboarding = localStorage.getItem('onboarding_completed');
    
    if (!hasCompletedOnboarding) {
      // Show tour after a short delay
      const timer = setTimeout(() => {
        setIsActive(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      const nextStep = tourSteps[currentStep + 1];
      
      // Execute step action if defined
      if (nextStep.action) {
        nextStep.action();
      }
      
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = () => {
    localStorage.setItem('onboarding_completed', 'true');
    setIsActive(false);
  };

  if (!isActive) {
    return null;
  }

  const step = tourSteps[currentStep];
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-[9998]" />
      
      {/* Spotlight effect */}
      {step.target !== 'body' && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.3s ease',
          }}
        />
      )}
      
      {/* Tour Card */}
      <Card className="fixed z-[10000] max-w-md p-6 shadow-2xl">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Step {currentStep + 1} of {tourSteps.length}
                </span>
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Content */}
          <p className="text-sm text-muted-foreground">{step.description}</p>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip Tour
            </Button>
            
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  size="sm"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
              )}
              
              <Button onClick={handleNext} size="sm">
                {currentStep === tourSteps.length - 1 ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

/**
 * Onboarding Checklist Component
 * Shows progress of key onboarding tasks
 */

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action?: () => void;
}

export function OnboardingChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: 'profile',
      title: 'Complete Your Profile',
      description: 'Add your contact information and preferences',
      completed: false,
    },
    {
      id: 'parcel',
      title: 'Register Your First Parcel',
      description: 'Add a land parcel to the system',
      completed: false,
    },
    {
      id: 'document',
      title: 'Upload a Document',
      description: 'Upload a title deed or survey plan',
      completed: false,
    },
    {
      id: 'transaction',
      title: 'Initiate a Transaction',
      description: 'Start your first property transaction',
      completed: false,
    },
    {
      id: 'blockchain',
      title: 'Verify on Blockchain',
      description: 'Verify a parcel on the blockchain',
      completed: false,
    },
  ]);

  const completedCount = items.filter(item => item.completed).length;
  const progress = (completedCount / items.length) * 100;

  // Check if checklist should be shown
  const showChecklist = localStorage.getItem('onboarding_completed') && completedCount < items.length;

  if (!showChecklist) {
    return null;
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Get Started</h3>
          <span className="text-sm text-muted-foreground">
            {completedCount} of {items.length} completed
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Checklist Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
            onClick={item.action}
          >
            <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
              item.completed ? 'bg-primary border-primary' : 'border-muted-foreground'
            }`}>
              {item.completed && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            
            <div className="flex-1 space-y-1">
              <p className={`text-sm font-medium ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      {progress === 100 && (
        <div className="p-4 bg-primary/10 rounded-lg text-center">
          <p className="text-sm font-medium text-primary">
            🎉 Congratulations! You've completed all onboarding tasks.
          </p>
        </div>
      )}
    </Card>
  );
}

/**
 * Contextual Tooltip Component
 * Shows helpful tips for complex features
 */

interface TooltipProps {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function ContextualTooltip({ id, title, description, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if tooltip has been dismissed
    const dismissed = localStorage.getItem(`tooltip_dismissed_${id}`);
    setIsDismissed(!!dismissed);
  }, [id]);

  const handleDismiss = () => {
    localStorage.setItem(`tooltip_dismissed_${id}`, 'true');
    setIsDismissed(true);
    setIsVisible(false);
  };

  if (isDismissed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      
      {isVisible && (
        <Card className="absolute z-50 p-4 max-w-xs shadow-lg mt-2">
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <h4 className="text-sm font-semibold">{title}</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-1 -mr-1"
                onClick={handleDismiss}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
