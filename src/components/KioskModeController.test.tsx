import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import KioskModeController from "./KioskModeController";
import {
  KIOSK_MOBILE_GUIDE_EVENT,
  KIOSK_MODE_STORAGE_KEY,
  KIOSK_MODE_VALUE,
} from "../lib/kioskMode";

const requestExternalGuide = () => {
  act(() => {
    window.dispatchEvent(new CustomEvent(KIOSK_MOBILE_GUIDE_EVENT, {
      detail: { href: "https://www.instagram.com/example" },
    }));
  });
};

describe("KioskModeController visibility", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.documentElement.classList.remove("kiosk-link-router-active");
    document.body.classList.remove("kiosk-link-router-active");
  });

  it("never shows the kiosk guide on an admin route", () => {
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);
    render(
      <MemoryRouter initialEntries={["/admin/v2/ingestor"]}>
        <KioskModeController />
      </MemoryRouter>,
    );

    requestExternalGuide();

    expect(screen.queryByRole("dialog", { name: "외부 링크 안내" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(KIOSK_MODE_STORAGE_KEY)).toBeNull();
  });

  it("never shows the kiosk guide for an authenticated administrator", () => {
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KioskModeController isAdmin />
      </MemoryRouter>,
    );

    requestExternalGuide();

    expect(screen.queryByRole("dialog", { name: "외부 링크 안내" })).not.toBeInTheDocument();
  });

  it("still shows the guide inside the dedicated kiosk tab", () => {
    window.sessionStorage.setItem(KIOSK_MODE_STORAGE_KEY, KIOSK_MODE_VALUE);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KioskModeController />
      </MemoryRouter>,
    );

    requestExternalGuide();

    expect(screen.getByRole("dialog", { name: "외부 링크 안내" })).toBeInTheDocument();
  });
});
