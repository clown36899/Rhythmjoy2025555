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

  // 1080px 최대 크기 제한 (메모리 절약)
  const maxSize = 1080;
  let width = pixelCrop.width;
  let height = pixelCrop.height;

  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height
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
  fileName = 'cropped.jpg',
}: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspectRatioMode, setAspectRatioMode] = useState<'free' | '16:9' | '1:1'>('16:9');
  const [isProcessing, setIsProcessing] = useState(false);

  const aspectRatio = aspectRatioMode === 'free' ? undefined : aspectRatioMode === '16:9' ? 16 / 9 : 1;

  // % → 픽셀 변환
  const convertToPixelCrop = (percentCrop: Crop, imageWidth: number, imageHeight: number): PixelCrop => {
    return {
      unit: 'px',
      x: (percentCrop.x * imageWidth) / 100,
      y: (percentCrop.y * imageHeight) / 100,
      width: (percentCrop.width * imageWidth) / 100,
      height: (percentCrop.height * imageHeight) / 100,
    };
  };

  const handleCropConfirm = async () => {
    if (!completedCrop || !imgRef.current) {
      alert('크롭 영역을 선택해주세요.');
      return;
    }

    setIsProcessing(true);
    try {
      const { file, previewUrl } = await createCroppedImage(
        imgRef.current,
        completedCrop,
        fileName
      );

      onCropComplete(file, previewUrl);
      onClose();
    } catch (error) {
      console.error('이미지 크롭 실패:', error);
      alert('이미지 크롭 중 오류가 발생했습니다.');
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
            onComplete={(c) => {
              if (imgRef.current) {
                const pixelCrop = convertToPixelCrop(
                  c,
                  imgRef.current.naturalWidth,
                  imgRef.current.naturalHeight
                );
                setCompletedCrop(pixelCrop);
              }
            }}
            aspect={aspectRatio}
            minWidth={50}
            minHeight={50}
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
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
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
    </div>,
    document.body
  );
}
