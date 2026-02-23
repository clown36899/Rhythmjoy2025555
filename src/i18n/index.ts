import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import messages from './local/index';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: 'ko', // Fixed default language to Korean
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en'],
    debug: false,
    resources: messages,
    interpolation: {
      escapeValue: false,
    },
  });

// Synchronize html[lang] attribute with current i18next language
i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
});

// Initial sync (Ensure it defaults to 'ko' at first)
document.documentElement.lang = i18n.language || 'ko';
if (!document.documentElement.lang.startsWith('ko')) {
  document.documentElement.lang = 'ko';
}

export default i18n;