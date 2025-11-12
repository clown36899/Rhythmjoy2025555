import { useEffect, useRef, type RefObject } from "react";

type CalendarMode = "collapsed" | "expanded" | "fullscreen";

interface UseUnifiedGestureControllerProps {
  containerRef: RefObject<HTMLElement>;
  eventListRef: RefObject<HTMLElement>;
  calendarContentRef: RefObject<HTMLElement>;
  headerHeight: number;
  calendarMode: CalendarMode;
  setCalendarMode: (mode: CalendarMode) => void;
  isScrollExpandingRef: React.MutableRefObject<boolean>;
  onHeightChange?: (height: number) => void; // 실시간 높이 콜백
  onDraggingChange?: (isDragging: boolean) => void; // 드래그 상태 콜백
}

export function useUnifiedGestureController({
  containerRef,
  eventListRef,
  calendarContentRef,
  headerHeight,
  calendarMode,
  setCalendarMode,
  onHeightChange,
  onDraggingChange,
}: UseUnifiedGestureControllerProps) {
  // 🎯 Callback refs - 매번 재등록하지 않고 최신 콜백 유지
  const onHeightChangeRef = useRef(onHeightChange);
  const onDraggingChangeRef = useRef(onDraggingChange);

  // 콜백 업데이트
  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
    onDraggingChangeRef.current = onDraggingChange;
  });

  useEffect(() => {
    const containerElement = containerRef.current;
    const eventListElement = eventListRef.current;
    const calendarElement = calendarContentRef.current;

    if (!containerElement || !eventListElement || !calendarElement) {
      return;
    }

    // 제스처 상태
    let isDragging = false;
    let isPending = false; // pending 상태 추가
    let startY = 0;
    let startX = 0;
    let startHeight = 0;
    let currentHeight = 0;
    let velocityHistory: Array<{ y: number; time: number }> = [];
    let rafId: number | null = null;

    // 높이 → 모드 변환
    const heightToMode = (height: number): CalendarMode => {
      if (height < 100) return "collapsed"; //최상단
      if (height < 400) return "expanded";
      return "fullscreen";
    };

    // 모드 → 높이 변환
    const modeToHeight = (mode: CalendarMode): number => {
      if (mode === "collapsed") return 0;
      if (mode === "expanded") return 250;
      return window.innerHeight - 150;
    };

    // RAF로 실시간 높이 업데이트
    const updateCalendarHeight = (height: number) => {
      const clampedHeight = Math.max(
        0,
        Math.min(height, window.innerHeight - 150),
      );
      calendarElement.style.height = `${clampedHeight}px`;
      currentHeight = clampedHeight;
      // 🎯 실시간 높이를 React state로 전달 (ref 사용)
      if (onHeightChangeRef.current) {
        onHeightChangeRef.current(clampedHeight);
      }
    };

    // Velocity 계산
    const calculateVelocity = (): number => {
      if (velocityHistory.length < 2) return 0;

      const first = velocityHistory[0];
      const last = velocityHistory[velocityHistory.length - 1];
      const distance = last.y - first.y;
      const time = last.time - first.time;

      if (time === 0 || time < 30) return 0;

      return distance / time; // px/ms
    };

    // 스냅 수행 (손 뗄 때만!)
    const performSnap = () => {
      const velocity = calculateVelocity();

      // 💥 중요: 최종 스냅은 이 currentMode를 기준으로 함
      const currentMode = heightToMode(currentHeight);
      let targetMode: CalendarMode;

      // 🎯 [플링 전용] Collapsed에서 Fullscreen으로 건너뛸 최소 드래그 거리 (300px로 조정)
      const FLING_SKIP_DISTANCE = 300;
      // 드래그 시작 높이(startHeight)와 현재 높이(currentHeight)의 차이가 총 드래그 거리(deltaY)입니다.
      const deltaY = currentHeight - startHeight;

      // Fling 감지 - 속도 > 0.4
      if (Math.abs(velocity) > 0.4) {
        if (velocity > 0) {
          // 빠르게 아래로 (확장)

          // 1. Collapsed 상태에서 Fling (Touched Started as Collapsed)
          if (calendarMode === "collapsed") {
            // 💥 TouchStart 시점의 모드(prop) 사용
            // 💥 거리 우선 판단: 긴 거리(300px)를 만족하면 Expanded 건너뛰기
            if (deltaY > FLING_SKIP_DISTANCE) {
              targetMode = "fullscreen"; // ⚡️ Fullscreen으로 바로 건너뛰기
            } else {
              targetMode = "expanded"; // Expanded까지만 허용
            }
          }
          // 2. Expanded 상태에서 Fling (Touched Started as Expanded)
          else if (calendarMode === "expanded") {
            // 💥 TouchStart 시점의 모드(prop) 사용
            targetMode = "fullscreen";
          }
          // 3. Fullscreen 상태 (Touched Started as Fullscreen)
          else {
            targetMode = "fullscreen";
          }
        } else {
          // 빠르게 위로 (축소) - 거리 조건 필요 없음
          if (currentMode === "fullscreen") targetMode = "expanded";
          else if (currentMode === "expanded") targetMode = "collapsed";
          else targetMode = "collapsed";
        }
      } else {
        // 느린 드래그: 최종 높이(currentHeight)를 기준으로 가까운 곳으로 스냅
        targetMode = heightToMode(currentHeight);
      }

      const targetHeight = modeToHeight(targetMode);

      // 애니메이션으로 스냅 (부드러운 easing)
      calendarElement.style.transition =
        "height 0.35s cubic-bezier(0.25, 0.1, 0.25, 1.0)";
      updateCalendarHeight(targetHeight);
      setCalendarMode(targetMode);

      setTimeout(() => {
        calendarElement.style.transition = "";
      }, 350);
    };

    // 🎯 TouchStart
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const scrollTop = eventListElement.scrollTop;
      const calendarHeight = modeToHeight(calendarMode);
      const calendarBottomY = headerHeight + calendarHeight;
      const isTouchingCalendar = touch.clientY < calendarBottomY;

      // 조건 1: 달력 위를 터치 → 달력 컨트롤 (최우선)
      if (isTouchingCalendar && calendarMode !== "collapsed") {
        isDragging = true;
        startY = touch.clientY;
        startX = touch.clientX;
        startHeight = calendarHeight;
        currentHeight = calendarHeight;
        velocityHistory = [{ y: touch.clientY, time: Date.now() }];

        // 스크롤 차단
        eventListElement.style.overflow = "hidden";
        e.preventDefault();

        // 🎯 드래그 시작 알림 (ref 사용)
        if (onDraggingChangeRef.current) {
          onDraggingChangeRef.current(true);
        }

        return;
      }

      // 조건 2: 리스트 최상단 → pending 상태 (calendarMode 관계없이!)
      if (scrollTop === 0) {
        isPending = true;
        startY = touch.clientY;
        startX = touch.clientX;
        startHeight = modeToHeight(calendarMode);
        currentHeight = startHeight;
        velocityHistory = [{ y: touch.clientY, time: Date.now() }];

        return;
      }
    };

    // 🎯 TouchMove
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;

      // Pending 상태: 방향 확인
      // Pending 상태: 방향 확인
      if (isPending) {
        if (Math.abs(deltaY) < 5 && Math.abs(deltaX) < 5) return; // 미세 움직임 무시

        const absDeltaY = Math.abs(deltaY);
        const absDeltaX = Math.abs(deltaX);

        if (absDeltaX > absDeltaY * 1.5) {
          // 수평 이동이 압도적으로 우세하면
          isPending = false;
          return; // 훅의 수직 드래그 로직을 건너뛰고, 상위 컴포넌트의 수평 로직을 실행하도록 허용
        }

        if (deltaY > 0) {
          // 수직 아래로 우세 (달력 확장)
          isPending = false;
          isDragging = true;
          eventListElement.style.overflow = "hidden";
          // 🎯 드래그 시작 알림 (ref 사용)
          if (onDraggingChangeRef.current) {
            onDraggingChangeRef.current(true);
          }
        } else if (deltaY < -5) {
          // 수직 위로 우세 (스크롤)
          isPending = false;
          return;
        } else {
          return; // 아직 방향 불명확 → 대기
        }
      }

      if (!isDragging) return;

      // 달력에서 드래그 → 위/아래 모두 허용
      e.preventDefault();

      // Velocity 샘플링
      velocityHistory.push({ y: touch.clientY, time: Date.now() });
      if (velocityHistory.length > 5) velocityHistory.shift();

      // 실시간 높이 업데이트 (스냅 없음!)
      const newHeight = startHeight + deltaY;

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateCalendarHeight(newHeight);
      });
    };

    // 🎯 TouchEnd
    const handleTouchEnd = () => {
      if (isPending) {
        // Pending 상태에서 손 떼면 → 취소
        isPending = false;
        return;
      }

      if (!isDragging) return;

      isDragging = false;

      // 스크롤 복원 (중요!)
      eventListElement.style.overflow = "";

      // 🎯 드래그 종료 알림 (ref 사용)
      if (onDraggingChangeRef.current) {
        onDraggingChangeRef.current(false);
      }

      // 여기서만 스냅!
      performSnap();

      velocityHistory = [];
    };

    // 🎯 TouchCancel
    const handleTouchCancel = () => {
      isPending = false;
      isDragging = false;

      // 스크롤 복원 (중요!)
      eventListElement.style.overflow = "";

      // 🎯 드래그 취소 알림 (ref 사용)
      if (onDraggingChangeRef.current) {
        onDraggingChangeRef.current(false);
      }

      velocityHistory = [];
    };

    // 이벤트 리스너 등록 (passive: false!)
    containerElement.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    containerElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    containerElement.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    });
    containerElement.addEventListener("touchcancel", handleTouchCancel, {
      passive: false,
    });

    // Cleanup
    return () => {
      containerElement.removeEventListener("touchstart", handleTouchStart);
      containerElement.removeEventListener("touchmove", handleTouchMove);
      containerElement.removeEventListener("touchend", handleTouchEnd);
      containerElement.removeEventListener("touchcancel", handleTouchCancel);

      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    containerRef,
    eventListRef,
    calendarContentRef,
    headerHeight,
    calendarMode,
    setCalendarMode,
  ]);
}
