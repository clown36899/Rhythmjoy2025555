(function () {
  "use strict";

  var allowedRoot = "swingenjoy.com";
  var homeUrl = "https://swingenjoy.com/";
  var returnUrl = "http://127.0.0.1:9230/return-home";
  var guideBaseUrl = "http://127.0.0.1:9230/external?u=";
  var qrDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAADwAQMAAAAEm3vRAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAABYklEQVRYhe2YPbKDMAyElaFwyRE4CkeDo/koHCGlCwZFK/kneY+0KSyryAR/VDvSag3RqN/XzFbydz0W5jSdj3z07Brjhx5M274e8i+wYFVk8Y0D81VPZlWNRLPoBG/M0i1P02jgqtoWtXe+ieoNlyGSAzjKSfcz1hsungrzKEN0Y7nOcCtMEX0vX1hVu1SouBwzJ5ouEg2jLp5+Mc0J7kG8I3lIg0x4IOQQz1h0CqYakoc47DnpBMU1z5hPbBHsspFRb+H60Dem8JY8MESsGlVPdYnVTSCUbOCcPOjDenrFFj1FiM0WKwO3IXKLQ9KekeQhK7YEkb1d17xijaY4wQYueI1EPeNaGkRZX0a7/KHecMvnmkPL5b55qlNcbnO4xdq1xVR7s9w+cfmosYtfoFvyEBVZBrYNjNbRVwa2QIZK2WluvpB1hvMQtRV7afL4/6HYFTaxsmo5sXPrFqd41K/rBfzCN2Uk0CkJAAAAAElFTkSuQmCC";

  function isAllowedHost(hostname) {
    return hostname === allowedRoot || hostname.endsWith("." + allowedRoot);
  }

  function isWebPage() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function isExternalPage() {
    return isWebPage() && !isAllowedHost(location.hostname);
  }

  function isAllowedPage() {
    return isWebPage() && isAllowedHost(location.hostname);
  }

  function normalizeUrl(rawHref) {
    if (!rawHref) return null;
    var trimmed = String(rawHref).trim();
    if (!trimmed || trimmed.charAt(0) === "#") return null;
    try {
      return new URL(trimmed, location.href);
    } catch (_) {
      return null;
    }
  }

  function isGuideUrl(url) {
    return url.href.indexOf("http://127.0.0.1:9230/") === 0;
  }

  function isInternalPseudoUrl(url) {
    return url.protocol === "about:" || url.protocol === "javascript:";
  }

  function shouldGuide(rawHref) {
    var url = normalizeUrl(rawHref);
    if (!url) return false;
    if (isGuideUrl(url)) return false;
    if (url.protocol === "http:" || url.protocol === "https:") return !isAllowedHost(url.hostname);
    return !isInternalPseudoUrl(url);
  }

  function openGuide(rawHref) {
    var url = normalizeUrl(rawHref);
    if (!url || window.__kioskGuideOpening) return;
    window.__kioskGuideOpening = true;
    location.href = guideBaseUrl + encodeURIComponent(url.href);
  }

  function findAnchor(node) {
    while (node && node !== document.documentElement) {
      if (node.tagName === "A" && node.href) return node;
      node = node.parentElement;
    }
    return null;
  }

  function installOutboundGuard() {
    if (!isAllowedPage()) return;
    if (window.__kioskAllowedPageOutboundGuard) return;
    window.__kioskAllowedPageOutboundGuard = true;

    function handleAnchorEvent(event) {
      var anchor = findAnchor(event.target);
      if (!anchor) return;
      var href = anchor.getAttribute("href") || anchor.href;
      if (!shouldGuide(href)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openGuide(anchor.href);
    }

    ["pointerdown", "mousedown", "touchstart", "click", "auxclick"].forEach(function (type) {
      document.addEventListener(type, handleAnchorEvent, true);
    });

    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || form.tagName !== "FORM") return;
        var action = form.getAttribute("action") || location.href;
        if (!shouldGuide(action)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openGuide(action);
      },
      true
    );

    var originalOpen = window.open;
    window.open = function (rawUrl) {
      if (rawUrl && shouldGuide(rawUrl)) {
        openGuide(rawUrl);
        return window;
      }
      return originalOpen.apply(window, arguments);
    };

    if (window.HTMLAnchorElement && HTMLAnchorElement.prototype && !window.__kioskAnchorClickPatched) {
      window.__kioskAnchorClickPatched = true;
      var originalAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        var href = this.getAttribute("href") || this.href;
        if (shouldGuide(href)) {
          openGuide(this.href);
          return;
        }
        return originalAnchorClick.apply(this, arguments);
      };
    }

    if (window.HTMLFormElement && HTMLFormElement.prototype && !window.__kioskFormSubmitPatched) {
      window.__kioskFormSubmitPatched = true;
      var originalSubmit = HTMLFormElement.prototype.submit;
      HTMLFormElement.prototype.submit = function () {
        var action = this.getAttribute("action") || location.href;
        if (shouldGuide(action)) {
          openGuide(action);
          return;
        }
        return originalSubmit.apply(this, arguments);
      };

      if (HTMLFormElement.prototype.requestSubmit) {
        var originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
        HTMLFormElement.prototype.requestSubmit = function () {
          var action = this.getAttribute("action") || location.href;
          if (shouldGuide(action)) {
            openGuide(action);
            return;
          }
          return originalRequestSubmit.apply(this, arguments);
        };
      }
    }
  }

  function goHome() {
    location.replace(returnUrl);
  }

  function createNode(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function empty(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function buildLock(lock) {
    empty(lock);

    var panel = createNode("div", "kel-panel");
    var image = createNode("img");
    var body = createNode("div");
    var title = createNode("div", "kel-title", "외부 링크 연결 기능 등 온전한 기능 사용은");
    var copy = createNode("div", "kel-copy", "모바일에서 댄스빌보드 사이트를 열어주세요.");
    var url = createNode("div", "kel-url", homeUrl);
    var actions = createNode("div", "kel-actions");
    var homeButton = createNode("button", "kel-home", "홈으로 돌아가기");
    var count = createNode("div", "kel-count");
    var left = createNode("span", "", "45");

    image.alt = "QR code";
    image.src = qrDataUrl;
    homeButton.type = "button";
    homeButton.addEventListener("click", goHome);

    count.appendChild(left);
    count.appendChild(document.createTextNode("초 후 자동으로 홈으로 돌아갑니다."));
    actions.appendChild(homeButton);
    actions.appendChild(count);
    body.appendChild(title);
    body.appendChild(copy);
    body.appendChild(url);
    body.appendChild(actions);
    panel.appendChild(image);
    panel.appendChild(body);
    lock.appendChild(panel);
  }

  function installLock() {
    if (!isExternalPage()) return;
    if (!document.documentElement) return;

    var style = document.getElementById("kiosk-external-lock-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "kiosk-external-lock-style";
      document.documentElement.appendChild(style);
    }
    style.textContent =
      "#kiosk-external-lock{position:fixed;inset:0;z-index:2147483647;pointer-events:auto;" +
      "display:flex;align-items:flex-end;justify-content:center;background:linear-gradient(to top,rgba(0,0,0,.56),rgba(0,0,0,0) 55%);" +
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;cursor:default}" +
      "#kiosk-external-lock *{box-sizing:border-box;pointer-events:none;user-select:none}" +
      "#kiosk-external-lock .kel-panel{width:min(980px,calc(100vw - 56px));min-height:210px;margin:0 0 34px;" +
      "display:grid;grid-template-columns:160px 1fr;gap:26px;align-items:center;padding:22px 28px;" +
      "border-radius:8px;background:rgba(12,12,12,.92);box-shadow:0 18px 70px rgba(0,0,0,.48);border:1px solid rgba(255,255,255,.16)}" +
      "#kiosk-external-lock img{width:160px;height:160px;border-radius:6px;background:#fff;padding:6px}" +
      "#kiosk-external-lock .kel-title{font-size:32px;font-weight:850;line-height:1.18;letter-spacing:0}" +
      "#kiosk-external-lock .kel-copy{margin-top:10px;font-size:24px;font-weight:760;line-height:1.35;color:rgba(255,255,255,.9)}" +
      "#kiosk-external-lock .kel-url{margin-top:12px;font-size:18px;line-height:1.3;color:rgba(255,255,255,.68);word-break:break-all}" +
      "#kiosk-external-lock .kel-actions{display:flex;align-items:center;gap:16px;margin-top:16px;flex-wrap:wrap}" +
      "#kiosk-external-lock .kel-home{pointer-events:auto;border:0;border-radius:6px;background:#fff;color:#111;font-size:20px;font-weight:850;padding:12px 18px;cursor:pointer}" +
      "#kiosk-external-lock .kel-count{font-size:17px;color:rgba(255,255,255,.58)}";

    document.documentElement.style.overflow = "hidden";
    if (document.body) document.body.style.overflow = "hidden";

    var lock = document.getElementById("kiosk-external-lock");
    if (!lock) {
      lock = document.createElement("div");
      lock.id = "kiosk-external-lock";
      document.documentElement.appendChild(lock);
    }

    buildLock(lock);

    if (!window.__kioskExternalLockTimer) {
      var left = 45;
      window.__kioskExternalLockTimer = window.setInterval(function () {
        left -= 1;
        var label = document.querySelector("#kiosk-external-lock .kel-count span");
        if (label) label.textContent = String(Math.max(left, 0));
        if (left <= 0) goHome();
      }, 1000);
    }
  }

  document.addEventListener(
    "click",
    function (event) {
      if (!isExternalPage()) return;
      if (event.target && event.target.classList && event.target.classList.contains("kel-home")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    true
  );

  installOutboundGuard();
  installLock();
  window.setTimeout(installLock, 0);
  window.setTimeout(installLock, 100);
  window.setTimeout(installOutboundGuard, 0);
  window.setTimeout(installOutboundGuard, 100);
  document.addEventListener("DOMContentLoaded", installLock, { once: true });
  document.addEventListener("DOMContentLoaded", installOutboundGuard, { once: true });
})();
