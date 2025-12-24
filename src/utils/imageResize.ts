export interface ResizedImages {
  micro: File;
  thumbnail: File;
  medium: File;
  full: File;
}

// WebP 지원 여부 확인
function supportsWebP(): boolean {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext || !canvas.getContext('2d')) {
    return false;
  }
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

export async function resizeImage(
  fileOrDataUrl: File | string,
  maxWidth: number,
  quality: number = 0.9,
  fileName: string = 'image.jpg'
): Promise<File> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const isDataUrl = typeof fileOrDataUrl === 'string';

    console.log(`[🖼️ 리사이즈 ${maxWidth}px] 시작`, {
      source: isDataUrl ? 'base64' : 'File',
      fileName: isDataUrl ? fileName : (fileOrDataUrl as File).name,
      dataSize: isDataUrl ? `${(fileOrDataUrl.length / 1024).toFixed(0)}KB` : `${((fileOrDataUrl as File).size / 1024).toFixed(0)}KB`,
      fileType: isDataUrl ? 'base64' : (fileOrDataUrl as File).type
    });

    function processImage(this: HTMLImageElement) {
      const elapsed = performance.now() - startTime;
      console.log(`[🖼️ 리사이즈 ${maxWidth}px] 이미지 로드 완료 (${elapsed.toFixed(0)}ms)`, {
        originalWidth: this.width,
        originalHeight: this.height
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error(`[🖼️ 리사이즈 ${maxWidth}px] ❌ Canvas context 생성 실패`);
        reject(new Error('Canvas context not available'));
        return;
      }

      let width = this.width;
      let height = this.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      console.log(`[🖼️ 리사이즈 ${maxWidth}px] Canvas 설정`, {
        targetWidth: Math.round(width),
        targetHeight: Math.round(height)
      });

      canvas.width = width;
      canvas.height = height;

      // PNG 투명 배경을 변환할 때 흰색 배경 추가
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(this, 0, 0, width, height);
      console.log(`[🖼️ 리사이즈 ${maxWidth}px] Canvas에 이미지 그리기 완료`);

      // WebP 지원 여부에 따라 형식 결정
      const useWebP = supportsWebP();
      const mimeType = useWebP ? 'image/webp' : 'image/jpeg';
      const extension = useWebP ? 'webp' : 'jpg';

      console.log(`[🖼️ 리사이즈 ${maxWidth}px] 출력 형식`, {
        useWebP,
        mimeType,
        quality
      });

      // 파일명 결정 - 확장자를 WebP로 강제 변경
      const baseFileName = isDataUrl
        ? fileName.replace(/\.[^.]+$/, '')
        : (fileOrDataUrl as File).name.replace(/\.[^.]+$/, '');
      const finalFileName = `${baseFileName}.${extension}`;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error(`[🖼️ 리사이즈 ${maxWidth}px] ❌ Blob 생성 실패`);
            reject(new Error('Failed to create blob'));
            return;
          }

          const elapsed = performance.now() - startTime;
          console.log(`[🖼️ 리사이즈 ${maxWidth}px] Blob 생성 완료 (${elapsed.toFixed(0)}ms)`, {
            blobSize: `${(blob.size / 1024).toFixed(0)}KB`,
            blobType: blob.type
          });

          const resizedFile = new File([blob], finalFileName, {
            type: mimeType,
            lastModified: Date.now(),
          });

          console.log(`[🖼️ 리사이즈 ${maxWidth}px] ✅ 완료 (총 ${elapsed.toFixed(0)}ms)`, {
            fileName: resizedFile.name,
            fileSize: `${(resizedFile.size / 1024).toFixed(0)}KB`,
            fileType: resizedFile.type
          });

          resolve(resizedFile);
        },
        mimeType,
        quality
      );
    }

    // URL.createObjectURL을 사용하여 메모리 효율적으로 이미지 로드
    let objectUrl: string | null = null;
    let sourceUrl: string;

    if (isDataUrl) {
      sourceUrl = fileOrDataUrl as string;
    } else {
      objectUrl = URL.createObjectURL(fileOrDataUrl as File);
      sourceUrl = objectUrl;
    }

    const img = new Image();
    img.onload = () => {
      processImage.call(img);
      if (objectUrl) URL.revokeObjectURL(objectUrl); // 메모리 해제
    };
    img.onerror = (error) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl); // 메모리 해제
      const elapsed = performance.now() - startTime;
      console.error(`[🖼️ 리사이즈 ${maxWidth}px] ❌ 이미지 로드 실패 (${elapsed.toFixed(0)}ms)`, error);
      reject(new Error('이미지를 처리할 수 없습니다. 지원하는 형식: JPG, PNG, GIF, WebP'));
    };
    img.src = sourceUrl;
  });
}

export async function createResizedImages(
  fileOrDataUrl: File | string,
  onProgress?: (progress: number, step: string) => void,
  fileName: string = 'image.jpg'
): Promise<ResizedImages> {
  const startTime = performance.now();
  const isDataUrl = typeof fileOrDataUrl === 'string';

  console.log('[🎨 이미지 리사이즈] 시작', {
    source: isDataUrl ? 'base64' : 'File',
    fileName: isDataUrl ? fileName : (fileOrDataUrl as File).name,
    dataSize: isDataUrl ? `${(fileOrDataUrl.length / 1024).toFixed(0)}KB` : `${((fileOrDataUrl as File).size / 1024).toFixed(0)}KB`,
    type: isDataUrl ? 'base64' : (fileOrDataUrl as File).type
  });

  try {
    let sourceUrl = fileOrDataUrl;
    let objectUrl: string | null = null;

    if (!isDataUrl && fileOrDataUrl instanceof File) {
      objectUrl = URL.createObjectURL(fileOrDataUrl);
      sourceUrl = objectUrl;
    }

    const [micro, thumbnail, medium, full] = await Promise.all([
      resizeImage(sourceUrl, 100, 0.7, fileName),
      resizeImage(sourceUrl, 300, 0.75, fileName),
      resizeImage(sourceUrl, 1080, 0.8, fileName),
      resizeImage(sourceUrl, 1280, 0.85, fileName),
    ]);

    if (objectUrl) URL.revokeObjectURL(objectUrl);

    const elapsed = performance.now() - startTime;
    console.log(`[🎨 이미지 리사이즈] ✅ 완료 (총 ${elapsed.toFixed(0)}ms)`, {
      micro: `${(micro.size / 1024).toFixed(0)}KB`,
      thumbnail: `${(thumbnail.size / 1024).toFixed(0)}KB`,
      medium: `${(medium.size / 1024).toFixed(0)}KB`,
      full: `${(full.size / 1024).toFixed(0)}KB`,
    });

    return { micro, thumbnail, medium, full };
  } catch (error) {
    console.error('[🎨 이미지 리사이즈] ❌ 실패', error);
    throw error;
  }
}

// Helper function to check if a file is an image
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}
