let refreshTimer: number | null = null;
let refreshInFlight = false;
let needsFollowUpRefresh = false;

const isEnglishTranslationActive = () => {
  if (typeof document === 'undefined') return false;

  const htmlLang = document.documentElement.lang || '';
  const storedLanguage = (() => {
    try {
      return window.localStorage.getItem('i18nextLng') || '';
    } catch {
      return '';
    }
  })();

  return (
    htmlLang.startsWith('en') ||
    storedLanguage.startsWith('en') ||
    document.body.classList.contains('translated-ltr') ||
    document.body.classList.contains('translated-rtl') ||
    document.documentElement.classList.contains('translated-ltr') ||
    document.documentElement.classList.contains('translated-rtl')
  );
};

export const requestGoogleTranslateRefresh = (delayMillis = 220) => {
  if (typeof window === 'undefined' || !isEnglishTranslationActive()) return;

  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;

    const refreshDynamicContent = (window as any).googleTranslateRefreshDynamicContent;
    const changeLanguage = (window as any).googleTranslateChangeLanguage || (window as any).changeLanguage;
    const refresh = typeof refreshDynamicContent === 'function'
      ? () => refreshDynamicContent()
      : typeof changeLanguage === 'function'
        ? () => changeLanguage('en')
        : null;

    if (!refresh) return;

    if (refreshInFlight) {
      needsFollowUpRefresh = true;
      return;
    }

    refreshInFlight = true;
    Promise.resolve(refresh())
      .catch(() => undefined)
      .finally(() => {
        refreshInFlight = false;
        if (needsFollowUpRefresh) {
          needsFollowUpRefresh = false;
          requestGoogleTranslateRefresh(300);
        }
      });
  }, delayMillis);
};
