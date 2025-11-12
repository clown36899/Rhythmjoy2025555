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
  // 월 변경 콜백
  onMonthChange: (direction: 'prev' | 'next') => void;
  // 수평 스와이프용 슬라이더 ref (DOM 직접 조작)
  calendarSliderRef: RefObject<HTMLElement>;
  eventListSliderRef: RefObject<HTMLElement>;
}

export function useUnifiedGestureController({
  containerRef,
  eventListRef,
  calendarContentRef,
  headerHeight,
  calendarMode,
  setCalendarMode,
  onMonthChange,
  calendarSliderRef,
  eventListSliderRef,
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
    let gestureDirection: 'vertical' | 'horizontal' | null = null; // 제스처 방향
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
              console.log(
                "⚡️ 초고속 플링: collapsed(시작) → fullscreen (거리 만족)",
              );
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

        console.log(`⚡ 플링: ${calendarMode} → ${targetMode}`);
      } else {
        // 느린 드래그: 최종 높이(currentHeight)를 기준으로 가까운 곳으로 스냅
        targetMode = heightToMode(currentHeight);
        console.log(`🐢 느린 드래그: ${targetMode}`);
      }

      const targetHeight = modeToHeight(targetMode);
      console.log(`🎯 타겟: ${targetMode} (${targetHeight}px)`);

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
        startX = touch.clientX;
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
        gestureDirection = null; // 방향 미정
        startY = touch.clientY;
        startX = touch.clientX;
        startHeight = modeToHeight(calendarMode);
        currentHeight = startHeight;
        velocityHistory = [{ y: touch.clientY, time: Date.now() }];

        console.log(`⏳ pending 상태 (방향 감지 대기)`);
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
          // 수평 스와이프 시작!
          isPending = false;
          gestureDirection = 'horizontal';
          isDragging = true;
          console.log("↔️ 수평 스와이프 시작 (월 변경)");
          e.preventDefault();
          return;
        }

        if (deltaY > 0) {
          // 수직 아래로 우세 (달력 확장)
          isPending = false;
          isDragging = true;
          eventListElement.style.overflow = "hidden";
          console.log("✅ 달력 드래그 시작! (아래로)");
        } else if (deltaY < -5) {
          // 수직 위로 우세 (스크롤)
          isPending = false;
          console.log("🔓 스크롤 허용 (위로)");
          return;
        } else {
          return; // 아직 방향 불명확 → 대기
        }
      }

      if (!isDragging) return;

      e.preventDefault();

      // 수평 스와이프 (월 변경)
      if (gestureDirection === 'horizontal') {
        // 시각적 피드백: DOM 직접 조작 (state 없이 ref 사용)
        requestAnimationFrame(() => {
          const calendarSlider = calendarSliderRef.current;
          const eventListSlider = eventListSliderRef.current;
          
          if (calendarSlider) {
            calendarSlider.style.transform = `translateX(calc(-100% + ${deltaX}px))`;
            calendarSlider.style.transition = 'none';
          }
          
          if (eventListSlider) {
            eventListSlider.style.transform = `translateX(calc(-100% + ${deltaX}px))`;
            eventListSlider.style.transition = 'none';
          }
        });
        console.log(`↔️ 수평 드래그: ${deltaX.toFixed(0)}px`);
        return;
      }

      // 수직 드래그 (달력 높이 조절)
      velocityHistory.push({ y: touch.clientY, time: Date.now() });
      if (velocityHistory.length > 5) velocityHistory.shift();

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
        isPending = false;
        console.log("⏹️ Pending 취소");
        return;
      }

      if (!isDragging) return;

      console.log("🔴 TouchEnd - 손 뗌!");

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;

      // 수평 스와이프 완료 → 월 변경
      if (gestureDirection === 'horizontal') {
        const threshold = 50; // 50px 이상 스와이프
        const calendarSlider = calendarSliderRef.current;
        const eventListSlider = eventListSliderRef.current;
        
        if (Math.abs(deltaX) > threshold) {
          const direction = deltaX > 0 ? 'prev' : 'next';
          console.log(`🎯 슬라이드 방식 월 변경: ${direction}, deltaX: ${deltaX.toFixed(0)}px`);
          
          // ⭐ 핵심: 애니메이션 시작 **전에** 월 변경!
          // 새 돔이 -100%에 배치됨 (예: 11월 → 12월이면 [11월, 12월, 1월])
          onMonthChange(direction);
          
          // 월 변경 직후 애니메이션 (현재 위치 → -100%)
          // React 리렌더링이 완료될 때까지 한 프레임 대기
          requestAnimationFrame(() => {
            // transition 설정
            if (calendarSlider) {
              calendarSlider.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
            }
            if (eventListSlider) {
              eventListSlider.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
            }
            
            // 한 프레임 더 대기 후 -100%로 애니메이션
            requestAnimationFrame(() => {
              if (calendarSlider) calendarSlider.style.transform = 'translateX(-100%)';
              if (eventListSlider) eventListSlider.style.transform = 'translateX(-100%)';
              console.log(`🎬 슬라이드 애니메이션: 현재 위치 → -100%`);
            });
          });
        } else {
          // threshold 미달 → 원위치 애니메이션
          console.log(`↩️ 스냅백 (threshold 미달): ${deltaX.toFixed(0)}px`);
          
          if (calendarSlider) {
            calendarSlider.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          }
          if (eventListSlider) {
            eventListSlider.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          }
          
          requestAnimationFrame(() => {
            if (calendarSlider) calendarSlider.style.transform = 'translateX(-100%)';
            if (eventListSlider) eventListSlider.style.transform = 'translateX(-100%)';
          });
        }
        
        isDragging = false;
        gestureDirection = null;
        eventListElement.style.overflow = "";
        return;
      }

      // 수직 드래그 완료 → 스냅
      isDragging = false;
      gestureDirection = null;
      eventListElement.style.overflow = "";
      performSnap();
      velocityHistory = [];
    };

    // 🎯 TouchCancel
    const handleTouchCancel = () => {
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
    onMonthChange,
    calendarSliderRef,
    eventListSliderRef,
  ]);
}
