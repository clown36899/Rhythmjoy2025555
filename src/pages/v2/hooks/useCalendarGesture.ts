import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCalendarGestureProps {
  headerHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  calendarRef?: React.RefObject<HTMLDivElement>;
  calendarContentRef?: React.RefObject<HTMLDivElement>;
  eventListElementRef: React.RefObject<HTMLDivElement>;
  onHorizontalSwipe: (direction: 'next' | 'prev') => void;
  isYearView: boolean;
  headerDebugInfo?: string;
  defaultMode?: 'collapsed' | 'expanded' | 'fullscreen';
}

const EXPANDED_HEIGHT = 200;
const FOOTER_HEIGHT = 130; // 하단 네비게이션 고정 높이
const MIN_SWIPE_DISTANCE = 40;
const CLICK_SUPPRESS_AFTER_SWIPE_MS = 450;

const getSafeRect = (element: Element | null | undefined) => {
  if (!element || !element.isConnected) return null;
  try {
    return element.getBoundingClientRect();
  } catch {
    return null;
  }
};

export function useCalendarGesture({
  headerHeight,
  containerRef,
  calendarRef,
  calendarContentRef,
  eventListElementRef,
  onHorizontalSwipe,
  isYearView,
  headerDebugInfo,
  defaultMode = 'collapsed',
}: UseCalendarGestureProps) {
  const [calendarMode, setCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen'>(defaultMode);
  const [isDragging, setIsDragging] = useState(false);
  const [liveCalendarHeight, setLiveCalendarHeight] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 600);

  const swipeAnimationRef = useRef<number | null>(null);
  const gestureEndFallbackRef = useRef<number | null>(null);
  const onHorizontalSwipeRef = useRef(onHorizontalSwipe);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    onHorizontalSwipeRef.current = onHorizontalSwipe;
  }, [onHorizontalSwipe]);

  const latestStateRef = useRef({ isAnimating, calendarMode, isYearView });
  useEffect(() => {
    latestStateRef.current = { isAnimating, calendarMode, isYearView };
  }, [isAnimating, calendarMode, isYearView]);

  // Track viewport height changes (mobile address bar hide/show)
  // Track viewport height changes (mobile address bar hide/show) - DISABLED to prevent flickering
  useEffect(() => {
    // Initial set only
    setViewportHeight(window.innerHeight);
  }, []);

  const calculateFullscreenHeight = useCallback(() => {
    if (typeof window === 'undefined') return 600;

    // Use visualViewport for more accurate height (handles mobile address bar)
    const actualViewportHeight = window.visualViewport
      ? window.visualViewport.height
      : viewportHeight;

    // 1. Bottom Nav Height
    const bottomNavSelector = '.shell-bottom-nav';
    const bottomNav = document.querySelector<HTMLElement>(bottomNavSelector);
    const bottomNavHeight = bottomNav ? bottomNav.offsetHeight : FOOTER_HEIGHT;

    // 2. Filter Bar Height
    const filterBarSelector = '.USS-header, .ELS-scopeSwitcherContainer';
    const filterBar = document.querySelector<HTMLElement>(filterBarSelector);
    const filterBarHeight = filterBar ? filterBar.offsetHeight : 34; // Fallback 34

    // Weekday Header is INSIDE the wrapper, so we don't deduct it.
    const EXTRA_FIXED_HEIGHT = filterBarHeight;

    // [Safety Buffer] Subtract extra 30px to ensure bottom is visible even with address bar quirks
    const SAFETY_BUFFER = 30;

    const result = actualViewportHeight - headerHeight - bottomNavHeight - EXTRA_FIXED_HEIGHT - SAFETY_BUFFER;

    return result;
  }, [headerHeight, viewportHeight, headerDebugInfo]);



  const getTargetHeight = useCallback(() => {
    if (calendarMode === "collapsed") return 0;
    if (calendarMode === "fullscreen") return calculateFullscreenHeight();
    return EXPANDED_HEIGHT;
  }, [calendarMode, calculateFullscreenHeight]);

  const gestureRef = useRef<{
    startX: number; startY: number; startHeight: number;
    isLocked: 'horizontal' | 'vertical-resize' | 'vertical-scroll' | 'native-scroll' | null;
    initialScrollTop: number;
    startTime: number;
    isActive: boolean;
    lastX: number;
    lastY: number;
    pointerCaptureTarget: HTMLElement | null;
    pointerId: number | null;
  }>({ startX: 0, startY: 0, startHeight: 0, isLocked: null, initialScrollTop: 0, startTime: 0, isActive: false, lastX: 0, lastY: 0, pointerCaptureTarget: null, pointerId: null });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    type GestureEvent = TouchEvent | MouseEvent | PointerEvent;

    const getCoords = (e: GestureEvent): { clientX: number; clientY: number } | null => {
      if (isTouchGestureEvent(e)) return e.touches.length > 0 ? e.touches[0] : null;
      return e;
    };

    const getEndCoords = (e: GestureEvent): { clientX: number; clientY: number } | null => {
      if (isTouchGestureEvent(e)) return e.changedTouches.length > 0 ? e.changedTouches[0] : null;
      return e;
    };

    const isTouchGestureEvent = (e: GestureEvent): e is TouchEvent =>
      typeof TouchEvent !== 'undefined' && e instanceof TouchEvent;

    const isMouseGestureEvent = (e: GestureEvent): e is MouseEvent =>
      typeof MouseEvent !== 'undefined' && e instanceof MouseEvent;

    const isPointerGestureEvent = (e: GestureEvent): e is PointerEvent =>
      typeof PointerEvent !== 'undefined' && e instanceof PointerEvent;

    const clearGestureEndFallback = () => {
      if (gestureEndFallbackRef.current) {
        window.clearTimeout(gestureEndFallbackRef.current);
        gestureEndFallbackRef.current = null;
      }
    };

    const removeWindowGestureListeners = () => {
      window.removeEventListener('mousemove', handleGestureMove);
      window.removeEventListener('mouseup', handleGestureEnd);
      window.removeEventListener('touchmove', handleGestureMove);
      window.removeEventListener('touchend', handleGestureEnd);
      window.removeEventListener('touchcancel', handleGestureEnd);
      window.removeEventListener('pointermove', handleGestureMove);
      window.removeEventListener('pointerup', handleGestureEnd);
      window.removeEventListener('pointercancel', handleGestureEnd);
    };

    const finishGesture = (endCoords: { clientX: number; clientY: number }) => {
      if (!gestureRef.current.isActive) return;
      clearGestureEndFallback();

      const { isLocked, startX, startY } = gestureRef.current;

      const diffX = endCoords.clientX - startX;
      const diffY = endCoords.clientY - startY;


      if (swipeAnimationRef.current) { cancelAnimationFrame(swipeAnimationRef.current); swipeAnimationRef.current = null; }



      if (isLocked === 'horizontal') {
        suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_AFTER_SWIPE_MS;
        if (Math.abs(diffX) > MIN_SWIPE_DISTANCE) {
          const containerWidth = containerRef.current?.offsetWidth || window.innerWidth;
          const direction = diffX < 0 ? "next" : "prev";
          const targetOffset = diffX < 0 ? -containerWidth : containerWidth;
          setDragOffset(targetOffset);
          setIsAnimating(true);
          setTimeout(() => {
            onHorizontalSwipeRef.current(direction);
            setDragOffset(0);
            setIsAnimating(false);
          }, 300);
        } else {
          setDragOffset(0);
        }
      } else if (isLocked === 'vertical-resize') {
        // Calculate endHeight dynamically to avoid stale state closure issues
        const DAMPING_FACTOR = 0.14; // Increased to 0.14 (lighter pull)
        const dampedDiffY = diffY * DAMPING_FACTOR;
        const endHeight = gestureRef.current.startHeight + dampedDiffY;

        let nextMode = latestStateRef.current.calendarMode;
        const VISUAL_THRESHOLD = 15; // Reduced to 25px (requires ~178px drag)

        // Velocity check: Ignore flings (fast swipes)
        const duration = Date.now() - gestureRef.current.startTime;
        const velocity = Math.abs(diffY) / duration;
        const isFling = velocity > 1.5; // Increased to 1.5 to allow fast intentional drags

        if (!isFling) {
          if (latestStateRef.current.calendarMode === 'collapsed') {
            // Opening: require significant visual stretch
            if (endHeight > VISUAL_THRESHOLD) {
              nextMode = 'expanded';
            }
          } else if (latestStateRef.current.calendarMode === 'expanded') {
            // Closing: require significant visual compression
            if (endHeight < EXPANDED_HEIGHT - VISUAL_THRESHOLD) {
              nextMode = 'collapsed';
            }
          }
        }

        setCalendarMode(nextMode);
        setIsDragging(false);
      }

      const { pointerCaptureTarget, pointerId } = gestureRef.current;
      if (pointerCaptureTarget && pointerId !== null && pointerCaptureTarget.releasePointerCapture) {
        try {
          pointerCaptureTarget.releasePointerCapture(pointerId);
        } catch {
          // Pointer capture may already be released by the browser on pointerup.
        }
      }

      removeWindowGestureListeners();
      gestureRef.current.isLocked = null;
      gestureRef.current.isActive = false;
      gestureRef.current.lastX = 0;
      gestureRef.current.lastY = 0;
      gestureRef.current.pointerCaptureTarget = null;
      gestureRef.current.pointerId = null;
    };

    const scheduleGestureEndFallback = () => {
      clearGestureEndFallback();
      gestureEndFallbackRef.current = window.setTimeout(() => {
        const { isActive, isLocked, lastX, lastY } = gestureRef.current;
        if (isActive && isLocked === 'horizontal') {
          finishGesture({ clientX: lastX, clientY: lastY });
        }
      }, 220);
    };

    const handleGestureStart = (e: GestureEvent) => {
      // [Definitive Fix] If a modal is open, don't intercept ANY gestures.
      // Check both html and body for maximum compatibility.
      if (document.documentElement.classList.contains('modal-open') ||
        document.body.classList.contains('modal-open')) return;

      if (gestureRef.current.isActive) return;
      if (latestStateRef.current.isAnimating || (isTouchGestureEvent(e) && e.touches.length > 1)) return;
      if (isPointerGestureEvent(e) && e.isPrimary === false) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) return;
      // Allow gestures on calendar cells and event cards even if they have role="button"
      const isCalendarCell = target.closest('.calendar-cell-fullscreen, .calendar-cell-base');
      const isEventCard = target.closest('.calendar-fullscreen-event-card');
      if (!isCalendarCell && !isEventCard && target.closest('button, a, input, select, .clickable, [role="button"]')) {
        return;
      }
      if (latestStateRef.current.isYearView && calendarContentRef?.current?.contains(target)) return;

      const coords = getCoords(e);
      if (!coords) return;

      const eventList = eventListElementRef.current;
      const scrollTop = eventList ? eventList.scrollTop : 0;
      const calendarContent = calendarContentRef?.current;
      const currentHeight = getSafeRect(calendarContent)?.height ?? getTargetHeight();

      if (calendarRef?.current && calendarContentRef?.current) {
        calendarRef.current.style.touchAction = 'pan-y'; // vertical scroll allowed
        calendarContentRef.current.style.touchAction = 'pan-y';
      } else if (containerRef.current) {
        // If strictly separated calendar page, we might want horizontal swipe on container
        containerRef.current.style.touchAction = 'pan-y';
      }
      gestureRef.current = {
        startX: coords.clientX, startY: coords.clientY, startHeight: currentHeight,
        isLocked: null, initialScrollTop: scrollTop, startTime: Date.now(), isActive: true,
        lastX: coords.clientX, lastY: coords.clientY,
        pointerCaptureTarget: null, pointerId: null,
      };
      if (isPointerGestureEvent(e)) {
        if (target.setPointerCapture) {
          try {
            target.setPointerCapture(e.pointerId);
            gestureRef.current.pointerCaptureTarget = target;
            gestureRef.current.pointerId = e.pointerId;
          } catch {
            gestureRef.current.pointerCaptureTarget = null;
            gestureRef.current.pointerId = null;
          }
        }
        window.addEventListener('pointermove', handleGestureMove, { passive: false });
        window.addEventListener('pointerup', handleGestureEnd, { passive: false });
        window.addEventListener('pointercancel', handleGestureEnd, { passive: false });
      } else if (isMouseGestureEvent(e)) {
        window.addEventListener('mousemove', handleGestureMove, { passive: false });
        window.addEventListener('mouseup', handleGestureEnd, { passive: false });
      } else if (isTouchGestureEvent(e)) {
        window.addEventListener('touchmove', handleGestureMove, { passive: false });
        window.addEventListener('touchend', handleGestureEnd, { passive: true });
        window.addEventListener('touchcancel', handleGestureEnd, { passive: true });
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      if (Date.now() > suppressClickUntilRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const handleGestureMove = (e: GestureEvent) => {
      if (!gestureRef.current.isActive) return;
      const coords = getCoords(e);
      if (!coords) return;
      const { startX, startY, isLocked, startHeight, initialScrollTop } = gestureRef.current;
      const diffX = coords.clientX - startX;
      const diffY = coords.clientY - startY;
      gestureRef.current.lastX = coords.clientX;
      gestureRef.current.lastY = coords.clientY;

      if (!isLocked) {
        // If the browser has already claimed the event for scrolling, we can't lock it.
        // However, we should still try to detect if it's a horizontal swipe we want to capture.

        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        // 임계값 상향 (3 -> 10)으로 클릭 미스 방지 및 반응서 확보
        if (absX > 10 || absY > 10) {
          // Reduced threshold (1.2 -> 1.0) for easier horizontal swipe detection
          // 프리뷰 모드(collapsed)에서는 가로 스와이프 비활성화
          if (absX > absY && latestStateRef.current.calendarMode !== 'collapsed') {
            gestureRef.current.isLocked = 'horizontal';
            const target = e.target instanceof Node ? e.target : null;
            const isCalendarArea = target && (calendarRef?.current?.contains(target) || containerRef.current?.contains(target)); // Fallback to container

            // If explicitly strictly calendar page (no calendarRef provided but containerRef exists)
            // effectively treat container as calendar area for horizontal swipes.
            if (!isCalendarArea) return;
          } else if (absY > absX) {
            const target = e.target instanceof Node ? e.target : null;
            const isTouchingCalendar = !!target && calendarRef?.current?.contains(target);

            // DISABLED: Pull-down to expand calendar from event list
            // Users reported this feature was interfering with normal scrolling
            // Only allow resize when directly touching the calendar area

            // Allow resize ONLY if touching calendar directly AND NOT in fullscreen mode
            const shouldResize = (isTouchingCalendar && latestStateRef.current.calendarMode !== 'fullscreen');

            if (shouldResize) {
              gestureRef.current.isLocked = 'vertical-resize';
              setIsDragging(true);
              setLiveCalendarHeight(startHeight);
            } else if (isMouseGestureEvent(e)) {
              gestureRef.current.isLocked = 'vertical-scroll';
            } else {
              // Allow native scrolling for event list
              gestureRef.current.isLocked = 'native-scroll';
            }
          }
        }
      }

      const currentLock = gestureRef.current.isLocked;
      if (currentLock === 'horizontal') {
        const target = e.target instanceof HTMLElement ? e.target : null;
        if (e.cancelable && !target?.closest('input[type="range"]')) e.preventDefault();
        if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
        swipeAnimationRef.current = requestAnimationFrame(() => setDragOffset(diffX));
        scheduleGestureEndFallback();
      } else if (currentLock === 'vertical-resize') {
        if (e.cancelable) e.preventDefault();
        // Apply damping factor for "gum-like" resistance
        const DAMPING_FACTOR = 0.12; //저항력
        const dampedDiffY = diffY * DAMPING_FACTOR;
        const newHeight = startHeight + dampedDiffY;

        const maxAllowedHeight = calculateFullscreenHeight();
        const clampedHeight = Math.max(0, Math.min(newHeight, maxAllowedHeight));
        if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
        swipeAnimationRef.current = requestAnimationFrame(() => setLiveCalendarHeight(clampedHeight));
      } else if (currentLock === 'vertical-scroll' && isMouseGestureEvent(e)) {
        if (e.cancelable) e.preventDefault();
        const eventList = eventListElementRef.current;
        if (eventList) eventList.scrollTop = initialScrollTop - diffY;
      }
    };

    const handleGestureEnd = (e: GestureEvent) => {
      if (!gestureRef.current.isActive) return;

      const { lastX, lastY } = gestureRef.current;
      const endCoords = getEndCoords(e) || { clientX: lastX, clientY: lastY };
      finishGesture(endCoords);
    };

    container.addEventListener('touchstart', handleGestureStart, { passive: true });
    container.addEventListener('touchmove', handleGestureMove, { passive: false });
    container.addEventListener('touchend', handleGestureEnd, { passive: true });
    container.addEventListener('touchcancel', handleGestureEnd, { passive: true });
    container.addEventListener('pointerdown', handleGestureStart, { passive: true });
    container.addEventListener('mousedown', handleGestureStart, { passive: true });
    container.addEventListener('click', handleClickCapture, true);

    return () => {
      container.removeEventListener('touchstart', handleGestureStart);
      container.removeEventListener('touchmove', handleGestureMove);
      container.removeEventListener('touchend', handleGestureEnd);
      container.removeEventListener('touchcancel', handleGestureEnd);
      container.removeEventListener('pointerdown', handleGestureStart);
      container.removeEventListener('mousedown', handleGestureStart);
      container.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('mousemove', handleGestureMove);
      window.removeEventListener('mouseup', handleGestureEnd);
      window.removeEventListener('touchmove', handleGestureMove);
      window.removeEventListener('touchend', handleGestureEnd);
      window.removeEventListener('touchcancel', handleGestureEnd);
      window.removeEventListener('pointermove', handleGestureMove);
      window.removeEventListener('pointerup', handleGestureEnd);
      window.removeEventListener('pointercancel', handleGestureEnd);
      clearGestureEndFallback();
      if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
    };
  }, [containerRef, calendarRef, calendarContentRef, eventListElementRef, calculateFullscreenHeight, getTargetHeight]);

  return {
    calendarMode, setCalendarMode, isDragging, liveCalendarHeight, dragOffset, setDragOffset, isAnimating, setIsAnimating, getTargetHeight, calculateFullscreenHeight,
  };
}
