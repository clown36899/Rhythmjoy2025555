import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import YouTube from 'react-youtube';
import styles from './Page.module.css';
import { BookmarkList } from '../components/BookmarkList';

interface Video {
    id: string;
    youtube_video_id: string;
    title: string;
    order_index: number;
    memo: string;
}

interface Playlist {
    id: string;
    title: string;
    description: string;
}

// ... imports including BookmarkList ...

interface Bookmark {
    id: string;
    video_id: string;
    timestamp: number;
    label: string;
}

interface Props {
    playlistId?: string;
    onClose?: () => void;
}

// ... Props interface ...

const LearningDetailPage = ({ playlistId, onClose }: Props) => {
    const { listId } = useParams();
    const navigate = useNavigate();
    const id = playlistId || listId;

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [videos, setVideos] = useState<Video[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const playerRef = useRef<any>(null);

    // Bookmark State
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        checkAdmin();
    }, []);

    const checkAdmin = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setIsAdmin(true);
    };

    useEffect(() => {
        if (id) fetchPlaylistData(id);
    }, [id]);

    // Fetch bookmarks when video changes
    useEffect(() => {
        if (videos.length > 0 && videos[currentVideoIndex]) {
            fetchBookmarks(videos[currentVideoIndex].id);
        }
    }, [currentVideoIndex, videos]);

    const fetchBookmarks = async (videoId: string) => {
        const { data, error } = await supabase
            .from('learning_video_bookmarks')
            .select('*')
            .eq('video_id', videoId)
            .order('timestamp', { ascending: true });

        if (!error && data) {
            setBookmarks(data);
        } else {
            setBookmarks([]);
        }
    };

    // Helper: Format seconds to MM:SS (Moved out or duplicated for simplicity)
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleAddBookmark = async () => {
        if (!playerRef.current || !videos[currentVideoIndex]) return;

        const timestamp = await playerRef.current.getCurrentTime();
        // Immediate Add with default name
        const label = formatTime(timestamp);

        const { error } = await supabase
            .from('learning_video_bookmarks')
            .insert({
                video_id: videos[currentVideoIndex].id,
                timestamp,
                label
            });

        if (error) {
            console.error('Bookmark add failed', error);
            alert('북마크 추가 실패');
        } else {
            fetchBookmarks(videos[currentVideoIndex].id);
        }
    };

    const handleEditBookmark = async (id: string, currentLabel: string) => {
        const newLabel = prompt('북마크 이름을 수정하세요', currentLabel);
        if (newLabel === null || newLabel === currentLabel) return;

        const { error } = await supabase
            .from('learning_video_bookmarks')
            .update({ label: newLabel })
            .eq('id', id);

        if (error) {
            alert('수정 실패');
        } else {
            if (videos[currentVideoIndex]) fetchBookmarks(videos[currentVideoIndex].id);
        }
    };

    const handleDeleteBookmark = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;

        const { error } = await supabase
            .from('learning_video_bookmarks')
            .delete()
            .eq('id', id);

        if (error) {
            alert('삭제 실패');
        } else {
            if (videos[currentVideoIndex]) fetchBookmarks(videos[currentVideoIndex].id);
        }
    };

    const seekTo = (seconds: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(seconds, true);
        }
    };

    const fetchPlaylistData = async (targetId: string) => {
        // ... existing fetch logic ...
        try {
            setIsLoading(true);

            // 1. 목록 정보
            const { data: listData, error: listError } = await supabase
                .from('learning_playlists')
                .select('*')
                .eq('id', targetId)
                .single();

            if (listError) throw listError;
            setPlaylist(listData);

            // 2. 비디오 목록
            const { data: videoData, error: videoError } = await supabase
                .from('learning_videos')
                .select('*')
                .eq('playlist_id', targetId)
                .order('order_index', { ascending: true });

            if (videoError) throw videoError;
            setVideos(videoData || []);

        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const onPlayerReady = (event: any) => {
        playerRef.current = event.target;
    };

    const onPlayerStateChange = (event: any) => {
        if (event.data === 0) playNext();
    };

    const playNext = () => {
        if (currentVideoIndex < videos.length - 1) {
            setCurrentVideoIndex(prev => prev + 1);
        }
    };

    const playVideo = (index: number) => {
        setCurrentVideoIndex(index);
    };

    const handleBack = () => {
        if (onClose) {
            onClose();
        } else {
            navigate('/learning');
        }
    };

    if (isLoading) return <div className={styles.messageContainer}>로딩 중...</div>;
    if (!playlist || videos.length === 0) return <div className={styles.messageContainer}>콘텐츠를 찾을 수 없습니다.</div>;

    const currentVideo = videos[currentVideoIndex];

    return (
        <div className={`${styles.container} ${playlistId ? styles.modalContainer : ''}`}>
            {/* Left: Player Area */}
            <div className={styles.playerArea}>
                {/* Header */}
                <div className={styles.header}>
                    <button
                        onClick={handleBack}
                        className={styles.backButton}
                    >
                        {onClose ? '✕ 닫기' : '← 갤러리로'}
                    </button>

                    {isAdmin && (
                        <button
                            onClick={handleAddBookmark}
                            className={styles.backButton}
                            style={{ marginLeft: 'auto', backgroundColor: 'rgba(37, 99, 235, 0.6)' }}
                        >
                            + 북마크 추가
                        </button>
                    )}
                </div>

                {/* YouTube Player Wrapper */}
                <div className={styles.playerWrapper}>
                    <YouTube
                        videoId={currentVideo.youtube_video_id}
                        opts={{
                            width: '100%',
                            height: '100%',
                            playerVars: {
                                autoplay: 1,
                                modestbranding: 1,
                                rel: 0,
                            },
                        }}
                        className={styles.youtubePlayer}
                        onReady={onPlayerReady}
                        onStateChange={onPlayerStateChange}
                    />
                </div>

                {/* Bookmark List */}
                <div style={{ padding: '0 16px', backgroundColor: '#111827' }}>
                    <BookmarkList
                        bookmarks={bookmarks}
                        onSeek={seekTo}
                        onDelete={handleDeleteBookmark}
                        onEdit={handleEditBookmark}
                        isAdmin={isAdmin}
                    />
                </div>

                {/* Video Info (Mobile only) */}
                <div className={styles.mobileInfo}>
                    <h2 className={styles.mobileTitle}>{currentVideo.title}</h2>
                    <div className={styles.mobileMeta}>
                        <span>{currentVideoIndex + 1} / {videos.length}</span>
                        {currentVideoIndex < videos.length - 1 && (
                            <button onClick={playNext} className={styles.nextButton}>다음 영상 ▶</button>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Sidebar */}
            <div className={styles.sidebar}>
                {/* ... existing sidebar content ... */}
                <div className={styles.sidebarHeader}>
                    <h1 className={styles.playlistTitle}>{playlist.title}</h1>
                    <div className={styles.progressLabel}>
                        PROGRESS: {Math.round(((currentVideoIndex + 1) / videos.length) * 100)}%
                    </div>
                    <div className={styles.progressBarTrack}>
                        <div
                            className={styles.progressBarFill}
                            style={{ width: `${((currentVideoIndex + 1) / videos.length) * 100}%` }}
                        />
                    </div>
                </div>

                <div className={styles.playlistContainer}>
                    {videos.map((video, idx) => (
                        <div
                            key={video.id}
                            onClick={() => playVideo(idx)}
                            className={`${styles.videoItem} ${currentVideoIndex === idx ? styles.videoItemActive : styles.videoItemInactive}`}
                        >
                            <div className={styles.videoThumbnailWrapper}>
                                <img
                                    src={`https://img.youtube.com/vi/${video.youtube_video_id}/mqdefault.jpg`}
                                    alt=""
                                    className={`${styles.videoThumbnail} ${currentVideoIndex === idx ? styles.videoThumbnailActive : styles.videoThumbnailInactive}`}
                                />
                                {currentVideoIndex === idx && (
                                    <div className={styles.playingOverlay}>
                                        <span className={styles.playingText}>Playing</span>
                                    </div>
                                )}
                            </div>
                            <div className={styles.videoInfo}>
                                <h3 className={`${styles.videoTitle} ${currentVideoIndex === idx ? styles.videoTitleActive : styles.videoTitleInactive}`}>
                                    {idx + 1}. {video.title}
                                </h3>
                                {video.memo && (
                                    <p className={styles.videoMemo}>{video.memo}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LearningDetailPage;
