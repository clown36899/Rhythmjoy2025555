#!/usr/bin/env python3
"""Restart the kiosk browser when it is stranded on a recoverable error page."""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse


CDP_TABS_URL = "http://127.0.0.1:9222/json/list"
KIOSK_HEALTH_URL = "https://swingenjoy.com/kiosk"
EXPECTED_HOST = "swingenjoy.com"
ERROR_TITLE_MARKERS = (
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "gateway time-out",
    "internal server error",
    "this site can't be reached",
    "this site can’t be reached",
    "privacy error",
    "사이트에 연결할 수 없음",
    "페이지가 작동하지 않습니다",
    "웹페이지를 사용할 수 없음",
)


def fetch_tabs() -> list[dict[str, object]]:
    with urllib.request.urlopen(CDP_TABS_URL, timeout=3) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise ValueError("Chrome DevTools returned a non-list payload")
    return [item for item in payload if isinstance(item, dict)]


def tab_failure_reason(tabs: list[dict[str, object]]) -> str | None:
    pages = [tab for tab in tabs if tab.get("type") == "page"]
    if not pages:
        return "Chrome has no page target"

    for page in pages:
        title = str(page.get("title") or "").strip()
        title_folded = title.casefold()
        url = str(page.get("url") or "").strip()
        parsed = urlparse(url)

        if url.startswith("chrome-error://"):
            return f"Chrome error page: {url}"
        if any(marker in title_folded for marker in ERROR_TITLE_MARKERS):
            return f"error title: {title or '(empty)'}"
        if parsed.scheme not in {"http", "https"}:
            return f"unexpected page URL: {url or '(empty)'}"

        hostname = (parsed.hostname or "").casefold()
        if hostname != EXPECTED_HOST and not hostname.endswith(f".{EXPECTED_HOST}"):
            return f"page left the kiosk domain: {url}"

    return None


def upstream_ready() -> tuple[bool, str]:
    request = urllib.request.Request(
        KIOSK_HEALTH_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = int(response.status)
        return 200 <= status < 400, f"HTTP {status}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except (OSError, urllib.error.URLError) as exc:
        return False, f"{type(exc).__name__}: {exc}"


def main() -> int:
    try:
        tabs = fetch_tabs()
        failure_reason = tab_failure_reason(tabs)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        failure_reason = f"Chrome DevTools unavailable: {type(exc).__name__}: {exc}"

    if failure_reason is None:
        print("kiosk page healthy")
        return 0

    ready, upstream_status = upstream_ready()
    if not ready:
        print(
            f"kiosk page unhealthy ({failure_reason}); "
            f"upstream not ready ({upstream_status}), leaving Chrome running"
        )
        return 0

    print(
        f"kiosk page unhealthy ({failure_reason}); "
        f"upstream ready ({upstream_status}), restarting Chrome"
    )
    try:
        subprocess.run(
            ["systemctl", "--user", "restart", "kiosk-chrome.service"],
            check=True,
            timeout=30,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        print(f"failed to restart kiosk Chrome: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
