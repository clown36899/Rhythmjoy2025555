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
  file: File,
  maxWidth: number,
  quality: number = 0.9
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // PNG 투명 배경을 변환할 때 흰색 배경 추가
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, width, height);

        // WebP 지원 여부에 따라 형식 결정
        const useWebP = supportsWebP();
        const mimeType = useWebP ? 'image/webp' : 'image/jpeg';
        const extension = useWebP ? '.webp' : '.jpg';
        
        // 파일명에서 확장자 제거 후 새 확장자 추가
        const fileName = file.name.replace(/\.[^.]+$/, extension);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }

            const resizedFile = new File([blob], fileName, {
              type: mimeType,
              lastModified: Date.now(),
            });

            resolve(resizedFile);
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => reject(new Error('이미지를 처리할 수 없습니다. 지원하는 형식: JPG, PNG, GIF, WebP'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다. 다른 이미지를 선택해주세요.'));
    reader.readAsDataURL(file);
  });
}

export async function createResizedImages(file: File): Promise<ResizedImages> {
  const [thumbnail, medium, full] = await Promise.all([
    resizeImage(file, 400, 0.82),  // 썸네일: 400px (리스트용)
    resizeImage(file, 1080, 0.9),  // 미디엄: 1080px (일반 상세보기용)
    resizeImage(file, 1280, 0.92), // 풀사이즈: 1280px (720p HD TV 빌보드 최적화)
  ]);

  return { thumbnail, medium, full };
}
