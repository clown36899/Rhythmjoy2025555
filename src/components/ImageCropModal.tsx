import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageCropModalProps {
  isOpen: boolean;
  imageUrl: string;  // blob URL 또는 data URL
  onClose: () => void;
  onCropComplete: (croppedFile: File, croppedPreviewUrl: string) => void;
  onDiscard?: () => void;  // 취소 시 호출 (메모리 정리용)
  onRestoreOriginal?: () => void;  // 원본으로 되돌리기
  hasOriginal?: boolean;  // 원본이 있는지 여부
  fileName?: string;
}

async function createCroppedImage(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  fileName: string
): Promise<{ file: File; previewUrl: string }> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  // 정수로 반올림하고 이미지 경계 내로 제한 (clamp)
  const imgWidth = image.naturalWidth;
  const imgHeight = image.naturalHeight;
  
  const cropX = Math.max(0, Math.min(Math.round(pixelCrop.x), imgWidth - 1));
  const cropY = Math.max(0, Math.min(Math.round(pixelCrop.y), imgHeight - 1));
  const cropWidth = Math.max(1, Math.min(Math.round(pixelCrop.width), imgWidth - cropX));
  const cropHeight = Math.max(1, Math.min(Math.round(pixelCrop.height), imgHeight - cropY));

  console.log('🖼️ 크롭 정보:', {
    원본이미지: { width: imgWidth, height: imgHeight },
    크롭영역: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
    원본픽셀값: pixelCrop
  });

  // 1080px 최대 크기 제한 (메모리 절약)
  const maxSize = 1080;
  let canvasWidth = cropWidth;
  let canvasHeight = cropHeight;

  if (canvasWidth > maxSize || canvasHeight > maxSize) {
    const ratio = Math.min(maxSize / canvasWidth, maxSize / canvasHeight);
    canvasWidth = Math.round(canvasWidth * ratio);
    canvasHeight = Math.round(canvasHeight * ratio);
  }

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  console.log('🎨 캔버스:', { width: canvasWidth, height: canvasHeight });

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvasWidth,
    canvasHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }

        const file = new File([blob], fileName, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        // 미리보기용 data URL 생성
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            file,
            previewUrl: e.target?.result as string,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      },
      'image/jpeg',
      0.92
    );
  });
}

export default function ImageCropModal({
  isOpen,
  imageUrl,
  onClose,
  onCropComplete,
  onDiscard,
  onRestoreOriginal,
  hasOriginal = false,
  fileName = 'cropped.jpg',
}: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 25,
    y: 25,
    width: 50,
    height: 50,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspectRatioMode, setAspectRatioMode] = useState<'free' | '16:9' | '1:1'>('free');
  const [isProcessing, setIsProcessing] = useState(false);

  const aspectRatio = aspectRatioMode === 'free' ? undefined : aspectRatioMode === '16:9' ? 16 / 9 : 1;

  const handleCropConfirm = async () => {
    if (!completedCrop || !imgRef.current) {
      alert('크롭 영역을 선택해주세요.');
      return;
    }

    console.log('크롭 시작:', {
      completedCrop,
      imageSize: {
        natural: { width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight },
        display: { width: imgRef.current.width, height: imgRef.current.height }
      }
    });

    setIsProcessing(true);
    try {
      const { file, previewUrl } = await createCroppedImage(
        imgRef.current,
        completedCrop,
        fileName
      );

      console.log('크롭 완료:', { fileSize: file.size, previewUrlLength: previewUrl.length });
      onCropComplete(file, previewUrl);
      onClose();
    } catch (error) {
      console.error('이미지 크롭 실패:', error);
      alert('이미지 크롭 중 오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (onDiscard) {
      onDiscard();  // 메모리 정리
    }
    onClose();
  };

  // 비율 변경 시 크롭 영역 재설정
  const handleAspectRatioChange = (mode: 'free' | '16:9' | '1:1') => {
    setAspectRatioMode(mode);
    
    // 비율에 맞게 크롭 영역 초기화
    if (mode === '16:9') {
      setCrop({
        unit: '%',
        x: 10,
        y: 25,
        width: 80,
        height: 45,
      });
    } else if (mode === '1:1') {
      setCrop({
        unit: '%',
        x: 25,
        y: 10,
        width: 50,
        height: 50,
      });
    } else {
      setCrop({
        unit: '%',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
      });
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000001] flex items-center justify-center bg-black bg-opacity-90 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          handleCancel();
        }
      }}
    >
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-white">
            <i className="ri-crop-line mr-2"></i>
            이미지 자르기
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={isProcessing}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* 크롭 영역 */}
        <div className="px-6 py-6 flex justify-center bg-black">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(displayPixelCrop) => {
              // ReactCrop의 첫 번째 파라미터가 display 기준 픽셀 크롭
              if (displayPixelCrop.width && displayPixelCrop.height && imgRef.current) {
                // display 크기 기준 픽셀을 natural 크기로 변환
                const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
                const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
                
                const naturalPixelCrop: PixelCrop = {
                  unit: 'px',
                  x: displayPixelCrop.x * scaleX,
                  y: displayPixelCrop.y * scaleY,
                  width: displayPixelCrop.width * scaleX,
                  height: displayPixelCrop.height * scaleY,
                };
                
                console.log('✂️ 크롭 영역 계산:', {
                  이미지: {
                    display: { width: imgRef.current.width, height: imgRef.current.height },
                    natural: { width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight }
                  },
                  스케일: { x: scaleX.toFixed(2), y: scaleY.toFixed(2) },
                  크롭: {
                    display픽셀: displayPixelCrop,
                    natural픽셀: naturalPixelCrop
                  }
                });
                
                setCompletedCrop(naturalPixelCrop);
              }
            }}
            aspect={aspectRatio}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="크롭할 이미지"
              className="max-w-full max-h-[500px] object-contain"
            />
          </ReactCrop>
        </div>

        {/* 컨트롤 */}
        <div className="px-6 py-4 space-y-4">
          {/* 비율 선택 */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              <i className="ri-aspect-ratio-line mr-1"></i>
              비율
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleAspectRatioChange('free')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  aspectRatioMode === 'free'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                disabled={isProcessing}
              >
                자유
              </button>
              <button
                onClick={() => handleAspectRatioChange('16:9')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  aspectRatioMode === '16:9'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                disabled={isProcessing}
              >
                16:9
              </button>
              <button
                onClick={() => handleAspectRatioChange('1:1')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  aspectRatioMode === '1:1'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                disabled={isProcessing}
              >
                1:1
              </button>
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="text-sm text-gray-400 bg-gray-800 p-3 rounded-lg">
            <i className="ri-information-line mr-1"></i>
            네 모서리나 변을 드래그하여 영역을 조절하세요
          </div>
        </div>

        {/* 푸터 */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 flex gap-3 justify-between">
          <div>
            {hasOriginal && onRestoreOriginal && (
              <button
                onClick={onRestoreOriginal}
                className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                disabled={isProcessing}
              >
                <i className="ri-refresh-line"></i>
                원본으로 되돌리기
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              disabled={isProcessing}
            >
              취소
            </button>
            <button
              onClick={handleCropConfirm}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  처리 중...
                </>
              ) : (
                <>
                  <i className="ri-check-line"></i>
                  자르기 완료
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
