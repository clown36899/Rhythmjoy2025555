(function () {
  "use strict";

  window.__kioskCarouselControlsLoaded = true;

  var allowedRoot = "swingenjoy.com";
  var controlsId = "kiosk-carousel-controls";

  function isAllowedHost(hostname) {
    return hostname === allowedRoot || hostname.endsWith("." + allowedRoot);
  }

  function shouldRun() {
    if (location.protocol !== "https:" && location.protocol !== "http:") return false;
    if (!isAllowedHost(location.hostname)) return false;
    return document.documentElement.classList.contains("v2-home-mode") || !!document.querySelector(".NEB-slider");
  }

  function indicators() {
    return Array.from(document.querySelectorAll(".NEB-indicators button"));
  }

  function activeIndex(buttons) {
    return buttons.findIndex(function (button) {
      return button.classList.contains("is-active");
    });
  }

  function clickIndicator(button) {
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function move(delta) {
    var buttons = indicators();
    if (!buttons.length) return;
    var current = activeIndex(buttons);
    if (current < 0) current = 0;
    var next = (current + delta + buttons.length) % buttons.length;
    clickIndicator(buttons[next]);
  }

  function makeButton(className, label, delta) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.setAttribute("aria-label", delta < 0 ? "이전 광고" : "다음 광고");
    button.addEventListener("pointerdown", stop, true);
    button.addEventListener("mousedown", stop, true);
    button.addEventListener("mouseup", stop, true);
    button.addEventListener("click", function (event) {
      stop(event);
      move(delta);
    }, true);
    return button;
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function ensureControls() {
    if (!shouldRun()) {
      var existing = document.getElementById(controlsId);
      if (existing) existing.style.display = "none";
      return;
    }

    var root = document.getElementById(controlsId);
    if (!root) {
      root = document.createElement("div");
      root.id = controlsId;
      root.appendChild(makeButton("kcc-prev", "‹", -1));
      root.appendChild(makeButton("kcc-next", "›", 1));
      document.documentElement.appendChild(root);
    }

    positionControls(root);
  }

  function positionControls(root) {
    var slider = document.querySelector(".NEB-slider");
    var buttons = indicators();
    if (!slider || buttons.length < 2) {
      root.style.display = "none";
      return;
    }

    var rect = slider.getBoundingClientRect();
    var visible = rect.bottom > 80 && rect.top < window.innerHeight - 80;
    if (!visible) {
      root.style.display = "none";
      return;
    }

    var top = Math.round(rect.top + rect.height / 2);
    root.style.display = "block";
    Array.from(root.querySelectorAll("button")).forEach(function (button) {
      button.style.top = top + "px";
      button.style.transform = "translateY(-50%)";
    });
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = window.requestAnimationFrame || function (callback) {
      return window.setTimeout(callback, 16);
    };
    raf(function () {
      scheduled = false;
      ensureControls();
    });
  }

  function start() {
    if (!document.documentElement) {
      window.setTimeout(start, 50);
      return;
    }

    schedule();
    [100, 300, 700, 1200, 2000, 4000, 7000].forEach(function (delay) {
      window.setTimeout(schedule, delay);
    });
    window.setInterval(schedule, 2000);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("DOMContentLoaded", schedule, { once: true });

    try {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    } catch (_) {
      window.setInterval(schedule, 500);
    }
  }

  start();
})();
