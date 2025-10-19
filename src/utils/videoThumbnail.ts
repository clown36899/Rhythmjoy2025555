// 영상 URL에서 썸네일 이미지 URL 추출

export async function getVideoThumbnail(videoUrl: string): Promise<string | null> {
  if (!videoUrl) return null;

  // YouTube 썸네일 추출
  const youtubeMatch = videoUrl.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  );
  if (youtubeMatch && youtubeMatch[1]) {
    const videoId = youtubeMatch[1];
    // maxresdefault (1280x720) 시도 -> hqdefault (480x360) 폴백
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    
    // maxresdefault가 존재하는지 확인
    try {
      const response = await fetch(maxResUrl);
      if (response.ok) {
        const blob = await response.blob();
        // maxresdefault가 실제로 존재하면 width > 200
        if (blob.size > 5000) {
          return maxResUrl;
        }
      }
    } catch (e) {
      // 오류 무시
    }
    
    // 폴백: hqdefault (항상 존재)
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  // Vimeo 썸네일 추출
  const vimeoMatch = videoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    try {
      const response = await fetch(`https://vimeo.com/api/v2/video/${videoId}.json`);
      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0].thumbnail_large) {
          return data[0].thumbnail_large;
        }
      }
    } catch (e) {
      console.error('Vimeo 썸네일 추출 실패:', e);
    }
  }

  // Instagram, Facebook는 썸네일 추출 불가 (API 제한)
  return null;
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
