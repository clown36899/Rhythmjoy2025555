import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NOTICE_EVENT, type AppNoticeDetail } from "../../utils/appNotice";
import "./AppNoticeToast.css";

type ActiveNotice = Required<Pick<AppNoticeDetail, "title" | "message" | "icon" | "tone">> & {
  id: number;
  durationMs: number;
};

const DEFAULT_NOTICE: Omit<ActiveNotice, "id"> = {
  title: "알림",
  message: "",
  icon: "ri-information-line",
  tone: "info",
  durationMs: 2600,
};

export const AppNoticeToast = () => {
  const [notice, setNotice] = useState<ActiveNotice | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      clearTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    const handleNotice = (event: Event) => {
      const detail = (event as CustomEvent<AppNoticeDetail>).detail;
      if (!detail?.title && !detail?.message) return;

      clearTimers();
      setNotice({
        id: Date.now(),
        title: detail.title || DEFAULT_NOTICE.title,
        message: detail.message || "",
        icon: detail.icon || DEFAULT_NOTICE.icon,
        tone: detail.tone || DEFAULT_NOTICE.tone,
        durationMs: detail.durationMs || DEFAULT_NOTICE.durationMs,
      });
      setIsVisible(true);

      hideTimerRef.current = window.setTimeout(() => {
        dismiss();
      }, detail.durationMs || DEFAULT_NOTICE.durationMs);
    };

    window.addEventListener(APP_NOTICE_EVENT, handleNotice);
    return () => {
      window.removeEventListener(APP_NOTICE_EVENT, handleNotice);
      clearTimers();
    };
  }, [clearTimers, dismiss]);

  if (!notice) return null;

  return (
    <div
      className={`app-notice-toast app-notice-toast--${notice.tone} ${isVisible ? "is-visible" : ""}`}
      role="status"
      aria-live="polite"
      onClick={dismiss}
    >
      <span className="app-notice-toast__icon" aria-hidden="true">
        <i className={notice.icon} />
      </span>
      <span className="app-notice-toast__copy">
        <strong>{notice.title}</strong>
        {notice.message && <span>{notice.message}</span>}
      </span>
      <button
        type="button"
        className="app-notice-toast__close"
        aria-label="알림 닫기"
        onClick={(event) => {
          event.stopPropagation();
          dismiss();
        }}
      >
        <i className="ri-close-line" aria-hidden="true" />
      </button>
    </div>
  );
};
