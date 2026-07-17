/**
 * Internationalization Configuration
 * Supports English, French, and Arabic with RTL support
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation resources
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import ha from './locales/ha.json'; // Hausa
import yo from './locales/yo.json'; // Yoruba
import ig from './locales/ig.json'; // Igbo
import pcm from './locales/pcm.json'; // Nigerian Pidgin
import sw from './locales/sw.json'; // Swahili
import am from './locales/am.json'; // Amharic

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  ar: { translation: ar },
  ha: { translation: ha },
  yo: { translation: yo },
  ig: { translation: ig },
  pcm: { translation: pcm },
  sw: { translation: sw },
  am: { translation: am },
} as const;

export const supportedLanguages = ['en', 'fr', 'ar', 'ha', 'yo', 'ig', 'pcm', 'sw', 'am'] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

// RTL languages
export const rtlLanguages = ['ar', 'am']; // Arabic and Amharic

export function isRTL(language: string): boolean {
  return rtlLanguages.includes(language);
}

// Currency formatting
export function formatCurrency(amount: number, language: string = 'en'): string {
  const localeMap: Record<string, string> = {
    'ar': 'ar-SA',
    'fr': 'fr-FR',
    'ha': 'ha-NG',
    'yo': 'yo-NG',
    'ig': 'ig-NG',
    'pcm': 'en-NG',
    'sw': 'sw-KE',
    'am': 'am-ET',
    'en': 'en-NG'
  };
  const locale = localeMap[language] || 'en-NG';
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Date formatting
export function formatDate(date: Date | string, language: string = 'en', format: 'short' | 'long' = 'short'): string {
  const localeMap: Record<string, string> = {
    'ar': 'ar-SA',
    'fr': 'fr-FR',
    'ha': 'ha-NG',
    'yo': 'yo-NG',
    'ig': 'ig-NG',
    'pcm': 'en-NG',
    'sw': 'sw-KE',
    'am': 'am-ET',
    'en': 'en-NG'
  };
  const locale = localeMap[language] || 'en-NG';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = format === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  
  return new Intl.DateTimeFormat(locale, options).format(dateObj);
}

// Number formatting
export function formatNumber(num: number, language: string = 'en'): string {
  const localeMap: Record<string, string> = {
    'ar': 'ar-SA',
    'fr': 'fr-FR',
    'ha': 'ha-NG',
    'yo': 'yo-NG',
    'ig': 'ig-NG',
    'pcm': 'en-NG',
    'sw': 'sw-KE',
    'am': 'am-ET',
    'en': 'en-NG'
  };
  const locale = localeMap[language] || 'en-NG';
  
  return new Intl.NumberFormat(locale).format(num);
}

// Area formatting (with unit conversion)
export function formatArea(sqm: number, language: string = 'en'): string {
  const localeMap: Record<string, string> = {
    'ar': 'ar-SA',
    'fr': 'fr-FR',
    'ha': 'ha-NG',
    'yo': 'yo-NG',
    'ig': 'ig-NG',
    'pcm': 'en-NG',
    'sw': 'sw-KE',
    'am': 'am-ET',
    'en': 'en-NG'
  };
  const locale = localeMap[language] || 'en-NG';
  
  // Convert to hectares if > 10,000 sqm
  if (sqm >= 10000) {
    const hectares = sqm / 10000;
    const unitMap: Record<string, string> = {
      'fr': 'ha',
      'ar': 'هكتار',
      'am': 'ሄክታር',
      'ha': 'hekta',
      'yo': 'hekita',
      'ig': 'hekita',
      'pcm': 'hectare',
      'sw': 'hektari',
      'en': 'ha'
    };
    const unit = unitMap[language] || 'ha';
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(hectares)} ${unit}`;
  }
  
  const unitMap: Record<string, string> = {
    'fr': 'm²',
    'ar': 'م²',
    'am': 'ካሬ ሜትር',
    'ha': 'murabba mita',
    'yo': 'mita square',
    'ig': 'mita square',
    'pcm': 'sqm',
    'sw': 'mita mraba',
    'en': 'sqm'
  };
  const unit = unitMap[language] || 'sqm';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(sqm)} ${unit}`;
}

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    
    interpolation: {
      escapeValue: false, // React already escapes
    },
    
    react: {
      useSuspense: true,
    },
  });

// Update document direction when language changes
i18n.on('languageChanged', (lng: string) => {
  const dir = isRTL(lng) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
});

// Set initial direction
const initialDir = isRTL(i18n.language) ? 'rtl' : 'ltr';
document.documentElement.setAttribute('dir', initialDir);
document.documentElement.setAttribute('lang', i18n.language);

export default i18n;
