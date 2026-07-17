import { format as dateFnsFormat, Locale } from 'date-fns';
import { enUS, fr, es, arSA } from 'date-fns/locale';

// Date-fns locale mapping
const localeMap: Record<string, Locale> = {
  en: enUS,
  fr: fr,
  es: es,
  ar: arSA,
  // African languages use English formatting as fallback
  pcm: enUS,
  yo: enUS,
  ig: enUS,
  ha: enUS,
  sw: enUS,
};

// Currency symbols by language/region
const currencyMap: Record<string, { code: string; symbol: string }> = {
  en: { code: 'USD', symbol: '$' },
  fr: { code: 'EUR', symbol: '€' },
  es: { code: 'EUR', symbol: '€' },
  ar: { code: 'SAR', symbol: 'ر.س' },
  pcm: { code: 'NGN', symbol: '₦' },
  yo: { code: 'NGN', symbol: '₦' },
  ig: { code: 'NGN', symbol: '₦' },
  ha: { code: 'NGN', symbol: '₦' },
  sw: { code: 'KES', symbol: 'KSh' },
};

/**
 * Format date according to user's language preference
 */
export function formatDate(date: Date | number, formatStr: string = 'PPP', language: string = 'en'): string {
  const locale = localeMap[language] || enUS;
  return dateFnsFormat(date, formatStr, { locale });
}

/**
 * Format currency according to user's language preference
 */
export function formatCurrency(amount: number, language: string = 'en'): string {
  const currency = currencyMap[language] || currencyMap.en;
  
  // Use Intl.NumberFormat for proper localization
  const formatter = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  try {
    return formatter.format(amount);
  } catch (error) {
    // Fallback to manual formatting if Intl fails
    return `${currency.symbol}${amount.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Format number according to user's language preference
 */
export function formatNumber(num: number, language: string = 'en', decimals: number = 0): string {
  return num.toLocaleString(language, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(date: Date | number, language: string = 'en'): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  // Translations for relative time
  const translations: Record<string, Record<string, string>> = {
    en: { justNow: 'just now', minutesAgo: 'minutes ago', hoursAgo: 'hours ago', daysAgo: 'days ago' },
    pcm: { justNow: 'just now', minutesAgo: 'minutes wey don pass', hoursAgo: 'hours wey don pass', daysAgo: 'days wey don pass' },
    yo: { justNow: 'báyìí', minutesAgo: 'ìṣẹ́jú sẹ́yìn', hoursAgo: 'wákàtí sẹ́yìn', daysAgo: 'ọjọ́ sẹ́yìn' },
    ig: { justNow: 'ugbu a', minutesAgo: 'nkeji gara aga', hoursAgo: 'awa gara aga', daysAgo: 'ụbọchị gara aga' },
    ha: { justNow: 'yanzu', minutesAgo: 'mintuna da suka wuce', hoursAgo: 'sa\'o\'i da suka wuce', daysAgo: 'kwanaki da suka wuce' },
    sw: { justNow: 'sasa hivi', minutesAgo: 'dakika zilizopita', hoursAgo: 'masaa yaliyopita', daysAgo: 'siku zilizopita' },
    fr: { justNow: 'à l\'instant', minutesAgo: 'minutes', hoursAgo: 'heures', daysAgo: 'jours' },
    es: { justNow: 'justo ahora', minutesAgo: 'minutos', hoursAgo: 'horas', daysAgo: 'días' },
    ar: { justNow: 'الآن', minutesAgo: 'دقائق', hoursAgo: 'ساعات', daysAgo: 'أيام' },
  };

  const t = translations[language] || translations.en;

  if (diffSec < 60) return t.justNow;
  if (diffMin < 60) return `${diffMin} ${t.minutesAgo}`;
  if (diffHour < 24) return `${diffHour} ${t.hoursAgo}`;
  return `${diffDay} ${t.daysAgo}`;
}
