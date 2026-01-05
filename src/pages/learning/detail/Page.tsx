import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext'; // Import useAuth
import { supabase } from '../../../lib/supabase';
import { BookmarkList } from '../components/BookmarkList';
import { fetchVideoDetails } from '../utils/youtube';
import { renderTextWithLinks } from '../utils/text';
import { HistoryContextWidget } from '../components/HistoryContextWidget';
import './Page.css';

// YouTube IFrame API 타입 선언
declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}


interface Video {
    id: string;
    title: string;
    youtube_video_id: string; // YouTube ID
    order_index: number;
    duration: number;
    memo: string;
    // Added for individual video editing
    year?: number;
    is_on_timeline?: boolean;
    description?: string;
    category_id?: string | null;
    playlist_id?: string | null;
}

interface Playlist {
    id: string;
    title: string;
    description: string;
    author_id: string;
    year?: number; // 추가
    is_on_timeline?: boolean; // 추가
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
    overlay_scale?: number; // 크기 배율 (0.5 ~ 2.0)
}

interface Props {
    playlistId?: string;
    onClose?: () => void;
}

const LearningDetailPage: React.FC<Props> = ({ playlistId: propPlaylistId, onClose }) => {
    // Check both potential parameter names
    const params = useParams();
    const playlistId = propPlaylistId || params.playlistId || params.listId || params.id;

    const navigate = useNavigate();
    const { isAdmin } = useAuth(); // Use context
    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [videos, setVideos] = useState<Video[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    // const [isAdmin, setIsAdmin] = useState(false); // Removed local state

    // Add Bookmark & Edit Info States 
    const playerRef = useRef<any>(null); // To access YT player
    const memoRef = useRef<HTMLDivElement>(null); // To check if memo is overflowing

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [isEditingYear, setIsEditingYear] = useState(false); // 연도 편집 상태
    const [editYear, setEditYear] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // --- Individual Video Editing State ---
    const [isEditingVideoTitle, setIsEditingVideoTitle] = useState(false);
    const [editVideoTitle, setEditVideoTitle] = useState('');
    const [isEditingVideoMemo, setIsEditingVideoMemo] = useState(false);
    const [editVideoMemo, setEditVideoMemo] = useState('');
    const [isEditingVideoYear, setIsEditingVideoYear] = useState(false);
    const [editVideoYear, setEditVideoYear] = useState('');
    const [editVideoIsOnTimeline, setEditVideoIsOnTimeline] = useState(false);

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
    const [overlayScale, setOverlayScale] = useState(1.0); // 기본 크기
    const [isDraggingMarker, setIsDraggingMarker] = useState(false);
    const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
    const [modalTimestamp, setModalTimestamp] = useState<number | null>(null);
    const previewPlayerRef = useRef<any>(null);

    // YouTube API Ready State
    const [youtubeApiReady, setYoutubeApiReady] = useState(false);

    // Video Overlay States
    const [currentTime, setCurrentTime] = useState(0);
    const [activeOverlays, setActiveOverlays] = useState<Bookmark[]>([]);

    // Load YouTube IFrame API
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            setYoutubeApiReady(true);
            return;
        }

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }

        window.onYouTubeIframeAPIReady = () => {
            setYoutubeApiReady(true);
        };
    }, []);

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
            if (memoRef.current && !isDescriptionExpanded) { // 펼쳐진 상태에서는 체크하지 않음 (버튼 유지)
                const isOverflow = memoRef.current.scrollHeight > memoRef.current.clientHeight;
                setIsOverflowing(isOverflow);
            }
        };

        // Check after content loads
        const timer = setTimeout(checkOverflow, 100);
        return () => clearTimeout(timer);
    }, [fullDescription, currentVideoIndex, isDescriptionExpanded]);

    // 영상 전환 시 초기화
    useEffect(() => {
        setIsDescriptionExpanded(false);
    }, [currentVideoIndex]);


    // Removed redundant checkAdmin useEffect block here

    // 북마크 모달 미리보기 플레이어 초기화
    useEffect(() => {
        if (!youtubeApiReady || !showBookmarkModal || !videos.length || !videos[currentVideoIndex]) return;

        const videoId = videos[currentVideoIndex].youtube_video_id;
        const playerId = 'preview-youtube-player';

        // 기존 플레이어 정리
        if (previewPlayerRef.current) {
            try {
                previewPlayerRef.current.destroy();
            } catch (e) {
                // Ignore
            }
            previewPlayerRef.current = null;
        }

        // 새 플레이어 생성
        setTimeout(() => {
            const element = document.getElementById(playerId);
            if (!element) return;

            previewPlayerRef.current = new window.YT.Player(playerId, {
                videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    modestbranding: 1,
                    mute: 1,
                    rel: 0,
                    iv_load_policy: 3,
                    enablejsapi: 1,
                },
                events: {
                    onReady: (event: any) => {
                        event.target.mute();
                        if (modalTimestamp !== null) {
                            event.target.seekTo(modalTimestamp, true);
                        }
                        event.target.playVideo();
                    },
                    onStateChange: (event: any) => {
                        // 재생 시작(1) 시 즉시 일시정지하여 프레임 가시화
                        if (event.data === 1) {
                            event.target.pauseVideo();
                        }
                    },
                },
            });
        }, 100);

        return () => {
            if (previewPlayerRef.current) {
                try {
                    previewPlayerRef.current.destroy();
                } catch (e) {
                    // Ignore
                }
                previewPlayerRef.current = null;
            }
        };
    }, [youtubeApiReady, showBookmarkModal, videos, currentVideoIndex, modalTimestamp]);

    // 미리보기 플레이어 시간 동기화 (modalTimestamp 변경 시)
    useEffect(() => {
        if (showBookmarkModal && previewPlayerRef.current && modalTimestamp !== null) {
            try {
                const player = previewPlayerRef.current;
                if (player.seekTo) {
                    player.seekTo(modalTimestamp, true);
                    // 장면 갱신을 위해 잠깐 재생 후 정지 유도
                    player.playVideo();
                    setTimeout(() => {
                        player.pauseVideo();
                    }, 100);
                }
            } catch (e) {
                console.warn("Preview sync failed", e);
            }
        }
    }, [modalTimestamp, showBookmarkModal]);

    useEffect(() => {
        if (!playlistId) {
            console.warn('[DetailPage] No playlistId found');
            setError('재생목록 ID를 찾을 수 없습니다.');
            return;
        }
        fetchPlaylistData(playlistId);
    }, [playlistId, refreshTrigger]);

    const fetchPlaylistData = async (rawTargetId: string) => {
        try {
            setError(null);

            let targetId = rawTargetId;
            if (targetId.startsWith('playlist:')) {
                targetId = targetId.replace('playlist:', '');
            }

            // Check if it's a standalone video (prefixed with 'video:')
            if (targetId.startsWith('video:')) {
                const videoId = targetId.replace('video:', '');

                // 1. Fetch Target Video Info
                const { data: targetVideo, error: videoError } = await supabase
                    .from('learning_videos')
                    .select('*')
                    .eq('id', videoId)
                    .maybeSingle();

                if (videoError) throw videoError;
                if (!targetVideo) {
                    setError('요청하신 영상을 찾을 수 없습니다.');
                    return;
                }

                let playlistVideos = [targetVideo];
                let contextTitle = targetVideo.title;

                // 2. If it belongs to a category, try to fetch sibling videos (Auto-Playlist)
                if (targetVideo.category_id) {
                    // 1. Get Category Name
                    const { data: catData } = await supabase
                        .from('learning_categories')
                        .select('name')
                        .eq('id', targetVideo.category_id)
                        .maybeSingle();

                    if (catData) {
                        contextTitle = catData.name;
                    }

                    // 2. Fetch Siblings (Same category, No playlist_id)
                    const { data: siblings, error: siblingsError } = await supabase
                        .from('learning_videos')
                        .select('*')
                        .eq('category_id', targetVideo.category_id)
                        .is('playlist_id', null)
                        .order('order_index', { ascending: true })
                        .order('created_at', { ascending: false }); // Secondary sort

                    if (!siblingsError && siblings && siblings.length > 0) {
                        playlistVideos = siblings;
                    }
                }

                // Create a playlist context object
                setPlaylist({
                    id: targetVideo.category_id ? `category:${targetVideo.category_id}` : targetVideo.id,
                    title: contextTitle,
                    description: '',
                    author_id: targetVideo.author_id,
                    year: targetVideo.year,
                    is_on_timeline: targetVideo.is_on_timeline
                });

                setVideos(playlistVideos);

                // Find and set correct index
                const targetIndex = playlistVideos.findIndex(v => v.id === videoId);
                setCurrentVideoIndex(targetIndex !== -1 ? targetIndex : 0);

                return;
            }

            // Check if it's a Folder Playlist (prefixed with 'category:')
            if (targetId.startsWith('category:')) {
                const categoryId = targetId.replace('category:', '');

                // 1. Fetch Category Info (as Playlist)
                const { data: categoryData, error: categoryError } = await supabase
                    .from('learning_categories')
                    .select('*')
                    .eq('id', categoryId)
                    .maybeSingle();

                if (categoryError) throw categoryError;
                if (!categoryData) {
                    setError('요청하신 폴더를 찾을 수 없습니다.');
                    return;
                }

                setPlaylist({
                    id: categoryData.id,
                    title: categoryData.name,
                    description: '', // Category doesn't have description yet
                    author_id: '', // Not needed for folder
                    year: undefined,
                    is_on_timeline: undefined
                });

                // 2. Fetch Videos in Category
                const { data: videoData, error: videoError } = await supabase
                    .from('learning_videos')
                    .select('*')
                    .eq('category_id', categoryId)
                    .is('playlist_id', null) // Only standalone videos in folder
                    .order('order_index', { ascending: true });

                if (videoError) throw videoError;

                if (videoData && videoData.length > 0) {
                    setVideos(videoData);
                } else {
                    setVideos([]);
                }
                return;
            }

            // Normal Playlist Logic
            // 1. Fetch Playlist Info
            const { data: listData, error: listError } = await supabase
                .from('learning_playlists')
                .select('*')
                .eq('id', targetId)
                .maybeSingle();

            if (listError) throw listError;

            if (!listData) {
                console.warn('[DetailPage] Playlist not found for ID:', targetId);
                setError('요청하신 재생목록을 찾을 수 없거나 접근 권한이 없습니다.');
                return;
            }

            setPlaylist(listData);

            // 2. Fetch Videos
            const { data: videoData, error: videoError } = await supabase
                .from('learning_videos')
                .select('*')
                .eq('playlist_id', targetId)
                .order('order_index', { ascending: true });

            if (videoError) throw videoError;

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

    // YouTube Player 초기화 (메인 플레이어)
    useEffect(() => {
        if (!youtubeApiReady || !videos.length || !videos[currentVideoIndex]) return;

        const videoId = videos[currentVideoIndex].youtube_video_id;
        const playerId = 'main-youtube-player';

        // 기존 플레이어 정리
        if (playerRef.current) {
            try {
                playerRef.current.destroy();
            } catch (e) {
                console.warn('Player destroy failed', e);
            }
            playerRef.current = null;
        }

        // 새 플레이어 생성
        setTimeout(() => {
            const container = document.querySelector('.ld-player-wrapper');
            if (!container) return;

            // 기존 요소 제거하고 새 div 생성
            const oldElement = document.getElementById(playerId);
            if (oldElement) {
                oldElement.remove();
            }

            const newDiv = document.createElement('div');
            newDiv.id = playerId;
            newDiv.className = 'ld-youtube-player';
            container.appendChild(newDiv);

            playerRef.current = new window.YT.Player(playerId, {
                videoId,
                playerVars: {
                    autoplay: 0,
                    modestbranding: 1,
                    rel: 0,
                    iv_load_policy: 3,
                    autohide: 1,
                    enablejsapi: 1,
                },
                events: {
                    onReady: () => {
                        // Player ready
                    },
                    onStateChange: (event: any) => {
                        setIsPlaying(event.data === 1); // 1 = Playing
                        if (event.data === 0) playNext(); // 0 = Ended
                    },
                },
            });
        }, 100);

        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch (e) {
                    // Ignore
                }
                playerRef.current = null;
            }
        };
    }, [youtubeApiReady, currentVideoIndex, videos]);

    // Track current playback time
    useEffect(() => {
        if (!isPlaying || !playerRef.current) return;

        const interval = setInterval(() => {
            if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
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
        if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
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
        if (!isAdmin) return;
        if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
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
        if (!isAdmin) return;
        const mark = bookmarks.find(b => b.id === id);
        if (!mark) return;

        setBookmarkLabel(mark.label);
        setIsOverlayBookmark(!!mark.is_overlay);
        setOverlayX(mark.overlay_x || 50);
        setOverlayY(mark.overlay_y || 50);
        setOverlayDuration(mark.overlay_duration || 3);
        setOverlayScale(mark.overlay_scale || 1.0);
        setEditingBookmarkId(id);
        setModalTimestamp(mark.timestamp);
        setShowBookmarkModal(true);
    };

    const handleSaveBookmark = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        if (!playerRef.current || !playlist || modalTimestamp === null) return;

        const video = videos[currentVideoIndex];
        const timestamp = modalTimestamp;

        const bookmarkData = {
            label: bookmarkLabel || `북마크 ${formatTime(timestamp)}`,
            is_overlay: isOverlayBookmark,
            overlay_x: isOverlayBookmark ? overlayX : null,
            overlay_y: isOverlayBookmark ? overlayY : null,
            overlay_duration: isOverlayBookmark ? overlayDuration : null,
            overlay_scale: isOverlayBookmark ? overlayScale : null,
        };

        if (editingBookmarkId) {
            // Update
            const { error } = await supabase
                .from('learning_video_bookmarks')
                .update({
                    timestamp,
                    ...bookmarkData
                })
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
        if (!isAdmin) return;
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
    const startEditingTitle = () => {
        if (!playlist) return;
        setEditTitle(playlist.title);
        setIsEditingTitle(true);
    };

    const cancelEditingTitle = () => {
        setIsEditingTitle(false);
    };

    const handleUpdateTitle = async () => {
        if (!isAdmin) return;
        if (!playlist) return;
        if (!editTitle.trim()) {
            alert("제목을 입력해주세요.");
            return;
        }

        try {
            if (playlist.id.startsWith('category:')) {
                const categoryId = playlist.id.replace('category:', '');
                const { error } = await supabase
                    .from('learning_categories')
                    .update({ name: editTitle })
                    .eq('id', categoryId);
                if (error) throw error;
            } else if (playlist.id.startsWith('video:')) {
                const videoId = playlist.id.replace('video:', '');
                const { error } = await supabase
                    .from('learning_videos')
                    .update({ title: editTitle })
                    .eq('id', videoId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('learning_playlists')
                    .update({ title: editTitle })
                    .eq('id', playlist.id);
                if (error) throw error;
            }

            setIsEditingTitle(false);
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Title update failed", error);
            alert("제목 수정 실패");
        }
    };

    const startEditingDesc = () => {
        if (!playlist) return;
        setEditDesc(playlist.description || '');
        setIsEditingDesc(true);

        // 부드럽게 스크롤
        setTimeout(() => {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    };

    const cancelEditingDesc = () => {
        setIsEditingDesc(false);
    };

    const handleUpdateDesc = async () => {
        if (!isAdmin) return;
        if (!playlist) return;

        // Folders do not support description
        if (playlist.id.startsWith('category:')) {
            alert("폴더형 재생목록은 설명을 수정할 수 없습니다.");
            return;
        }

        try {
            if (playlist.id.startsWith('video:')) {
                const videoId = playlist.id.replace('video:', '');
                const { error } = await supabase
                    .from('learning_videos')
                    .update({ description: editDesc })
                    .eq('id', videoId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('learning_playlists')
                    .update({ description: editDesc })
                    .eq('id', playlist.id);
                if (error) throw error;
            }

            setIsEditingDesc(false);
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Description update failed", error);
            alert("설명 수정 실패");
        }
    };

    const handleUpdateTimelineSettings = async () => {
        if (!isAdmin) return;
        if (!playlist) return;

        // Folders do not support timeline
        if (playlist.id.startsWith('category:')) {
            alert("폴더형 재생목록은 타임라인 설정을 수정할 수 없습니다.");
            return;
        }

        // DB Updates
        const isStandalone = playlist.id.startsWith('video:'); // Use playlist.id directly
        const table = isStandalone ? 'learning_videos' : 'learning_playlists';
        const targetId = isStandalone ? playlist.id.replace('video:', '') : playlist.id;

        const { error } = await supabase
            .from(table)
            .update({
                year: editYear ? parseInt(editYear) : null,
                is_on_timeline: true
            })
            .eq('id', targetId);

        if (error) {
            console.error("Timeline settings update failed", error);
            alert("연도/타임라인 설정 수정 실패");
        } else {
            setIsEditingYear(false);
            setRefreshTrigger(prev => prev + 1);
        }
    };

    // --- Video Metadata Handlers (Individual) ---
    const startEditingVideoTitle = () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;
        setEditVideoTitle(video.title);
        setIsEditingVideoTitle(true);
    };

    const handleUpdateVideoTitle = async () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;
        if (!editVideoTitle.trim()) {
            alert("제목을 입력해주세요.");
            return;
        }

        const { error } = await supabase
            .from('learning_videos')
            .update({ title: editVideoTitle })
            .eq('id', video.id);

        if (error) {
            console.error("Video title update failed", error);
            alert("영상 제목 수정 실패");
        } else {
            setIsEditingVideoTitle(false);
            setRefreshTrigger(prev => prev + 1);
        }
    };

    const startEditingVideoYear = () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;
        setEditVideoYear(video.year?.toString() || '');
        setEditVideoIsOnTimeline(video.is_on_timeline || false);
        setIsEditingVideoYear(true);
    };

    const handleUpdateVideoYear = async () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;

        const { error } = await supabase
            .from('learning_videos')
            .update({
                year: editVideoYear ? parseInt(editVideoYear) : null,
                is_on_timeline: true // Always enable if setting year, or use checkbox if we add one (User asked for timeline linkage)
            })
            .eq('id', video.id);

        if (error) {
            console.error("Video year update failed", error);
            alert("영상 연도 수정 실패");
        } else {
            setIsEditingVideoYear(false);
            setRefreshTrigger(prev => prev + 1);
        }
    };

    const startEditingVideoMemo = () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;
        setEditVideoMemo(video.memo || '');
        setIsEditingVideoMemo(true);
    };

    const handleUpdateVideoMemo = async () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;

        const { error } = await supabase
            .from('learning_videos')
            .update({ memo: editVideoMemo })
            .eq('id', video.id);

        if (error) {
            console.error("Video memo update failed", error);
            alert("메모 수정 실패");
        } else {
            setIsEditingVideoMemo(false);
            setRefreshTrigger(prev => prev + 1);
        }
    };


    const formatTimestamp = (seconds: number) => {
        const s = Math.round(seconds);
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const adjTime = (amount: number) => {
        setModalTimestamp(prev => {
            const newVal = Math.round((prev || 0) + amount); // 1초 단위 명확하게 보장
            return Math.max(0, newVal);
        });
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

    return (
        <div className={`ld-container ${onClose ? 'ld-modal-container' : ''}`}>
            {/* Left: Player Area */}
            <div className="ld-player-area">
                {/* Header */}
                {/* Header (Show only if modal) */}
                {onClose && (
                    <div className="ld-header">
                        <button onClick={onClose} className="ld-back-button">
                            ← 닫기
                        </button>
                    </div>
                )}

                {/* Floating Admin Action (Page View) */}
                {isAdmin && (
                    <div className="ld-floating-actions">
                        <button onClick={handleAddBookmark} className="ld-fab-btn" title="북마크 추가">
                            <i className="ri-bookmark-3-line"></i>
                        </button>
                        <div className="ld-fab-group">
                            <button
                                onClick={async () => {
                                    if (!bookmarks.length) {
                                        alert('복사할 북마크가 없습니다.');
                                        return;
                                    }
                                    try {
                                        // ID와 생성일 등은 제외하고 순수 데이터만 복사
                                        const cleanBookmarks = bookmarks.map(({ id, video_id, created_at, ...rest }) => rest);
                                        await navigator.clipboard.writeText(JSON.stringify(cleanBookmarks));
                                        alert(`북마크 ${cleanBookmarks.length}개가 복사되었습니다.\n다른 영상에서 붙여넣기 하세요.`);
                                    } catch (err) {
                                        console.error('Copy failed', err);
                                        alert('복사 실패');
                                    }
                                }}
                                className="ld-fab-sub-btn"
                                title="북마크 복사"
                            >
                                📋
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        const text = await navigator.clipboard.readText();
                                        if (!text) return;

                                        let data;
                                        try {
                                            data = JSON.parse(text);
                                        } catch (e) {
                                            alert('유효한 북마크 데이터가 아닙니다.');
                                            return;
                                        }

                                        if (!Array.isArray(data)) {
                                            alert('북마크 형식이 아닙니다 (Array required).');
                                            return;
                                        }

                                        if (!confirm(`클립보드 내용을 붙여넣으시겠습니까?\n(기존 북마크에 추가됩니다)`)) return;

                                        const currentVideo = videos[currentVideoIndex];
                                        if (!currentVideo) return;

                                        const newBookmarks = data.map(item => ({
                                            video_id: currentVideo.id,
                                            timestamp: item.timestamp,
                                            label: item.label,
                                            is_overlay: item.is_overlay,
                                            overlay_x: item.overlay_x,
                                            overlay_y: item.overlay_y,
                                            overlay_duration: item.overlay_duration,
                                            overlay_scale: item.overlay_scale
                                        })).filter(item => item.timestamp !== undefined && item.label); // 간단한 유효성 검사

                                        if (newBookmarks.length === 0) {
                                            alert('추가할 유효한 북마크가 없습니다.');
                                            return;
                                        }

                                        const { error } = await supabase
                                            .from('learning_video_bookmarks')
                                            .insert(newBookmarks);

                                        if (error) throw error;

                                        alert('성공적으로 붙여넣었습니다.');
                                        fetchBookmarks(currentVideo.id);

                                    } catch (err) {
                                        console.error('Paste failed', err);
                                        alert('붙여넣기 실패: ' + (err as any).message);
                                    }
                                }}
                                className="ld-fab-sub-btn"
                                title="북마크 붙여넣기"
                            >
                                📥
                            </button>
                        </div>
                    </div>
                )}

                {/* YouTube Player Wrapper */}
                <div className="ld-player-wrapper">
                    <div id="main-youtube-player" className="ld-youtube-player"></div>



                    {/* Video Overlays */}
                    {activeOverlays.map((overlay) => (
                        <div
                            key={overlay.id}
                            className="ld-video-overlay"
                            style={{
                                left: `${overlay.overlay_x || 50}%`,
                                top: `${overlay.overlay_y || 50}%`,
                                // transform을 하나로 합쳐서 충돌 방지
                                transform: `translate(-50%, -50%) scale(${overlay.overlay_scale || 1})`
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
                        {isPlaylistOpen ? '목록 닫기' : '재생목록 보기'}
                    </button>
                </div>

                <div className="ld-video-metadata">
                    {/* Video Title Row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                            {isEditingVideoTitle ? (
                                <div className="ld-edit-container-mini" style={{ marginBottom: '8px' }}>
                                    <input
                                        className="ld-edit-input-mini"
                                        value={editVideoTitle}
                                        onChange={(e) => setEditVideoTitle(e.target.value)}
                                        placeholder="영상 제목"
                                        autoFocus
                                    />
                                    <div className="ld-edit-actions-mini">
                                        <button onClick={handleUpdateVideoTitle} className="ld-save-button-mini">저장</button>
                                        <button onClick={() => setIsEditingVideoTitle(false)} className="ld-cancel-button-mini">취소</button>
                                    </div>
                                </div>
                            ) : (
                                <h2 className="ld-video-title-display">
                                    {currentVideo.title}
                                    {isAdmin && (
                                        <button onClick={startEditingVideoTitle} className="ld-edit-button" title="제목 수정" style={{ opacity: 0.5, fontSize: '0.8em', marginLeft: '6px' }}>✎</button>
                                    )}
                                </h2>
                            )}
                        </div>

                        {/* Video Year Badge & Editor */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            {isEditingVideoYear ? (
                                <div className="ld-edit-container-mini" style={{ alignItems: 'flex-end', background: '#374151', padding: '6px', borderRadius: '4px' }}>
                                    <input
                                        type="number"
                                        className="ld-edit-input-mini"
                                        style={{ width: '80px', textAlign: 'right' }}
                                        value={editVideoYear}
                                        onChange={(e) => setEditVideoYear(e.target.value)}
                                        placeholder="연도"
                                    />
                                    <div className="ld-edit-actions-mini" style={{ justifyContent: 'flex-end', marginTop: '4px' }}>
                                        <button onClick={handleUpdateVideoYear} className="ld-save-button-mini">저장</button>
                                        <button onClick={() => setIsEditingVideoYear(false)} className="ld-cancel-button-mini">취소</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {currentVideo.year && <span className="ld-year-badge">#{currentVideo.year}</span>}
                                    {currentVideo.is_on_timeline && <span className="ld-timeline-badge">Timeline</span>}
                                    {isAdmin && (
                                        <button
                                            onClick={startEditingVideoYear}
                                            className="ld-edit-button-small"
                                            title="영상 연도/타임라인 설정"
                                            style={{ margin: 0, padding: '2px 6px', fontSize: '12px' }}
                                        >
                                            {currentVideo.year ? '✎' : '+연도'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Description (Memo) */}
                <div className="ld-video-memo-wrapper">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.85em', color: '#9ca3af' }}>메모 / 설명</span>
                        {isAdmin && !isEditingVideoMemo && (
                            <button onClick={startEditingVideoMemo} className="ld-edit-button-small" style={{ fontSize: '11px', padding: '2px 5px' }}>✎ 메모 수정</button>
                        )}
                    </div>

                    {isEditingVideoMemo ? (
                        <div className="ld-edit-container">
                            <textarea
                                className="ld-edit-textarea"
                                value={editVideoMemo}
                                onChange={(e) => setEditVideoMemo(e.target.value)}
                                placeholder="영상에 대한 메모를 입력하세요 (이 내용은 목록에도 표시됩니다)"
                                rows={4}
                            />
                            <div className="ld-edit-actions">
                                <button onClick={() => setIsEditingVideoMemo(false)} className="ld-cancel-button">취소</button>
                                <button onClick={handleUpdateVideoMemo} className="ld-save-button">저장</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div
                                ref={memoRef}
                                className={`ld-video-memo-display ${isDescriptionExpanded ? 'expanded' : ''}`}
                            >
                                {renderTextWithLinks(currentVideo.memo || fullDescription || '')}
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
                        </>
                    )}
                </div>

                <HistoryContextWidget year={currentVideo.year || playlist.year || null} />

                {/* Playlist Description Editor (Bottom) - Hide for Folder-Playlists */}
                {!playlist.id.startsWith('category:') && (
                    <div className="ld-description-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                <h4 style={{ margin: 0, color: '#9ca3af', fontSize: '14px' }}>재생목록 정보</h4>
                                {playlist.year && (
                                    <span className="ld-year-badge">#{playlist.year}년</span>
                                )}
                                {playlist.is_on_timeline && (
                                    <span className="ld-timeline-badge">Timeline ON</span>
                                )}
                            </div>
                            {isAdmin && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {!isEditingYear && (
                                        <button
                                            onClick={() => {
                                                setEditYear(playlist.year?.toString() || '');
                                                setIsEditingYear(true);
                                            }}
                                            className="ld-edit-button-small"
                                        >
                                            ✎ 연도 설정
                                        </button>
                                    )}
                                    {!isEditingDesc && (
                                        <button onClick={startEditingDesc} className="ld-edit-button-small">✎ 설명 수정</button>
                                    )}
                                </div>
                            )}
                        </div>

                        {isEditingYear && (
                            <div className="ld-edit-container" style={{ marginBottom: '16px' }}>
                                <div className="ld-edit-row">
                                    <label style={{ fontSize: '12px', color: '#9ca3af' }}>역사 연도:</label>
                                    <input
                                        type="number"
                                        className="ld-edit-input-mini"
                                        value={editYear}
                                        onChange={(e) => setEditYear(e.target.value)}
                                        placeholder="연도 (예: 1980)"
                                    />
                                </div>

                                <div className="ld-edit-actions">
                                    <button onClick={() => setIsEditingYear(false)} className="ld-cancel-button">취소</button>
                                    <button onClick={handleUpdateTimelineSettings} className="ld-save-button">설정 저장</button>
                                </div>
                            </div>
                        )}

                        {isEditingDesc ? (
                            <div className="ld-edit-container">
                                <textarea
                                    className="ld-edit-textarea"
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    placeholder="설명 (선택사항)"
                                />
                                <div className="ld-edit-actions">
                                    <button onClick={cancelEditingDesc} className="ld-cancel-button">취소</button>
                                    <button onClick={handleUpdateDesc} className="ld-save-button">저장</button>
                                </div>
                            </div>
                        ) : (
                            playlist.description ? (
                                <p className="ld-info-description">{renderTextWithLinks(playlist.description)}</p>
                            ) : (
                                <p className="ld-info-description no-content">등록된 설명이 없습니다.</p>
                            )
                        )}
                    </div>
                )}


            </div>

            {/* Right: Sidebar */}
            <div className={`ld-sidebar ${isPlaylistOpen ? 'open' : 'mobile-hidden'}`}>
                <div className="ld-sidebar-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* Playlist Info Section (Title Only) */}
                        <div className="ld-sidebar-info" style={{ flex: 1 }}>
                            {isEditingTitle ? (
                                <div className="ld-edit-container-mini">
                                    <input
                                        className="ld-edit-input-mini"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        placeholder="재생목록 제목"
                                        autoFocus
                                    />
                                    <div className="ld-edit-actions-mini">
                                        <button onClick={handleUpdateTitle} className="ld-save-button-mini">확인</button>
                                        <button onClick={cancelEditingTitle} className="ld-cancel-button-mini">취소</button>
                                    </div>
                                </div>
                            ) : (
                                <h2 className="ld-sidebar-playlist-title">
                                    {playlist.title}
                                    {isAdmin && (
                                        <button onClick={startEditingTitle} className="ld-edit-button" title="제목 수정">✎</button>
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
                                    <p className="ld-video-memo">{renderTextWithLinks(video.memo)}</p>
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
                            <label>메모 내용</label>
                            <textarea
                                value={bookmarkLabel}
                                onChange={(e) => setBookmarkLabel(e.target.value)}
                                placeholder="영상 위에 표시될 메모 내용 (줄바꿈 가능)"
                                className="ld-bookmark-modal-input textarea"
                                rows={2}
                            />
                        </div>

                        <div className="ld-bookmark-modal-field compact-row">
                            <label className="ld-bookmark-modal-checkbox">
                                <input
                                    type="checkbox"
                                    checked={isOverlayBookmark}
                                    onChange={(e) => setIsOverlayBookmark(e.target.checked)}
                                />
                                <span>영상 위에 오버레이로 표시</span>
                            </label>
                        </div>

                        {/* Video & Time Seek Section - Always visible for better UX */}
                        <div className="ld-bookmark-modal-field no-margin">
                            <div className="ld-video-seek-group">
                                <div
                                    className="ld-overlay-preview"
                                    onMouseMove={handleMarkerDrag}
                                    onMouseUp={handleMarkerDragEnd}
                                    onMouseLeave={handleMarkerDragEnd}
                                    onTouchMove={handleMarkerDrag}
                                    onTouchEnd={handleMarkerDragEnd}
                                >
                                    <div className="ld-preview-player-wrapper">
                                        <div id="preview-youtube-player" className="ld-preview-video-element"></div>
                                    </div>
                                    <div className="ld-preview-cover" />
                                    {isOverlayBookmark && (
                                        <div
                                            className="ld-overlay-marker"
                                            style={{
                                                left: `${overlayX}%`,
                                                top: `${overlayY}%`,
                                                transform: `translate(-50%, -50%) scale(${overlayScale})`,
                                                cursor: isDraggingMarker ? 'grabbing' : 'grab'
                                            }}
                                            onMouseDown={handleMarkerDragStart}
                                            onTouchStart={handleMarkerDragStart}
                                        >
                                            <span className="ld-overlay-marker-icon">📍</span>
                                            <span className="ld-overlay-marker-text">{bookmarkLabel}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="ld-time-slider-attached">
                                    <div
                                        className="ld-time-bubble"
                                        style={{
                                            left: `${(modalTimestamp || 0) / (playerRef.current?.getDuration() || 1) * 100}%`
                                        }}
                                    >
                                        {formatTimestamp(modalTimestamp || 0)}
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={playerRef.current?.getDuration() || 3600}
                                        value={modalTimestamp || 0}
                                        onChange={(e) => setModalTimestamp(Number(e.target.value))}
                                        className="ld-time-range-slider-mini"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="ld-time-controls-compact">
                            <div className="ld-time-adj-row">
                                <button onClick={() => adjTime(-5)} className="ld-adj-btn-compact">-5s</button>
                                <button onClick={() => adjTime(-1)} className="ld-adj-btn-compact">-1s</button>
                                <button onClick={() => adjTime(1)} className="ld-adj-btn-compact">+1s</button>
                                <button onClick={() => adjTime(5)} className="ld-adj-btn-compact">+5s</button>
                            </div>
                        </div>

                        {isOverlayBookmark && (
                            <div className="ld-overlay-params-row-compact">
                                <div className="ld-param-field flex-1">
                                    <div className="ld-param-header">
                                        <span>표시 시간</span>
                                        <span className="ld-param-val">{overlayDuration}s</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        value={overlayDuration}
                                        onChange={(e) => setOverlayDuration(Number(e.target.value))}
                                        className="ld-bookmark-modal-slider-mini"
                                    />
                                </div>

                                <div className="ld-param-field flex-1">
                                    <div className="ld-param-header">
                                        <span>메모 크기</span>
                                        <span className="ld-param-val">{Math.round(overlayScale * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.5"
                                        step="0.1"
                                        value={overlayScale}
                                        onChange={(e) => setOverlayScale(Number(e.target.value))}
                                        className="ld-bookmark-modal-slider-mini"
                                    />
                                </div>
                            </div>
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
