export interface ResizedImages {
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
      const extension = useWebP ? '.webp' : '.jpg';
      
      console.log(`[🖼️ 리사이즈 ${maxWidth}px] 출력 형식`, {
        useWebP,
        mimeType,
        quality
      });
      
      // 파일명 결정
      const finalFileName = isDataUrl ? fileName.replace(/\.[^.]+$/, extension) : (fileOrDataUrl as File).name.replace(/\.[^.]+$/, extension);

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
    
    // base64인 경우 직접 Image 로드 (FileReader 우회)
    if (isDataUrl) {
      console.log(`[🖼️ 리사이즈 ${maxWidth}px] base64 데이터 직접 사용 (FileReader 우회)`);
      const img = new Image();
      img.onload = () => processImage.call(img);
      img.onerror = (error) => {
        const elapsed = performance.now() - startTime;
        console.error(`[🖼️ 리사이즈 ${maxWidth}px] ❌ 이미지 로드 실패 (${elapsed.toFixed(0)}ms)`, error);
        reject(new Error('이미지를 처리할 수 없습니다. 지원하는 형식: JPG, PNG, GIF, WebP'));
      };
      img.src = fileOrDataUrl as string;
    } else {
      // File 객체인 경우 FileReader 사용
      console.log(`[🖼️ 리사이즈 ${maxWidth}px] FileReader로 File 객체 읽기 시작`);
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log(`[🖼️ 리사이즈 ${maxWidth}px] 파일 읽기 완료`);
        const img = new Image();
        img.onload = () => processImage.call(img);
        img.onerror = (error) => {
          const elapsed = performance.now() - startTime;
          console.error(`[🖼️ 리사이즈 ${maxWidth}px] ❌ 이미지 로드 실패 (${elapsed.toFixed(0)}ms)`, error);
          reject(new Error('이미지를 처리할 수 없습니다. 지원하는 형식: JPG, PNG, GIF, WebP'));
        };
        img.src = e.target?.result as string;
      };
      
      reader.onerror = (error) => {
        const elapsed = performance.now() - startTime;
        console.error(`[🖼️ 리사이즈 ${maxWidth}px] ❌ 파일 읽기 실패 (${elapsed.toFixed(0)}ms)`, error);
        reject(new Error('파일을 읽을 수 없습니다. 다른 이미지를 선택해주세요.'));
      };
      reader.readAsDataURL(fileOrDataUrl as File);
    }
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
    // 순차 처리 (모바일 호환성)
    onProgress?.(0, '썸네일 생성 중...');
    const thumbnail = await resizeImage(fileOrDataUrl, 400, 0.82, fileName);
    console.log('[🎨 이미지 리사이즈] ✅ 썸네일 완료', { size: `${(thumbnail.size / 1024).toFixed(0)}KB` });
    
    onProgress?.(33, '미디엄 생성 중...');
    const medium = await resizeImage(fileOrDataUrl, 1080, 0.9, fileName);
    console.log('[🎨 이미지 리사이즈] ✅ 미디엄 완료', { size: `${(medium.size / 1024).toFixed(0)}KB` });
    
    onProgress?.(66, '풀사이즈 생성 중...');
    const full = await resizeImage(fileOrDataUrl, 1280, 0.92, fileName);
    console.log('[🎨 이미지 리사이즈] ✅ 풀사이즈 완료', { size: `${(full.size / 1024).toFixed(0)}KB` });
    
    onProgress?.(100, '완료');

    const elapsed = performance.now() - startTime;
    console.log(`[🎨 이미지 리사이즈] ✅ 모든 크기 생성 완료 (총 ${elapsed.toFixed(0)}ms)`, {
      thumbnailSize: `${(thumbnail.size / 1024).toFixed(0)}KB`,
      mediumSize: `${(medium.size / 1024).toFixed(0)}KB`,
      fullSize: `${(full.size / 1024).toFixed(0)}KB`
    });

    return { thumbnail, medium, full };
  } catch (error) {
    const elapsed = performance.now() - startTime;
    console.error(`[🎨 이미지 리사이즈] ❌ 실패 (${elapsed.toFixed(0)}ms)`, error);
    throw error;
  }
}
