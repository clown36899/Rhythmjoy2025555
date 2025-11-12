import { useEffect, type RefObject } from "react";

type CalendarMode = "collapsed" | "expanded" | "fullscreen";

interface UseUnifiedGestureControllerProps {
  containerRef: RefObject<HTMLDivElement>;
  eventListRef: RefObject<HTMLDivElement>;
  calendarContentRef: RefObject<HTMLDivElement>;
  headerHeight: number;
  calendarMode: CalendarMode;
  setCalendarMode: (mode: CalendarMode) => void;
  isScrollExpandingRef: React.MutableRefObject<boolean>;
  // 월 변경 콜백
  onMonthChange: (direction: 'prev' | 'next') => void;
  // Buffer Rotation 콜백 (optional)
  onSwipeStart?: (direction: 'prev' | 'next') => void;
  onSwipeComplete?: (direction: 'prev' | 'next') => void;
  // Double-Buffered Carousel: 영구 컨테이너 ref
  eventListMonthRefs: {
    prev: RefObject<HTMLDivElement>;
    current: RefObject<HTMLDivElement>;
    next: RefObject<HTMLDivElement>;
  };
}

export function useUnifiedGestureController({
  containerRef,
  eventListRef,
  calendarContentRef,
  headerHeight,
  calendarMode,
  setCalendarMode,
  onMonthChange,
  onSwipeStart,
  onSwipeComplete,
  eventListMonthRefs,
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
    
    // Buffer Rotation: 스와이프 방향 및 콜백 상태
    let activeSwipeDirection: 'prev' | 'next' | null = null;
    let hasFiredSwipeStart = false;

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
          
          // Buffer Rotation: 방향 계산 및 onSwipeStart 호출
          if (!hasFiredSwipeStart && Math.abs(deltaX) > 0) {
            activeSwipeDirection = deltaX > 0 ? 'prev' : 'next';
            hasFiredSwipeStart = true;
            console.log(`🚀 Buffer Rotation: onSwipeStart(${activeSwipeDirection})`);
            onSwipeStart?.(activeSwipeDirection);
          }
          
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
        // 시각적 피드백: ref로 각 월 div에 직접 접근해서 개별 transform
        requestAnimationFrame(() => {
          const prev = eventListMonthRefs.prev.current;
          const current = eventListMonthRefs.current.current;
          const next = eventListMonthRefs.next.current;
          
          // 각 월을 손가락 따라 이동 (React 개입 없이 순수 DOM 조작)
          if (prev) {
            prev.style.transform = `translateX(${deltaX}px)`;
            prev.style.transition = 'none';
          }
          if (current) {
            current.style.transform = `translateX(${deltaX}px)`;
            current.style.transition = 'none';
          }
          if (next) {
            next.style.transform = `translateX(${deltaX}px)`;
            next.style.transition = 'none';
          }
        });
        console.log(`↔️ 수평 드래그 (RAF): ${deltaX.toFixed(0)}px`);
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
        
        // 빠른 스와이프 감지 (velocity 기반)
        let velocityX = 0;
        if (velocityHistory.length >= 2) {
          const first = velocityHistory[0];
          const last = velocityHistory[velocityHistory.length - 1];
          const timeDiff = last.time - first.time;
          if (timeDiff > 0) {
            velocityX = (touch.clientX - startX) / timeDiff;
          }
        }
        const isQuickSwipe = Math.abs(velocityX) > 0.3; // 빠른 스와이프
        
        if (Math.abs(deltaX) > threshold || isQuickSwipe) {
          const direction = deltaX > 0 ? 'prev' : 'next';
          console.log(`🎯 Double-Buffered 슬라이드: ${direction}, deltaX: ${deltaX.toFixed(0)}px, velocity: ${velocityX.toFixed(2)}`);
          
          // ref로 직접 월 컨테이너 접근
          const prev = eventListMonthRefs.prev.current;
          const current = eventListMonthRefs.current.current;
          const next = eventListMonthRefs.next.current;
          
          if (!prev || !current || !next) {
            console.warn('⚠️ 월 ref를 찾을 수 없음');
            isDragging = false;
            gestureDirection = null;
            eventListElement.style.overflow = "";
            return;
          }
          
          const handleTransitionEnd = (event: TransitionEvent) => {
            // event.target === current 확인 (single-fire 보장)
            if (event.target !== current) {
              console.log('⏭️ transitionend 무시 (target !== current)');
              return;
            }
            
            console.log(`✅ 애니메이션 완료 → transform 리셋`);
            
            // 모든 월 transform 리셋 (transition 없이)
            prev.style.transition = 'none';
            current.style.transition = 'none';
            next.style.transition = 'none';
            prev.style.transform = 'translateX(0)';
            current.style.transform = 'translateX(0)';
            next.style.transform = 'translateX(0)';
            
            // Buffer Rotation: onSwipeComplete 호출 (rotateBuffers 실행)
            if (activeSwipeDirection) {
              console.log(`🏁 Buffer Rotation: onSwipeComplete(${activeSwipeDirection})`);
              onSwipeComplete?.(activeSwipeDirection);
            }
            
            // 월 변경 (React 리렌더링 → 비활성 버퍼만 업데이트)
            onMonthChange(direction);
            console.log(`🎉 월 변경: ${direction} (Double-Buffered)`);
            
            // Buffer Rotation flags 리셋
            activeSwipeDirection = null;
            hasFiredSwipeStart = false;
          };
          
          // transition 설정
          prev.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          current.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          next.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          
          // 현재 달(가운데)에 이벤트 등록
          current.addEventListener('transitionend', handleTransitionEnd, { once: true });
          
          // RAF로 한 프레임 대기 후 애니메이션 시작
          requestAnimationFrame(() => {
            if (direction === 'next') {
              // 왼쪽 스와이프 → 모든 월이 왼쪽으로
              prev.style.transform = 'translateX(-100%)';
              current.style.transform = 'translateX(-100%)';
              next.style.transform = 'translateX(-100%)';
              console.log(`🎬 왼쪽 스와이프: 모든 월 왼쪽으로 (RAF)`);
            } else {
              // 오른쪽 스와이프 → 모든 월이 오른쪽으로
              prev.style.transform = 'translateX(100%)';
              current.style.transform = 'translateX(100%)';
              next.style.transform = 'translateX(100%)';
              console.log(`🎬 오른쪽 스와이프: 모든 월 오른쪽으로 (RAF)`);
            }
          });
        } else {
          // threshold 미달 → 원위치 애니메이션
          console.log(`↩️ 스냅백: ${deltaX.toFixed(0)}px`);
          
          const prev = eventListMonthRefs.prev.current;
          const current = eventListMonthRefs.current.current;
          const next = eventListMonthRefs.next.current;
          
          if (prev) prev.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          if (current) current.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          if (next) next.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          
          requestAnimationFrame(() => {
            if (prev) prev.style.transform = 'translateX(0)';
            if (current) current.style.transform = 'translateX(0)';
            if (next) next.style.transform = 'translateX(0)';
          });
          
          // Buffer Rotation flags 리셋 (스냅백 시)
          activeSwipeDirection = null;
          hasFiredSwipeStart = false;
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
      gestureDirection = null;

      // 스크롤 복원 (중요!)
      eventListElement.style.overflow = "";

      // Buffer Rotation flags 리셋
      activeSwipeDirection = null;
      hasFiredSwipeStart = false;

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
    eventListMonthRefs,
  ]);
}
