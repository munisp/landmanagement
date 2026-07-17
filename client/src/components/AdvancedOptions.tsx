/**
 * Advanced Options Component
 * Progressive disclosure for advanced form options
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';

interface AdvancedOptionsProps {
  children: React.ReactNode;
  title?: string;
  defaultOpen?: boolean;
}

export function AdvancedOptions({ 
  children, 
  title = "Advanced Options",
  defaultOpen = false 
}: AdvancedOptionsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg p-4 bg-muted/50">
      <Button
        variant="ghost"
        className="w-full justify-between p-0 h-auto font-semibold hover:bg-transparent"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>
      
      {isOpen && (
        <div className="mt-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
