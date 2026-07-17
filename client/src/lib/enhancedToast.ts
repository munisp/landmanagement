/**
 * Enhanced Toast Notifications
 * Utilities for advanced toast notifications with undo and progress
 */

import { toast } from 'sonner';

interface UndoToastOptions {
  message: string;
  onUndo: () => void;
  duration?: number;
}

/**
 * Show toast with undo action
 */
export function toastWithUndo({ message, onUndo, duration = 5000 }: UndoToastOptions) {
  return toast(message, {
    duration,
    action: {
      label: 'Undo',
      onClick: onUndo,
    },
  });
}

interface ProgressToastOptions {
  message: string;
  promise: Promise<any>;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * Show progress toast for async operations
 */
export function toastWithProgress({
  message,
  promise,
  successMessage = 'Operation completed successfully',
  errorMessage = 'Operation failed',
}: ProgressToastOptions) {
  return toast.promise(promise, {
    loading: message,
    success: successMessage,
    error: errorMessage,
  });
}

/**
 * Show toast for destructive action with confirmation
 */
export function toastDestructive(message: string) {
  return toast.error(message, {
    duration: 4000,
  });
}

/**
 * Show toast for successful action
 */
export function toastSuccess(message: string) {
  return toast.success(message, {
    duration: 3000,
  });
}

/**
 * Show toast for informational message
 */
export function toastInfo(message: string) {
  return toast.info(message, {
    duration: 3000,
  });
}

/**
 * Show toast for warning message
 */
export function toastWarning(message: string) {
  return toast.warning(message, {
    duration: 4000,
  });
}
