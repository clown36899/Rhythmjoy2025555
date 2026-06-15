import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  enableKioskMode,
  isKioskModeEnabled,
  KIOSK_MOBILE_URL,
  syncKioskModeClass,
} from "../lib/kioskMode";

const KIOSK_QR_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAADwAQMAAAAEm3vRAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAABYklEQVRYhe2YPbKDMAyElaFwyRE4CkeDo/koHCGlCwZFK/kneY+0KSyryAR/VDvSag3RqN/XzFbydz0W5jSdj3z07Brjhx5M274e8i+wYFVk8Y0D81VPZlWNRLPoBG/M0i1P02jgqtoWtXe+ieoNlyGSAzjKSfcz1hsungrzKEN0Y7nOcCtMEX0vX1hVu1SouBwzJ5ouEg2jLp5+Mc0J7kG8I3lIg0x4IOQQz1h0CqYakoc47DnpBMU1z5hPbBHsspFRb+H60Dem8JY8MESsGlVPdYnVTSCUbOCcPOjDenrFFj1FiM0WKwO3IXKLQ9KekeQhK7YEkb1d17xijaY4wQYueI1EPeNaGkRZX0a7/KHecMvnmkPL5b55qlNcbnO4xdq1xVR7s9w+cfmosYtfoFvyEBVZBrYNjNbRVwa2QIZK2WluvpB1hvMQtRV7afL4/6HYFTaxsmo5sXPrFqd41K/rBfzCN2Uk0CkJAAAAAElFTkSuQmCC";

const KIOSK_ALLOWED_ROOT = "swingenjoy.com";
const KIOSK_COUNTDOWN_SECONDS = 45;
const KIOSK_SW_RESET_KEY = "rhythmjoy:kiosk-sw-reset";
const INTERNAL_PROTOCOLS = new Set(["about:", "javascript:"]);
const LOCALHOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

type BlockedExternalLink = {
  href: string;
  secondsLeft: number;
};

function isAllowedHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  const current = window.location.hostname.toLowerCase();

  if (normalized === current) return true;
  if (normalized === KIOSK_ALLOWED_ROOT || normalized.endsWith(`.${KIOSK_ALLOWED_ROOT}`)) return true;
  if (LOCALHOSTS.has(current) && LOCALHOSTS.has(normalized)) return true;

  return false;
}

function normalizeUrl(rawHref: unknown) {
  if (!rawHref) return null;

  const trimmed = String(rawHref).trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  try {
    return new URL(trimmed, window.location.href);
  } catch {
    return null;
  }
}

function shouldBlockHref(rawHref: unknown) {
  const url = normalizeUrl(rawHref);
  if (!url) return false;

  if (url.protocol === "http:" || url.protocol === "https:") {
    return !isAllowedHost(url.hostname);
  }

  return !INTERNAL_PROTOCOLS.has(url.protocol);
}

function findAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest("a[href]") as HTMLAnchorElement | null;
}

function findForm(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest("form") as HTMLFormElement | null;
}

function stopNativeEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function getIndicatorButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".NEB-indicators button"));
}

function clickIndicator(button: HTMLButtonElement) {
  button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

export default function KioskModeController() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isActive, setIsActive] = useState(() => isKioskModeEnabled());
  const [blockedExternalLink, setBlockedExternalLink] = useState<BlockedExternalLink | null>(null);
  const [carouselTop, setCarouselTop] = useState(0);
  const [showCarouselControls, setShowCarouselControls] = useState(false);

  useEffect(() => {
    const active = isKioskModeEnabled();
    setIsActive(active);
    syncKioskModeClass(active);

    if (active) {
      enableKioskMode();
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!isActive) return;

    const resetServiceWorker = async () => {
      try {
        const registrations = await navigator.serviceWorker?.getRegistrations();
        await Promise.all((registrations || []).map((registration) => registration.unregister()));

        if (navigator.serviceWorker?.controller && sessionStorage.getItem(KIOSK_SW_RESET_KEY) !== "done") {
          sessionStorage.setItem(KIOSK_SW_RESET_KEY, "done");
          window.location.reload();
          return;
        }

        if (!navigator.serviceWorker?.controller) {
          sessionStorage.removeItem(KIOSK_SW_RESET_KEY);
        }
      } catch {
        // Kiosk mode should not fail if SW APIs are unavailable.
      }
    };

    resetServiceWorker();

    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => { });
    }
  }, [isActive]);

  const openExternalGuide = useCallback((rawHref: unknown) => {
    const url = normalizeUrl(rawHref);
    const href = url?.href || String(rawHref || KIOSK_MOBILE_URL);

    setBlockedExternalLink({
      href,
      secondsLeft: KIOSK_COUNTDOWN_SECONDS,
    });
  }, []);

  const guardExternalHref = useCallback((rawHref: unknown, event?: Event) => {
    if (!shouldBlockHref(rawHref)) return false;

    if (event) {
      stopNativeEvent(event);
    }

    openExternalGuide(rawHref);
    return true;
  }, [openExternalGuide]);

  useEffect(() => {
    if (!isActive) return;

    const handleAnchorEvent = (event: Event) => {
      const anchor = findAnchor(event.target);
      if (!anchor) return;
      const href = anchor.getAttribute("href") || anchor.href;
      guardExternalHref(href, event);
    };

    const handleSubmit = (event: Event) => {
      const form = findForm(event.target);
      if (!form) return;
      const action = form.getAttribute("action") || window.location.href;
      guardExternalHref(action, event);
    };

    ["pointerdown", "mousedown", "touchstart", "click", "auxclick"].forEach((type) => {
      document.addEventListener(type, handleAnchorEvent, true);
    });
    document.addEventListener("submit", handleSubmit, true);

    const originalOpen = window.open;
    window.open = ((rawUrl?: string | URL, target?: string, features?: string) => {
      if (rawUrl && guardExternalHref(rawUrl)) {
        return window;
      }

      return originalOpen.call(window, rawUrl, target, features);
    }) as typeof window.open;

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      const href = this.getAttribute("href") || this.href;
      if (guardExternalHref(href)) return;
      return originalAnchorClick.call(this);
    };

    const originalSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function submit() {
      const action = this.getAttribute("action") || window.location.href;
      if (guardExternalHref(action)) return;
      return originalSubmit.call(this);
    };

    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    if (originalRequestSubmit) {
      HTMLFormElement.prototype.requestSubmit = function requestSubmit(submitter?: HTMLElement | null) {
        const action = this.getAttribute("action") || window.location.href;
        if (guardExternalHref(action)) return;
        return originalRequestSubmit.call(this, submitter);
      };
    }

    return () => {
      ["pointerdown", "mousedown", "touchstart", "click", "auxclick"].forEach((type) => {
        document.removeEventListener(type, handleAnchorEvent, true);
      });
      document.removeEventListener("submit", handleSubmit, true);
      window.open = originalOpen;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      HTMLFormElement.prototype.submit = originalSubmit;

      if (originalRequestSubmit) {
        HTMLFormElement.prototype.requestSubmit = originalRequestSubmit;
      }
    };
  }, [guardExternalHref, isActive]);

  const returnHome = useCallback(() => {
    setBlockedExternalLink(null);

    if (location.pathname !== "/") {
      navigate("/", { replace: true });
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!blockedExternalLink) return;

    const timer = window.setInterval(() => {
      setBlockedExternalLink((current) => {
        if (!current) return current;
        const nextSecondsLeft = current.secondsLeft - 1;

        if (nextSecondsLeft <= 0) {
          window.clearInterval(timer);
          window.setTimeout(returnHome, 0);
          return current;
        }

        return {
          ...current,
          secondsLeft: nextSecondsLeft,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [blockedExternalLink, returnHome]);

  useEffect(() => {
    if (!isActive) {
      setShowCarouselControls(false);
      return;
    }

    let scheduled = false;
    let observer: MutationObserver | null = null;

    const update = () => {
      const slider = document.querySelector<HTMLElement>(".NEB-slider");
      const buttons = getIndicatorButtons();

      if (!slider || buttons.length < 2) {
        setShowCarouselControls(false);
        return;
      }

      const rect = slider.getBoundingClientRect();
      const visible = rect.bottom > 80 && rect.top < window.innerHeight - 80;

      if (!visible) {
        setShowCarouselControls(false);
        return;
      }

      setCarouselTop(Math.round(rect.top + rect.height / 2));
      setShowCarouselControls(true);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        update();
      });
    };

    schedule();
    [100, 300, 700, 1200, 2000, 4000, 7000].forEach((delay) => {
      window.setTimeout(schedule, delay);
    });

    const interval = window.setInterval(schedule, 2000);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer?.disconnect();
    };
  }, [isActive, location.pathname]);

  const moveCarousel = useCallback((delta: number) => {
    const buttons = getIndicatorButtons();
    if (!buttons.length) return;

    const currentIndex = buttons.findIndex((button) => button.classList.contains("is-active"));
    const nextIndex = ((currentIndex < 0 ? 0 : currentIndex) + delta + buttons.length) % buttons.length;
    clickIndicator(buttons[nextIndex]);
  }, []);

  const carouselButtonStyle = useMemo(() => ({
    top: `${carouselTop}px`,
    transform: "translateY(-50%)",
  }), [carouselTop]);

  if (!isActive) return null;

  return (
    <>
      {showCarouselControls && (
        <div id="kiosk-carousel-controls" aria-label="광고 이동">
          <button
            type="button"
            className="kcc-prev"
            style={carouselButtonStyle}
            aria-label="이전 광고"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              moveCarousel(-1);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="kcc-next"
            style={carouselButtonStyle}
            aria-label="다음 광고"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              moveCarousel(1);
            }}
          >
            ›
          </button>
        </div>
      )}

      {blockedExternalLink && (
        <div
          id="kiosk-external-lock"
          role="dialog"
          aria-modal="true"
          aria-label="외부 링크 안내"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="kel-panel">
            <img src={KIOSK_QR_DATA_URI} alt="댄스빌보드 QR" />
            <div>
              <div className="kel-title">외부 링크 연결 기능 등 온전한 기능 사용은</div>
              <div className="kel-copy">모바일에서 댄스빌보드 사이트를 열어주세요.</div>
              <div className="kel-url">{KIOSK_MOBILE_URL}</div>
              <div className="kel-blocked-url">{blockedExternalLink.href}</div>
              <div className="kel-actions">
                <button type="button" className="kel-home" onClick={returnHome}>
                  홈으로 돌아가기
                </button>
                <div className="kel-count">
                  <span>{blockedExternalLink.secondsLeft}</span>초 후 자동으로 홈으로 돌아갑니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
