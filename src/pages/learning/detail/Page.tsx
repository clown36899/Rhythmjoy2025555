import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import YouTube, { type YouTubeProps } from 'react-youtube';
import { supabase } from '../../../lib/supabase';
import { BookmarkList } from '../components/BookmarkList';
import { fetchVideoDetails } from '../utils/youtube';
import './Page.css';

interface Video {
    id: string;
    title: string;
    youtube_video_id: string; // YouTube ID
    order_index: number;
    duration: number;
    memo: string;
}

interface Playlist {
    id: string;
    title: string;
    description: string;
    author_id: string;
}

interface Bookmark {
    id: string;
    video_id: string;
    timestamp: number;
    label: string;
    created_at: string;
}

interface Props {
    playlistId?: string;
    onClose?: () => void;
}

const LearningDetailPage: React.FC<Props> = ({ playlistId: propPlaylistId, onClose }) => {
    // Check both potential parameter names
    const params = useParams();
    const playlistId = propPlaylistId || params.playlistId || params.listId;

    const navigate = useNavigate();
    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [videos, setVideos] = useState<Video[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // Add Bookmark & Edit Info States 
    const playerRef = useRef<any>(null); // To access YT player

    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [error, setError] = useState<string | null>(null);
    const [fullDescription, setFullDescription] = useState<string | null>(null);
    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false); // Mobile Toggle State
    const [isBookmarksOpen, setIsBookmarksOpen] = useState(false); // Bookmarks Toggle State
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false); // Description Toggle State

    // Fetch Full Description on Video Change
    useEffect(() => {
        const fetchDesc = async () => {
            if (!videos[currentVideoIndex]) return;

            // Reset state to avoid showing previous video's desc
            setFullDescription(null);

            try {
                const videoId = videos[currentVideoIndex].youtube_video_id;
                const details = await fetchVideoDetails(videoId);
                if (details && details.description) {
                    setFullDescription(details.description);
                }
            } catch (err) {
                console.error("Failed to fetch full description", err);
            }
        };
        fetchDesc();
    }, [currentVideoIndex, videos]);

    // Check Admin & Debug Mount
    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setIsAdmin(!!session);
        };
        checkAdmin();

        console.log('[DetailPage] Mounted. PropId:', propPlaylistId, 'Params:', params);
    }, []);

    useEffect(() => {
        if (!playlistId) {
            console.warn('[DetailPage] No playlistId found');
            setError('재생목록 ID를 찾을 수 없습니다.');
            return;
        }
        console.log('[DetailPage] Fetching for ID:', playlistId);
        fetchPlaylistData(playlistId);
    }, [playlistId, refreshTrigger]);

    const fetchPlaylistData = async (targetId: string) => {
        try {
            setError(null);
            // 1. Fetch Playlist Info
            const { data: listData, error: listError } = await supabase
                .from('learning_playlists')
                .select('*')
                .eq('id', targetId)
                .single();

            if (listError) throw listError;
            console.log('[DetailPage] Playlist Loaded:', listData.title);
            setPlaylist(listData);

            // 2. Fetch Videos
            const { data: videoData, error: videoError } = await supabase
                .from('learning_videos')
                .select('*')
                .eq('playlist_id', targetId)
                .order('order_index', { ascending: true });

            if (videoError) throw videoError;
            console.log('[DetailPage] Videos Loaded:', videoData?.length);

            if (videoData && videoData.length > 0) {
                setVideos(videoData);
                // initial bookmark fetch for first video happens in effect below
            } else {
                setVideos([]);
            }
        } catch (err: any) {
            console.error('Error fetching playlist:', err);
            setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
        }
    };

    useEffect(() => {
        if (videos.length > 0) {
            const video = videos[currentVideoIndex];
            fetchBookmarks(video.id);
        }
    }, [currentVideoIndex, videos, refreshTrigger]);

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

    // Helper: Format seconds to MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
    };

    const handleStateChange: YouTubeProps['onStateChange'] = (event) => {
        setIsPlaying(event.data === 1); // 1 = Playing
        if (event.data === 0) playNext(); // 0 = Ended
    };


    const playNext = () => {
        if (currentVideoIndex < videos.length - 1) {
            setCurrentVideoIndex(prev => prev + 1);
        }
    };

    const handleVideoClick = (index: number) => {
        setCurrentVideoIndex(index);
    };

    const seekTo = (seconds: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(seconds, true);
        }
    };

    const handleDeleteBookmark = async (id: string) => {
        if (!isAdmin) return;
        if (!confirm('북마크를 삭제하시겠습니까?')) return;

        const { error } = await supabase
            .from('learning_video_bookmarks')
            .delete()
            .eq('id', id);

        if (!error) {
            const video = videos[currentVideoIndex];
            fetchBookmarks(video.id);
        } else {
            alert('삭제 실패');
        }
    };

    const handleAddBookmark = async () => {
        if (!playerRef.current || !videos[currentVideoIndex]) return;
        const currentSeconds = playerRef.current.getCurrentTime();

        // Format timestamp as label (MM:SS)
        const timeLabel = formatTime(currentSeconds);

        const video = videos[currentVideoIndex];

        const { error } = await supabase
            .from('learning_video_bookmarks')
            .insert({
                video_id: video.id,
                timestamp: currentSeconds,
                label: timeLabel // Default label is the timestamp
            });

        if (!error) {
            fetchBookmarks(video.id);
        } else {
            alert('북마크 추가 실패');
        }
    };

    // --- Edit Infomation Handlers ---
    const startEditing = () => {
        if (!playlist) return;
        setEditTitle(playlist.title);
        setEditDesc(playlist.description || '');
        setIsEditingInfo(true);
    };

    const cancelEditing = () => {
        setIsEditingInfo(false);
    };

    const handleUpdatePlaylist = async () => {
        if (!playlist) return;

        const { error } = await supabase
            .from('learning_playlists')
            .update({
                title: editTitle,
                description: editDesc
            })
            .eq('id', playlist.id);

        if (error) {
            console.error("Update failed", error);
            alert("수정 실패");
        } else {
            setIsEditingInfo(false);
            setRefreshTrigger(prev => prev + 1); // Refresh data
        }
    };

    // New handler for editing bookmark labels
    const handleEditBookmark = async (id: string, currentLabel: string) => {
        if (!isAdmin) return;

        const newLabel = prompt("새로운 북마크 이름을 입력하세요:", currentLabel);
        if (newLabel === null || newLabel.trim() === "") return; // Cancel or empty

        if (newLabel === currentLabel) return; // No change

        const { error } = await supabase
            .from('learning_video_bookmarks')
            .update({ label: newLabel })
            .eq('id', id);

        if (error) {
            console.error("Bookmark update failed", error);
            alert("북마크 수정 실패");
        } else {
            const video = videos[currentVideoIndex];
            fetchBookmarks(video.id);
        }
    };


    // --- Render Loading / Error States ---
    if (error) {
        return (
            <div className="ld-message-container" style={{ color: '#ef4444' }}>
                <h3>오류 발생</h3>
                <p>{error}</p>
                <button onClick={() => navigate('/learning')} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 4, border: 'none', background: '#374151', color: 'white' }}>
                    돌아가기
                </button>
            </div>
        );
    }

    if (!playlist) return <div className="ld-message-container">로딩 중...</div>;
    if (videos.length === 0) return <div className="ld-message-container">콘텐츠를 찾을 수 없습니다.</div>;

    const currentVideo = videos[currentVideoIndex] || { youtube_video_id: '' };
    console.log('[DetailPage] Current Memo:', currentVideo.memo?.length, currentVideo.memo);

    return (
        <div className={`ld-container ${playlistId ? '' : ''}`}>
            {/* Left: Player Area */}
            <div className="ld-player-area">
                {/* Header */}
                <div className="ld-header">
                    <button
                        onClick={() => {
                            if (onClose) {
                                onClose();
                            } else {
                                navigate('/learning');
                            }
                        }}
                        className="ld-back-button"
                    >
                        ← 갤러리로
                    </button>

                    {isAdmin && (
                        <button
                            onClick={handleAddBookmark}
                            className="ld-back-button"
                            style={{ marginLeft: 'auto', backgroundColor: 'rgba(37, 99, 235, 0.6)' }}
                        >
                            + 북마크 추가
                        </button>
                    )}
                </div>

                {/* YouTube Player Wrapper */}
                <div className="ld-player-wrapper">
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
                        className="ld-youtube-player"
                        onReady={onPlayerReady}
                        onStateChange={handleStateChange}
                    />
                </div>

                {/* Control Bar */}
                <div className="ld-control-bar">
                    <button
                        className="ld-control-btn"
                        onClick={() => setIsBookmarksOpen(!isBookmarksOpen)}
                    >
                        {isBookmarksOpen ? '북마크 닫기' : '북마크 보기'}
                    </button>
                    <button
                        className="ld-control-btn"
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    >
                        {isDescriptionExpanded ? '설명 접기' : '설명 보기'}
                    </button>
                    <button
                        className="ld-control-btn mobile-only"
                        onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
                    >
                        {isPlaylistOpen ? '목록 닫기' : '목록 보기'}
                    </button>
                </div>

                {/* Video Info (Title & Metadata) */}
                <div className="ld-video-metadata">
                    <h2 className="ld-video-title-display">{currentVideo.title}</h2>
                    <div className="ld-video-meta-row">
                        <span>{currentVideoIndex + 1} / {videos.length}</span>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {currentVideoIndex < videos.length - 1 && (
                                <button onClick={playNext} className="ld-next-button">다음 영상 ▶</button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Description (Memo) */}
                <div className={`ld-video-memo-display ${isDescriptionExpanded ? 'expanded' : ''}`}>
                    {fullDescription || currentVideo.memo}
                </div>

                {/* Bookmark List */}
                {isBookmarksOpen && (
                    <div className="ld-bookmark-section">
                        <BookmarkList
                            bookmarks={bookmarks}
                            onSeek={seekTo}
                            onDelete={handleDeleteBookmark}
                            onEdit={handleEditBookmark}
                            isAdmin={isAdmin}
                        />
                    </div>
                )}

                {/* Playlist Description Editor (Bottom) */}
                <div className="ld-description-section">
                    {isEditingInfo ? (
                        <div className="ld-edit-container">
                            <textarea
                                className="ld-edit-textarea"
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                placeholder="설명 (선택사항)"
                            />
                            <div className="ld-edit-actions">
                                <button onClick={cancelEditing} className="ld-cancel-button">취소</button>
                                <button onClick={handleUpdatePlaylist} className="ld-save-button">저장</button>
                            </div>
                        </div>
                    ) : (
                        playlist.description && (
                            <p className="ld-info-description">{playlist.description}</p>
                        )
                    )}
                </div>
            </div>

            {/* Right: Sidebar */}
            <div className={`ld-sidebar ${isPlaylistOpen ? 'open' : 'mobile-hidden'}`}>
                <div className="ld-sidebar-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* Playlist Info Section (Title Only) */}
                        <div className="ld-sidebar-info" style={{ flex: 1 }}>
                            {isEditingInfo ? (
                                <div className="ld-edit-container">
                                    <input
                                        className="ld-edit-input"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        placeholder="재생목록 제목"
                                    />
                                </div>
                            ) : (
                                <h2 className="ld-sidebar-playlist-title">
                                    {playlist.title}
                                    {isAdmin && (
                                        <button onClick={startEditing} className="ld-edit-button" title="정보 수정">✎</button>
                                    )}
                                </h2>
                            )}
                        </div>
                        <button
                            className="ld-mobile-close-btn"
                            onClick={() => setIsPlaylistOpen(false)}
                        >
                            ✕
                        </button>
                    </div>

                    <div className="ld-progress-label">
                        PROGRESS: {Math.round(((currentVideoIndex + 1) / videos.length) * 100)}% ({currentVideoIndex + 1}/{videos.length})
                    </div>
                    <div className="ld-progress-bar-track">
                        <div
                            className="ld-progress-bar-fill"
                            style={{ width: `${((currentVideoIndex + 1) / videos.length) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="ld-playlist-container">
                    {videos.map((video, idx) => (
                        <div
                            key={video.id}
                            onClick={() => handleVideoClick(idx)}
                            className={`ld-video-item ${currentVideoIndex === idx ? 'ld-video-item-active' : 'ld-video-item-inactive'}`}
                        >
                            <div className="ld-video-thumbnail-wrapper">
                                <img
                                    src={`https://img.youtube.com/vi/${video.youtube_video_id}/mqdefault.jpg`}
                                    alt=""
                                    className={`ld-video-thumbnail ${currentVideoIndex === idx ? 'ld-video-thumbnail-active' : 'ld-video-thumbnail-inactive'}`}
                                />
                                {currentVideoIndex === idx && isPlaying && (
                                    <div className="ld-playing-overlay">
                                        <span className="ld-playing-text">Playing</span>
                                    </div>
                                )}
                            </div>
                            <div className="ld-video-info">
                                <h3 className={`ld-video-title ${currentVideoIndex === idx ? 'ld-video-title-active' : 'ld-video-title-inactive'}`}>
                                    {idx + 1}. {video.title}
                                </h3>
                                {video.memo && (
                                    <p className="ld-video-memo">{video.memo}</p>
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
