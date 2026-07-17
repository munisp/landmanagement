/**
 * Contextual Help System
 * Provides inline tooltips, guided workflows, and contextual assistance
 */

import { useState, useEffect } from 'react';

export interface HelpContent {
  id: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  trigger?: 'hover' | 'click' | 'focus';
  videoUrl?: string;
  relatedArticles?: Array<{ title: string; url: string }>;
}

export interface GuidedWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  currentStep: number;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  element: string; // CSS selector
  action: 'click' | 'input' | 'navigate';
  validation?: () => boolean;
}

/**
 * Help content database
 */
export const HELP_CONTENT: Record<string, HelpContent> = {
  'parcel-registration-title': {
    id: 'parcel-registration-title',
    title: 'Parcel Title Number',
    content: 'Enter the unique title number assigned to this parcel. Format: STATE-LGA-WARD-NUMBER (e.g., LAG-IKJ-001-12345)',
    position: 'right',
    trigger: 'focus',
    relatedArticles: [
      { title: 'Understanding Title Numbers', url: '/help/title-numbers' },
      { title: 'Parcel Registration Guide', url: '/help/parcel-registration' },
    ],
  },
  'parcel-registration-area': {
    id: 'parcel-registration-area',
    title: 'Parcel Area',
    content: 'Enter the total area of the parcel. You can use square meters, hectares, or acres. The system will automatically convert to standard units.',
    position: 'right',
    trigger: 'focus',
  },
  'parcel-registration-coordinates': {
    id: 'parcel-registration-coordinates',
    title: 'GPS Coordinates',
    content: 'Enter the GPS coordinates of the parcel boundaries. You can click "Use Current Location" to automatically fill this field if you\'re at the property site.',
    position: 'top',
    trigger: 'focus',
    videoUrl: '/videos/gps-coordinates-guide.mp4',
  },
  'transaction-type': {
    id: 'transaction-type',
    title: 'Transaction Type',
    content: 'Select the type of transaction: Transfer (change of ownership), Subdivision (split parcel), Mortgage (loan collateral), or Lease (temporary rights).',
    position: 'bottom',
    trigger: 'click',
  },
  'document-upload-requirements': {
    id: 'document-upload-requirements',
    title: 'Document Requirements',
    content: 'Required documents: Survey Plan, Deed of Assignment, Tax Clearance Certificate, and valid ID. Accepted formats: PDF, JPG, PNG. Maximum size: 10MB per file.',
    position: 'left',
    trigger: 'hover',
  },
  'blockchain-verification': {
    id: 'blockchain-verification',
    title: 'Blockchain Verification',
    content: 'This transaction will be recorded on the blockchain for immutable verification. Once confirmed, it cannot be altered or deleted.',
    position: 'top',
    trigger: 'hover',
  },
};

/**
 * Guided workflows for complex processes
 */
export const GUIDED_WORKFLOWS: Record<string, Omit<GuidedWorkflow, 'currentStep'>> = {
  'parcel-registration': {
    id: 'parcel-registration',
    name: 'Parcel Registration',
    steps: [
      {
        id: 'step-1',
        title: 'Enter Basic Information',
        description: 'Start by entering the parcel title number, location, and area',
        element: '#parcel-basic-info',
        action: 'input',
      },
      {
        id: 'step-2',
        title: 'Add GPS Coordinates',
        description: 'Mark the parcel boundaries on the map or enter coordinates manually',
        element: '#parcel-coordinates',
        action: 'input',
      },
      {
        id: 'step-3',
        title: 'Upload Required Documents',
        description: 'Upload survey plan, deed, and other required documents',
        element: '#document-upload',
        action: 'click',
      },
      {
        id: 'step-4',
        title: 'Review and Submit',
        description: 'Review all information and submit for verification',
        element: '#submit-button',
        action: 'click',
      },
    ],
  },
  'title-transfer': {
    id: 'title-transfer',
    name: 'Title Transfer',
    steps: [
      {
        id: 'step-1',
        title: 'Select Parcel',
        description: 'Search and select the parcel you want to transfer',
        element: '#parcel-search',
        action: 'input',
      },
      {
        id: 'step-2',
        title: 'Enter Recipient Details',
        description: 'Provide the new owner\'s information and verify their identity',
        element: '#recipient-details',
        action: 'input',
      },
      {
        id: 'step-3',
        title: 'Upload Transfer Documents',
        description: 'Upload deed of assignment and tax clearance',
        element: '#transfer-documents',
        action: 'click',
      },
      {
        id: 'step-4',
        title: 'Set Transfer Amount',
        description: 'Enter the transfer amount and payment method',
        element: '#transfer-amount',
        action: 'input',
      },
      {
        id: 'step-5',
        title: 'Review and Initiate',
        description: 'Review all details and initiate the transfer',
        element: '#initiate-transfer',
        action: 'click',
      },
    ],
  },
};

/**
 * Hook for contextual help
 */
export function useContextualHelp(helpId: string) {
  const [isVisible, setIsVisible] = useState(false);
  const [content, setContent] = useState<HelpContent | null>(null);

  useEffect(() => {
    const helpContent = HELP_CONTENT[helpId];
    if (helpContent) {
      setContent(helpContent);
    }
  }, [helpId]);

  const show = () => setIsVisible(true);
  const hide = () => setIsVisible(false);
  const toggle = () => setIsVisible(!isVisible);

  return {
    isVisible,
    content,
    show,
    hide,
    toggle,
  };
}

/**
 * Hook for guided workflows
 */
export function useGuidedWorkflow(workflowId: string) {
  const [workflow, setWorkflow] = useState<GuidedWorkflow | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const workflowTemplate = GUIDED_WORKFLOWS[workflowId];
    if (workflowTemplate) {
      setWorkflow({
        ...workflowTemplate,
        currentStep: 0,
      });
    }
  }, [workflowId]);

  const start = () => {
    setIsActive(true);
    if (workflow) {
      setWorkflow({ ...workflow, currentStep: 0 });
    }
  };

  const next = () => {
    if (workflow && workflow.currentStep < workflow.steps.length - 1) {
      setWorkflow({ ...workflow, currentStep: workflow.currentStep + 1 });
    } else {
      complete();
    }
  };

  const previous = () => {
    if (workflow && workflow.currentStep > 0) {
      setWorkflow({ ...workflow, currentStep: workflow.currentStep - 1 });
    }
  };

  const goToStep = (stepIndex: number) => {
    if (workflow && stepIndex >= 0 && stepIndex < workflow.steps.length) {
      setWorkflow({ ...workflow, currentStep: stepIndex });
    }
  };

  const complete = () => {
    setIsActive(false);
    // Store completion in localStorage
    if (workflow) {
      const completedWorkflows = JSON.parse(
        localStorage.getItem('completedWorkflows') || '[]'
      );
      if (!completedWorkflows.includes(workflow.id)) {
        completedWorkflows.push(workflow.id);
        localStorage.setItem('completedWorkflows', JSON.stringify(completedWorkflows));
      }
    }
  };

  const skip = () => {
    setIsActive(false);
  };

  const currentStep = workflow?.steps[workflow.currentStep];
  const progress = workflow
    ? ((workflow.currentStep + 1) / workflow.steps.length) * 100
    : 0;

  return {
    workflow,
    currentStep,
    isActive,
    progress,
    start,
    next,
    previous,
    goToStep,
    complete,
    skip,
  };
}

/**
 * Check if user has completed a workflow
 */
export function hasCompletedWorkflow(workflowId: string): boolean {
  const completedWorkflows = JSON.parse(
    localStorage.getItem('completedWorkflows') || '[]'
  );
  return completedWorkflows.includes(workflowId);
}

/**
 * Get user's help preferences
 */
export function getHelpPreferences() {
  return {
    showTooltips: localStorage.getItem('showTooltips') !== 'false',
    showGuidedWorkflows: localStorage.getItem('showGuidedWorkflows') !== 'false',
    autoStartWorkflows: localStorage.getItem('autoStartWorkflows') === 'true',
  };
}

/**
 * Update help preferences
 */
export function updateHelpPreferences(preferences: Partial<ReturnType<typeof getHelpPreferences>>) {
  if (preferences.showTooltips !== undefined) {
    localStorage.setItem('showTooltips', String(preferences.showTooltips));
  }
  if (preferences.showGuidedWorkflows !== undefined) {
    localStorage.setItem('showGuidedWorkflows', String(preferences.showGuidedWorkflows));
  }
  if (preferences.autoStartWorkflows !== undefined) {
    localStorage.setItem('autoStartWorkflows', String(preferences.autoStartWorkflows));
  }
}

/**
 * Track help interaction analytics
 */
export function trackHelpInteraction(helpId: string, action: 'view' | 'click' | 'complete') {
  const interactions = JSON.parse(localStorage.getItem('helpInteractions') || '{}');
  
  if (!interactions[helpId]) {
    interactions[helpId] = {
      views: 0,
      clicks: 0,
      completes: 0,
      lastInteraction: null,
    };
  }

  if (action === 'view') interactions[helpId].views++;
  if (action === 'click') interactions[helpId].clicks++;
  if (action === 'complete') interactions[helpId].completes++;
  interactions[helpId].lastInteraction = new Date().toISOString();

  localStorage.setItem('helpInteractions', JSON.stringify(interactions));
}
