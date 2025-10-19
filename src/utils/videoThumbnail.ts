// 영상 URL에서 썸네일 이미지 URL 추출

export interface VideoThumbnailOption {
  url: string;
  label: string;
  quality: 'high' | 'medium' | 'low';
}

// 여러 장면의 썸네일 옵션 가져오기 (YouTube만 지원)
export async function getVideoThumbnailOptions(videoUrl: string): Promise<VideoThumbnailOption[]> {
  if (!videoUrl) return [];

  // YouTube 썸네일 추출 (일반 영상 및 쇼츠)
  const youtubeMatch = videoUrl.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|(?:shorts\/))|(?:.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  );
  
  if (youtubeMatch && youtubeMatch[1]) {
    const videoId = youtubeMatch[1];
    const thumbnails: VideoThumbnailOption[] = [];
    
    // YouTube는 0.jpg, 1.jpg, 2.jpg, 3.jpg 형식으로 4개의 자동 생성 프레임 제공
    // 그리고 maxresdefault, hqdefault도 제공
    
    // 먼저 고화질 옵션 확인
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    try {
      const response = await fetch(maxResUrl);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 5000) {
          thumbnails.push({
            url: maxResUrl,
            label: '대표 썸네일 (고화질)',
            quality: 'high'
          });
        }
      }
    } catch (e) {
      // 무시
    }
    
    // 4개의 자동 생성 프레임 (0, 1, 2, 3)
    for (let i = 0; i < 4; i++) {
      thumbnails.push({
        url: `https://img.youtube.com/vi/${videoId}/${i}.jpg`,
        label: `장면 ${i + 1}`,
        quality: 'medium'
      });
    }
    
    // hqdefault 추가 (항상 존재)
    thumbnails.push({
      url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      label: '기본 썸네일',
      quality: 'medium'
    });
    
    return thumbnails;
  }

  // Vimeo는 단일 썸네일만 제공
  const vimeoMatch = videoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    try {
      const response = await fetch(`https://vimeo.com/api/v2/video/${videoId}.json`);
      if (response.ok) {
        const data = await response.json();
        if (data && data[0]) {
          return [
            {
              url: data[0].thumbnail_large || data[0].thumbnail_medium,
              label: '대표 썸네일',
              quality: 'high'
            }
          ];
        }
      }
    } catch (e) {
      console.error('Vimeo 썸네일 추출 실패:', e);
    }
  }

  return [];
}

// 단일 썸네일 가져오기 (기존 호환성)
export async function getVideoThumbnail(videoUrl: string): Promise<string | null> {
  const options = await getVideoThumbnailOptions(videoUrl);
  return options.length > 0 ? options[0].url : null;
}

// 썸네일 URL을 Blob으로 다운로드 (Supabase 업로드용)
export async function downloadThumbnailAsBlob(thumbnailUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(thumbnailUrl);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return blob;
  } catch (e) {
    console.error('썸네일 다운로드 실패:', e);
    return null;
  }
}
