// components/QRCodeModal.tsx
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

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
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-800 rounded-xl w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-700">
          <h3 className="text-white font-bold">QR 코드</h3>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white cursor-pointer"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* 바디 */}
        <div className="p-5 space-y-4">
          {/* URL 입력 */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400">URL</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate(targetUrl)}
                className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com"
              />
              <button
                onClick={() => generate(targetUrl)}
                disabled={isUrlEmpty}
                className={`px-3 py-2 rounded-lg cursor-pointer whitespace-nowrap ${
                  isUrlEmpty
                    ? "bg-gray-600 text-gray-300"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                생성
              </button>
            </div>
          </div>

          {/* QR 출력 */}
          <div className="flex items-center justify-center">
            {dataUrl ? (
              <img
                src={dataUrl}
                alt="QR"
                className="rounded-lg border border-gray-700"
                style={{ width: qrSize, height: qrSize }}
              />
            ) : (
              <div className="w-40 h-40 grid place-items-center text-gray-400">
                {isUrlEmpty ? "URL을 입력하세요" : "생성 중…"}
              </div>
            )}
          </div>

          {/* 액션 */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleCopyUrl}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-2 cursor-pointer"
            >
              URL 복사
            </button>
            <button
              onClick={handleDownload}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-2 cursor-pointer"
              disabled={!dataUrl}
            >
              PNG 저장
            </button>
            <button
              onClick={handleRefresh}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-2 cursor-pointer"
              title="현재 주소로 갱신"
            >
              현재주소
            </button>
          </div>

          {/* 옵션 */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">전경색</label>
              <input
                type="color"
                value={fg}
                onChange={(e) => {
                  const v = e.target.value;
                  setFg(v);
                  generate(targetUrl, { fg: v });
                }}
                className="w-full h-10 rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">배경색</label>
              <input
                type="color"
                value={bg}
                onChange={(e) => {
                  const v = e.target.value;
                  setBg(v);
                  generate(targetUrl, { bg: v });
                }}
                className="w-full h-10 rounded"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">크기(px)</label>
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
                className="w-full"
              />
              <div className="text-right text-xs text-gray-400 mt-1">{qrSize}px</div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-4 py-2 cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
