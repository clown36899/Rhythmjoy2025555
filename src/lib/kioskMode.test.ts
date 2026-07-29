import { beforeEach, describe, expect, it } from "vitest";
import {
  disableKioskMode,
  enableKioskMode,
  isKioskModeEnabled,
  KIOSK_MODE_STORAGE_KEY,
  KIOSK_MODE_VALUE,
} from "./kioskMode";

describe("kiosk mode scope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    disableKioskMode();
  });

  it("does not inherit the legacy origin-wide localStorage flag", () => {
    window.localStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);

    expect(isKioskModeEnabled()).toBe(false);
  });

  it("keeps kiosk mode only in the current tab session", () => {
    enableKioskMode();

    expect(window.sessionStorage.getItem(KIOSK_MODE_STORAGE_KEY)).toBe(KIOSK_MODE_VALUE);
    expect(window.localStorage.getItem(KIOSK_MODE_STORAGE_KEY)).toBeNull();
    expect(isKioskModeEnabled()).toBe(true);
  });

  it("enables the explicit kiosk entry route", () => {
    expect(isKioskModeEnabled({ pathname: "/kiosk" })).toBe(true);
  });

  it("always disables kiosk mode on admin routes", () => {
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);

    expect(isKioskModeEnabled({ pathname: "/admin/v2/ingestor" })).toBe(false);
  });

  it("always disables kiosk mode for authenticated administrators", () => {
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);

    expect(isKioskModeEnabled({ isAdmin: true, pathname: "/" })).toBe(false);
  });
});
