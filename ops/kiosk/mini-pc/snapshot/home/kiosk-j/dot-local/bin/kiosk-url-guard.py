#!/usr/bin/env python3
import base64
import html
import json
import os
import socket
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOME_URL = "https://swingenjoy.com/"
ALLOWED_ROOT = "swingenjoy.com"
DEBUG_JSON_URL = "http://127.0.0.1:9222/json"
GUIDE_ORIGIN = "http://127.0.0.1:9230"
TV_CSS_PATH = "/home/kiosk-j/.local/share/kiosk-domain-guard/kiosk-tv.css"
CAROUSEL_CSS_PATH = "/home/kiosk-j/.local/share/kiosk-domain-guard/kiosk-carousel-controls.css"
CAROUSEL_JS_PATH = "/home/kiosk-j/.local/share/kiosk-domain-guard/kiosk-carousel-controls.js"
QR_IMAGE_PATH = "/home/kiosk-j/.local/share/kiosk-domain-guard/swingenjoy-qr.png"
POLL_SECONDS = 0.25


def is_allowed_host(hostname):
    if not hostname:
        return False
    return hostname == ALLOWED_ROOT or hostname.endswith("." + ALLOWED_ROOT)


def is_allowed_url(raw_url):
    try:
        parsed = urllib.parse.urlparse(raw_url)
    except ValueError:
        return False

    if raw_url.startswith(GUIDE_ORIGIN):
        return True

    if raw_url in ("about:blank", "about:srcdoc"):
        return True

    if parsed.scheme in ("http", "https"):
        return is_allowed_host(parsed.hostname)

    return False


def guide_page(external_url):
    safe_home_url = html.escape(HOME_URL, quote=True)
    safe_return_url = html.escape(GUIDE_ORIGIN + "/return-home", quote=True)

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>댄스빌보드 모바일 안내</title>
  <style>
    :root {{
      color-scheme: dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #111;
      color: #fff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: #111;
    }}
    main {{
      width: min(980px, calc(100vw - 56px));
      min-height: 210px;
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 26px;
      align-items: center;
      margin: 0 0 34px;
      padding: 22px 28px;
      background: rgba(12, 12, 12, .96);
      border: 1px solid rgba(255, 255, 255, .16);
      border-radius: 8px;
      box-shadow: 0 18px 70px rgba(0, 0, 0, .48);
    }}
    h1 {{
      margin: 0;
      font-size: 32px;
      line-height: 1.18;
      letter-spacing: 0;
      font-weight: 850;
    }}
    p {{
      margin: 10px 0 0;
      color: rgba(255, 255, 255, .9);
      font-size: 24px;
      font-weight: 760;
      line-height: 1.35;
    }}
    img {{
      display: block;
      width: 160px;
      height: 160px;
      border-radius: 6px;
      background: #fff;
      padding: 6px;
    }}
    .url {{
      margin-top: 12px;
      color: rgba(255, 255, 255, .68);
      font-size: 18px;
      line-height: 1.35;
      word-break: break-all;
    }}
    .actions {{
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 16px;
      flex-wrap: wrap;
    }}
    button {{
      border: 0;
      border-radius: 6px;
      padding: 12px 18px;
      background: #fff;
      color: #111;
      font-size: 20px;
      font-weight: 850;
      cursor: pointer;
    }}
    .count {{
      color: rgba(255, 255, 255, .58);
      font-size: 17px;
    }}
  </style>
</head>
<body>
  <main>
    <img alt="QR code" src="/qr.png">
    <div>
      <h1>외부 링크 연결 기능 등 온전한 기능 사용은</h1>
      <p>모바일에서 댄스빌보드 사이트를 열어주세요.</p>
      <div class="url">{safe_home_url}</div>
      <div class="actions">
        <button type="button" onclick="location.replace('{safe_return_url}')">홈으로 돌아가기</button>
        <div class="count"><span id="left">45</span>초 후 자동으로 홈으로 돌아갑니다.</div>
      </div>
    </div>
  </main>
  <script>
    let left = 45;
    const label = document.getElementById("left");
    setInterval(() => {{
      left -= 1;
      label.textContent = String(Math.max(left, 0));
      if (left <= 0) location.replace("{safe_return_url}");
    }}, 1000);
  </script>
</body>
</html>"""


def is_guide_return_url(raw_url):
    return raw_url.startswith(GUIDE_ORIGIN + "/return-home") or raw_url.startswith(GUIDE_ORIGIN + "/external")


def is_home_target(raw_url):
    try:
        parsed = urllib.parse.urlparse(raw_url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and is_allowed_host(parsed.hostname)


def devtools_http(path):
    try:
        with urllib.request.urlopen("http://127.0.0.1:9222" + path, timeout=1) as response:
            response.read()
        return True
    except Exception:
        return False


def activate_target(target):
    target_id = target.get("id")
    did_activate = False
    if target.get("webSocketDebuggerUrl"):
        did_activate = websocket_call(target["webSocketDebuggerUrl"], "Page.bringToFront", {})
    if target_id:
        did_activate = devtools_http("/json/activate/" + urllib.parse.quote(target_id, safe="")) or did_activate
    return did_activate


def close_target(target):
    target_id = target.get("id")
    if target_id:
        if devtools_http("/json/close/" + urllib.parse.quote(target_id, safe="")):
            return True
    if target.get("webSocketDebuggerUrl"):
        return websocket_call(target["webSocketDebuggerUrl"], "Page.close", {})
    return False


def return_to_home():
    try:
        targets = [target for target in fetch_targets() if target.get("type") == "page"]
    except Exception:
        return False

    home_targets = [target for target in targets if is_home_target(target.get("url", ""))]
    close_targets = [
        target for target in targets
        if not is_allowed_url(target.get("url", "")) or is_guide_return_url(target.get("url", ""))
    ]

    if home_targets:
        activate_target(home_targets[0])
    elif targets:
        websocket_navigate(targets[0]["webSocketDebuggerUrl"], HOME_URL)
        activate_target(targets[0])
        home_targets = [targets[0]]

    keep_ids = {target.get("id") for target in home_targets[:1]}
    for target in close_targets:
        if target.get("id") not in keep_ids:
            close_target(target)

    return True


def schedule_return_to_home():
    thread = threading.Thread(target=return_to_home, daemon=True)
    thread.start()


def returning_page():
    safe_home = html.escape(HOME_URL, quote=True)
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>홈으로 돌아가는 중</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #111;
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 28px;
      font-weight: 800;
    }}
  </style>
</head>
<body>
  홈으로 돌아가는 중입니다.
  <script>
    setTimeout(() => location.replace("{safe_home}"), 1200);
  </script>
</body>
</html>"""


class GuideHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return

        if parsed.path == "/qr.png":
            try:
                with open(QR_IMAGE_PATH, "rb") as qr_file:
                    body = qr_file.read()
            except OSError:
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/return-home":
            body = returning_page().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            schedule_return_to_home()
            return

        if parsed.path != "/external":
            self.send_response(302)
            self.send_header("Location", HOME_URL)
            self.end_headers()
            return

        params = urllib.parse.parse_qs(parsed.query)
        target = params.get("u", [HOME_URL])[0]
        body = guide_page(target).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


def start_guide_server():
    server = ThreadingHTTPServer(("127.0.0.1", 9230), GuideHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()


def fetch_targets():
    with urllib.request.urlopen(DEBUG_JSON_URL, timeout=1) as response:
        return json.loads(response.read().decode("utf-8"))


def websocket_call(websocket_url, method, params):
    parsed = urllib.parse.urlparse(websocket_url)
    port = parsed.port or 80
    path = parsed.path
    if parsed.query:
        path += "?" + parsed.query

    sock = socket.create_connection((parsed.hostname, port), timeout=1.5)
    try:
        sock.settimeout(1.5)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(request.encode("ascii"))
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                return False
            response += chunk
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            return False

        payload = json.dumps({"id": 1, "method": method, "params": params}, separators=(",", ":")).encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.extend([0x80 | 126, (length >> 8) & 0xFF, length & 0xFF])
        else:
            header.append(0x80 | 127)
            header.extend(length.to_bytes(8, "big"))
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        sock.sendall(bytes(header) + mask + masked)

        buffered = response.split(b"\r\n\r\n", 1)[1]
        deadline = time.monotonic() + 1.5
        while time.monotonic() < deadline:
            message, buffered = websocket_read_message(sock, buffered)
            if message is None:
                continue
            try:
                decoded = json.loads(message)
            except json.JSONDecodeError:
                continue
            if decoded.get("id") == 1:
                return "error" not in decoded
        return False
    finally:
        sock.close()


def websocket_read_message(sock, buffered):
    while len(buffered) < 2:
        buffered += sock.recv(4096)

    first, second = buffered[0], buffered[1]
    opcode = first & 0x0F
    masked = bool(second & 0x80)
    length = second & 0x7F
    offset = 2

    if length == 126:
        while len(buffered) < offset + 2:
            buffered += sock.recv(4096)
        length = int.from_bytes(buffered[offset:offset + 2], "big")
        offset += 2
    elif length == 127:
        while len(buffered) < offset + 8:
            buffered += sock.recv(4096)
        length = int.from_bytes(buffered[offset:offset + 8], "big")
        offset += 8

    mask = b""
    if masked:
        while len(buffered) < offset + 4:
            buffered += sock.recv(4096)
        mask = buffered[offset:offset + 4]
        offset += 4

    while len(buffered) < offset + length:
        buffered += sock.recv(4096)

    payload = buffered[offset:offset + length]
    remaining = buffered[offset + length:]
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))

    if opcode == 1:
        return payload.decode("utf-8", errors="replace"), remaining
    return None, remaining


def websocket_navigate(websocket_url, target_url):
    return websocket_call(websocket_url, "Page.navigate", {"url": target_url})


def load_tv_css():
    return load_text_file(TV_CSS_PATH)


def load_carousel_css():
    return load_text_file(CAROUSEL_CSS_PATH)


def load_carousel_js():
    return load_text_file(CAROUSEL_JS_PATH)


def load_text_file(path):
    try:
        with open(path, "r", encoding="utf-8") as text_file:
            return text_file.read()
    except OSError:
        return ""


def load_qr_data_url():
    try:
        with open(QR_IMAGE_PATH, "rb") as qr_file:
            encoded = base64.b64encode(qr_file.read()).decode("ascii")
            return "data:image/png;base64," + encoded
    except OSError:
        return (
            "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data="
            + urllib.parse.quote(HOME_URL, safe="")
        )


def inject_allowed_page_helpers(websocket_url):
    css = load_tv_css()
    carousel_css = load_carousel_css()
    carousel_js = load_carousel_js()
    expression = (
        "(() => {"
        "const css = " + json.dumps(css) + ";"
        "const carouselCss = " + json.dumps(carousel_css) + ";"
        "const carouselJs = " + json.dumps(carousel_js) + ";"
        "if (css) {"
        "  let style = document.getElementById('kiosk-tv-style');"
        "  if (!style) {"
        "    style = document.createElement('style');"
        "    style.id = 'kiosk-tv-style';"
        "    (document.head || document.documentElement).appendChild(style);"
        "  }"
        "  if (style.textContent !== css) style.textContent = css;"
        "}"
        "if (carouselCss) {"
        "  let carouselStyle = document.getElementById('kiosk-carousel-style');"
        "  if (!carouselStyle) {"
        "    carouselStyle = document.createElement('style');"
        "    carouselStyle.id = 'kiosk-carousel-style';"
        "    (document.head || document.documentElement).appendChild(carouselStyle);"
        "  }"
        "  if (carouselStyle.textContent !== carouselCss) carouselStyle.textContent = carouselCss;"
        "}"
        "if (carouselJs && !window.__kioskCarouselControlsLoaded) {"
        "  try { (0, eval)(carouselJs); } catch (error) { window.__kioskCarouselControlsError = String(error && error.message || error); }"
        "}"
        "if (!window.__kioskExternalWindowGuard) {"
        "  window.__kioskExternalWindowGuard = true;"
        "  const allowedRoot = " + json.dumps(ALLOWED_ROOT) + ";"
        "  const guideOrigin = " + json.dumps(GUIDE_ORIGIN) + ";"
        "  const isWeb = url => url.protocol === 'http:' || url.protocol === 'https:';"
        "  const isAllowed = url => url.hostname === allowedRoot || url.hostname.endsWith('.' + allowedRoot);"
        "  const isGuideUrl = url => url.href.startsWith(guideOrigin + '/');"
        "  const isInternalPseudoUrl = url => url.protocol === 'about:' || url.protocol === 'javascript:';"
        "  const shouldGuide = rawHref => {"
        "    if (!rawHref) return false;"
        "    const trimmed = String(rawHref).trim();"
        "    if (!trimmed || trimmed.startsWith('#')) return false;"
        "    let url;"
        "    try { url = new URL(trimmed, location.href); } catch (_) { return false; }"
        "    if (isGuideUrl(url)) return false;"
        "    if (isWeb(url)) return !isAllowed(url);"
        "    return !isInternalPseudoUrl(url);"
        "  };"
        "  const findAnchor = node => {"
        "    while (node && node !== document.documentElement) {"
        "      if (node.tagName === 'A' && node.href) return node;"
        "      node = node.parentElement;"
        "    }"
        "    return null;"
        "  };"
        "  const originalOpen = window.open;"
        "  const openExternal = href => {"
        "    if (window.__kioskGuideOpening) return;"
        "    window.__kioskGuideOpening = true;"
        "    const guideUrl = " + json.dumps(GUIDE_ORIGIN + "/external?u=") + " + encodeURIComponent(href);"
        "    location.href = guideUrl;"
        "  };"
        "  const handleAnchorEvent = event => {"
        "    const anchor = findAnchor(event.target);"
        "    if (!anchor) return;"
        "    if (!shouldGuide(anchor.getAttribute('href') || anchor.href)) return;"
        "    event.preventDefault();"
        "    event.stopPropagation();"
        "    event.stopImmediatePropagation();"
        "    openExternal(anchor.href);"
        "  };"
        "  ['pointerdown','mousedown','touchstart','click','auxclick'].forEach(type => {"
        "    document.addEventListener(type, handleAnchorEvent, true);"
        "  });"
        "  document.addEventListener('submit', event => {"
        "    const form = event.target;"
        "    if (!form || form.tagName !== 'FORM') return;"
        "    const action = form.getAttribute('action') || location.href;"
        "    if (!shouldGuide(action)) return;"
        "    event.preventDefault();"
        "    event.stopPropagation();"
        "    event.stopImmediatePropagation();"
        "    openExternal(action);"
        "  }, true);"
        "  window.open = function(rawUrl) {"
        "    if (rawUrl) {"
        "      try {"
        "        const url = new URL(rawUrl, location.href);"
        "        if (shouldGuide(rawUrl)) {"
        "          openExternal(url.href);"
        "          return window;"
        "        }"
        "      } catch (_) {}"
        "    }"
        "    return originalOpen.apply(window, arguments);"
        "  };"
        "  if (window.HTMLAnchorElement && HTMLAnchorElement.prototype && !window.__kioskAnchorClickPatched) {"
        "    window.__kioskAnchorClickPatched = true;"
        "    const originalAnchorClick = HTMLAnchorElement.prototype.click;"
        "    HTMLAnchorElement.prototype.click = function() {"
        "      const href = this.getAttribute('href') || this.href;"
        "      if (shouldGuide(href)) { openExternal(this.href); return; }"
        "      return originalAnchorClick.apply(this, arguments);"
        "    };"
        "  }"
        "  if (window.HTMLFormElement && HTMLFormElement.prototype && !window.__kioskFormSubmitPatched) {"
        "    window.__kioskFormSubmitPatched = true;"
        "    const originalSubmit = HTMLFormElement.prototype.submit;"
        "    HTMLFormElement.prototype.submit = function() {"
        "      const action = this.getAttribute('action') || location.href;"
        "      if (shouldGuide(action)) { openExternal(action); return; }"
        "      return originalSubmit.apply(this, arguments);"
        "    };"
        "    if (HTMLFormElement.prototype.requestSubmit) {"
        "      const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;"
        "      HTMLFormElement.prototype.requestSubmit = function() {"
        "        const action = this.getAttribute('action') || location.href;"
        "        if (shouldGuide(action)) { openExternal(action); return; }"
        "        return originalRequestSubmit.apply(this, arguments);"
        "      };"
        "    }"
        "  }"
        "}"
        "return true;"
        "})()"
    )
    return websocket_call(
        websocket_url,
        "Runtime.evaluate",
        {"expression": expression, "returnByValue": False, "awaitPromise": False},
    )


def inject_external_lock(websocket_url, external_url):
    qr_url = load_qr_data_url()
    expression = (
        "(() => {"
        "const targetUrl = " + json.dumps(external_url) + ";"
        "const qrUrl = " + json.dumps(qr_url) + ";"
        "const homeUrl = " + json.dumps(HOME_URL) + ";"
        "const returnUrl = " + json.dumps(GUIDE_ORIGIN + "/return-home") + ";"
        "let style = document.getElementById('kiosk-external-lock-style');"
        "if (!style) {"
        "  style = document.createElement('style');"
        "  style.id = 'kiosk-external-lock-style';"
        "  (document.head || document.documentElement).appendChild(style);"
        "}"
        "style.textContent = `"
        "#kiosk-external-lock{position:fixed;inset:0;z-index:2147483647;pointer-events:auto;"
        "display:flex;align-items:flex-end;justify-content:center;background:linear-gradient(to top,rgba(0,0,0,.56),rgba(0,0,0,0) 55%);"
        "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;cursor:default}"
        "#kiosk-external-lock *{box-sizing:border-box;pointer-events:none;user-select:none}"
        "#kiosk-external-lock .kel-panel{width:min(980px,calc(100vw - 56px));min-height:210px;margin:0 0 34px;"
        "display:grid;grid-template-columns:160px 1fr;gap:26px;align-items:center;padding:22px 28px;"
        "border-radius:8px;background:rgba(12,12,12,.92);box-shadow:0 18px 70px rgba(0,0,0,.48);border:1px solid rgba(255,255,255,.16)}"
        "#kiosk-external-lock img{width:160px;height:160px;border-radius:6px;background:#fff;padding:6px}"
        "#kiosk-external-lock .kel-title{font-size:32px;font-weight:850;line-height:1.18;letter-spacing:0}"
        "#kiosk-external-lock .kel-copy{margin-top:10px;font-size:24px;font-weight:760;line-height:1.35;color:rgba(255,255,255,.9)}"
        "#kiosk-external-lock .kel-url{margin-top:12px;font-size:18px;line-height:1.3;color:rgba(255,255,255,.68);word-break:break-all}"
        "#kiosk-external-lock .kel-actions{display:flex;align-items:center;gap:16px;margin-top:16px;flex-wrap:wrap}"
        "#kiosk-external-lock .kel-home{pointer-events:auto;border:0;border-radius:6px;background:#fff;color:#111;"
        "font-size:20px;font-weight:850;padding:12px 18px;cursor:pointer}"
        "#kiosk-external-lock .kel-count{font-size:17px;color:rgba(255,255,255,.58)}"
        "`;"
        "document.documentElement.style.overflow = 'hidden';"
        "if (document.body) document.body.style.overflow = 'hidden';"
        "let lock = document.getElementById('kiosk-external-lock');"
        "if (!lock) {"
        "  lock = document.createElement('div');"
        "  lock.id = 'kiosk-external-lock';"
        "  document.documentElement.appendChild(lock);"
        "}"
        "const createNode = (tagName, className, text) => {"
        "  const node = document.createElement(tagName);"
        "  if (className) node.className = className;"
        "  if (text) node.textContent = text;"
        "  return node;"
        "};"
        "while (lock.firstChild) lock.removeChild(lock.firstChild);"
        "const panel = createNode('div', 'kel-panel');"
        "const image = createNode('img');"
        "const body = createNode('div');"
        "const title = createNode('div', 'kel-title', '외부 링크 연결 기능 등 온전한 기능 사용은');"
        "const copy = createNode('div', 'kel-copy', '모바일에서 댄스빌보드 사이트를 열어주세요.');"
        "const url = createNode('div', 'kel-url', homeUrl);"
        "const actions = createNode('div', 'kel-actions');"
        "const homeButton = createNode('button', 'kel-home', '홈으로 돌아가기');"
        "const count = createNode('div', 'kel-count');"
        "const leftLabel = createNode('span', '', '45');"
        "image.alt = 'QR code';"
        "image.src = qrUrl;"
        "homeButton.type = 'button';"
        "homeButton.onclick = () => location.replace(returnUrl);"
        "count.appendChild(leftLabel);"
        "count.appendChild(document.createTextNode('초 후 자동으로 홈으로 돌아갑니다.'));"
        "actions.appendChild(homeButton);"
        "actions.appendChild(count);"
        "body.appendChild(title);"
        "body.appendChild(copy);"
        "body.appendChild(url);"
        "body.appendChild(actions);"
        "panel.appendChild(image);"
        "panel.appendChild(body);"
        "lock.appendChild(panel);"
        "if (!window.__kioskExternalLockTimer) {"
        "  let left = 45;"
        "  window.__kioskExternalLockTimer = setInterval(() => {"
        "    left -= 1;"
        "    const label = document.querySelector('#kiosk-external-lock .kel-count span');"
        "    if (label) label.textContent = String(Math.max(left, 0));"
        "    if (left <= 0) location.replace(returnUrl);"
        "  }, 1000);"
        "}"
        "return true;"
        "})()"
    )
    return websocket_call(
        websocket_url,
        "Runtime.evaluate",
        {"expression": expression, "returnByValue": False, "awaitPromise": False},
    )


def guide_url(external_url):
    return GUIDE_ORIGIN + "/external?u=" + urllib.parse.quote(external_url, safe="")


def monitor():
    handled = {}
    injected = {}
    while True:
        try:
            targets = fetch_targets()
            now = time.monotonic()
            for target in targets:
                if target.get("type") != "page":
                    continue
                raw_url = target.get("url", "")
                if not raw_url:
                    continue

                if is_allowed_url(raw_url):
                    target_id = target.get("id", "")
                    prior_url, prior_time = injected.get(target_id, ("", 0))
                    if prior_url != raw_url or now - prior_time > 0.5:
                        if inject_allowed_page_helpers(target["webSocketDebuggerUrl"]):
                            injected[target_id] = (raw_url, now)
                    continue

                target_id = target.get("id", "")
                prior_url, prior_time = handled.get(target_id, ("", 0))
                if prior_url == raw_url and now - prior_time < 1:
                    continue

                if websocket_navigate(target["webSocketDebuggerUrl"], guide_url(raw_url)):
                    handled[target_id] = (raw_url, now)
        except Exception:
            pass
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    start_guide_server()
    monitor()
