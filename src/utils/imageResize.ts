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
  targetSize: number,
  quality: number = 0.9,
  fileName: string = 'image.jpg',
  mode: 'width' | 'min' | 'height' = 'width'
): Promise<File> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const isDataUrl = typeof fileOrDataUrl === 'string';



    function processImage(this: HTMLImageElement) {



      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error(`[🖼️ 리사이즈 ${targetSize}px] ❌ Canvas context 생성 실패`);
        reject(new Error('Canvas context not available'));
        return;
      }

      let width = this.width;
      let height = this.height;

      if (mode === 'width') {
        // 기존 가로 맥시멈 기준
        if (width > targetSize) {
          height = (height * targetSize) / width;
          width = targetSize;
        }
      } else if (mode === 'min') {
        // 작은 쪽 길이를 targetSize에 맞춤 (Aspect Ratio 유지하며 가득 채우기 용)
        const ratio = Math.max(targetSize / width, targetSize / height);
        width = width * ratio;
        height = height * ratio;
      } else if (mode === 'height') {
        // 세로 길이 기준
        if (height > targetSize) {
          width = (width * targetSize) / height;
          height = targetSize;
        }
      }



      canvas.width = width;
      canvas.height = height;

      // PNG 투명 배경을 변환할 때 흰색 배경 추가
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(this, 0, 0, width, height);


      // WebP 지원 여부에 따라 형식 결정
      const useWebP = supportsWebP();
      const mimeType = useWebP ? 'image/webp' : 'image/jpeg';
      const extension = useWebP ? 'webp' : 'jpg';



      // 파일명 결정 - 확장자를 WebP로 강제 변경
      const baseFileName = isDataUrl
        ? fileName.replace(/\.[^.]+$/, '')
        : (fileOrDataUrl as File).name.replace(/\.[^.]+$/, '');
      const finalFileName = `${baseFileName}.${extension}`;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error(`[🖼️ 리사이즈 ${targetSize}px] ❌ Blob 생성 실패`);
            reject(new Error('Failed to create blob'));
            return;
          }




          const resizedFile = new File([blob], finalFileName, {
            type: mimeType,
            lastModified: Date.now(),
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
      console.error(`[🖼️ 리사이즈 ${targetSize}px] ❌ 이미지 로드 실패 (${elapsed.toFixed(0)}ms)`, error);
      reject(new Error('이미지를 처리할 수 없습니다. 지원하는 형식: JPG, PNG, GIF, WebP'));
    };
    img.src = sourceUrl;
  });
}

// Helper to load image once
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

// Optimized resize function taking pre-loaded image
async function resizeLoadedImage(
  img: HTMLImageElement,
  targetSize: number,
  quality: number,
  fileName: string,
  mode: 'width' | 'min' | 'height' = 'width'
): Promise<File> {
  return new Promise((resolve, reject) => {
    // ... (Similar canvas logic but using existing img)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context failure'));
      return;
    }

    let width = img.width;
    let height = img.height;

    if (mode === 'width') {
      if (width > targetSize) {
        height = (height * targetSize) / width;
        width = targetSize;
      }
    } else if (mode === 'min') {
      const ratio = Math.max(targetSize / width, targetSize / height);
      width = width * ratio;
      height = height * ratio;
    } else if (mode === 'height') {
      if (height > targetSize) {
        width = (width * targetSize) / height;
        height = targetSize;
      }
    }

    canvas.width = Math.round(width);
    canvas.height = Math.round(height);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const useWebP = supportsWebP();
    const mimeType = useWebP ? 'image/webp' : 'image/jpeg';
    const extension = useWebP ? 'webp' : 'jpg';
    const finalFileName = `${fileName.replace(/\.[^.]+$/, '')}.${extension}`;

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Blob creation failed'));
          return;
        }
        const resizedFile = new File([blob], finalFileName, {
          type: mimeType,
          lastModified: Date.now(),
        });
        resolve(resizedFile);
      },
      mimeType,
      quality
    );
  });
}

export async function createResizedImages(
  fileOrDataUrl: File | string,
  _onProgress?: (progress: number, step: string) => void,
  fileName: string = 'image.jpg'
): Promise<ResizedImages> {

  const isDataUrl = typeof fileOrDataUrl === 'string';
  let objectUrl: string | null = null;

  try {
    let src = fileOrDataUrl as string;
    if (!isDataUrl && fileOrDataUrl instanceof File) {
      objectUrl = URL.createObjectURL(fileOrDataUrl);
      src = objectUrl;
    }

    const img = await loadImage(src);

    // Run sequentially to reduce memory pressure, yielding to main thread between steps to prevent UI freeze
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    const micro = await resizeLoadedImage(img, 100, 0.7, fileName);
    await yieldToMain();

    const thumbnail = await resizeLoadedImage(img, 300, 0.75, fileName);
    await yieldToMain();

    const medium = await resizeLoadedImage(img, 650, 0.9, fileName);
    await yieldToMain();

    const full = await resizeLoadedImage(img, 1300, 0.85, fileName);

    if (objectUrl) URL.revokeObjectURL(objectUrl);



    return { micro, thumbnail, medium, full };
  } catch (error) {
    console.error('Resize failed:', error);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

// Helper function to check if a file is an image
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}
