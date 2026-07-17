/**
 * Tooltip Component
 * Displays contextual help with rich content
 */

import { useState, useRef, useEffect } from 'react';
import { useContextualHelp, trackHelpInteraction } from '@/lib/contextualHelp';
import { HelpCircle, X, ExternalLink, Video } from 'lucide-react';

interface TooltipProps {
  helpId: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ helpId, children, className = '' }: TooltipProps) {
  const { isVisible, content, show, hide } = useContextualHelp(helpId);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let top = 0;
      let left = 0;

      // Calculate position based on content.position
      switch (content?.position) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - 8;
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = triggerRect.bottom + 8;
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.left - tooltipRect.width - 8;
          break;
        case 'right':
        default:
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.right + 8;
          break;
      }

      // Ensure tooltip stays within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < 8) left = 8;
      if (left + tooltipRect.width > viewportWidth - 8) {
        left = viewportWidth - tooltipRect.width - 8;
      }
      if (top < 8) top = 8;
      if (top + tooltipRect.height > viewportHeight - 8) {
        top = viewportHeight - tooltipRect.height - 8;
      }

      setPosition({ top, left });
    }
  }, [isVisible, content]);

  const handleShow = () => {
    show();
    trackHelpInteraction(helpId, 'view');
  };

  const handleHide = () => {
    hide();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (content?.trigger === 'click') {
      if (isVisible) {
        handleHide();
      } else {
        handleShow();
      }
    }
  };

  if (!content) return <>{children}</>;

  const triggerProps: any = {};
  
  if (content.trigger === 'hover') {
    triggerProps.onMouseEnter = handleShow;
    triggerProps.onMouseLeave = handleHide;
  } else if (content.trigger === 'click') {
    triggerProps.onClick = handleClick;
  } else if (content.trigger === 'focus') {
    triggerProps.onFocus = handleShow;
    triggerProps.onBlur = handleHide;
  }

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative inline-flex items-center gap-2 ${className}`}
        {...triggerProps}
      >
        {children}
        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
      </div>

      {isVisible && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleHide}
          />

          {/* Tooltip */}
          <div
            ref={tooltipRef}
            className="fixed z-50 w-80 rounded-lg border bg-popover p-4 shadow-lg"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-sm">{content.title}</h4>
              <button
                onClick={handleHide}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <p className="text-sm text-muted-foreground mb-3">{content.content}</p>

            {/* Video */}
            {content.videoUrl && (
              <div className="mb-3">
                <a
                  href={content.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  onClick={() => trackHelpInteraction(helpId, 'click')}
                >
                  <Video className="h-4 w-4" />
                  Watch video guide
                </a>
              </div>
            )}

            {/* Related Articles */}
            {content.relatedArticles && content.relatedArticles.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Related Articles
                </p>
                <div className="space-y-1">
                  {content.relatedArticles.map((article, index) => (
                    <a
                      key={index}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-primary hover:underline"
                      onClick={() => trackHelpInteraction(helpId, 'click')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {article.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Arrow */}
            <div
              className={`absolute w-2 h-2 bg-popover border transform rotate-45 ${
                content.position === 'top'
                  ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r'
                  : content.position === 'bottom'
                  ? 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l'
                  : content.position === 'left'
                  ? 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r'
                  : 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l'
              }`}
            />
          </div>
        </>
      )}
    </>
  );
}

/**
 * Inline Tooltip (simpler version)
 */
interface InlineTooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InlineTooltip({
  content,
  children,
  position = 'top',
}: InlineTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap ${
            position === 'top'
              ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
              : position === 'bottom'
              ? 'top-full left-1/2 -translate-x-1/2 mt-2'
              : position === 'left'
              ? 'right-full top-1/2 -translate-y-1/2 mr-2'
              : 'left-full top-1/2 -translate-y-1/2 ml-2'
          }`}
        >
          {content}
          <div
            className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 ${
              position === 'top'
                ? 'top-full left-1/2 -translate-x-1/2 -mt-1'
                : position === 'bottom'
                ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1'
                : position === 'left'
                ? 'left-full top-1/2 -translate-y-1/2 -ml-1'
                : 'right-full top-1/2 -translate-y-1/2 -mr-1'
            }`}
          />
        </div>
      )}
    </div>
  );
}
