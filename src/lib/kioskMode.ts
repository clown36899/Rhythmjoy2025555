export const KIOSK_MODE_STORAGE_KEY = "rhythmjoy:kiosk-mode";
export const KIOSK_MODE_VALUE = "mini-pc";
export const KIOSK_ENTRY_PATH = "/kiosk";
export const KIOSK_HOME_PATH = "/";
export const KIOSK_MOBILE_URL = "https://swingenjoy.com/";
export const KIOSK_MOBILE_GUIDE_EVENT = "kiosk:show-mobile-guide";

type KioskMobileGuideOptions = {
  closeOnly?: boolean;
};

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export function syncKioskModeClass(enabled: boolean) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("kiosk-link-router-active", enabled);

  if (document.body) {
    document.body.classList.toggle("kiosk-link-router-active", enabled);
  }
}

export function enableKioskMode() {
  syncKioskModeClass(true);

  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);
  } catch {
    // Storage may be unavailable in strict privacy modes. The /kiosk route still enables the current render.
  }
}

export function isKioskModeEnabled() {
  if (typeof window === "undefined") return false;

  if (window.location.pathname === KIOSK_ENTRY_PATH) return true;

  try {
    return (
      window.localStorage.getItem(KIOSK_MODE_STORAGE_KEY) === KIOSK_MODE_VALUE ||
      window.sessionStorage.getItem(KIOSK_MODE_STORAGE_KEY) === KIOSK_MODE_VALUE
    );
  } catch {
    return false;
  }
}

export function requestKioskMobileGuide(href = KIOSK_MOBILE_URL, options: KioskMobileGuideOptions = {}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(KIOSK_MOBILE_GUIDE_EVENT, {
    detail: {
      href,
      closeOnly: options.closeOnly ?? true,
    },
  }));
}

export function disableKioskMode() {
  syncKioskModeClass(false);

  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(KIOSK_MODE_STORAGE_KEY);
    window.sessionStorage.removeItem(KIOSK_MODE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
