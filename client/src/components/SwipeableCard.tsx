import { ReactNode, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { Card } from '@/components/ui/card';
import { Trash2, Edit, Eye } from 'lucide-react';

interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  onAction: () => void;
}

interface SwipeableCardProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  threshold?: number;
  disabled?: boolean;
}

export function SwipeableCard({
  children,
  leftAction,
  rightAction,
  threshold = 80,
  disabled = false,
}: SwipeableCardProps) {
  const [swipeX, setSwipeX] = useState(0);
  const [actionTriggered, setActionTriggered] = useState(false);

  const bind = useDrag(
    ({ movement: [mx], last, cancel }) => {
      // Only enable on mobile devices
      if (disabled || window.innerWidth > 768) {
        cancel();
        return;
      }

      // Update swipe position with limits
      const maxSwipe = 150;
      const limitedX = Math.max(-maxSwipe, Math.min(maxSwipe, mx));
      setSwipeX(limitedX);

      // Trigger action on release
      if (last) {
        if (Math.abs(limitedX) > threshold) {
          setActionTriggered(true);
          
          // Execute appropriate action
          if (limitedX > 0 && leftAction) {
            leftAction.onAction();
          } else if (limitedX < 0 && rightAction) {
            rightAction.onAction();
          }
          
          // Reset after animation
          setTimeout(() => {
            setSwipeX(0);
            setActionTriggered(false);
          }, 300);
        } else {
          // Snap back if threshold not met
          setSwipeX(0);
        }
      }
    },
    {
      axis: 'x',
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  const showLeftAction = swipeX > threshold / 2 && leftAction;
  const showRightAction = swipeX < -threshold / 2 && rightAction;

  return (
    <div className="relative overflow-hidden touch-pan-y">
      {/* Left action background */}
      {leftAction && (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-start px-6 transition-opacity"
          style={{
            width: `${Math.max(0, swipeX)}px`,
            backgroundColor: leftAction.color,
            opacity: showLeftAction ? 1 : 0,
          }}
        >
          <div className="flex items-center gap-2 text-white">
            {leftAction.icon}
            <span className="font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Right action background */}
      {rightAction && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end px-6 transition-opacity"
          style={{
            width: `${Math.max(0, -swipeX)}px`,
            backgroundColor: rightAction.color,
            opacity: showRightAction ? 1 : 0,
          }}
        >
          <div className="flex items-center gap-2 text-white">
            <span className="font-medium">{rightAction.label}</span>
            {rightAction.icon}
          </div>
        </div>
      )}

      {/* Card content */}
      <div
        {...bind()}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: actionTriggered ? 'transform 0.3s ease-out' : 'none',
          touchAction: 'pan-y',
        }}
      >
        <Card className="cursor-grab active:cursor-grabbing">
          {children}
        </Card>
      </div>
    </div>
  );
}

// Preset actions for common use cases
export const swipeActions = {
  delete: (onDelete: () => void): SwipeAction => ({
    icon: <Trash2 className="h-5 w-5" />,
    label: 'Delete',
    color: '#ef4444', // red-500
    onAction: onDelete,
  }),
  
  edit: (onEdit: () => void): SwipeAction => ({
    icon: <Edit className="h-5 w-5" />,
    label: 'Edit',
    color: '#3b82f6', // blue-500
    onAction: onEdit,
  }),
  
  view: (onView: () => void): SwipeAction => ({
    icon: <Eye className="h-5 w-5" />,
    label: 'View',
    color: '#10b981', // green-500
    onAction: onView,
  }),
};
