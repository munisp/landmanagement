export type AccessibilityPreferences = {
  screenReaderHints: boolean;
  keyboardMode: boolean;
  highContrast: boolean;
  simplifiedMode: boolean;
  wizardWorkflow: boolean;
  dyslexiaFont: boolean;
  lowBandwidth: boolean;
  ttsPrompt: string;
};

const STORAGE_KEY = 'idlr.accessibility-preferences.v1';

const defaults: AccessibilityPreferences = {
  screenReaderHints: true,
  keyboardMode: true,
  highContrast: false,
  simplifiedMode: false,
  wizardWorkflow: true,
  dyslexiaFont: false,
  lowBandwidth: false,
  ttsPrompt: 'Read section headings and required form guidance aloud before data entry.',
};

export function getAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AccessibilityPreferences>;
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

export function applyAccessibilityPreferences(preferences: AccessibilityPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.highContrastPreference = String(preferences.highContrast);
  root.dataset.simplified = String(preferences.simplifiedMode);
  root.dataset.dyslexiaFont = String(preferences.dyslexiaFont);
  root.dataset.lowBandwidth = String(preferences.lowBandwidth);
  root.dataset.keyboardMode = String(preferences.keyboardMode);
}

export function saveAccessibilityPreferences(preferences: AccessibilityPreferences): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  applyAccessibilityPreferences(preferences);
  window.dispatchEvent(new CustomEvent('idlr:accessibility-preferences', { detail: preferences }));
}

export function initializeAccessibilityPreferences(): AccessibilityPreferences {
  const preferences = getAccessibilityPreferences();
  applyAccessibilityPreferences(preferences);
  return preferences;
}
