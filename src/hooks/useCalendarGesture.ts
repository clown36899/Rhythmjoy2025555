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

const EXPANDED_HEIGHT = 280;
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

  const swipeAnimationRef = useRef<number | null>(null);

  const latestStateRef = useRef({ isAnimating, calendarMode, isYearView });
  useEffect(() => {
    latestStateRef.current = { isAnimating, calendarMode, isYearView };
  }, [isAnimating, calendarMode, isYearView]);

  const calculateFullscreenHeight = useCallback(() => {
    if (typeof window === 'undefined') return 600;
    const mainNavButtons = document.querySelector<HTMLElement>('[data-id="main-nav-buttons"]');
    const mainNavButtonsHeight = mainNavButtons ? mainNavButtons.offsetHeight : FOOTER_HEIGHT;
    return window.innerHeight - headerHeight - mainNavButtonsHeight;
  }, [headerHeight]);

  const getTargetHeight = useCallback(() => {
    if (calendarMode === "collapsed") return 0;
    if (calendarMode === "fullscreen") return calculateFullscreenHeight();
    return EXPANDED_HEIGHT;
  }, [calendarMode, calculateFullscreenHeight]);

  const gestureRef = useRef<{
    startX: number; startY: number; startHeight: number;
    isLocked: 'horizontal' | 'vertical-resize' | 'vertical-scroll' | null;
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
      if (target.closest('button, a, input, select, .clickable, [role="button"]')) return;
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
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);
        if (absX > 10 || absY > 10) {
          if (absX > absY * 1.5) {
            gestureRef.current.isLocked = 'horizontal';
          } else if (absY > absX) {
            const isTouchingCalendar = calendarRef.current?.contains(e.target as Node);
            const isPullingDown = initialScrollTop <= 2 && diffY > 0;
            if (isTouchingCalendar || isPullingDown) {
              gestureRef.current.isLocked = 'vertical-resize';
              setIsDragging(true);
              setLiveCalendarHeight(startHeight);
            } else if (e instanceof MouseEvent) {
              gestureRef.current.isLocked = 'vertical-scroll';
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
        const newHeight = startHeight + diffY;
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
          const direction = diffX < 0 ? "next" : "prev";
          const targetOffset = diffX < 0 ? -window.innerWidth : window.innerWidth;
          setDragOffset(targetOffset);
          setIsAnimating(true);
          setTimeout(() => {
            onHorizontalSwipe(direction);
            setDragOffset(0);
            setIsAnimating(false);
          }, 200);
        } else {
          setDragOffset(0);
        }
      } else if (isLocked === 'vertical-resize') {
        const endHeight = liveCalendarHeight;
        const fullscreenH = calculateFullscreenHeight();
        let nextMode = latestStateRef.current.calendarMode;

        if (diffY > 50) nextMode = endHeight < EXPANDED_HEIGHT ? 'expanded' : 'fullscreen';
        else if (diffY < -50) nextMode = endHeight > EXPANDED_HEIGHT ? 'expanded' : 'collapsed';
        else {
          const dists = {
            collapsed: Math.abs(endHeight - 0),
            expanded: Math.abs(endHeight - EXPANDED_HEIGHT),
            fullscreen: Math.abs(endHeight - fullscreenH),
          };
          nextMode = (Object.keys(dists) as (keyof typeof dists)[]).reduce((a, b) => dists[a] < dists[b] ? a : b);
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

