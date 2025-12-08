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

    // YouTube 썸네일 URL 생성
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const sdResUrl = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
    const hqResUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const mqResUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    const defResUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;

    // 우선순위대로 배열 반환 (실제 존재 여부는 나중에 체크하거나 이미지 로드 시 결정됨)
    // 여기서는 가장 높은 품질 하나만 반환하지 않고, 호출자가 선택할 수 있도록 하거나
    // getVideoThumbnail 함수가 첫 번째 유효한 것을 찾도록 로직을 수정해야 함.
    // 하지만 현재 구조상 리스트를 반환하므로 후보군을 다 넣어줌.

    thumbnails.push({
      url: maxResUrl,
      label: '최고화질 (MaxRes)',
      quality: 'high'
    });
    thumbnails.push({
      url: sdResUrl,
      label: '고화질 (Standard)',
      quality: 'high'
    });
    thumbnails.push({
      url: hqResUrl,
      label: '일반화질 (HQ)',
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

// 단일 썸네일 가져오기 (가장 높은 화질 자동 선택)
export async function getVideoThumbnail(videoUrl: string): Promise<string | null> {
  if (!videoUrl) return null;

  // YouTube ID 추출
  const youtubeMatch = videoUrl.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|(?:shorts\/))|(?:.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  );

  if (!youtubeMatch || !youtubeMatch[1]) return null;
  const videoId = youtubeMatch[1];

  // 1. MaxRes 시도
  const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const response = await fetch(maxResUrl, { mode: 'cors' });
    if (response.ok) return maxResUrl;
  } catch (e) {
    console.log("MaxRes thumbnail not found or CORS error, trying HQ");
  }

  // 2. HQ 시도 (fallback)
  const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const response = await fetch(hqUrl, { mode: 'cors' });
    if (response.ok) return hqUrl;
  } catch (e) {
    console.error("HQ thumbnail fetch failed", e);
  }

  return null;
}

// 썸네일 URL을 Blob으로 다운로드 (Supabase 업로드용)
export async function downloadThumbnailAsBlob(thumbnailUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(thumbnailUrl, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    return blob;
  } catch (e) {
    console.error('썸네일 다운로드 실패:', e);
    return null;
  }
}
