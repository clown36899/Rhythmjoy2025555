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
    is_overlay?: boolean;
    overlay_x?: number;  // 0-100 퍼센트
    overlay_y?: number;  // 0-100 퍼센트
    overlay_duration?: number;  // 초 단위
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
    const memoRef = useRef<HTMLDivElement>(null); // To check if memo is overflowing

    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [error, setError] = useState<string | null>(null);
    const [fullDescription, setFullDescription] = useState<string | null>(null);
    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false); // Mobile Toggle State
    const [isBookmarksOpen, setIsBookmarksOpen] = useState(true); // Bookmarks visible by default
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false); // Description Toggle State
    const [isOverflowing, setIsOverflowing] = useState(false); // Check if description overflows

    // Bookmark Add Modal States
    const [showBookmarkModal, setShowBookmarkModal] = useState(false);
    const [bookmarkLabel, setBookmarkLabel] = useState('');
    const [isOverlayBookmark, setIsOverlayBookmark] = useState(false);
    const [overlayX, setOverlayX] = useState(50); // 중앙
    const [overlayY, setOverlayY] = useState(50); // 중앙
    const [overlayDuration, setOverlayDuration] = useState(5);
    const [isDraggingMarker, setIsDraggingMarker] = useState(false);
    const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
    const [modalTimestamp, setModalTimestamp] = useState<number | null>(null);

    // Video Overlay States
    const [currentTime, setCurrentTime] = useState(0);
    const [activeOverlays, setActiveOverlays] = useState<Bookmark[]>([]);

    // Fetch Full Description on Video Change
    useEffect(() => {
        const fetchDesc = async () => {
            if (!videos[currentVideoIndex]) return;

            // Reset state to avoid showing previous video's desc
            setFullDescription(null);
            setIsDescriptionExpanded(false);

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

    // Check if description is overflowing
    useEffect(() => {
        const checkOverflow = () => {
            if (memoRef.current) {
                const isOverflow = memoRef.current.scrollHeight > memoRef.current.clientHeight;
                setIsOverflowing(isOverflow);
            }
        };

        // Check after content loads
        const timer = setTimeout(checkOverflow, 100);
        return () => clearTimeout(timer);
    }, [fullDescription, currentVideoIndex, isDescriptionExpanded]);

    // Check Admin & Debug Mount
    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setIsAdmin(!!session);
        };
        checkAdmin();

        console.log('[DetailPage] Mounted. PropId:', propPlaylistId, 'Params:', params);

        // Set data attribute for full-width layout on desktop
        document.body.setAttribute('data-learning-route', 'true');

        // Cleanup: Remove attribute when leaving
        return () => {
            document.body.removeAttribute('data-learning-route');
        };
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
        console.log('[FetchBookmarks] Fetching for video ID:', videoId);
        const { data, error } = await supabase
            .from('learning_video_bookmarks')
            .select('*')
            .eq('video_id', videoId)
            .order('timestamp', { ascending: true });

        console.log('[FetchBookmarks] Response:', { data, error });

        if (!error && data) {
            console.log('[FetchBookmarks] Setting bookmarks:', data);
            setBookmarks(data);
        } else {
            console.log('[FetchBookmarks] No bookmarks or error');
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

    // Track current playback time
    useEffect(() => {
        if (!isPlaying || !playerRef.current) return;

        const interval = setInterval(() => {
            if (playerRef.current) {
                const time = playerRef.current.getCurrentTime();
                setCurrentTime(time);
            }
        }, 100); // Update every 100ms

        return () => clearInterval(interval);
    }, [isPlaying]);

    // Check for active overlays based on current time
    useEffect(() => {
        const overlayBookmarks = bookmarks.filter(b => b.is_overlay);
        const active = overlayBookmarks.filter(b => {
            const timeDiff = currentTime - b.timestamp;
            return timeDiff >= 0 && timeDiff < (b.overlay_duration || 5);
        });
        setActiveOverlays(active);
    }, [currentTime, bookmarks]);


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

            // 1. 현재 시간 상태 즉시 업데이트
            setCurrentTime(seconds);

            // 2. 오버레이 상태 즉시 재계산 (인터벌 대기 없이 즉시 반영)
            const overlayBookmarks = bookmarks.filter(b => b.is_overlay);
            const active = overlayBookmarks.filter(b => {
                const timeDiff = seconds - b.timestamp;
                return timeDiff >= 0 && timeDiff < (b.overlay_duration || 5);
            });
            setActiveOverlays(active);
        }
    };

    const handleDeleteBookmark = async (id: string) => {
        if (!isAdmin) return;

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

    const handleAddBookmark = () => {
        if (!playerRef.current) return;
        const currentSeconds = playerRef.current.getCurrentTime();
        setBookmarkLabel('');
        setIsOverlayBookmark(false);
        setOverlayX(50);
        setOverlayY(50);
        setOverlayDuration(5);
        setEditingBookmarkId(null);
        setModalTimestamp(currentSeconds);
        setShowBookmarkModal(true);
    };

    const handleEditBookmark = (id: string) => {
        const mark = bookmarks.find(b => b.id === id);
        if (!mark) return;

        setBookmarkLabel(mark.label);
        setIsOverlayBookmark(!!mark.is_overlay);
        setOverlayX(mark.overlay_x || 50);
        setOverlayY(mark.overlay_y || 50);
        setOverlayDuration(mark.overlay_duration || 3);
        setEditingBookmarkId(id);
        setModalTimestamp(mark.timestamp);
        setShowBookmarkModal(true);
    };

    const handleSaveBookmark = async () => {
        if (!playerRef.current || !playlist || modalTimestamp === null) return;

        const video = videos[currentVideoIndex];
        const timestamp = modalTimestamp;

        const bookmarkData = {
            label: bookmarkLabel || `북마크 ${formatTime(timestamp)}`,
            is_overlay: isOverlayBookmark,
            overlay_x: isOverlayBookmark ? overlayX : null,
            overlay_y: isOverlayBookmark ? overlayY : null,
            overlay_duration: isOverlayBookmark ? overlayDuration : null,
        };

        if (editingBookmarkId) {
            // Update
            const { error } = await supabase
                .from('learning_video_bookmarks')
                .update(bookmarkData)
                .eq('id', editingBookmarkId);

            if (error) {
                console.error('Error updating bookmark:', error);
                alert('북마크 수정 실패');
            }
        } else {
            // Insert
            const { error } = await supabase
                .from('learning_video_bookmarks')
                .insert({
                    video_id: video.id,
                    timestamp,
                    ...bookmarkData
                });

            if (error) {
                console.error('Error saving bookmark:', error);
                alert('북마크 저장 실패');
            }
        }

        setShowBookmarkModal(false);
        fetchBookmarks(video.id);
    };

    // 드래그 핸들러
    const handleMarkerDragStart = () => {
        setIsDraggingMarker(true);
    };

    const handleMarkerDrag = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (!isDraggingMarker) return;

        // 터치 이벤트 대응
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const rect = e.currentTarget.getBoundingClientRect();

        // 0~100% 사이로 제한 (영상 영역 안에서만)
        let x = ((clientX - rect.left) / rect.width) * 100;
        let y = ((clientY - rect.top) / rect.height) * 100;

        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

        setOverlayX(x);
        setOverlayY(y);

        // 스크롤 방지 (터치 시)
        if (e.cancelable) e.preventDefault();
    };

    const handleMarkerDragEnd = () => {
        setIsDraggingMarker(false);
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
                                autoplay: 0,
                                modestbranding: 1,
                                rel: 0,
                                iv_load_policy: 3,
                                autohide: 1,
                            },
                        }}
                        className="ld-youtube-player"
                        onReady={onPlayerReady}
                        onStateChange={handleStateChange}
                    />

                    {/* Transparent Play/Pause Overlay */}
                    <div
                        className={`ld-custom-player-overlay ${isPlaying ? 'playing' : 'paused'}`}
                        onClick={() => {
                            if (isPlaying) playerRef.current?.pauseVideo();
                            else playerRef.current?.playVideo();
                        }}
                    >
                        {!isPlaying && <div className="ld-play-icon">▶</div>}
                    </div>

                    {/* Video Overlays */}
                    {activeOverlays.map((overlay) => (
                        <div
                            key={overlay.id}
                            className="ld-video-overlay"
                            style={{
                                left: `${overlay.overlay_x || 50}%`,
                                top: `${overlay.overlay_y || 50}%`,
                            }}
                        >
                            {overlay.label}
                        </div>
                    ))}
                </div>

                {/* Bookmark List - Moved to directly below video */}
                {isBookmarksOpen && (
                    <div className="ld-bookmark-section">
                        <BookmarkList
                            bookmarks={bookmarks}
                            onSeek={seekTo}
                            onDelete={handleDeleteBookmark}
                            onEdit={(id) => handleEditBookmark(id)}
                            isAdmin={isAdmin}
                        />
                    </div>
                )}

                {/* Control Bar */}
                <div className="ld-control-bar">
                    <button
                        className="ld-control-btn"
                        onClick={() => setIsBookmarksOpen(!isBookmarksOpen)}
                    >
                        {isBookmarksOpen ? '북마크 닫기' : '북마크 보기'}
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
                </div>

                {/* Description (Memo) */}
                <div className="ld-video-memo-wrapper">
                    <div
                        ref={memoRef}
                        className={`ld-video-memo-display ${isDescriptionExpanded ? 'expanded' : ''}`}
                    >
                        {fullDescription || currentVideo.memo}
                    </div>
                    {isOverflowing && (
                        !isDescriptionExpanded ? (
                            <span
                                className="ld-memo-more"
                                onClick={() => setIsDescriptionExpanded(true)}
                            >
                                ...더보기
                            </span>
                        ) : (
                            <span
                                className="ld-memo-more"
                                onClick={() => setIsDescriptionExpanded(false)}
                            >
                                간략히 보기
                            </span>
                        )
                    )}
                </div>

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

            {/* Bookmark Add Modal */}
            {showBookmarkModal && (
                <div className="ld-bookmark-modal-overlay" onClick={() => setShowBookmarkModal(false)}>
                    <div className="ld-bookmark-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="ld-bookmark-modal-title">
                            {editingBookmarkId ? '북마크 수정' : '북마크 추가'}
                        </h3>

                        <div className="ld-bookmark-modal-field">
                            <label>이름</label>
                            <input
                                type="text"
                                value={bookmarkLabel}
                                onChange={(e) => setBookmarkLabel(e.target.value)}
                                placeholder="북마크 이름"
                                className="ld-bookmark-modal-input"
                            />
                        </div>

                        <div className="ld-bookmark-modal-field">
                            <label className="ld-bookmark-modal-checkbox">
                                <input
                                    type="checkbox"
                                    checked={isOverlayBookmark}
                                    onChange={(e) => setIsOverlayBookmark(e.target.checked)}
                                />
                                <span>영상 위에 오버레이로 표시</span>
                            </label>
                        </div>

                        {isOverlayBookmark && (
                            <>
                                <div className="ld-bookmark-modal-field">
                                    <label>위치 설정 (드래그하세요)</label>
                                    <div
                                        className="ld-overlay-preview"
                                        onMouseMove={handleMarkerDrag}
                                        onMouseUp={handleMarkerDragEnd}
                                        onMouseLeave={handleMarkerDragEnd}
                                        onTouchMove={handleMarkerDrag}
                                        onTouchEnd={handleMarkerDragEnd}
                                    >
                                        <div className="ld-preview-player-wrapper">
                                            <YouTube
                                                videoId={currentVideo.youtube_video_id}
                                                opts={{
                                                    playerVars: {
                                                        start: Math.floor(modalTimestamp || 0),
                                                        autoplay: 1,
                                                        controls: 0,
                                                        modestbranding: 1,
                                                        mute: 1,
                                                    },
                                                }}
                                                onReady={(e) => {
                                                    // 해당 초로 확실히 이동 후 일시정지
                                                    e.target.seekTo(modalTimestamp || 0, true);
                                                    setTimeout(() => e.target.pauseVideo(), 500);
                                                }}
                                                className="ld-preview-video-element"
                                            />
                                        </div>
                                        <div className="ld-overlay-preview-bg" style={{ opacity: 0.2 }}>장면 로딩 중...</div>
                                        <div
                                            className="ld-overlay-marker"
                                            style={{
                                                left: `${overlayX}%`,
                                                top: `${overlayY}%`,
                                                cursor: isDraggingMarker ? 'grabbing' : 'grab'
                                            }}
                                            onMouseDown={handleMarkerDragStart}
                                            onTouchStart={handleMarkerDragStart}
                                        >
                                            <span className="ld-overlay-marker-icon">📍</span>
                                            <span className="ld-overlay-marker-text">{bookmarkLabel}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="ld-bookmark-modal-field">
                                    <label>표시 시간: {overlayDuration}초</label>
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        value={overlayDuration}
                                        onChange={(e) => setOverlayDuration(Number(e.target.value))}
                                        className="ld-bookmark-modal-slider"
                                    />
                                </div>
                            </>
                        )}

                        <div className="ld-bookmark-modal-actions">
                            <button onClick={() => setShowBookmarkModal(false)} className="ld-bookmark-modal-btn cancel">
                                취소
                            </button>
                            <button onClick={handleSaveBookmark} className="ld-bookmark-modal-btn save">
                                {editingBookmarkId ? '수정 완료' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LearningDetailPage;
