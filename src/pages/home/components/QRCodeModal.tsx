// components/QRCodeModal.tsx
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import "./QRCodeModal.css";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 전달 안하면 현재 페이지 주소로 생성 */
  url?: string;
  /** 기본 280px */
  size?: number;
  /** 다크테마 색상 커스텀(전경/배경) */
  fgColor?: string;
  bgColor?: string;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  url,
  size = 280,
  fgColor = "#ffffff",
  bgColor = "#111827",
}: QRCodeModalProps) {
  const [targetUrl, setTargetUrl] = useState("");
  const [dataUrl, setDataUrl] = useState<string>("");
  const [qrSize, setQrSize] = useState(size);
  const [fg, setFg] = useState(fgColor);
  const [bg, setBg] = useState(bgColor);
  const inputRef = useRef<HTMLInputElement>(null);

  // 모달이 열릴 때 URL 초기화 (props.url 없으면 현재 주소)
  useEffect(() => {
    if (!isOpen) return;
    const current =
      url || (typeof window !== "undefined" ? window.location.href : "");
    setTargetUrl(current);
  }, [isOpen, url]);

  // props 변경 시 로컬 상태 동기화
  useEffect(() => setQrSize(size), [size]);
  useEffect(() => setFg(fgColor), [fgColor]);
  useEffect(() => setBg(bgColor), [bgColor]);

  // URL → QR 생성
  const generate = async (u: string, opt?: { size?: number; fg?: string; bg?: string }) => {
    const _size = opt?.size ?? qrSize;
    const _fg = opt?.fg ?? fg;
    const _bg = opt?.bg ?? bg;
    if (!u) {
      setDataUrl("");
      return;
    }
    try {
      const data = await QRCode.toDataURL(u, {
        width: _size,
        margin: 2,
        color: { dark: _fg, light: _bg },
        errorCorrectionLevel: "M",
      });
      setDataUrl(data);
    } catch (e) {
      console.error("QR generate error:", e);
      setDataUrl("");
    }
  };

  // 열려 있고 URL이 있으면 생성
  useEffect(() => {
    if (isOpen && targetUrl) generate(targetUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetUrl, qrSize, fg, bg]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr.png";
    a.click();
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      alert("URL이 복사되었습니다!");
    } catch {
      alert("복사에 실패했습니다.");
    }
  };

  const handleRefresh = () => {
    if (typeof window !== "undefined") {
      const current = window.location.href;
      setTargetUrl(current);
    }
  };

  if (!isOpen) return null;

  const isUrlEmpty = !targetUrl.trim();

  return (
    <div
      className="qr-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="qr-modal-container">
        {/* 헤더 */}
        <div className="qr-header">
          <h3 className="qr-header-title">QR 코드</h3>
          <button
            onClick={onClose}
            className="qr-close-btn"
          >
            <i className="ri-close-line qr-close-icon"></i>
          </button>
        </div>

        {/* 바디 */}
        <div className="qr-body">
          <div className="qr-body-spacing">
            {/* URL 입력 */}
            <div className="qr-url-section">
              <label className="qr-url-label">URL</label>
              <div className="qr-url-input-row">
                <input
                  ref={inputRef}
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generate(targetUrl)}
                  className="qr-url-input"
                  placeholder="https://example.com"
                />
                <button
                  onClick={() => generate(targetUrl)}
                  disabled={isUrlEmpty}
                  className={`qr-generate-btn ${
                    isUrlEmpty
                      ? "qr-generate-btn-disabled"
                      : "qr-generate-btn-enabled"
                  }`}
                >
                  생성
                </button>
              </div>
            </div>

            {/* QR 출력 */}
            <div className="qr-display-area">
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="QR"
                  className="qr-image"
                  style={{ width: qrSize, height: qrSize }}
                />
              ) : (
                <div className="qr-placeholder">
                  {isUrlEmpty ? "URL을 입력하세요" : "생성 중…"}
                </div>
              )}
            </div>

            {/* 액션 */}
            <div className="qr-action-group">
              <button
                onClick={handleCopyUrl}
                className="qr-action-btn"
              >
                URL 복사
              </button>
              <button
                onClick={handleDownload}
                className="qr-action-btn qr-action-btn-purple"
                disabled={!dataUrl}
              >
                PNG 저장
              </button>
              <button
                onClick={handleRefresh}
                className="qr-action-btn"
                title="현재 주소로 갱신"
              >
                현재주소
              </button>
            </div>

            {/* 옵션 */}
            <div className="qr-options-grid">
              <div className="qr-option-item">
                <label className="qr-option-label">전경색</label>
                <input
                  type="color"
                  value={fg}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFg(v);
                    generate(targetUrl, { fg: v });
                  }}
                  className="qr-color-input"
                />
              </div>
              <div className="qr-option-item">
                <label className="qr-option-label">배경색</label>
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBg(v);
                    generate(targetUrl, { bg: v });
                  }}
                  className="qr-color-input"
                />
              </div>
              <div className="qr-option-item qr-option-full">
                <label className="qr-option-label">크기(px)</label>
                <input
                  type="range"
                  min={160}
                  max={520}
                  step={20}
                  value={qrSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setQrSize(v);
                    generate(targetUrl, { size: v });
                  }}
                  className="qr-range-input"
                />
                <div className="qr-size-text">{qrSize}px</div>
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="qr-footer">
          <button
            onClick={onClose}
            className="qr-footer-btn"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
