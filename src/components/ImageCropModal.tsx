import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './ImageCropModal.css';
import { getVideoThumbnailOptions, downloadThumbnailAsBlob, type VideoThumbnailOption } from '../utils/videoThumbnail';
import { useModalHistory } from '../hooks/useModalHistory';

interface ImageCropModalProps {
  isOpen: boolean;
  imageUrl: string | null;  // blob URL 또는 data URL (null 허용)
  videoUrl?: string; // 동영상 URL (썸네일 추출용)
  onClose: () => void;
  onCropComplete: (croppedFile: File, croppedPreviewUrl: string, isModified: boolean) => void;
  onDiscard?: () => void;  // 취소 시 호출 (메모리 정리용)
  onChangeImage?: () => void; // 이미지 변경 (파일 선택창 열기)
  onImageUpdate?: (file: File) => void; // 썸네일 등으로 이미지 교체 시 부모에게 알림
  fileName?: string;
  originalImageUrl?: string | null; // 부모로부터 전달받는 원본 이미지 URL
  // 되돌리기 기능을 위한 Props 추가
  hasOriginal?: boolean;
  onRestoreOriginal?: () => void;
  isLoading?: boolean;
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
      async (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }

        // Clone the blob to avoid ERR_UPLOAD_FILE_CHANGED
        const arrayBuffer = await blob.arrayBuffer();
        const blobClone = new Blob([arrayBuffer], { type: 'image/jpeg' });

        const file = new File([blobClone], fileName, {
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

export default memo(function ImageCropModal({
  isOpen,
  imageUrl,
  videoUrl,
  onClose,
  onCropComplete,
  onDiscard,
  onChangeImage,
  onImageUpdate,
  fileName = 'cropped.jpg',
  originalImageUrl = null,
  hasOriginal = false,
  onRestoreOriginal,
  isLoading = false,
}: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // 크롭 전 상태 저장 (되돌리기용)
  const previousCrop = useRef<Crop | null>(null);

  // View States
  const [viewMode, setViewMode] = useState<'crop' | 'source-select' | 'thumbnail-select'>('crop');
  const [thumbnails, setThumbnails] = useState<VideoThumbnailOption[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);

  // Preview State (Separated from final complete)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);

  // Image Loading State (for visual rendering)
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    // URL이 바뀌면 로딩 상태 리셋
    if (imageUrl) {
      setIsImageLoaded(false);
    }
  }, [imageUrl]); // Removed croppedPreviewUrl to prevent spinner on crop apply

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImageUpdate) {
      onImageUpdate(file);
    }
    // Clear input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleChangeImageClick = () => {
    fileInputRef.current?.click();
  };

  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [isModified, setIsModified] = useState(false);

  // 원본 이미지 URL 저장 (되돌리기용)
  const [originalImageUrlForRestore, setOriginalImageUrlForRestore] = useState<string | null>(null);

  const aspectRatio = aspectRatioMode === 'free' ? undefined : aspectRatioMode === '3:4' ? 3 / 4 : 1;

  // 모달이 열릴 때마다 초기화
  useEffect(() => {
    if (isOpen) {
      setViewMode('crop');
      setCrop({
        unit: '%',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      setCompletedCrop(undefined);
      setAspectRatioMode('free');
      setIsModified(false);
      setCroppedFile(null);
      setCroppedPreviewUrl(null);
      // 부모로부터 받은 원본 URL을 사용
      setOriginalImageUrlForRestore(originalImageUrl || null);
    }
  }, [isOpen]); // originalImageUrl 변경 시 초기화 로직 제거하여 자르기 과정 방해 방지

  // Enable mobile back gesture to close modal
  useModalHistory(isOpen, onClose);

  const loadThumbnails = async () => {
    if (!videoUrl) return;
    setLoadingThumbnails(true);
    try {
      const options = await getVideoThumbnailOptions(videoUrl);
      setThumbnails(options);
      setViewMode('thumbnail-select');
    } catch (e) {
      console.error(e);
      alert('썸네일을 불러오는데 실패했습니다.');
    } finally {
      setLoadingThumbnails(false);
    }
  };

  const handleThumbnailSelect = async (url: string) => {
    setIsProcessing(true);
    try {
      const blob = await downloadThumbnailAsBlob(url);
      if (blob && onImageUpdate) {
        const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
        onImageUpdate(file);
        // 부모가 imageUrl을 업데이트하면 useEffect에 의해 'crop' 모드로 전환됨
      } else {
        alert('이미지를 다운로드할 수 없습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 1: Apply Crop (Cut) -> Show Preview
  const handleApplyCrop = async () => {
    if (!imgRef.current) return;

    // completedCrop이 없으면 현재 crop 상태(퍼센트)를 기반으로 계산
    let pixelCrop = completedCrop;

    if (!pixelCrop && crop.width && crop.height) {
      const img = imgRef.current;
      pixelCrop = {
        unit: 'px',
        x: (crop.x / 100) * img.naturalWidth,
        y: (crop.y / 100) * img.naturalHeight,
        width: (crop.width / 100) * img.naturalWidth,
        height: (crop.height / 100) * img.naturalHeight,
      };
    }

    if (!pixelCrop) {
      alert('크롭 영역을 선택해주세요.');
      return;
    }

    setIsProcessing(true);

    // 크롭 전 원본 이미지 URL 저장 (되돌리기용)
    if (!originalImageUrlForRestore && imageUrl) {
      setOriginalImageUrlForRestore(imageUrl);
    }
    previousCrop.current = { ...crop };

    try {
      const { file, previewUrl } = await createCroppedImage(
        imgRef.current,
        pixelCrop,
        fileName
      );

      // Detect modification
      const isFullWidth = imgRef.current ? Math.abs(pixelCrop.width - imgRef.current.naturalWidth) < 2 : false;
      const isFullHeight = imgRef.current ? Math.abs(pixelCrop.height - imgRef.current.naturalHeight) < 2 : false;
      const modified = !(isFullWidth && isFullHeight);

      setCroppedFile(file);
      setCroppedPreviewUrl(previewUrl);
      setIsModified(modified);

      // 크롭 그리드를 전체 이미지로 리셋
      setCrop({
        unit: '%',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    } catch (error) {
      console.error('이미지 크롭 실패:', error);
      alert('이미지 크롭 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Restore (Back to Edit)
  const handleRestoreCrop = () => {
    // 원본 이미지 URL로 복원
    if (originalImageUrlForRestore && onImageUpdate) {
      // 원본 이미지를 다시 로드
      fetch(originalImageUrlForRestore)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], fileName, { type: blob.type });
          onImageUpdate(file);
        })
        .catch(err => console.error('Failed to restore original image:', err));
    }

    // 이전 크롭 상태 복원
    if (previousCrop.current) {
      setCrop(previousCrop.current);
    }

    // 크롭된 미리보기 제거
    setCroppedPreviewUrl(null);
    setCroppedFile(null);

    // 원본 URL 리셋
    setOriginalImageUrlForRestore(null);
  };

  const handleCancel = () => {
    if (viewMode === 'thumbnail-select' && !imageUrl) {
      setViewMode('source-select'); // Should theoretically not reachable as we removed source-select view, but for safety
      return;
    }
    if (viewMode === 'thumbnail-select' && imageUrl) {
      setViewMode('crop');
      return;
    }

    // 크롭된 이미지가 있으면 저장하지 않고 닫기
    if (onDiscard) {
      onDiscard();
    }
    onClose();
  };

  // 저장 버튼 핸들러 - 크롭된 이미지를 부모 컴포넌트로 전달
  const handleSave = () => {
    if (croppedFile && croppedPreviewUrl) {
      onCropComplete(croppedFile, croppedPreviewUrl, isModified);
      onClose();
    }
  };

  // 이미지 크기에 맞는 정확한 비율의 크롭 영역 계산
  const calculateCropForAspect = (mode: 'free' | '3:4' | '1:1'): Crop => {
    const img = imgRef.current;
    if (!img) {
      return { unit: '%', x: 20, y: 20, width: 60, height: 60 };
    }

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    if (mode === 'free') {
      return { unit: '%', x: 10, y: 10, width: 80, height: 80 };
    }

    const targetAspect = mode === '3:4' ? 3 / 4 : 1;
    let cropWidth: number;
    let cropHeight: number;

    const imgAspect = imgWidth / imgHeight;

    if (imgAspect > targetAspect) {
      cropHeight = imgHeight;
      cropWidth = cropHeight * targetAspect;
    } else {
      cropWidth = imgWidth;
      cropHeight = cropWidth / targetAspect;
    }

    const cropX = (imgWidth - cropWidth) / 2;
    const cropY = (imgHeight - cropHeight) / 2;

    return {
      unit: '%',
      x: (cropX / imgWidth) * 100,
      y: (cropY / imgHeight) * 100,
      width: (cropWidth / imgWidth) * 100,
      height: (cropHeight / imgHeight) * 100,
    };
  };

  const handleAspectRatioChange = (mode: 'free' | '3:4' | '1:1') => {
    setCompletedCrop(undefined);
    setAspectRatioMode(mode);
    requestAnimationFrame(() => {
      const newCrop = calculateCropForAspect(mode);
      setCrop(newCrop);
    });
  };


  if (!isOpen) return null;

  return createPortal(
    <div className="crop-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="crop-modal-container" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="crop-modal-header">
          <h2 className="crop-modal-title">
            <i className="ri-crop-line crop-modal-title-icon"></i>
            {croppedPreviewUrl
              ? '편집 결과 확인'
              : (viewMode === 'thumbnail-select' ? '썸네일 선택' : '이미지 편집')}
          </h2>
          <button
            onClick={handleCancel}
            className="crop-modal-close-btn"
            disabled={isProcessing}
          >
            <i className="ri-close-line crop-modal-close-icon"></i>
          </button>
        </div>

        {/* 메인 컨텐츠 영역 */}
        <div className="crop-content-area" style={{ position: 'relative', minHeight: '300px' }}>
          {/* 크롭 UI - 항상 렌더링하되 로딩 중에는 숨김 (onLoad 트리거 위해) */}
          {imageUrl ? (
            <div style={{
              opacity: (isLoading || (imageUrl && imageUrl.startsWith('http') && !isImageLoaded)) ? 0 : 1,
              width: '100%',
              height: '100%'
            }}>
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(displayPixelCrop) => {
                  if (displayPixelCrop.width && displayPixelCrop.height && imgRef.current) {
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
                className="ReactCrop"
              >
                <img
                  ref={imgRef}
                  src={croppedPreviewUrl || imageUrl}
                  alt="크롭할 이미지"
                  className="crop-image"
                  crossOrigin="anonymous"
                  onLoad={() => setIsImageLoaded(true)}
                />
              </ReactCrop>
            </div>
          ) : (
            /* 3. 이미지 없음 (Placeholder) */
            <div
              className="crop-placeholder-container"
              onClick={handleChangeImageClick}
            >
              <div className="crop-placeholder-icon-bg">
                <i className="ri-image-add-line crop-placeholder-icon"></i>
              </div>
              <p className="crop-placeholder-text">편집할 이미지가 없습니다</p>
              <button
                className="crop-upload-link"
              >
                이미지 업로드
              </button>
            </div>
          )
          }

          {/* 썸네일 선택 오버레이 */}
          {viewMode === 'thumbnail-select' && (
            <div className="crop-thumbnail-overlay">
              <div className="crop-thumbnail-header">
                <h3 className="crop-thumbnail-title">썸네일 선택</h3>
                <button onClick={() => setViewMode('crop')} className="crop-thumbnail-close">
                  <i className="ri-close-line crop-icon-2xl"></i>
                </button>
              </div>
              <div className="crop-thumbnail-list">
                {loadingThumbnails ? (
                  <div className="crop-loading-container">
                    <div className="crop-spinner"></div>
                  </div>
                ) : thumbnails.length > 0 ? (
                  <div className="crop-thumbnail-grid">
                    {thumbnails.map((thumb, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleThumbnailSelect(thumb.url)}
                        className="crop-thumbnail-item group"
                      >
                        <img src={thumb.url} alt={thumb.label} className="crop-thumbnail-img" />
                        <div className="crop-thumbnail-overlay-info group-hover:opacity-100">
                          <span className="crop-thumbnail-label">{thumb.label}</span>
                          <span className="crop-thumbnail-select-text">선택</span>
                        </div>
                        <span className="crop-thumbnail-badge">
                          {thumb.quality.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="crop-empty-state">
                    <i className="ri-error-warning-line crop-empty-icon"></i>
                    <p className="crop-empty-text">가져올 수 있는 썸네일이 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Area */}
        <div className="crop-modal-footer">

          {/* 편집 컨트롤 - 항상 표시 */}
          <>
            {/* Aspect Ratio Controls */}
            <div className="crop-button-row" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
              <button
                onClick={() => handleAspectRatioChange('free')}
                className={`crop-ratio-btn ${aspectRatioMode === 'free' ? 'crop-ratio-btn-active' : 'crop-ratio-btn-inactive'}`}
                disabled={!imageUrl || isProcessing}
              >
                자유
              </button>
              <button
                onClick={() => handleAspectRatioChange('3:4')}
                className={`crop-ratio-btn ${aspectRatioMode === '3:4' ? 'crop-ratio-btn-active' : 'crop-ratio-btn-inactive'}`}
                disabled={!imageUrl || isProcessing}
              >
                3:4
              </button>
              <button
                onClick={() => handleAspectRatioChange('1:1')}
                className={`crop-ratio-btn ${aspectRatioMode === '1:1' ? 'crop-ratio-btn-active' : 'crop-ratio-btn-inactive'}`}
                disabled={!imageUrl || isProcessing}
              >
                1:1
              </button>
            </div>

            <div className="crop-footer-content">
              {/* Source Selection */}
              <div className="grid grid-cols-2 gap-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  onClick={onChangeImage}
                  className="crop-action-btn crop-change-btn"
                  style={{ justifyContent: 'center' }}
                >
                  <i className="ri-upload-cloud-2-line crop-icon-lg"></i>
                  업로드
                </button>
                {videoUrl && ( // Only show thumbnail button if video URL is provided
                  <button
                    onClick={loadThumbnails}
                    className="crop-action-btn crop-thumbnail-btn"
                    disabled={!videoUrl}
                    style={{ justifyContent: 'center' }}
                  >
                    <i className="ri-youtube-fill crop-icon-lg"></i>
                    썸네일 가져오기
                  </button>
                )}
              </div>

              {/* Apply Action */}
              <div className="crop-button-row">
                {/* 되돌리기 버튼 - 원본 이미지 복원 가능할 때 표시 */}
                {(hasOriginal || originalImageUrlForRestore) && (
                  <button
                    onClick={() => {
                      if (onRestoreOriginal) {
                        onRestoreOriginal();
                      } else {
                        handleRestoreCrop();
                      }
                    }}
                    className="crop-action-btn crop-cancel-btn"
                    disabled={isProcessing}
                  >
                    <i className="ri-arrow-go-back-line" style={{ marginRight: '0.5rem' }}></i>
                    되돌리기
                  </button>
                )}

                <button
                  onClick={handleApplyCrop} // Changed to Apply Crop
                  className="crop-action-btn crop-apply-btn"
                  disabled={isProcessing || !imageUrl}
                >
                  {isProcessing ? '처리 중...' : '자르기'}
                </button>

                {/* 저장 버튼 - 크롭 후에만 표시 */}
                {croppedPreviewUrl && (
                  <button
                    onClick={handleSave}
                    className="crop-action-btn crop-save-btn"
                    disabled={isProcessing}
                    style={{ backgroundColor: '#4CAF50' }}
                  >
                    <i className="ri-check-line" style={{ marginRight: '0.5rem' }}></i>
                    저장
                  </button>
                )}
              </div>
            </div>
          </>

        </div>

        {/* Loading Overlay Sibling (Covers Entire Modal) */}
        {(isLoading || (imageUrl && imageUrl.startsWith('http') && !isImageLoaded)) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent
            display: 'flex',
            flexDirection: 'column', // Stack spinner and text
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 'inherit', // follow modal radius
            gap: '1rem'
          }}>
            <div
              className="crop-spinner"
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(255,255,255,0.3)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%'
              }}
            ></div>
            <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: 500 }}>
              이미지 불러오는 중...
            </span>
          </div>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
    </div>,
    document.body
  );
});
