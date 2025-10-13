import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  url: string;
  /** 모듈당 픽셀 크기(정수). 6~10 권장. 기본 8 */
  scale?: number;
  /** Quiet zone(모듈 수). 기본 4 */
  marginModules?: number;
  /** 오류정정 레벨. H 권장 */
  errorLevel?: "L" | "M" | "Q" | "H";
  /** 전경/배경색 – 인식률 관점에선 #000 / #fff 추천 */
  fgColor?: string;
  bgColor?: string;
  /** 외곽 스타일 */
  className?: string;
  alt?: string;
};

export default function QRCodeImage({
  url,
  scale = 8,             // 모듈을 굵게
  marginModules = 4,      // 넉넉한 여백
  errorLevel = "H",
  fgColor = "#000000",
  bgColor = "#ffffff",
  className,
  alt = "QR code",
}: Props) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const make = async () => {
      const value = (url || "").trim();
      if (!value) { setDataUrl(""); return; }

      try {
        // width 대신 scale(정수) 사용 → 픽셀 스냅으로 또렷
        const data = await QRCode.toDataURL(value, {
          scale,                         // 👈 모듈 크기(정수 배)
          margin: marginModules,         // 👈 Quiet zone(모듈 수)
          errorCorrectionLevel: errorLevel,
          color: { dark: fgColor, light: bgColor },
        });
        if (mounted) setDataUrl(data);
      } catch (e) {
        console.error("QR generate error:", e);
        if (mounted) setDataUrl("");
      }
    };
    make();
    return () => { mounted = false; };
  }, [url, scale, marginModules, errorLevel, fgColor, bgColor]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt={alt}
      className={className}
      // PNG 스케일 유지(브라우저가 부드럽게 보정하지 않도록)
      style={{ imageRendering: "pixelated" }}
      draggable={false}
    />
  );
}
