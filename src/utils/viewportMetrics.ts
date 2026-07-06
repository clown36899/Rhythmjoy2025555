export interface VisualViewportMetrics {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  bottom: number;
  right: number;
}

export const getVisualViewportMetrics = (): VisualViewportMetrics => {
  if (typeof window === 'undefined') {
    return {
      width: 390,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      bottom: 720,
      right: 390,
    };
  }

  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth || 390;
  const height = viewport?.height || window.innerHeight || 720;
  const offsetTop = viewport?.offsetTop || 0;
  const offsetLeft = viewport?.offsetLeft || 0;

  return {
    width,
    height,
    offsetTop,
    offsetLeft,
    bottom: offsetTop + height,
    right: offsetLeft + width,
  };
};

export const updateViewportCssVars = () => {
  if (typeof document === 'undefined') return;

  const metrics = getVisualViewportMetrics();
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--app-visual-viewport-width', `${metrics.width}px`);
  rootStyle.setProperty('--app-visual-viewport-height', `${metrics.height}px`);
  rootStyle.setProperty('--app-visual-viewport-top', `${metrics.offsetTop}px`);
  rootStyle.setProperty('--app-visual-viewport-left', `${metrics.offsetLeft}px`);
  rootStyle.setProperty('--app-visual-viewport-bottom', `${metrics.bottom}px`);
  rootStyle.setProperty('--app-visual-viewport-right', `${metrics.right}px`);
};

export const installViewportCssVars = () => {
  if (typeof window === 'undefined') return () => {};

  let frameId = 0;
  const viewportTarget = window.visualViewport;

  const scheduleUpdate = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      updateViewportCssVars();
    });
  };

  scheduleUpdate();
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('orientationchange', scheduleUpdate);
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate);
  document.addEventListener('visibilitychange', scheduleUpdate);

  if (viewportTarget && typeof viewportTarget.addEventListener === 'function') {
    viewportTarget.addEventListener('resize', scheduleUpdate);
    viewportTarget.addEventListener('scroll', scheduleUpdate);
  }

  return () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', scheduleUpdate);
    window.removeEventListener('orientationchange', scheduleUpdate);
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('pageshow', scheduleUpdate);
    document.removeEventListener('visibilitychange', scheduleUpdate);

    if (viewportTarget && typeof viewportTarget.removeEventListener === 'function') {
      viewportTarget.removeEventListener('resize', scheduleUpdate);
      viewportTarget.removeEventListener('scroll', scheduleUpdate);
    }
  };
};
