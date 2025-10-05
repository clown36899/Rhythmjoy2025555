import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QRCodeModal({ isOpen, onClose }: QRCodeModalProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768;
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  const currentUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("주소 복사에 실패했습니다");
    }
  };

  const handleAddToHomeScreen = () => {
    alert(
      "홈 화면에 추가하기:\n\n" +
      "1. 브라우저 메뉴(⋮)를 열어주세요\n" +
      "2. '홈 화면에 추가' 또는 '바로가기 추가'를 선택하세요\n" +
      "3. 이름을 확인하고 '추가'를 누르세요"
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl p-6 max-w-md w-full relative shadow-2xl border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          aria-label="닫기"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          즐거찾기 공유하기
        </h2>

        {isMobile ? (
          /* Mobile View */
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-300 mb-3 break-all">
                {currentUrl}
              </p>
              <button
                onClick={handleCopyUrl}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                  copied
                    ? "bg-green-600 text-white"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
              >
                {copied ? "✓ 복사 완료!" : "📋 웹 주소 복사"}
              </button>
            </div>

            <button
              onClick={handleAddToHomeScreen}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              📱 홈 화면에 바로가기 추가
            </button>

            <p className="text-xs text-gray-400 text-center">
              바로가기를 추가하면 앱처럼 빠르게 접속할 수 있어요
            </p>
          </div>
        ) : (
          /* Desktop View - QR Code */
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-lg flex justify-center">
              <QRCodeSVG
                value={currentUrl}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-300 break-all text-center">
                {currentUrl}
              </p>
            </div>

            <p className="text-sm text-gray-400 text-center">
              📱 모바일로 QR 코드를 스캔해서 접속하세요
            </p>

            <button
              onClick={handleCopyUrl}
              className={`w-full py-2 px-4 rounded-lg font-semibold transition-all ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-white"
              }`}
            >
              {copied ? "✓ 복사 완료!" : "📋 주소 복사"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
