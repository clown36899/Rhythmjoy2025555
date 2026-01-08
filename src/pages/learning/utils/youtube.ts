
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

export interface YouTubePlaylistInfo {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    channelTitle: string;
}

export interface YouTubeVideoInfo {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    position: number;
    resourceId: {
        videoId: string;
    };
}

/**
 * 유튜브 재생목록 ID 추출
 */
export const extractPlaylistId = (url: string): string | null => {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('list');
    } catch (e) {
        return null;
    }
};

/**
 * 유튜브 비디오 ID 추출
 */
export const extractVideoId = (url: string): string | null => {
    try {
        const urlObj = new URL(url);
        // Short URL (youtu.be)
        if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.slice(1);
        }
        // Standard URL (youtube.com)
        return urlObj.searchParams.get('v');
    } catch (e) {
        return null;
    }
};

/**
 * 재생목록 기본 정보 가져오기
 */
export const fetchPlaylistInfo = async (playlistId: string): Promise<YouTubePlaylistInfo> => {
    if (!API_KEY) throw new Error('YouTube API Key is missing');

    const response = await fetch(
        `${BASE_URL}/playlists?part=snippet&id=${playlistId}&key=${API_KEY}`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch playlist info');
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
        throw new Error('Playlist not found');
    }

    const snippet = data.items[0].snippet;
    return {
        id: data.items[0].id,
        title: snippet.title,
        description: snippet.description,
        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
        channelTitle: snippet.channelTitle,
    };
};

/**
 * 재생목록 내의 비디오 리스트 가져오기 (최대 50개)
 * 페이지네이션은 추후 필요시 구현
 */
export const fetchPlaylistVideos = async (playlistId: string): Promise<YouTubeVideoInfo[]> => {
    if (!API_KEY) throw new Error('YouTube API Key is missing');

    const response = await fetch(
        `${BASE_URL}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${API_KEY}`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch playlist items');
    }

    const data = await response.json();

    return data.items.map((item: any) => ({
        id: item.snippet.resourceId.videoId, // 🔥 FIX: Use actual video ID, not playlist item ID
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
        position: item.snippet.position,
        resourceId: item.snippet.resourceId,
    })).filter((video: YouTubeVideoInfo) =>
        video.title !== 'Private video' && video.title !== 'Deleted video' // 비공개/삭제된 영상 제외
    );
};

/**
 * 단일 비디오 상세 정보 가져오기
 */
export const fetchVideoDetails = async (videoId: string): Promise<YouTubeVideoInfo | null> => {
    if (!API_KEY) return null;

    try {
        const response = await fetch(
            `${BASE_URL}/videos?part=snippet&id=${videoId}&key=${API_KEY}`
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (!data.items || data.items.length === 0) return null;

        const item = data.items[0];
        return {
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
            position: 0,
            resourceId: { videoId: item.id }
        };
    } catch (e) {
        console.error('Failed to fetch video details:', e);
        return null;
    }
};
