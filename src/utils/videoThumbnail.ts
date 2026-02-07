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
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|(?:shorts\/))|(?:.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );

  if (youtubeMatch && youtubeMatch[1]) {
    const videoId = youtubeMatch[1];
    const thumbnails: VideoThumbnailOption[] = [];

    // YouTube 썸네일 URL 생성
    const maxResUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    const sdResUrl = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
    const hqResUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // 이미지 존재 여부 확인 함수
    const checkImageExists = async (url: string): Promise<boolean> => {
      try {
        const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
        return res.ok;
      } catch (e) {
        // HEAD 요청 실패 시 GET으로 재시도 (CORS 등 이유)
        try {
          const res = await fetch(url, { method: 'GET', mode: 'cors' });
          return res.ok;
        } catch (e2) {
          return false;
        }
      }
    };

    // 병렬로 존재 여부 확인
    const [hasMaxRes, hasSdRes] = await Promise.all([
      checkImageExists(maxResUrl),
      checkImageExists(sdResUrl)
    ]);

    if (hasMaxRes) {
      thumbnails.push({
        url: maxResUrl,
        label: '최고화질 (MaxRes)',
        quality: 'high'
      });
    }

    if (hasSdRes) {
      thumbnails.push({
        url: sdResUrl,
        label: '고화질 (Standard)',
        quality: 'high'
      });
    }

    // HQ는 거의 항상 존재하므로 기본 fallback으로 추가
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
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|(?:shorts\/))|(?:.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
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
