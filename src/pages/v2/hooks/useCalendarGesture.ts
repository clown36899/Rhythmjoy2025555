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
const MIN_SWIPE_DISTANCE = 50;

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
    const filterBarSelector = '.evt-sticky-header';
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
  }>({ startX: 0, startY: 0, startHeight: 0, isLocked: null, initialScrollTop: 0, startTime: 0, isActive: false });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCoords = (e: TouchEvent | MouseEvent): { clientX: number; clientY: number } | null => {
      if (e instanceof TouchEvent) return e.touches.length > 0 ? e.touches[0] : null;
      return e;
    };

    const getEndCoords = (e: TouchEvent | MouseEvent): { clientX: number; clientY: number } | null => {
      if (e instanceof TouchEvent) return e.changedTouches.length > 0 ? e.changedTouches[0] : null;
      return e;
    };

    const handleGestureStart = (e: TouchEvent | MouseEvent) => {
      // [Definitive Fix] If a modal is open, don't intercept ANY gestures.
      // Check both html and body for maximum compatibility.
      if (document.documentElement.classList.contains('modal-open') ||
        document.body.classList.contains('modal-open')) return;

      if (latestStateRef.current.isAnimating || (e instanceof TouchEvent && e.touches.length > 1)) return;
      const target = e.target as HTMLElement;
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
      const currentHeight = calendarContentRef?.current ? calendarContentRef.current.getBoundingClientRect().height : getTargetHeight();

      if (calendarRef?.current && calendarContentRef?.current) {
        calendarRef.current.style.touchAction = 'pan-y'; // vertical scroll allowed
        calendarContentRef.current.style.touchAction = 'pan-y';
      } else if (containerRef.current) {
        // If strictly separated calendar page, we might want horizontal swipe on container
        containerRef.current.style.touchAction = 'pan-y';
      }
      gestureRef.current = {
        startX: coords.clientX, startY: coords.clientY, startHeight: currentHeight,
        isLocked: null, initialScrollTop: scrollTop, startTime: Date.now(), isActive: true
      };
      if (e instanceof MouseEvent) {
        window.addEventListener('mousemove', handleGestureMove, { passive: false });
        window.addEventListener('mouseup', handleGestureEnd, { passive: false });
      }
    };

    const handleGestureMove = (e: TouchEvent | MouseEvent) => {
      if (!gestureRef.current.isActive) return;
      const coords = getCoords(e);
      if (!coords) return;
      const { startX, startY, isLocked, startHeight, initialScrollTop } = gestureRef.current;
      const diffX = coords.clientX - startX;
      const diffY = coords.clientY - startY;

      if (!isLocked) {
        // If the browser has already claimed the event for scrolling, we can't lock it.
        // However, we should still try to detect if it's a horizontal swipe we want to capture.

        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        // Reduced deadzone (5 -> 3) for even faster response
        if (absX > 3 || absY > 3) {
          // Reduced threshold (1.2 -> 1.0) for easier horizontal swipe detection
          // 프리뷰 모드(collapsed)에서는 가로 스와이프 비활성화
          if (absX > absY && latestStateRef.current.calendarMode !== 'collapsed') {
            gestureRef.current.isLocked = 'horizontal';
            const target = e.target as HTMLElement;
            const isCalendarArea = calendarRef?.current?.contains(target) || containerRef.current?.contains(target); // Fallback to container

            // If explicitly strictly calendar page (no calendarRef provided but containerRef exists)
            // effectively treat container as calendar area for horizontal swipes.
            if (!isCalendarArea) return;
          } else if (absY > absX) {
            const isTouchingCalendar = calendarRef?.current?.contains(e.target as Node);

            // DISABLED: Pull-down to expand calendar from event list
            // Users reported this feature was interfering with normal scrolling
            // Only allow resize when directly touching the calendar area

            // Allow resize ONLY if touching calendar directly AND NOT in fullscreen mode
            const shouldResize = (isTouchingCalendar && latestStateRef.current.calendarMode !== 'fullscreen');

            if (shouldResize) {
              gestureRef.current.isLocked = 'vertical-resize';
              setIsDragging(true);
              setLiveCalendarHeight(startHeight);
            } else if (e instanceof MouseEvent) {
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
        if (e.cancelable && !(e.target as HTMLElement)?.closest('input[type="range"]')) e.preventDefault();
        if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
        swipeAnimationRef.current = requestAnimationFrame(() => setDragOffset(diffX));
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
      } else if (currentLock === 'vertical-scroll' && e instanceof MouseEvent) {
        if (e.cancelable) e.preventDefault();
        const eventList = eventListElementRef.current;
        if (eventList) eventList.scrollTop = initialScrollTop - diffY;
      }
    };

    const handleGestureEnd = (e: TouchEvent | MouseEvent) => {
      if (!gestureRef.current.isActive) return;

      const { isLocked, startX, startY } = gestureRef.current;
      const endCoords = getEndCoords(e);
      if (!endCoords) return;

      const diffX = endCoords.clientX - startX;
      const diffY = endCoords.clientY - startY;


      if (swipeAnimationRef.current) { cancelAnimationFrame(swipeAnimationRef.current); swipeAnimationRef.current = null; }



      if (isLocked === 'horizontal') {
        if (Math.abs(diffX) > MIN_SWIPE_DISTANCE) {
          const containerWidth = containerRef.current?.offsetWidth || window.innerWidth;
          const direction = diffX < 0 ? "next" : "prev";
          const targetOffset = diffX < 0 ? -containerWidth : containerWidth;
          setDragOffset(targetOffset);
          setIsAnimating(true);
          setTimeout(() => {
            onHorizontalSwipe(direction);
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

      if (e instanceof MouseEvent) {
        window.removeEventListener('mousemove', handleGestureMove);
        window.removeEventListener('mouseup', handleGestureEnd);
      }
      gestureRef.current.isLocked = null;
      gestureRef.current.isActive = false;
    };

    const options = { passive: false };
    container.addEventListener('touchstart', handleGestureStart, options);
    container.addEventListener('touchmove', handleGestureMove, options);
    container.addEventListener('touchend', handleGestureEnd, options);
    container.addEventListener('touchcancel', handleGestureEnd, options);
    container.addEventListener('mousedown', handleGestureStart, options);

    return () => {
      container.removeEventListener('touchstart', handleGestureStart);
      container.removeEventListener('touchmove', handleGestureMove);
      container.removeEventListener('touchend', handleGestureEnd);
      container.removeEventListener('touchcancel', handleGestureEnd);
      container.removeEventListener('mousedown', handleGestureStart);
      window.removeEventListener('mousemove', handleGestureMove);
      window.removeEventListener('mouseup', handleGestureEnd);
      if (swipeAnimationRef.current) cancelAnimationFrame(swipeAnimationRef.current);
    };
  }, [containerRef, calendarRef, calendarContentRef, eventListElementRef, calculateFullscreenHeight, onHorizontalSwipe, getTargetHeight]);

  return {
    calendarMode, setCalendarMode, isDragging, liveCalendarHeight, dragOffset, setDragOffset, isAnimating, setIsAnimating, getTargetHeight, calculateFullscreenHeight,
  };
}

