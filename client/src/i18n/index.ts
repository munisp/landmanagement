import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import enTranslation from "./locales/en/translation.json";
import haTranslation from "./locales/ha/translation.json";
import yoTranslation from "./locales/yo/translation.json";
import igTranslation from "./locales/ig/translation.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "🇳🇬" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "🇳🇬" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "🇳🇬" },
] as const;

export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      ha: { translation: haTranslation },
      yo: { translation: yoTranslation },
      ig: { translation: igTranslation },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "ha", "yo", "ig"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "lms_language",
    },
    react: { useSuspense: false },
  });

export function changeLanguage(code: SupportedLanguageCode): Promise<void> {
  return i18n.changeLanguage(code).then(() => undefined);
}

export function getCurrentLanguage(): SupportedLanguageCode {
  const lang = i18n.language?.slice(0, 2) as SupportedLanguageCode;
  return ["en", "ha", "yo", "ig"].includes(lang) ? lang : "en";
}

export default i18n;
