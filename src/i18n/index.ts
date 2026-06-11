import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import messages from './local/index';

const getInitialLanguage = () => {
  try {
    const stored = window.localStorage.getItem('i18nextLng');
    return stored?.startsWith('en') ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: getInitialLanguage(),
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en'],
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
    },
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
if (!document.documentElement.lang.startsWith('ko') && !document.documentElement.lang.startsWith('en')) {
  document.documentElement.lang = 'ko';
}

export default i18n;
