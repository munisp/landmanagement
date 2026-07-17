import { ReactNode, useEffect, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  snapPoints?: number[]; // Percentage heights [50, 90]
  initialSnap?: number; // Index of snapPoints
}

export function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [50, 90],
  initialSnap = 0,
}: MobileBottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(snapPoints[initialSnap]);
  const [isDragging, setIsDragging] = useState(false);

  const bind = useDrag(
    ({ movement: [, my], last, velocity: [, vy] }) => {
      // Only enable on mobile
      if (window.innerWidth > 768) return;

      setIsDragging(!last);

      if (last) {
        // Close if swiped down with velocity or past threshold
        if (vy > 0.5 || my > 100) {
          onClose();
          return;
        }

        // Snap to nearest snap point
        const currentHeight = window.innerHeight * (currentSnap / 100);
        const newHeight = currentHeight - my;
        const newPercent = (newHeight / window.innerHeight) * 100;

        const nearest = snapPoints.reduce((prev, curr) =>
          Math.abs(curr - newPercent) < Math.abs(prev - newPercent) ? curr : prev
        );

        setCurrentSnap(nearest);
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'bg-background rounded-t-2xl shadow-2xl',
          'transition-transform md:hidden',
          isDragging ? 'transition-none' : 'transition-transform duration-300'
        )}
        style={{
          height: `${currentSnap}vh`,
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        {/* Drag Handle */}
        <div
          {...bind()}
          className="flex flex-col items-center py-3 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pb-4 border-b">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: `calc(${currentSnap}vh - 80px)` }}>
          {children}
        </div>
      </div>
    </>
  );
}
