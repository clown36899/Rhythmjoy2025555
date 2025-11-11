import { useState, useRef, useEffect } from 'react';
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

  // 원본 해상도 그대로 자르기 (리사이즈는 나중에 createResizedImages에서 처리)
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
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
  const [aspectRatioMode, setAspectRatioMode] = useState<'free' | '3:4' | '1:1'>('free');
  const [isProcessing, setIsProcessing] = useState(false);

  const aspectRatio = aspectRatioMode === 'free' ? undefined : aspectRatioMode === '3:4' ? 3 / 4 : 1;

  // 모달이 열릴 때마다 크롭 영역 초기화
  useEffect(() => {
    if (isOpen) {
      setCrop({
        unit: '%',
        x: 25,
        y: 25,
        width: 50,
        height: 50,
      });
      setCompletedCrop(undefined);
      setAspectRatioMode('free');
    }
  }, [isOpen, imageUrl]);

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

  // 이미지 크기에 맞는 정확한 비율의 크롭 영역 계산
  const calculateCropForAspect = (mode: 'free' | '3:4' | '1:1'): Crop => {
    const img = imgRef.current;
    if (!img) {
      // 이미지 로드 전 기본값
      return { unit: '%', x: 20, y: 20, width: 60, height: 60 };
    }

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    if (mode === 'free') {
      // 자유 비율: 큰 영역
      return { unit: '%', x: 10, y: 10, width: 80, height: 80 };
    }

    // 목표 aspect ratio 계산
    const targetAspect = mode === '3:4' ? 3 / 4 : 1; // width/height

    // 이미지 중앙에 목표 비율로 크롭 영역 생성
    let cropWidth: number;
    let cropHeight: number;

    // 이미지 크기의 70%를 차지하도록 설정
    if (mode === '3:4') {
      // 3:4 세로: height 기준
      cropHeight = imgHeight * 0.7;
      cropWidth = cropHeight * targetAspect;
      
      // 너비가 이미지를 초과하면 width 기준으로 재계산
      if (cropWidth > imgWidth) {
        cropWidth = imgWidth * 0.7;
        cropHeight = cropWidth / targetAspect;
      }
    } else {
      // 1:1: 작은 쪽 기준
      const minDimension = Math.min(imgWidth, imgHeight);
      cropWidth = minDimension * 0.7;
      cropHeight = cropWidth; // 1:1
    }

    // 중앙 배치를 위한 x, y 계산 (픽셀)
    const cropX = (imgWidth - cropWidth) / 2;
    const cropY = (imgHeight - cropHeight) / 2;

    // 픽셀을 퍼센트로 변환
    return {
      unit: '%',
      x: (cropX / imgWidth) * 100,
      y: (cropY / imgHeight) * 100,
      width: (cropWidth / imgWidth) * 100,
      height: (cropHeight / imgHeight) * 100,
    };
  };

  // 비율 변경 시 크롭 영역 재설정
  const handleAspectRatioChange = (mode: 'free' | '3:4' | '1:1') => {
    setCompletedCrop(undefined);
    setAspectRatioMode(mode);
    
    // 정확한 비율의 크롭 영역 계산 및 설정
    requestAnimationFrame(() => {
      const newCrop = calculateCropForAspect(mode);
      setCrop(newCrop);
    });
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
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
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
        <div className="px-4 py-4 flex justify-center items-center bg-black" style={{ height: 'calc(90vh - 240px)' }}>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  
                  setCompletedCrop(naturalPixelCrop);
                }
              }}
              aspect={aspectRatio}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="크롭할 이미지"
                style={{ maxHeight: 'calc(90vh - 240px)', width: 'auto', height: 'auto' }}
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </div>
        </div>

        {/* 푸터 */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-4 py-3 space-y-2">
          {/* 비율 선택 */}
          <div className="flex gap-2">
            <button
              onClick={() => handleAspectRatioChange('free')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                aspectRatioMode === 'free'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              disabled={isProcessing}
            >
              자유
            </button>
            <button
              onClick={() => handleAspectRatioChange('3:4')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                aspectRatioMode === '3:4'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              disabled={isProcessing}
            >
              3:4
            </button>
            <button
              onClick={() => handleAspectRatioChange('1:1')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                aspectRatioMode === '1:1'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              disabled={isProcessing}
            >
              1:1
            </button>
          </div>
          
          {/* 액션 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              disabled={isProcessing}
            >
              취소
            </button>
            {hasOriginal && onRestoreOriginal && (
              <button
                onClick={onRestoreOriginal}
                className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                disabled={isProcessing}
              >
                원본 되돌리기
              </button>
            )}
            <button
              onClick={handleCropConfirm}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              disabled={isProcessing}
            >
              {isProcessing ? '처리 중...' : '자르기 완료'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
