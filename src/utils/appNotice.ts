export const APP_NOTICE_EVENT = "swingenjoy:app-notice";

export type AppNoticeTone = "info" | "success" | "warning";

export interface AppNoticeDetail {
  title?: string;
  message?: string;
  icon?: string;
  tone?: AppNoticeTone;
  durationMs?: number;
}

export function showAppNotice(detail: AppNoticeDetail | string) {
  if (typeof window === "undefined") return;

  const notice = typeof detail === "string"
    ? { title: detail }
    : detail;

  window.dispatchEvent(new CustomEvent<AppNoticeDetail>(APP_NOTICE_EVENT, {
    detail: notice,
  }));
}

export function showComingSoonNotice() {
  showAppNotice({
    title: "준비중",
    icon: "ri-tools-line",
    tone: "info",
  });
}
