import { useEffect, useState, memo } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { useModalHistory } from "../hooks/useModalHistory";
import "./QRCodeModal.css";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default memo(function QRCodeModal({ isOpen, onClose }: QRCodeModalProps) {
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

  // Enable mobile back gesture to close modal
  useModalHistory(isOpen, onClose);

  const currentUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";

  // QRCodeModal.tsx의 handleCopyUrl 함수 수정

  const handleCopyUrl = async () => {
    const textToCopy = currentUrl;

    // 1. 최신 Clipboard API 시도 (HTTPS 환경에서만 작동)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return; // 성공했으면 종료
      } catch (err) {
        console.error("Clipboard API 실패. Fallback 시도:", err);
        // 실패 시 아래의 execCommand 로직으로 넘어갑니다.
      }
    }

    // 2. Fallback: document.execCommand('copy') 사용
    try {
      // 임시 input 요소를 생성하여 텍스트를 담습니다.
      const input = document.createElement('textarea');
      input.value = textToCopy;
      document.body.appendChild(input);

      // input 내용을 선택하고 복사합니다.
      input.select();
      document.execCommand('copy');

      // 임시 input을 제거합니다.
      document.body.removeChild(input);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

    } catch (err) {
      console.error("ExecCommand 복사도 실패:", err);
      alert("주소 복사에 실패했습니다.");
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
      className="qrc-overlay"
      onClick={onClose}
    >
      <div
        className="qrc-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="qrc-close-button"
          aria-label="닫기"
        >
          <svg
            className="qrc-close-icon"
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
        <h2 className="qrc-title">
          댄스일정표 주소링크
        </h2>

        {isMobile ? (
          /* Mobile View */
          <div className="qrc-content">
            {/* QR 박스: 항상 표시 */}
            <div className="qrc-qr-box">
              <QRCodeSVG
                value={currentUrl}
                size={qrSize}          // 화면 폭에 맞춰 자동 크기
                level="H"
                includeMargin={true}
              />
            </div>

            {/* URL 표시 */}
            <div className="qrc-url-box">
              <p className="qrc-url-text">
                {currentUrl}
              </p>
            </div>

            {/* 안내 문구 (모바일/데스크탑 각각 자연스러운 카피) */}
            <div className="qrc-description">
              <p>📱 휴대폰 카메라(또는 QR 앱)로 스캔해서 바로 접속하세요.</p>
              <p>또는 아래 버튼으로 웹 주소를 복사하고 공유할 수 있어요.</p>
              <p className="qrc-description-small">
                홈 화면에 추가하면 앱처럼 한 번에 열 수 있습니다.
              </p>
            </div>

            {/* 액션 버튼: 복사 + 홈화면 추가 (모바일/데스크탑 모두 노출) */}
            <div className="qrc-button-grid">
              <button
                onClick={handleCopyUrl}
                className={`qrc-button qrc-button-copy ${copied ? "qrc-copied" : ""
                  }`}
              >
                {copied ? "✓ 복사 완료!" : "📋 주소 복사"}
              </button>

              <button
                onClick={handleAddToHomeScreen}
                className="qrc-button qrc-button-home"
              >
                📱 홈 화면에 바로가기 추가
              </button>
            </div>
          </div>
        ) : (
          /* Desktop View - QR Code */
          <div className="qrc-content">
            <div className="qrc-qr-box-desktop">
              <QRCodeSVG
                value={currentUrl}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="qrc-url-box">
              <p className="qrc-url-text">
                {currentUrl}
              </p>
            </div>

            <p className="qrc-description">
              📱 모바일로 QR 코드를 스캔해서 접속하세요
            </p>

            <button
              onClick={handleCopyUrl}
              className={`qrc-button-single qrc-button-single-copy ${copied ? "qrc-copied" : ""
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
});
