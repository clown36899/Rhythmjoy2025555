export const KIOSK_MODE_STORAGE_KEY = "rhythmjoy:kiosk-mode";
export const KIOSK_MODE_VALUE = "mini-pc";
export const KIOSK_ENTRY_PATH = "/kiosk";
export const KIOSK_HOME_PATH = "/";
export const KIOSK_MOBILE_URL = "https://swingenjoy.com/";
export const KIOSK_MOBILE_GUIDE_EVENT = "kiosk:show-mobile-guide";

type KioskMobileGuideOptions = {
  closeOnly?: boolean;
};

type KioskModeContext = {
  isAdmin?: boolean;
  pathname?: string;
};

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export function isAdminPath(pathname: string) {
  return /^\/admin(?:\/|$)/i.test(pathname);
}

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
    // Kiosk mode belongs to the dedicated kiosk tab, not every tab on this origin.
    window.localStorage.removeItem(KIOSK_MODE_STORAGE_KEY);
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);
  } catch {
    // Storage may be unavailable in strict privacy modes. The /kiosk route still enables the current render.
  }
}

export function isKioskModeEnabled(context: KioskModeContext = {}) {
  if (typeof window === "undefined") return false;

  const pathname = context.pathname ?? window.location.pathname;

  if (context.isAdmin || isAdminPath(pathname)) return false;
  if (pathname === KIOSK_ENTRY_PATH) return true;

  try {
    return window.sessionStorage.getItem(KIOSK_MODE_STORAGE_KEY) === KIOSK_MODE_VALUE;
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
