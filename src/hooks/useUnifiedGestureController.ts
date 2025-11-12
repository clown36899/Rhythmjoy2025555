import { useEffect, type RefObject } from "react";

type CalendarMode = "collapsed" | "expanded" | "fullscreen";

interface UseUnifiedGestureControllerProps {
  containerRef: RefObject<HTMLElement>;
  eventListRef: RefObject<HTMLElement>;
  calendarContentRef: RefObject<HTMLElement>;
  headerHeight: number;
  calendarMode: CalendarMode;
  setCalendarMode: (mode: CalendarMode) => void;
  isScrollExpandingRef: React.MutableRefObject<boolean>;
}

export function useUnifiedGestureController({
  containerRef,
  eventListRef,
  calendarContentRef,
  headerHeight,
  calendarMode,
  setCalendarMode,
  isScrollExpandingRef,
}: UseUnifiedGestureControllerProps) {
  useEffect(() => {
    const containerElement = containerRef.current;
    const eventListElement = eventListRef.current;
    const calendarElement = calendarContentRef.current;

    if (!containerElement || !eventListElement || !calendarElement) {
      console.log("❌ 필수 요소 없음");
      return;
    }

    console.log("✅ Touch Events 컨트롤러 활성화!");

    // 제스처 상태
    let isDragging = false;
    let isPending = false; // pending 상태 추가
    let startY = 0;
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
      console.log(
        `🧲 스냅 시작: 현재=${currentHeight}px, 속도=${velocity.toFixed(3)}px/ms`,
      );

      const currentMode = heightToMode(currentHeight);
      let targetMode: CalendarMode;

      // 🎯 [플링 전용] Collapsed에서 Fullscreen으로 건너뛸 최소 드래그 거리 (150px)
      const FLING_SKIP_DISTANCE = 300;
      // 드래그 시작 높이(startHeight)와 현재 높이(currentHeight)의 차이가 총 드래그 거리(deltaY)입니다.
      const deltaY = currentHeight - startHeight;

      // Fling 감지 - 속도 > 0.4
      if (Math.abs(velocity) > 0.4) {
        if (velocity > 0) {
          // 빠르게 아래로 (확장)

          // 1. Collapsed 상태에서 Fling (Collapsed -> Expanded 또는 Fullscreen)
          if (currentMode === "collapsed") {
            // 💥 [플링 시 거리 조정]: Fling 속도 + 긴 거리(150px)를 만족하면 Expanded 건너뛰기
            if (deltaY > FLING_SKIP_DISTANCE) {
              targetMode = "fullscreen"; // ⚡️ Fullscreen으로 바로 건너뛰기
              console.log(
                "⚡️ 초고속 플링: collapsed → fullscreen (거리 만족)",
              );
            } else {
              targetMode = "expanded"; // Expanded까지만 허용 (기본 동작)
            }
          }
          // 2. Expanded 상태에서 Fling (Expanded -> Fullscreen)
          else if (currentMode === "expanded") {
            targetMode = "fullscreen";
          }
          // 3. Fullscreen 상태 (Fullscreen 유지)
          else {
            targetMode = "fullscreen";
          }
        } else {
          // 빠르게 위로 (축소) - 거리 조건 필요 없음
          if (currentMode === "fullscreen") targetMode = "expanded";
          else if (currentMode === "expanded") targetMode = "collapsed";
          else targetMode = "collapsed";
        }
        console.log(`⚡ 플링: ${currentMode} → ${targetMode}`);
      } else {
        // 느린 드래그 → 현재 높이 기준 가까운 곳 (heightToMode 사용)
        targetMode = heightToMode(currentHeight);
        console.log(`🐢 느린 드래그: ${targetMode}`);
      }

      const targetHeight = modeToHeight(targetMode);

      // 애니메이션으로 스냅
      calendarElement.style.transition =
        "height 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)";
      updateCalendarHeight(targetHeight);
      setCalendarMode(targetMode);

      setTimeout(() => {
        calendarElement.style.transition = "";
      }, 300);
    };

    // 🎯 TouchStart
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const scrollTop = eventListElement.scrollTop;
      const calendarHeight = modeToHeight(calendarMode);
      const calendarBottomY = headerHeight + calendarHeight;
      const isTouchingCalendar = touch.clientY < calendarBottomY;

      console.log(
        `🔵 TouchStart: y=${touch.clientY}, scrollTop=${scrollTop}, calendarMode=${calendarMode}, isTouchingCalendar=${isTouchingCalendar}`,
      );

      // 조건 1: 달력 위를 터치 → 달력 컨트롤 (최우선)
      if (isTouchingCalendar && calendarMode !== "collapsed") {
        isDragging = true;
        startY = touch.clientY;
        startHeight = calendarHeight;
        currentHeight = calendarHeight;
        velocityHistory = [{ y: touch.clientY, time: Date.now() }];

        // 스크롤 차단
        eventListElement.style.overflow = "hidden";
        e.preventDefault();

        console.log("📅 달력 위에서 드래그 시작!");
        return;
      }

      // 조건 2: 리스트 최상단 → pending 상태 (calendarMode 관계없이!)
      if (scrollTop === 0) {
        isPending = true;
        startY = touch.clientY;
        startHeight = modeToHeight(calendarMode);
        currentHeight = startHeight;
        velocityHistory = [{ y: touch.clientY, time: Date.now() }];

        console.log(
          `⏳ pending 상태 (현재모드: ${calendarMode}, 높이: ${startHeight}px)`,
        );
        return;
      }
    };

    // 🎯 TouchMove
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;

      // Pending 상태: 방향 확인
      if (isPending) {
        if (deltaY > 0) {
          // 아래로 드래그 → 달력 제스처 시작!
          isPending = false;
          isDragging = true;
          eventListElement.style.overflow = "hidden";
          console.log("✅ 달력 드래그 시작! (아래로)");
        } else if (deltaY < -5) {
          // 위로 드래그 → 스크롤 허용
          isPending = false;
          console.log("🔓 스크롤 허용 (위로)");
          return;
        } else {
          // 아직 방향 불명확 → 대기
          return;
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
        console.log(
          `📏 실시간: ${newHeight.toFixed(0)}px (deltaY: ${deltaY.toFixed(0)})`,
        );
      });
    };

    // 🎯 TouchEnd
    const handleTouchEnd = (e: TouchEvent) => {
      if (isPending) {
        // Pending 상태에서 손 떼면 → 취소
        isPending = false;
        console.log("⏹️ Pending 취소");
        return;
      }

      if (!isDragging) return;

      console.log("🔴 TouchEnd - 손 뗌!");

      isDragging = false;

      // 스크롤 복원 (중요!)
      eventListElement.style.overflow = "";

      // 여기서만 스냅!
      performSnap();

      velocityHistory = [];
    };

    // 🎯 TouchCancel
    const handleTouchCancel = (e: TouchEvent) => {
      console.log("⚠️ TouchCancel");

      isPending = false;
      isDragging = false;

      // 스크롤 복원 (중요!)
      eventListElement.style.overflow = "";

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
