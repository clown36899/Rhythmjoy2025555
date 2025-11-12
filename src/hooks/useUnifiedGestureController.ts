import { useEffect, type RefObject } from 'react';

type GestureType = 'none' | 'scroll' | 'calendar-drag';
type CalendarMode = 'collapsed' | 'expanded' | 'fullscreen';

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
    
    if (!containerElement || !eventListElement) {
      console.log("❌ useUnifiedGestureController: 컨테이너 요소 없음");
      return;
    }

    console.log("✅ 통합 Pointer Events 컨트롤러 활성화!", { 
      containerElement: containerElement.tagName,
      eventListElement: eventListElement.tagName,
      supportsPointer: 'PointerEvent' in window,
      supportsTouch: 'TouchEvent' in window
    });

    // 🎯 제스처 상태 머신
    let activeGesture: GestureType = 'none';
    let gestureStartY = 0;
    let gestureStartX = 0;
    let gestureStartHeight = 0;
    let gesturePointerId: number | null = null;
    let isHorizontalGesture = false;
    
    // 🚀 통합 velocity history
    const gestureHistory: Array<{ y: number; time: number }> = [];
    
    // Helper: Velocity 계산
    const calculateVelocity = (): number => {
      if (gestureHistory.length < 2) return 0;
      
      const first = gestureHistory[0];
      const last = gestureHistory[gestureHistory.length - 1];
      const distance = last.y - first.y;
      const time = last.time - first.time;
      
      if (time === 0 || time < 30) return 0;
      
      const velocity = distance / time;
      console.log(`✅ 제스처 속도: ${distance.toFixed(0)}px / ${time}ms = ${velocity.toFixed(3)} px/ms (${gestureHistory.length}개)`);
      return velocity;
    };
    
    // Helper: Calendar 스냅 수행
    const performCalendarSnap = (velocity: number, currentHeight: number, deltaY: number) => {
      const fullscreenHeight = window.innerHeight - 150;
      const FLING_VELOCITY_THRESHOLD = 0.15; // Android TV 최적화 (0.25 → 0.15)
      const FLING_DISTANCE_THRESHOLD = 5; // 짧은 거리도 반응 (10 → 5)
      
      let finalHeight = 0;
      let targetMode: CalendarMode = 'collapsed';
      
      // Fling 또는 느린 드래그 기반 스냅 결정
      if (calendarMode === 'collapsed') {
        const isFlickDown = deltaY > FLING_DISTANCE_THRESHOLD && velocity > FLING_VELOCITY_THRESHOLD;
        
        if (isFlickDown) {
          finalHeight = 250;
          targetMode = 'expanded';
          console.log("⚡️ Fling: collapsed → expanded", velocity.toFixed(3));
        } else if (deltaY > 5) {
          // 아래로 5px 이상 당겼으면 무조건 확장 (사용자 요구: "이동거리가 나와야")
          finalHeight = 250;
          targetMode = 'expanded';
          console.log("✅ 거리 기반 확장:", deltaY.toFixed(1), "px");
        } else {
          finalHeight = 0;
          targetMode = 'collapsed';
          isScrollExpandingRef.current = false;
        }
      } else if (calendarMode === 'expanded') {
        const isFlickUp = deltaY < -FLING_DISTANCE_THRESHOLD && velocity < -FLING_VELOCITY_THRESHOLD;
        const isFlickDown = deltaY > FLING_DISTANCE_THRESHOLD && velocity > FLING_VELOCITY_THRESHOLD;
        
        if (isFlickUp) {
          finalHeight = 0;
          targetMode = 'collapsed';
          console.log("⚡️ Fling: expanded → collapsed", velocity.toFixed(3));
        } else if (isFlickDown) {
          finalHeight = fullscreenHeight;
          targetMode = 'fullscreen';
          console.log("⚡️ Fling: expanded → fullscreen", velocity.toFixed(3));
        } else if (velocity > 0) {
          if (currentHeight > 280) {
            finalHeight = fullscreenHeight;
            targetMode = 'fullscreen';
          } else {
            finalHeight = 250;
            targetMode = 'expanded';
          }
        } else {
          if (currentHeight < 220) {
            finalHeight = 0;
            targetMode = 'collapsed';
          } else {
            finalHeight = 250;
            targetMode = 'expanded';
          }
        }
      } else {
        // fullscreen
        const isFlickUp = Math.abs(deltaY) > 10 && velocity < -FLING_VELOCITY_THRESHOLD;
        
        if (isFlickUp) {
          finalHeight = 250;
          targetMode = 'expanded';
          console.log("⚡️ Fling: fullscreen → expanded", velocity.toFixed(3));
        } else if (currentHeight < fullscreenHeight - 60) {
          finalHeight = 250;
          targetMode = 'expanded';
        } else {
          finalHeight = fullscreenHeight;
          targetMode = 'fullscreen';
        }
      }
      
      console.log("🧲 최종 스냅:", finalHeight, targetMode);
      
      // 스냅 애니메이션
      if (calendarContentRef.current) {
        calendarContentRef.current.style.setProperty('height', `${finalHeight}px`);
        calendarContentRef.current.style.setProperty('transition', 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)');
        calendarContentRef.current.style.setProperty('transform', 'scaleY(1)');
        calendarContentRef.current.style.setProperty('--live-calendar-height', `${finalHeight}px`);
      }
      
      if (targetMode !== calendarMode) {
        setCalendarMode(targetMode);
      }
    };
    
    // 🎯 PointerDown: 제스처 분류
    const handlePointerDown = (e: PointerEvent) => {
      console.log("🔵 PointerDown 발생!", { pointerType: e.pointerType, clientY: e.clientY });
      
      const scrollTop = eventListElement.scrollTop;
      const isAtTop = scrollTop <= 0;
      
      console.log("🔍 ScrollTop 확인:", { scrollTop, isAtTop });
      
      if (!isAtTop) {
        // 최상단 아니면 일반 스크롤
        activeGesture = 'scroll';
        console.log("❌ 스크롤 모드 (최상단 아님)");
        return;
      }
      
      // ✅ 최상단이면 무조건 calendar-drag로 시작 (이벤트 리스트에서 pull down도 처리)
      activeGesture = 'calendar-drag';
      // setPointerCapture 제거 - PointerUp 이벤트가 발생하지 않는 문제 해결
      // (e.target as HTMLElement).setPointerCapture(e.pointerId);
      gesturePointerId = e.pointerId;
      
      const currentCalendarHeight = calendarContentRef.current?.offsetHeight || 0;
      const calendarBottomY = headerHeight + currentCalendarHeight;
      
      gestureStartY = e.clientY;
      gestureStartX = e.clientX;
      gestureStartHeight = currentCalendarHeight;
      isHorizontalGesture = false;
      
      gestureHistory.length = 0;
      gestureHistory.push({ y: e.clientY, time: Date.now() });
      
      // 브라우저 기본 동작 방지 (스크롤 차단) - scrollTop === 0일 때만
      e.preventDefault();
      
      console.log("🎯 제스처 시작: calendar-drag (isAtTop)", { clientY: e.clientY, calendarBottomY, currentCalendarHeight });
    };
    
    // 🎯 PointerMove: 제스처 타입에 따라 처리
    const handlePointerMove = (e: PointerEvent) => {
      console.log("🟢 PointerMove!", { activeGesture, clientY: e.clientY });
      
      if (activeGesture === 'none' || activeGesture === 'scroll') {
        console.log("❌ PointerMove 무시 (activeGesture:", activeGesture, ")");
        return;
      }
      
      const currentY = e.clientY;
      const currentX = e.clientX;
      const deltaY = currentY - gestureStartY;
      const deltaX = currentX - gestureStartX;
      
      // 수평/수직 감지
      if (!isHorizontalGesture && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
        isHorizontalGesture = Math.abs(deltaX) > Math.abs(deltaY);
      }
      
      if (isHorizontalGesture) {
        return;
      }
      
      gestureHistory.push({ y: currentY, time: Date.now() });
      
      // Calendar drag 처리
      if (activeGesture === 'calendar-drag') {
        // 브라우저 기본 동작 방지 (스크롤, 제스처 등)
        e.preventDefault();
        
        const fullscreenHeight = window.innerHeight - 150;
        const isPullingDown = deltaY > 0;
        
        if (isPullingDown && calendarMode !== 'fullscreen') {
          isScrollExpandingRef.current = true;
          
          let targetHeight = gestureStartHeight + deltaY * 1.2;
          const scale = Math.min(1, 0.6 + (targetHeight / 150) * 0.4);
          
          targetHeight = Math.max(0, Math.min(targetHeight, fullscreenHeight));
          
          if (calendarContentRef.current) {
            calendarContentRef.current.style.setProperty('height', `${targetHeight}px`);
            calendarContentRef.current.style.setProperty('transition', 'none');
            calendarContentRef.current.style.setProperty('transform', `scaleY(${scale})`);
            calendarContentRef.current.style.setProperty('transform-origin', 'top center');
            calendarContentRef.current.style.setProperty('--live-calendar-height', `${targetHeight}px`);
            console.log("📏 실시간 높이 업데이트:", targetHeight.toFixed(0), "px");
          }
        } else if (!isPullingDown && calendarMode !== 'collapsed') {
          let targetHeight = gestureStartHeight + deltaY * 1.2;
          const scale = Math.min(1, 0.6 + (targetHeight / 150) * 0.4);
          
          targetHeight = Math.max(0, targetHeight);
          
          if (calendarContentRef.current) {
            calendarContentRef.current.style.setProperty('height', `${targetHeight}px`);
            calendarContentRef.current.style.setProperty('transition', 'none');
            calendarContentRef.current.style.setProperty('transform', `scaleY(${scale})`);
            calendarContentRef.current.style.setProperty('transform-origin', 'top center');
            console.log("📏 실시간 높이 업데이트 (축소):", targetHeight.toFixed(0), "px");
          }
        }
      }
    };
    
    // 🎯 PointerUp: Fling 감지 및 스냅
    const handlePointerUp = (e: PointerEvent) => {
      console.log("🔴 PointerUp!", { activeGesture, historyLength: gestureHistory.length });
      
      if (activeGesture === 'none' || activeGesture === 'scroll') {
        console.log("❌ PointerUp 무시 (activeGesture:", activeGesture, ")");
        activeGesture = 'none';
        return;
      }
      
      // Pointer capture 해제 (제거됨)
      // if (gesturePointerId !== null) {
      //   try {
      //     (e.target as HTMLElement).releasePointerCapture(gesturePointerId);
      //   } catch (err) {
      //     // Ignore
      //   }
      //   gesturePointerId = null;
      // }
      gesturePointerId = null;
      
      if (activeGesture === 'calendar-drag') {
        const velocity = calculateVelocity();
        const currentHeight = calendarContentRef.current?.offsetHeight || 0;
        const deltaY = gestureHistory.length > 0 
          ? gestureHistory[gestureHistory.length - 1].y - gestureStartY 
          : 0;
        
        console.log("🔴 PointerUp:", { calendarMode, currentHeight, velocity: velocity.toFixed(3), deltaY });
        
        performCalendarSnap(velocity, currentHeight, deltaY);
      }
      
      // 초기화
      activeGesture = 'none';
      gestureStartY = 0;
      gestureStartX = 0;
      gestureStartHeight = 0;
      isHorizontalGesture = false;
      gestureHistory.length = 0;
    };
    
    // PointerCancel 처리 - PointerUp과 동일하게 스냅 수행
    const handlePointerCancel = (e: PointerEvent) => {
      console.log("⚠️ PointerCancel! - PointerUp처럼 처리", { activeGesture, gesturePointerId });
      
      // PointerUp과 동일하게 처리
      handlePointerUp(e);
    };
    
    // 이벤트 리스너 등록 (passive: false 필수!)
    containerElement.addEventListener('pointerdown', handlePointerDown as EventListener, { passive: false });
    containerElement.addEventListener('pointermove', handlePointerMove as EventListener, { passive: false });
    containerElement.addEventListener('pointerup', handlePointerUp as EventListener);
    containerElement.addEventListener('pointercancel', handlePointerCancel as EventListener);
    
    return () => {
      containerElement.removeEventListener('pointerdown', handlePointerDown as EventListener);
      containerElement.removeEventListener('pointermove', handlePointerMove as EventListener);
      containerElement.removeEventListener('pointerup', handlePointerUp as EventListener);
      containerElement.removeEventListener('pointercancel', handlePointerCancel as EventListener);
    };
  }, [headerHeight, calendarMode, setCalendarMode]);
}
