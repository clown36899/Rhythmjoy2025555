import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import messages from './local/index';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // lng: 'ko', // Remove fixed language to allow browser auto-detection
    fallbackLng: 'ko',
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

// Initial sync
document.documentElement.lang = i18n.language || 'ko';

export default i18n;