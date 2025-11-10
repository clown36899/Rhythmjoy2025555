import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

interface ImageCropModalProps {
  isOpen: boolean;
  imageUrl: string;  // blob URL 또는 data URL
  onClose: () => void;
  onCropComplete: (croppedFile: File, croppedPreviewUrl: string) => void;
  onDiscard?: () => void;  // 취소 시 호출 (메모리 정리용)
  fileName?: string;
}

async function createCroppedImage(
  imageSrc: string,
  pixelCrop: Area,
  fileName: string
): Promise<{ file: File; previewUrl: string }> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
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
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectRatioMode, setAspectRatioMode] = useState<'free' | '16:9' | '1:1'>('16:9');
  const [isProcessing, setIsProcessing] = useState(false);

  const aspectRatio = aspectRatioMode === 'free' ? undefined : aspectRatioMode === '16:9' ? 16 / 9 : 1;

  const onCropCompleteCallback = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropConfirm = async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      const { file, previewUrl } = await createCroppedImage(
        imageUrl,
        croppedAreaPixels,
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

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90 p-4"
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
        <div className="relative w-full" style={{ height: '500px' }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteCallback}
            style={{
              containerStyle: {
                backgroundColor: '#000',
              },
            }}
          />
        </div>

        {/* 컨트롤 */}
        <div className="px-6 py-4 space-y-4">
          {/* 줌 슬라이더 */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              <i className="ri-zoom-in-line mr-1"></i>
              확대/축소
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
              disabled={isProcessing}
            />
          </div>

          {/* 비율 선택 */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              <i className="ri-aspect-ratio-line mr-1"></i>
              비율
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setAspectRatioMode('free')}
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
                onClick={() => setAspectRatioMode('16:9')}
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
                onClick={() => setAspectRatioMode('1:1')}
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
