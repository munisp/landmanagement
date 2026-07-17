import { useState, useEffect } from 'react';
import { Keyboard, Command } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['Ctrl', 'K'], description: 'Open search', category: 'Navigation' },
  { keys: ['Ctrl', 'D'], description: 'Go to dashboard', category: 'Navigation' },
  { keys: ['Ctrl', 'N'], description: 'Create new parcel', category: 'Navigation' },
  { keys: ['Ctrl', 'B'], description: 'Open bulk operations', category: 'Navigation' },
  { keys: ['Ctrl', 'A'], description: 'Open analytics', category: 'Navigation' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Navigation' },
  
  // Actions
  { keys: ['Ctrl', 'S'], description: 'Save current form', category: 'Actions' },
  { keys: ['Ctrl', 'Enter'], description: 'Submit form/comment', category: 'Actions' },
  { keys: ['Esc'], description: 'Close dialog/modal', category: 'Actions' },
  
  // Accessibility
  { keys: ['Tab'], description: 'Navigate forward', category: 'Accessibility' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backward', category: 'Accessibility' },
  { keys: ['Enter'], description: 'Activate focused element', category: 'Accessibility' },
  { keys: ['Space'], description: 'Toggle checkbox/button', category: 'Accessibility' },
];

export function KeyboardShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open dialog with '?' key
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Don't trigger if user is typing in an input
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }

      // Close dialog with Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)));

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? '⌘' : 'Ctrl';

  const formatKeys = (keys: string[]) => {
    return keys.map((key) => {
      if (key === 'Ctrl') return modifierKey;
      if (key === 'Enter') return '↵';
      if (key === 'Shift') return '⇧';
      if (key === 'Tab') return '⇥';
      if (key === 'Esc') return 'Esc';
      if (key === 'Space') return 'Space';
      return key;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these keyboard shortcuts to navigate faster
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter((s) => s.category === category)
                  .map((shortcut, index) => (
                    <Card key={index} className="border-0 shadow-none">
                      <CardContent className="flex items-center justify-between p-3 bg-muted/50">
                        <span className="text-sm">{shortcut.description}</span>
                        <div className="flex items-center gap-1">
                          {formatKeys(shortcut.keys).map((key, i) => (
                            <span key={i} className="flex items-center">
                              <Badge
                                variant="outline"
                                className="font-mono text-xs px-2 py-1"
                              >
                                {key}
                              </Badge>
                              {i < shortcut.keys.length - 1 && (
                                <span className="mx-1 text-muted-foreground">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> Press <Badge variant="outline" className="mx-1">?</Badge> anytime to view this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
