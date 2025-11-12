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
    
    // Helper: Calendar 스냅 수행 (currentHeight 기준)
    const performCalendarSnap = (velocity: number, currentHeight: number, deltaY: number) => {
      const fullscreenHeight = window.innerHeight - 150;
      // 웹 표준 임계값 (Material Design / iOS 기준, 모바일 최적화)
      const FLING_VELOCITY_THRESHOLD = 0.4; // 400px/초 (달성 가능하게 조정)
      const FLING_DISTANCE_THRESHOLD = 40; // 40px (모바일에서 달성 가능)
      
      let finalHeight = 0;
      let targetMode: CalendarMode = 'collapsed';
      
      // 🎯 currentHeight 기준 임계값 (연속 드래그 지원)
      const midPoint = (250 + fullscreenHeight) / 2; // 250과 fullscreen 중간
      
      // Fling 우선 처리
      const isFlickDown = deltaY > FLING_DISTANCE_THRESHOLD && velocity > FLING_VELOCITY_THRESHOLD;
      const isFlickUp = deltaY < -FLING_DISTANCE_THRESHOLD && velocity < -FLING_VELOCITY_THRESHOLD;
      
      if (isFlickDown) {
        // 빠르게 아래로
        if (currentHeight < 125) {
          finalHeight = 250;
          targetMode = 'expanded';
          console.log("⚡️ Fling Down:", currentHeight.toFixed(0), "→ 250 expanded");
        } else {
          finalHeight = fullscreenHeight;
          targetMode = 'fullscreen';
          console.log("⚡️ Fling Down:", currentHeight.toFixed(0), "→", fullscreenHeight, "fullscreen");
        }
      } else if (isFlickUp) {
        // 빠르게 위로
        if (currentHeight > midPoint) {
          finalHeight = 250;
          targetMode = 'expanded';
          console.log("⚡️ Fling Up:", currentHeight.toFixed(0), "→ 250 expanded");
        } else {
          finalHeight = 0;
          targetMode = 'collapsed';
          isScrollExpandingRef.current = false;
          console.log("⚡️ Fling Up:", currentHeight.toFixed(0), "→ 0 collapsed");
        }
      } else {
        // 느린 드래그: 가장 가까운 스냅 포인트
        if (currentHeight < 125) {
          // 0 ~ 125: collapsed vs expanded
          if (currentHeight > 60 || deltaY > 5) {
            finalHeight = 250;
            targetMode = 'expanded';
            console.log("✅ 스냅:", currentHeight.toFixed(0), "→ 250 expanded");
          } else {
            finalHeight = 0;
            targetMode = 'collapsed';
            isScrollExpandingRef.current = false;
            console.log("✅ 스냅:", currentHeight.toFixed(0), "→ 0 collapsed");
          }
        } else if (currentHeight < 320) {
          // 125 ~ 320: expanded vs fullscreen (임계값 낮춤: midPoint → 320)
          finalHeight = 250;
          targetMode = 'expanded';
          console.log("✅ 스냅:", currentHeight.toFixed(0), "→ 250 expanded");
        } else {
          // 320 ~ fullscreen: fullscreen
          finalHeight = fullscreenHeight;
          targetMode = 'fullscreen';
          console.log("✅ 스냅:", currentHeight.toFixed(0), "→", fullscreenHeight, "fullscreen");
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
    
    // 🎯 PointerDown: 제스처 분류 (터치 위치 기준)
    const handlePointerDown = (e: PointerEvent) => {
      console.log("🔵 PointerDown 발생!", { pointerType: e.pointerType, clientY: e.clientY });
      
      const scrollTop = eventListElement.scrollTop;
      const isAtTop = scrollTop <= 0;
      const currentCalendarHeight = calendarContentRef.current?.offsetHeight || 0;
      const calendarBottomY = headerHeight + currentCalendarHeight;
      
      console.log("🔍 터치 위치 확인:", { scrollTop, isAtTop, clientY: e.clientY, calendarBottomY });
      
      // 터치 위치가 이벤트 리스트 영역 (달력 아래)
      if (e.clientY > calendarBottomY) {
        if (!isAtTop) {
          // 스크롤 중간: 일반 스크롤
          activeGesture = 'scroll';
          console.log("❌ 스크롤 모드 (리스트 영역, 스크롤 중간)");
          return;
        } else {
          // 스크롤 최상단: pending-calendar 모드 (아래로 당기면 즉시 달력 제어)
          activeGesture = 'scroll'; // 일단 scroll
          gesturePointerId = e.pointerId;
          gestureStartY = e.clientY;
          gestureStartX = e.clientX;
          gestureStartHeight = currentCalendarHeight;
          isHorizontalGesture = false;
          gestureHistory.length = 0;
          gestureHistory.push({ y: e.clientY, time: Date.now() });
          
          // ⚠️ 모바일 핵심: 즉시 Pointer 캡처 (native scroll 차단)
          try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            console.log("🔒 Pointer 캡처 완료 (모바일 native scroll 차단)");
          } catch (err) {
            console.log("⚠️ Pointer 캡처 실패:", err);
          }
          
          console.log("⏳ pending-calendar 모드 (리스트 최상단 - 아래로 당기면 달력)");
          return;
        }
      }
      
      // 터치 위치가 달력 영역: 무조건 calendar-drag
      activeGesture = 'calendar-drag';
      gesturePointerId = e.pointerId;
      gestureStartY = e.clientY;
      gestureStartX = e.clientX;
      gestureStartHeight = currentCalendarHeight;
      isHorizontalGesture = false;
      gestureHistory.length = 0;
      gestureHistory.push({ y: e.clientY, time: Date.now() });
      
      // 브라우저 기본 동작 방지
      e.preventDefault();
      
      console.log("🎯 제스처 시작: calendar-drag (달력 영역)", { clientY: e.clientY, calendarBottomY, currentCalendarHeight });
    };
    
    // 🎯 PointerMove: 제스처 타입에 따라 처리
    const handlePointerMove = (e: PointerEvent) => {
      console.log("🟢 PointerMove!", { activeGesture, clientY: e.clientY });
      
      if (activeGesture === 'none') {
        return;
      }
      
      // scroll 모드에서 pull down 감지
      if (activeGesture === 'scroll') {
        const scrollTop = eventListElement.scrollTop;
        const deltaY = e.clientY - gestureStartY;
        
        // 스크롤 최상단 + 아래로 당김 → 즉시 calendar-drag로 전환
        if (scrollTop <= 0 && deltaY > 0) {
          console.log("🔄 제스처 전환: scroll → calendar-drag (deltaY:", deltaY.toFixed(1), ")");
          activeGesture = 'calendar-drag';
          // 즉시 preventDefault() 호출
          e.preventDefault();
          // 아래 calendar-drag 로직으로 넘어감
        } else if (deltaY < 0) {
          // 위로 밀기 → 스크롤 허용, Pointer 캡처 해제
          if (gesturePointerId !== null) {
            try {
              (e.target as HTMLElement).releasePointerCapture(gesturePointerId);
              console.log("🔓 Pointer 캡처 해제 (위로 스크롤 허용)");
            } catch (err) {
              // Ignore
            }
          }
          return;
        } else {
          // deltaY === 0: 아직 움직임 없음
          return;
        }
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
        
        // 배율: 웹 표준 1:1 (Material Design / iOS 표준)
        let targetHeight = gestureStartHeight + deltaY * 1.0;
        const scale = Math.min(1, 0.6 + (targetHeight / 150) * 0.4);
        
        // 높이 제한: 0 ~ fullscreen
        targetHeight = Math.max(0, Math.min(targetHeight, fullscreenHeight));
        
        // 확장 중 플래그
        if (deltaY > 0) {
          isScrollExpandingRef.current = true;
        }
        
        if (calendarContentRef.current) {
          calendarContentRef.current.style.setProperty('height', `${targetHeight}px`);
          calendarContentRef.current.style.setProperty('transition', 'none');
          calendarContentRef.current.style.setProperty('transform', `scaleY(${scale})`);
          calendarContentRef.current.style.setProperty('transform-origin', 'top center');
          calendarContentRef.current.style.setProperty('--live-calendar-height', `${targetHeight}px`);
          console.log("📏 실시간 높이:", targetHeight.toFixed(0), "px (deltaY:", deltaY.toFixed(1), ")");
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
