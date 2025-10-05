import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface FullscreenBillboardProps {
  images: string[];
  events: any[];
  isOpen: boolean;
  onClose: () => void;
  onEventClick: (event: any) => void;
}

export default function FullscreenBillboard({
  images,
  events,
  isOpen,
  onClose,
  onEventClick,
}: FullscreenBillboardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen || images.length === 0) return;

    const startAutoplay = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % images.length);
          setIsTransitioning(false);
        }, 300);
      }, 5000);
    };

    startAutoplay();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOpen, images.length]);

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
      <div className="relative w-full h-full flex items-center justify-center">
        <img
          src={images[currentIndex]}
          alt="Event Billboard"
          className={`max-w-full max-h-full object-contain transition-opacity duration-300 cursor-pointer ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
          onClick={handleImageClick}
        />

        {images.length > 1 && (
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 flex gap-2 pb-4">
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

        <div className="absolute top-4 right-4 text-white/70 text-sm">
          이미지 클릭: 상세보기 | 배경 클릭: 닫기
        </div>
      </div>
    </div>,
    document.body
  );
}
