import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCalendarGestureProps {
  headerHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  calendarRef: React.RefObject<HTMLDivElement>;
  calendarContentRef: React.RefObject<HTMLDivElement>;
  eventListElementRef: React.RefObject<HTMLDivElement>;
  onHorizontalSwipe: (direction: 'next' | 'prev') => void;
  isYearView: boolean;
}

const EXPANDED_HEIGHT = 200;
const FOOTER_HEIGHT = 80;
const MIN_SWIPE_DISTANCE = 50;

export function useCalendarGesture({
  headerHeight,
  containerRef,
  calendarRef,
  calendarContentRef,
  eventListElementRef,
  onHorizontalSwipe,
  isYearView,
}: UseCalendarGestureProps) {
  const [calendarMode, setCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen'>('collapsed');
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
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    // Also listen to visualViewport for better mobile support
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  const calculateFullscreenHeight = useCallback(() => {
    if (typeof window === 'undefined') return 600;
    const bottomNav = document.querySelector<HTMLElement>('.shell-bottom-nav');
    const bottomNavHeight = bottomNav ? bottomNav.offsetHeight : FOOTER_HEIGHT;
    return viewportHeight - headerHeight - bottomNavHeight;
  }, [headerHeight, viewportHeight]);

  const getTargetHeight = useCallback(() => {
    if (calendarMode === "collapsed") return 0;
    if (calendarMode === "fullscreen") return calculateFullscreenHeight();
    return EXPANDED_HEIGHT;
  }, [calendarMode, calculateFullscreenHeight]);

  const gestureRef = useRef<{
    startX: number; startY: number; startHeight: number;
    isLocked: 'horizontal' | 'vertical-resize' | 'vertical-scroll' | 'native-scroll' | null;
    initialScrollTop: number;
  }>({ startX: 0, startY: 0, startHeight: 0, isLocked: null, initialScrollTop: 0 });

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
      if (latestStateRef.current.isAnimating || (e instanceof TouchEvent && e.touches.length > 1)) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, .clickable, [role="button"]')) {
        return;
      }
      if (latestStateRef.current.isYearView && calendarContentRef.current?.contains(target)) return;

      const coords = getCoords(e);
      if (!coords) return;

      const eventList = eventListElementRef.current;
      const scrollTop = eventList ? eventList.scrollTop : 0;
      const currentHeight = calendarContentRef.current ? calendarContentRef.current.getBoundingClientRect().height : getTargetHeight();

      gestureRef.current = {
        startX: coords.clientX, startY: coords.clientY, startHeight: currentHeight,
        isLocked: null, initialScrollTop: scrollTop
      };
      if (e instanceof MouseEvent) {
        window.addEventListener('mousemove', handleGestureMove, { passive: false });
        window.addEventListener('mouseup', handleGestureEnd, { passive: false });
      }
    };

    const handleGestureMove = (e: TouchEvent | MouseEvent) => {
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

        // Lower deadzone (10 -> 5) for faster response
        if (absX > 5 || absY > 5) {
          // Reverted threshold to 1.2 to avoid blocking vertical scroll
          if (absX > absY * 1.2) {
            gestureRef.current.isLocked = 'horizontal';
          } else if (absY > absX) {
            const isTouchingCalendar = calendarRef.current?.contains(e.target as Node);
            const isTouchingEventList = eventListElementRef.current?.contains(e.target as Node);

            // Check if user is at the TOP of the event list and pulling down BEYOND a threshold
            const eventList = eventListElementRef.current;
            const isAtTop = eventList
              ? (eventList.scrollTop <= 2)
              : false;

            // Require pulling down at least 30px beyond the top to trigger calendar resize
            // This allows normal scrolling to work first
            const PULL_DOWN_THRESHOLD = 30;
            const isPullingDownBeyondThreshold = isAtTop && diffY > PULL_DOWN_THRESHOLD;

            // Allow resize if:
            // 1. Touching calendar directly AND NOT in fullscreen mode (to allow scrolling), OR
            // 2. Touching event list AND at top AND pulled down beyond threshold
            const shouldResize = (isTouchingCalendar && latestStateRef.current.calendarMode !== 'fullscreen') || (isTouchingEventList && isPullingDownBeyondThreshold);

            if (shouldResize) {
              gestureRef.current.isLocked = 'vertical-resize';
              setIsDragging(true);
              setLiveCalendarHeight(startHeight);
            } else if (e instanceof MouseEvent) {
              gestureRef.current.isLocked = 'vertical-scroll';
            } else {
              // Explicitly lock as native-scroll to prevent re-evaluation
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
      const { isLocked, startX, startY } = gestureRef.current;
      const endCoords = getEndCoords(e);
      if (!endCoords) return;

      const diffX = endCoords.clientX - startX;
      const diffY = endCoords.clientY - startY;
      const distance = Math.sqrt(diffX * diffX + diffY * diffY);

      if (swipeAnimationRef.current) { cancelAnimationFrame(swipeAnimationRef.current); swipeAnimationRef.current = null; }

      if (!isLocked && distance < 10) {
        const target = e.target as HTMLElement;
        const eventCard = target.closest<HTMLElement>('[data-event-id]');
        if (eventCard) { e.preventDefault(); eventCard.click(); }
        const dateCell = target.closest<HTMLElement>('[data-calendar-date]');
        if (dateCell) { e.preventDefault(); dateCell.click(); }
      }

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
        const endHeight = liveCalendarHeight;
        let nextMode = latestStateRef.current.calendarMode;

        // Increased threshold for "pull more" behavior (50 -> 120)
        const DRAG_THRESHOLD = 90;

        if (diffY > DRAG_THRESHOLD) {
          // Dragging down - only allow collapsed -> expanded
          if (latestStateRef.current.calendarMode === 'collapsed') nextMode = 'expanded';
          // If already expanded or fullscreen, stay in current mode
        } else if (diffY < -DRAG_THRESHOLD) {
          // Dragging up - only allow expanded -> collapsed
          if (latestStateRef.current.calendarMode === 'expanded') nextMode = 'collapsed';
          // If already collapsed or fullscreen, stay in current mode
        } else {
          // Snap to nearest (only between collapsed and expanded)
          if (latestStateRef.current.calendarMode === 'fullscreen') {
            // If in fullscreen, don't change mode on small drags
            nextMode = 'fullscreen';
          } else {
            const dists = {
              collapsed: Math.abs(endHeight - 0),
              expanded: Math.abs(endHeight - EXPANDED_HEIGHT),
            };
            nextMode = (Object.keys(dists) as (keyof typeof dists)[]).reduce((a, b) => dists[a] < dists[b] ? a : b);
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

