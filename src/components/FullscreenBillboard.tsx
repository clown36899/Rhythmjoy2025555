import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface FullscreenBillboardProps {
  images: string[];
  events: any[];
  isOpen: boolean;
  onClose: () => void;
  onEventClick: (event: any) => void;
  autoSlideInterval?: number;
  transitionDuration?: number;
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen || images.length === 0) {
      // 광고판이 닫히거나 이미지가 없으면 타이머 정리 및 인덱스 초기화
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentIndex(0);
      setIsTransitioning(false);
      return;
    }

    // 기존 타이머가 있으면 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // 인덱스 초기화
    setCurrentIndex(0);

    // 새로운 자동 재생 시작
    intervalRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
        setIsTransitioning(false);
      }, transitionDuration);
    }, autoSlideInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOpen, images.length, autoSlideInterval, transitionDuration]);

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
    if (events[currentIndex]) {
      onEventClick(events[currentIndex]);
    }
  };

  if (!isOpen || images.length === 0) return null;

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
            src={images[currentIndex]}
            alt="Event Billboard"
            className={`max-w-full max-h-full object-contain transition-opacity cursor-pointer ${
              isTransitioning ? "opacity-0" : "opacity-100"
            }`}
            style={{ transitionDuration: `${transitionDuration}ms` }}
            onClick={handleImageClick}
          />
          
          {events[currentIndex] && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6 pb-8 pointer-events-none">
              <h2 className={`text-white text-2xl sm:text-3xl md:text-4xl font-bold text-center transition-opacity ${
                isTransitioning ? "opacity-0" : "opacity-100"
              }`}
              style={{ transitionDuration: `${transitionDuration}ms` }}
              >
                {events[currentIndex].title}
              </h2>
              
              {/* 상세보기 버튼 */}
              <div className="flex justify-center mt-4 pointer-events-auto">
                <button
                  onClick={handleImageClick}
                  className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-medium text-sm flex items-center space-x-2 transition-all hover:scale-105 ${
                    isTransitioning ? "opacity-0" : "opacity-100"
                  }`}
                  style={{ transitionDuration: `${transitionDuration}ms` }}
                >
                  <i className="ri-eye-line text-lg"></i>
                  <span>상세보기</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 flex gap-2 pointer-events-none">
            {images.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex ? "bg-white w-6" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        )}

        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm px-6 py-3 rounded-full pointer-events-none">
          <p className="text-white text-base sm:text-lg font-medium text-center">
            이미지 클릭: 상세보기, 배경 클릭: 닫기
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
