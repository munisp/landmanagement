import { Button, buttonVariants } from '@/components/ui/button';
import { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * TouchFriendlyButton - Button component optimized for mobile touch interactions
 * Ensures minimum 44x44px tap target size as per WCAG 2.1 AA guidelines
 */
type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function TouchFriendlyButton({ 
  className, 
  children, 
  ...props 
}: ButtonProps) {
  return (
    <Button
      className={cn(
        // Minimum touch target size (44x44px)
        'min-h-[44px] min-w-[44px]',
        // Adequate padding for comfortable tapping
        'px-6 py-3',
        // Prevent text selection on double-tap
        'select-none',
        // Active state feedback
        'active:scale-95 transition-transform',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * TouchFriendlyIconButton - Icon-only button optimized for mobile
 */
export function TouchFriendlyIconButton({ 
  className, 
  children, 
  ...props 
}: ButtonProps) {
  return (
    <Button
      className={cn(
        // Square touch target
        'h-[44px] w-[44px]',
        // Center icon
        'flex items-center justify-center',
        'p-0',
        'select-none',
        'active:scale-95 transition-transform',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
