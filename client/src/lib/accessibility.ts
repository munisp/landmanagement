/**
 * Accessibility Utilities for WCAG 2.1 AA Compliance
 * Provides keyboard navigation, screen reader support, and focus management
 */

/**
 * Trap focus within a container (for modals, dialogs)
 */
export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  };
  
  element.addEventListener('keydown', handleKeyDown);
  
  // Focus first element
  firstFocusable?.focus();
  
  // Return cleanup function
  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Announce message to screen readers
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Generate unique ID for ARIA labels
 */
let idCounter = 0;
export function generateAriaId(prefix: string = 'aria'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Check if element is visible
 */
export function isElementVisible(element: HTMLElement): boolean {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
}

/**
 * Get all focusable elements within container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .filter(isElementVisible);
}

/**
 * Keyboard navigation helper
 */
export class KeyboardNavigator {
  private elements: HTMLElement[];
  private currentIndex: number = 0;
  
  constructor(container: HTMLElement) {
    this.elements = getFocusableElements(container);
  }
  
  next() {
    this.currentIndex = (this.currentIndex + 1) % this.elements.length;
    this.elements[this.currentIndex]?.focus();
  }
  
  previous() {
    this.currentIndex = (this.currentIndex - 1 + this.elements.length) % this.elements.length;
    this.elements[this.currentIndex]?.focus();
  }
  
  first() {
    this.currentIndex = 0;
    this.elements[0]?.focus();
  }
  
  last() {
    this.currentIndex = this.elements.length - 1;
    this.elements[this.currentIndex]?.focus();
  }
  
  handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.previous();
        break;
      case 'Home':
        event.preventDefault();
        this.first();
        break;
      case 'End':
        event.preventDefault();
        this.last();
        break;
    }
  }
}

/**
 * Skip to content link (for keyboard users)
 */
export function createSkipLink(targetId: string, text: string = 'Skip to main content') {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = text;
  skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-primary focus:text-primary-foreground';
  
  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
  
  return skipLink;
}

/**
 * Focus management for route changes
 */
export function manageFocusOnRouteChange() {
  // Find main content or first heading
  const mainContent = document.querySelector('main') || document.querySelector('h1');
  
  if (mainContent instanceof HTMLElement) {
    // Make focusable if not already
    if (!mainContent.hasAttribute('tabindex')) {
      mainContent.setAttribute('tabindex', '-1');
    }
    
    mainContent.focus();
    
    // Announce page change to screen readers
    const pageTitle = document.title;
    announceToScreenReader(`Navigated to ${pageTitle}`, 'assertive');
  }
}

/**
 * High contrast mode detection
 */
export function isHighContrastMode(): boolean {
  // Check for Windows high contrast mode
  if (window.matchMedia('(prefers-contrast: high)').matches) {
    return true;
  }
  
  // Check for forced colors
  if (window.matchMedia('(forced-colors: active)').matches) {
    return true;
  }
  
  return false;
}

/**
 * Reduced motion detection
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Color contrast checker (WCAG AA: 4.5:1, AAA: 7:1)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (color: string): number => {
    // Simple RGB extraction (assumes hex format #RRGGBB)
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const [rs, gs, bs] = [r, g, b].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG standards
 */
export function meetsContrastRequirement(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  
  if (level === 'AAA') {
    return isLargeText ? ratio >= 4.5 : ratio >= 7;
  }
  
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * ARIA live region manager
 */
export class LiveRegionManager {
  private politeRegion: HTMLElement;
  private assertiveRegion: HTMLElement;
  
  constructor() {
    // Create polite live region
    this.politeRegion = document.createElement('div');
    this.politeRegion.setAttribute('role', 'status');
    this.politeRegion.setAttribute('aria-live', 'polite');
    this.politeRegion.setAttribute('aria-atomic', 'true');
    this.politeRegion.className = 'sr-only';
    
    // Create assertive live region
    this.assertiveRegion = document.createElement('div');
    this.assertiveRegion.setAttribute('role', 'alert');
    this.assertiveRegion.setAttribute('aria-live', 'assertive');
    this.assertiveRegion.setAttribute('aria-atomic', 'true');
    this.assertiveRegion.className = 'sr-only';
    
    document.body.appendChild(this.politeRegion);
    document.body.appendChild(this.assertiveRegion);
  }
  
  announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
    const region = priority === 'assertive' ? this.assertiveRegion : this.politeRegion;
    
    // Clear previous message
    region.textContent = '';
    
    // Announce new message
    setTimeout(() => {
      region.textContent = message;
    }, 100);
  }
  
  clear() {
    this.politeRegion.textContent = '';
    this.assertiveRegion.textContent = '';
  }
}

/**
 * Accessible form validation
 */
export function announceFormError(fieldName: string, error: string) {
  announceToScreenReader(`${fieldName}: ${error}`, 'assertive');
}

/**
 * Accessible loading state
 */
export function setLoadingState(element: HTMLElement, isLoading: boolean, loadingText: string = 'Loading') {
  if (isLoading) {
    element.setAttribute('aria-busy', 'true');
    element.setAttribute('aria-label', loadingText);
  } else {
    element.removeAttribute('aria-busy');
    element.removeAttribute('aria-label');
  }
}

/**
 * Accessible modal dialog
 */
export function setupAccessibleModal(modalElement: HTMLElement) {
  // Store previously focused element
  const previouslyFocused = document.activeElement as HTMLElement;
  
  // Set ARIA attributes
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-modal', 'true');
  
  // Trap focus
  const cleanup = trapFocus(modalElement);
  
  // Handle Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  
  document.addEventListener('keydown', handleEscape);
  
  // Cleanup function
  const closeModal = () => {
    cleanup();
    document.removeEventListener('keydown', handleEscape);
    previouslyFocused?.focus();
  };
  
  return closeModal;
}

/**
 * Initialize accessibility features
 */
export function initializeAccessibility() {
  // Add skip link
  const skipLink = createSkipLink('main-content', 'Skip to main content');
  document.body.insertBefore(skipLink, document.body.firstChild);
  
  // Initialize live region manager
  const liveRegionManager = new LiveRegionManager();
  
  // Add high contrast mode class
  if (isHighContrastMode()) {
    document.documentElement.classList.add('high-contrast');
  }
  
  // Add reduced motion class
  if (prefersReducedMotion()) {
    document.documentElement.classList.add('reduce-motion');
  }
  
  // Listen for preference changes
  window.matchMedia('(prefers-contrast: high)').addEventListener('change', (e) => {
    document.documentElement.classList.toggle('high-contrast', e.matches);
  });
  
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    document.documentElement.classList.toggle('reduce-motion', e.matches);
  });
  
  return liveRegionManager;
}
