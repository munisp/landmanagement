/**
 * Keyboard Shortcuts System
 * Global keyboard shortcuts for power users
 */

import hotkeys from 'hotkeys-js';
import { toast } from 'sonner';

export interface Shortcut {
  key: string;
  description: string;
  action: () => void;
  scope?: string;
}

const shortcuts: Shortcut[] = [];

/**
 * Register a keyboard shortcut
 */
export function registerShortcut(shortcut: Shortcut) {
  const { key, action, scope = 'all' } = shortcut;
  
  hotkeys(key, scope, (event) => {
    event.preventDefault();
    action();
    return false;
  });
  
  shortcuts.push(shortcut);
}

/**
 * Unregister a keyboard shortcut
 */
export function unregisterShortcut(key: string, scope: string = 'all') {
  hotkeys.unbind(key, scope);
  const index = shortcuts.findIndex(s => s.key === key && (s.scope || 'all') === scope);
  if (index > -1) {
    shortcuts.splice(index, 1);
  }
}

/**
 * Get all registered shortcuts
 */
export function getAllShortcuts(): Shortcut[] {
  return shortcuts;
}

/**
 * Initialize default keyboard shortcuts
 */
export function initializeKeyboardShortcuts(navigate: (path: string) => void) {
  // Global shortcuts
  registerShortcut({
    key: 'ctrl+k,cmd+k',
    description: 'Open search',
    action: () => {
      navigate('/search');
      toast.info('Search opened (Ctrl+K)');
    },
  });

  registerShortcut({
    key: 'ctrl+h,cmd+h',
    description: 'Go to home',
    action: () => {
      navigate('/');
      toast.info('Home (Ctrl+H)');
    },
  });

  registerShortcut({
    key: 'ctrl+d,cmd+d',
    description: 'Go to dashboard',
    action: () => {
      navigate('/dashboard');
      toast.info('Dashboard (Ctrl+D)');
    },
  });

  registerShortcut({
    key: 'ctrl+n,cmd+n',
    description: 'New parcel registration',
    action: () => {
      navigate('/parcels/new');
      toast.info('New Parcel (Ctrl+N)');
    },
  });

  registerShortcut({
    key: 'ctrl+t,cmd+t',
    description: 'New transaction',
    action: () => {
      navigate('/transactions/new');
      toast.info('New Transaction (Ctrl+T)');
    },
  });

  registerShortcut({
    key: 'ctrl+b,cmd+b',
    description: 'Bulk operations',
    action: () => {
      navigate('/bulk-operations');
      toast.info('Bulk Operations (Ctrl+B)');
    },
  });

  registerShortcut({
    key: 'ctrl+a,cmd+a',
    description: 'Analytics dashboard',
    action: () => {
      navigate('/analytics');
      toast.info('Analytics (Ctrl+A)');
    },
  });

  registerShortcut({
    key: 'ctrl+w,cmd+w',
    description: 'Workflow designer',
    action: () => {
      navigate('/workflow-designer');
      toast.info('Workflow Designer (Ctrl+W)');
    },
  });

  registerShortcut({
    key: '/',
    description: 'Focus search input',
    action: () => {
      const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        toast.info('Search focused (/)');
      }
    },
  });

  registerShortcut({
    key: 'esc',
    description: 'Close modals/dialogs',
    action: () => {
      // Trigger escape key event to close any open modals
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    },
  });

  registerShortcut({
    key: '?',
    description: 'Show keyboard shortcuts help',
    action: () => {
      showShortcutsHelp();
    },
  });

  // Set scope filter to allow shortcuts in input fields (except for /)
  hotkeys.filter = function(event) {
    const target = event.target as HTMLElement;
    const tagName = target.tagName;
    
    // Allow '?' and 'esc' everywhere
    if (event.key === '?' || event.key === 'Escape') {
      return true;
    }
    
    // Block other shortcuts in input/textarea/select
    return !(tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA');
  };
}

/**
 * Show shortcuts help dialog
 */
function showShortcutsHelp() {
  const shortcutsList = getAllShortcuts()
    .map(s => `${s.key.split(',')[0]}: ${s.description}`)
    .join('\n');
  
  toast.info('Keyboard Shortcuts', {
    description: shortcutsList,
    duration: 10000,
  });
}

/**
 * Cleanup all shortcuts
 */
export function cleanupKeyboardShortcuts() {
  hotkeys.unbind();
  shortcuts.length = 0;
}
