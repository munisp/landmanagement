/**
 * Mobile Bottom Navigation Component
 * Provides mobile-optimized navigation with touch-friendly targets
 */

import { Home, Search, LayoutDashboard, Activity, User } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Search, label: 'Search', path: '/search' },
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Activity, label: 'Unified', path: '/unified-dashboard' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export function MobileBottomNav() {
  const [location] = useLocation();

  return (
    <>
      {/* Spacer to prevent content from being hidden behind fixed nav */}
      <div className="h-20 md:hidden" />
      
      {/* Fixed bottom navigation - only visible on mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border md:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  'flex flex-col items-center justify-center',
                  'min-w-[60px] min-h-[44px]', // Touch-friendly target size
                  'px-2 py-1 rounded-lg',
                  'transition-colors duration-200',
                  'active:bg-accent/50', // Touch feedback
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn(
                  'w-6 h-6 mb-0.5',
                  'transition-transform duration-200',
                  isActive && 'scale-110'
                )} />
                <span className={cn(
                  'text-[10px] font-medium',
                  'transition-all duration-200',
                  isActive && 'font-semibold'
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
