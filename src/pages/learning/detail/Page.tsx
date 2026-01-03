import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import YouTube from 'react-youtube';
import styles from './Page.module.css';

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

interface Props {
    playlistId?: string;
    onClose?: () => void;
}

const LearningDetailPage = ({ playlistId, onClose }: Props) => {
    const { listId } = useParams();
    const navigate = useNavigate();
    const id = playlistId || listId;

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [videos, setVideos] = useState<Video[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const playerRef = useRef<any>(null);

    useEffect(() => {
        if (id) fetchPlaylistData(id);
    }, [id]);

    const fetchPlaylistData = async (targetId: string) => {
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
        // 0 = Ended
        if (event.data === 0) {
            playNext();
        }
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
