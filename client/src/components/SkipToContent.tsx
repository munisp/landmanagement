/**
 * SkipToContent - Accessibility component for keyboard navigation
 * Allows keyboard users to skip repetitive navigation and jump directly to main content
 * WCAG 2.1 AA Compliance: Success Criterion 2.4.1 (Bypass Blocks)
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );
}

/**
 * MainContent - Wrapper component for main content area
 * Provides the target anchor for skip navigation
 */
export function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      {children}
    </main>
  );
}
