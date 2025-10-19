import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { parseVideoUrl } from "../utils/videoEmbed";

interface FullscreenBillboardProps {
  images: string[];
  events: any[];
  isOpen: boolean;
  onClose: () => void;
  onEventClick: (event: any) => void;
  autoSlideInterval?: number;
  transitionDuration?: number;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  showDateRange?: boolean;
  playOrder?: "sequential" | "random";
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
  dateRangeStart,
  dateRangeEnd,
  showDateRange = true,
  playOrder = "random",
}: FullscreenBillboardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 이미지와 이벤트를 재생 순서에 따라 정렬 (필터링은 이미 완료됨)
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
      <div className="relative w-full h-full" onClick={handleBackgroundClick}>
        {/* 미디어 컨텐츠 (이미지 또는 영상) - 상단 여백 없이 배치 */}
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          {(() => {
            const currentEvent = sortedEvents[currentIndex];
            const videoUrl = currentEvent?.video_url;
            
            if (videoUrl) {
              const videoInfo = parseVideoUrl(videoUrl);
              if (videoInfo.embedUrl) {
                return (
                  <div 
                    className={`relative w-full h-screen flex items-center justify-center transition-opacity cursor-pointer ${
                      isTransitioning ? "opacity-0" : "opacity-100"
                    }`}
                    style={{ transitionDuration: `${transitionDuration}ms` }}
                  >
                    <iframe
                      src={videoInfo.embedUrl}
                      className="w-full h-full"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ maxHeight: '100vh', objectFit: 'contain' }}
                    ></iframe>
                    {/* 투명 오버레이: 인스타 클릭 차단 및 상세보기로 이동 */}
                    <div 
                      className="absolute inset-0 z-10 cursor-pointer"
                      onClick={handleImageClick}
                      title="클릭하여 상세보기"
                    ></div>
                  </div>
                );
              }
            }
            
            return (
              <img
                src={sortedImages[currentIndex]}
                alt="Event Billboard"
                className={`max-w-full max-h-screen object-contain transition-opacity cursor-pointer ${
                  isTransitioning ? "opacity-0" : "opacity-100"
                }`}
                style={{ transitionDuration: `${transitionDuration}ms` }}
                onClick={handleImageClick}
              />
            );
          })()}
        </div>

        {/* 화면 기준 하단 - 제목 + 버튼/QR (이미지와 분리) */}
        {sortedEvents[currentIndex] && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent pt-16 px-6 pointer-events-none">
            {/* 대형 제목 - 40인치 디스플레이용, 단어 단위 줄바꿈 */}
            <h2
              className={`text-white text-3xl md:text-4xl lg:text-5xl font-black text-center leading-tight tracking-tight transition-opacity ${
                isTransitioning ? "opacity-0" : "opacity-100"
              }`}
              style={{
                transitionDuration: `${transitionDuration}ms`,
                textShadow: "0 4px 20px rgba(0,0,0,0.8)",
                whiteSpace: "pre-line",
                maxWidth: "90%",
                margin: "0 auto 1.5rem",
              }}
            >
              {(() => {
                const title = sortedEvents[currentIndex].title;

                // 띄어쓰기가 없으면 8글자씩 나누기
                if (!title.includes(" ")) {
                  const chunks = title.match(/.{1,8}/g) || [];
                  return chunks.join("\n");
                }

                // 띄어쓰기가 있으면 단어 단위로 적당히 줄바꿈 (10글자 기준)
                const words = title.split(" ");
                const lines: string[] = [];
                let currentLine = "";

                words.forEach((word: string) => {
                  // 단어가 10글자를 넘으면 8글자씩 나눔
                  if (word.length > 10) {
                    if (currentLine) {
                      lines.push(currentLine);
                      currentLine = "";
                    }
                    const chunks = word.match(/.{1,8}/g) || [];
                    chunks.forEach((chunk, idx) => {
                      if (idx === chunks.length - 1) {
                        currentLine = chunk;
                      } else {
                        lines.push(chunk);
                      }
                    });
                    return;
                  }

                  // 띄어쓰기를 포함한 길이 계산 (10글자 기준)
                  const nextLineLength = currentLine
                    ? currentLine.length + 1 + word.length
                    : word.length;

                  if (nextLineLength <= 10) {
                    currentLine += (currentLine ? " " : "") + word;
                  } else {
                    if (currentLine) lines.push(currentLine);
                    currentLine = word;
                  }
                });

                if (currentLine) lines.push(currentLine);

                return lines.join("\n");
              })()}
            </h2>

            {/* 최하단 - 상세보기 버튼 + QR 코드 가로 배치 (바닥에서 1rem) */}
            <div className="flex items-center justify-center gap-4 pb-4 pointer-events-auto">
              <button
                onClick={handleImageClick}
                style={{
                  transitionDuration: `${transitionDuration}ms`,
                }}
                className={`bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium text-base inline-flex items-center gap-2 transition-all hover:scale-105 ${
                  isTransitioning ? "opacity-0" : "opacity-100"
                }`}
              >
                <i className="ri-eye-line text-lg" aria-hidden="true"></i>
                <span>상세보기</span>
              </button>

              {/* QR 코드 */}
              <div
                className={`bg-white p-2 rounded-lg transition-opacity ${
                  isTransitioning ? "opacity-0" : "opacity-100"
                }`}
                style={{ transitionDuration: `${transitionDuration}ms` }}
                title="QR 스캔으로 바로 보기"
              >
                <QRCodeSVG
                  value={`${window.location.origin}/?event=${sortedEvents[currentIndex].id}&from=qr`}
                  size={70}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* 좌측 상단 영역 - 원형 진행 표시 + 날짜 범위 */}
        <div className="absolute top-8 left-8 pointer-events-none">
          {/* 원형 진행 표시 - 우로보로스 형태 */}
          {sortedImages.length > 1 && (
            <div className="relative w-24 h-24 mb-3">
              {/* 원형 진행 바 배경 */}
              <svg className="transform -rotate-90 w-24 h-24">
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="6"
                  fill="none"
                />
                {/* 진행 원 */}
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="white"
                  strokeWidth="6"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
              </svg>

              {/* 중앙 슬라이드 번호 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-white font-bold text-xl">
                  {currentIndex + 1}/{sortedImages.length}
                </div>
              </div>
            </div>
          )}

          {/* 날짜 범위 표시 */}
          {showDateRange && (dateRangeStart || dateRangeEnd) && (
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white">
              <div className="text-xs text-gray-300 mb-1">일정 기간</div>
              <div className="font-bold text-sm">
                {dateRangeStart || "시작"} ~
              </div>
              <div className="font-bold text-sm">{dateRangeEnd || "종료"}</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
