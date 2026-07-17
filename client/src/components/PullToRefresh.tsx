import { ReactNode, useState, useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export function PullToRefresh({ 
  onRefresh, 
  children, 
  threshold = 80,
  disabled = false 
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const bind = useDrag(
    ({ movement: [, my], last, cancel }) => {
      // Only enable on mobile devices
      if (disabled || window.innerWidth > 768) {
        cancel();
        return;
      }

      // Only trigger when at the top of the page
      const scrollTop = containerRef.current?.scrollTop || window.scrollY;
      if (scrollTop > 0) {
        cancel();
        return;
      }

      // Prevent pull down when already refreshing
      if (isRefreshing) {
        cancel();
        return;
      }

      // Update pull distance with resistance effect
      const resistance = 0.5;
      const distance = Math.max(0, my * resistance);
      setPullDistance(distance);

      // Trigger refresh when released beyond threshold
      if (last && distance > threshold) {
        setIsRefreshing(true);
        setPullDistance(threshold);
        
        onRefresh().finally(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        });
      } else if (last) {
        // Reset if released before threshold
        setPullDistance(0);
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  const refreshOpacity = Math.min(pullDistance / threshold, 1);
  const spinnerRotation = (pullDistance / threshold) * 360;

  return (
    <div
      ref={containerRef}
      {...bind()}
      className="relative overflow-hidden touch-pan-y"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center transition-opacity"
        style={{
          height: `${pullDistance}px`,
          opacity: refreshOpacity,
          pointerEvents: 'none',
        }}
      >
        <div className="bg-background/90 backdrop-blur-sm rounded-full p-2 shadow-lg">
          <Loader2
            className="h-5 w-5 text-primary"
            style={{
              transform: isRefreshing 
                ? 'rotate(0deg)' 
                : `rotate(${spinnerRotation}deg)`,
              transition: isRefreshing ? 'none' : 'transform 0.1s',
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </div>
      </div>

      {/* Content with offset */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isRefreshing ? 'transform 0.2s' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
