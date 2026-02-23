/**
 * 이미지를 WebP 형식으로 변환하고 압축합니다.
 * @param file 원본 이미지 파일
 * @param maxWidth 최대 너비 (기본값: 200px)
 * @param maxHeight 최대 높이 (기본값: 200px)
 * @param quality 품질 (0-1, 기본값: 0.8)
 * @returns WebP Blob
 */
export async function convertToWebP(
    file: File,
    maxWidth: number = 200,
    maxHeight: number = 200,
    quality: number = 0.8
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                // 캔버스 생성
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Canvas context를 가져올 수 없습니다.'));
                    return;
                }

                // 비율 유지하면서 리사이즈
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                // 이미지 그리기
                ctx.drawImage(img, 0, 0, width, height);

                // WebP로 변환
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('이미지 변환에 실패했습니다.'));
                        }
                    },
                    'image/webp',
                    quality
                );
            };

            img.onerror = () => {
                reject(new Error('이미지 로드에 실패했습니다.'));
            };

            img.src = e.target?.result as string;
        };

        reader.onerror = () => {
            reject(new Error('파일 읽기에 실패했습니다.'));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Supabase Storage URL에서 파일 경로 추출
 * @param url Supabase Storage 공개 URL
 * @returns 파일 경로 (예: "profiles/user-123.webp")
 */
export function extractStoragePath(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        // URL 형식: /storage/v1/object/public/images/profiles/user-123.webp
        const publicIndex = pathParts.indexOf('public');
        if (publicIndex !== -1 && publicIndex < pathParts.length - 2) {
            // 'images' 버킷 이후의 경로 반환
            return pathParts.slice(publicIndex + 2).join('/');
        }
        return null;
    } catch {
        return null;
    }
}
