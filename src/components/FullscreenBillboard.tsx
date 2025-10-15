import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

interface FullscreenBillboardProps {
  images: string[];
  events: any[];
  isOpen: boolean;
  onClose: () => void;
  onEventClick: (event: any) => void;
  autoSlideInterval?: number;
  transitionDuration?: number;
}

// 배열 셔플 함수
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function FullscreenBillboard({
  images,
  events,
  isOpen,
  onClose,
  onEventClick,
  autoSlideInterval = 5000,
  transitionDuration = 300,
}: FullscreenBillboardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 재생 순서 설정 (localStorage에서 읽기)
  const [playOrder, setPlayOrder] = useState<"sequential" | "random">(() => {
    return (
      (localStorage.getItem("billboardPlayOrder") as "sequential" | "random") ||
      "random"
    );
  });

  // 이미지와 이벤트를 재생 순서에 따라 정렬
  const { sortedImages, sortedEvents } = useMemo(() => {
    if (playOrder === "random") {
      // 랜덤 순서로 셔플 (이미지와 이벤트를 함께 셔플)
      const indices = images.map((_, i) => i);
      const shuffledIndices = shuffleArray(indices);
      return {
        sortedImages: shuffledIndices.map((i) => images[i]),
        sortedEvents: shuffledIndices.map((i) => events[i]),
      };
    } else {
      // 순차 재생
      return {
        sortedImages: images,
        sortedEvents: events,
      };
    }
  }, [images, events, playOrder, isOpen]); // isOpen이 변경될 때마다 재생성 (광고판 열릴 때 새로 셔플)

  // localStorage 변경 감지
  useEffect(() => {
    const handleStorageChange = () => {
      const newOrder =
        (localStorage.getItem("billboardPlayOrder") as
          | "sequential"
          | "random") || "random";
      setPlayOrder(newOrder);
    };

    window.addEventListener("billboardOrderChange", handleStorageChange);
    return () => {
      window.removeEventListener("billboardOrderChange", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || sortedImages.length === 0) {
      // 광고판이 닫히거나 이미지가 없으면 타이머 정리 및 인덱스 초기화
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setCurrentIndex(0);
      setIsTransitioning(false);
      setProgress(0);
      return;
    }

    // 기존 타이머가 있으면 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // 인덱스 초기화
    setCurrentIndex(0);
    setProgress(0);

    // 진행 바 업데이트 (50ms마다)
    const progressStep = (50 / autoSlideInterval) * 100;
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 0;
        }
        return prev + progressStep;
      });
    }, 50);

    // 새로운 자동 재생 시작
    intervalRef.current = setInterval(() => {
      setIsTransitioning(true);
      setProgress(0);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % sortedImages.length);
        setIsTransitioning(false);
      }, transitionDuration);
    }, autoSlideInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isOpen, sortedImages.length, autoSlideInterval, transitionDuration]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sortedEvents[currentIndex]) {
      onEventClick(sortedEvents[currentIndex]);
    }
  };

  if (!isOpen || sortedImages.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={handleBackgroundClick}
    >
      <div
        className="relative w-full h-full flex items-center justify-center"
        onClick={handleBackgroundClick}
      >
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          <img
            src={sortedImages[currentIndex]}
            alt="Event Billboard"
            className={`max-w-full max-h-full object-contain transition-opacity cursor-pointer ${
              isTransitioning ? "opacity-0" : "opacity-100"
            }`}
            style={{ transitionDuration: `${transitionDuration}ms` }}
            onClick={handleImageClick}
          />

          {sortedEvents[currentIndex] && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pb-4 pointer-events-none">
              {/* 제목 */}
              <h2
                className={`text-white text-lg font-bold text-center mb-2 line-clamp-1 transition-opacity ${
                  isTransitioning ? "opacity-0" : "opacity-100"
                }`}
                style={{ transitionDuration: `${transitionDuration}ms` }}
              >
                {sortedEvents[currentIndex].title}
              </h2>

              {/* 상세보기 버튼 + QR 코드 가로 배치 */}
              <div className="flex items-center justify-center gap-3 pointer-events-auto">
                <button
                  onClick={handleImageClick}
                  style={{
                    transitionDuration: `${transitionDuration}ms`,
                  }}
                  className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-medium text-sm inline-flex items-center gap-2 transition-all hover:scale-105 ${
                    isTransitioning ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <i className="ri-eye-line text-base" aria-hidden="true"></i>
                  <span>상세보기</span>
                </button>
                
                {/* QR 코드 - 더 작게 */}
                <div 
                  className={`bg-white p-1.5 rounded transition-opacity flex flex-col items-center ${
                    isTransitioning ? "opacity-0" : "opacity-100"
                  }`}
                  style={{ transitionDuration: `${transitionDuration}ms` }}
                  title="QR 스캔으로 바로 보기"
                >
                  <QRCodeSVG
                    value={`${window.location.origin}?event=${sortedEvents[currentIndex].id}&from=qr`}
                    size={60}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 상단 안내 + 슬라이드 인디케이터 + 진행 바 */}
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-3 pointer-events-none">
          {sortedImages.length > 1 && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                {sortedImages.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentIndex ? "bg-white w-6" : "bg-white/50"
                    }`}
                  />
                ))}
              </div>

              {/* 진행 바 */}
              <div className="w-32 h-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-75"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
