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
  const [qrSize, setQrSize] = useState(220);
  // 기존 useEffect(checkMobile) 안을 이렇게 수정
useEffect(() => {
  const checkMobile = () => {
    const mobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768;
    setIsMobile(mobile);

    // 화면 폭에 따라 QR 사이즈 자동 설정 (160~300 사이)
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const calc = Math.min(300, Math.max(160, Math.floor(vw * 0.5)));
    setQrSize(calc);
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
          즐겨찾기 공유하기
        </h2>

        {isMobile ? (
          /* Mobile View */
          <div className="space-y-4">
          {/* QR 박스: 항상 표시 */}
          <div className="bg-white p-5 rounded-lg flex justify-center">
            <QRCodeSVG
              value={currentUrl}
              size={qrSize}          // 화면 폭에 맞춰 자동 크기
              level="H"
              includeMargin={true}
            />
          </div>
        
          {/* URL 표시 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-300 break-all text-center">
              {currentUrl}
            </p>
          </div>
        
          {/* 안내 문구 (모바일/데스크탑 각각 자연스러운 카피) */}
          <div className="text-sm text-gray-400 text-center space-y-1">
            <p>📱 휴대폰 카메라(또는 QR 앱)로 스캔해서 바로 접속하세요.</p>
            <p>또는 아래 버튼으로 웹 주소를 복사하고 공유할 수 있어요.</p>
            <p className="text-xs text-gray-500">
              홈 화면에 추가하면 앱처럼 한 번에 열 수 있습니다.
            </p>
          </div>
        
          {/* 액션 버튼: 복사 + 홈화면 추가 (모바일/데스크탑 모두 노출) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={handleCopyUrl}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-white"
              }`}
            >
              {copied ? "✓ 복사 완료!" : "📋 주소 복사"}
            </button>
        
            <button
              onClick={handleAddToHomeScreen}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              📱 홈 화면에 바로가기 추가
            </button>
          </div>
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
