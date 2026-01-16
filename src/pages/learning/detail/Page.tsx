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
    metadata?: any;
    content?: string; // 사용자 추가 메모
}

interface Playlist {
    id: string;
    title: string;
    description: string;
    author_id: string;
    year?: number; // 추가
    is_on_timeline?: boolean; // 추가
    metadata?: any;
    content?: string; // 추가
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
    isEditMode?: boolean; // Added control for edit visibility
}

const LearningDetailPage: React.FC<Props> = ({ playlistId: propPlaylistId, onClose, isEditMode = false }) => {
    // Check both potential parameter names
    const params = useParams();
    const playlistId = propPlaylistId || params.playlistId || params.listId || params.id;

    const navigate = useNavigate();
    const { isAdmin } = useAuth(); // Use context
    // Combined flag for UI rendering
    const canEdit = isAdmin && isEditMode;

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
    const [isEditingVideoContent, setIsEditingVideoContent] = useState(false);
    const [editVideoContent, setEditVideoContent] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [fullDescription, setFullDescription] = useState<string | null>(null);

    // Tab State: 'bookmarks' (default) or 'playlist'
    const [activeTab, setActiveTab] = useState<'bookmarks' | 'playlist'>('bookmarks');

    // Legacy states kept for sidebar compatibility (though sidebar is hidden on mobile now)
    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

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

    // Layout Effect: Lock parent scroll on desktop for independent scrolling
    useEffect(() => {
        const contentEl = document.querySelector('.archive-layout-container');
        if (contentEl) {
            contentEl.classList.add('is-detail-page-mode');
            return () => {
                contentEl.classList.remove('is-detail-page-mode');
            };
        }
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
                    origin: window.location.origin, // Fix postMessage origin mismatch
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
            let isStandalone = false;

            if (targetId.startsWith('playlist:')) {
                targetId = targetId.replace('playlist:', '');
            } else if (targetId.startsWith('video:')) {
                targetId = targetId.replace('video:', '');
                // Check if it's a UUID (hyphens) - if not, treat as standalone (legacy support)
                if (!targetId.includes('-')) {
                    isStandalone = true;
                }
            } else if (targetId.startsWith('standalone_video:')) {
                // Bypass DB check for direct YouTube IDs
                targetId = targetId.replace('standalone_video:', '');
                isStandalone = true;
            }

            // A) Direct YouTube ID handling (bypass DB)
            if (isStandalone) {
                // Create a mock video object
                const mockVideo: Video = {
                    id: `temp-${targetId}`,
                    title: 'YouTube Video',
                    youtube_video_id: targetId,
                    order_index: 0,
                    duration: 0,
                    memo: '',
                    playlist_id: null
                };

                setVideos([mockVideo]);
                setPlaylist({
                    id: 'standalone',
                    title: 'YouTube Video',
                    description: '',
                    author_id: '',
                    year: undefined,
                    is_on_timeline: false
                });
                setCurrentVideoIndex(0);

                // Try to fetch real title from YouTube API if possible, or just leave generic
                // (Optional: fetchVideoDetails here if needed)

                return;
            }

            // Unified Fetch Logic for learning_resources
            // 1. Fetch Target Resource
            const { data: targetResource, error: resourceError } = await supabase
                .from('learning_resources')
                .select('*')
                .eq('id', targetId)
                .maybeSingle();

            if (resourceError) throw resourceError;
            if (!targetResource) {
                // Fallback: Check if it's a standalone video ID that was passed directly?
                // (Existing logic handled video: prefix, but let's be robust)
                console.warn('[DetailPage] Resource not found for ID:', targetId);
                setError('요청하신 자료를 찾을 수 없습니다.');
                return;
            }

            // Case A: Target is a Video (Standalone)
            if (targetResource.type === 'video') {
                const mappedVideo: Video = {
                    ...targetResource,
                    // Map metadata fields
                    youtube_video_id: targetResource.metadata?.youtube_video_id || '',
                    duration: targetResource.metadata?.duration || 0,
                    memo: targetResource.description || '', // Map description to memo? Or keep separate?
                    // Legacy: memo was a column. New: description.
                    playlist_id: targetResource.metadata?.playlist_id || null,
                    order_index: targetResource.order_index || 0
                };

                let playlistVideos = [mappedVideo];
                let contextTitle = targetResource.title;
                let contextDescription = '';

                // Attempt to fetch siblings logic (Same category, or playlist context)
                if (targetResource.category_id) {
                    // Fetch Category Name
                    const { data: catData } = await supabase
                        .from('learning_categories') // 🔥 [Fix] Correct table for folders
                        .select('name, content, description, metadata') // 🔥 [Fix] Fetch 'content' as requested
                        .eq('id', targetResource.category_id)
                        .maybeSingle();
                    if (catData) {
                        contextTitle = catData.name;
                        // 🔥 [Fix] User specifically asked for 'content' column from learning_categories
                        contextDescription = catData.content || catData.description || catData.metadata?.description || '';
                    }

                    // Fetch Siblings
                    const { data: siblings } = await supabase
                        .from('learning_resources')
                        .select('*')
                        .eq('type', 'video')
                        .eq('category_id', targetResource.category_id)
                        .order('order_index', { ascending: true })
                        .order('created_at', { ascending: false });

                    if (siblings && siblings.length > 0) {
                        playlistVideos = siblings.map((v: any) => ({
                            ...v,
                            youtube_video_id: v.metadata?.youtube_video_id || '',
                            duration: v.metadata?.duration || 0,
                            memo: v.description || '',
                            playlist_id: v.metadata?.playlist_id || null
                        }));
                    }
                } else if (targetResource.metadata?.playlist_id) {
                    // It's in a playlist (migrated style)
                    // Fetch playlist resource for title? (Maybe skip for now to save query)
                    const { data: siblings } = await supabase
                        .from('learning_resources')
                        .select('*')
                        .eq('type', 'video')
                        .contains('metadata', { playlist_id: targetResource.metadata.playlist_id })
                        .order('order_index', { ascending: true });

                    if (siblings && siblings.length > 0) {
                        playlistVideos = siblings.map((v: any) => ({
                            ...v,
                            youtube_video_id: v.metadata?.youtube_video_id || '',
                            duration: v.metadata?.duration || 0,
                            memo: v.description || '',
                            playlist_id: v.metadata?.playlist_id || null
                        }));
                    }
                }

                setPlaylist({
                    id: targetResource.category_id ? `category:${targetResource.category_id}` : targetResource.id,
                    title: contextTitle,
                    description: contextDescription, // 🔥 [Fix] Use fetched description
                    author_id: targetResource.user_id,
                    year: targetResource.metadata?.year,
                    is_on_timeline: targetResource.metadata?.is_on_timeline,
                    metadata: targetResource.metadata
                });

                setVideos(playlistVideos);

                // Find and set correct index using targetId
                const idx = playlistVideos.findIndex(v => v.id === targetId);
                setCurrentVideoIndex(idx !== -1 ? idx : 0);
                return;
            }

            // Case B: Target is a Playlist or Category (Folder) -> Type 'general'
            // (Or migrated 'playlist' if type was preserved, but migration said 'general')
            // We treat 'general' as a container.

            setPlaylist({
                id: targetResource.id,
                title: targetResource.title,
                description: targetResource.description || '',
                author_id: targetResource.user_id,
                year: targetResource.metadata?.year,
                is_on_timeline: targetResource.metadata?.is_on_timeline,
                metadata: targetResource.metadata
            });

            // Fetch Videos
            // Logic: Videos where category_id = targetId OR metadata->playlist_id = targetId
            // This covers both new structure (child of folder) and migrated structure (linked by playlist_id)
            const { data: videoData, error: videoError } = await supabase
                .from('learning_resources')
                .select('*')
                .eq('type', 'video')
                .or(`category_id.eq.${targetId},metadata->>playlist_id.eq.${targetId}`)
                .order('order_index', { ascending: true });

            if (videoError) throw videoError;

            if (videoData && videoData.length > 0) {
                const mappedVideos = videoData.map((v: any) => ({
                    ...v,
                    youtube_video_id: v.metadata?.youtube_video_id || '',
                    duration: v.metadata?.duration || 0,
                    memo: v.description || '',
                    playlist_id: v.metadata?.playlist_id || null
                }));
                setVideos(mappedVideos);
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
        // Skip fetching for temporary/standalone videos that aren't in the DB
        if (videoId.startsWith('temp-')) {
            setBookmarks([]);
            return;
        }

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

    // Refs to hold fresh handlers for avoiding stale closures in YouTube events
    const handlersRef = useRef({ playNext: () => { }, playPrevious: () => { } });

    const handleVideoClick = (index: number) => {
        setCurrentVideoIndex(index);
    };

    const playPrevious = () => {
        if (currentVideoIndex > 0) {
            handleVideoClick(currentVideoIndex - 1);
        } else if (videos.length > 0) {
            handleVideoClick(videos.length - 1); // Loop to end
        }
    };

    const playNext = () => {
        if (currentVideoIndex < videos.length - 1) {
            setCurrentVideoIndex(prev => prev + 1);
        }
    };

    // Keep handlers ref updated
    useEffect(() => {
        handlersRef.current = { playNext, playPrevious };
    }, [playNext, playPrevious]);

    // 1. Initial Player Setup (Once)
    useEffect(() => {
        if (!youtubeApiReady || !videos.length) return;

        // If player already exists, don't recreate
        if (playerRef.current) return;

        const videoId = videos[currentVideoIndex]?.youtube_video_id;
        if (!videoId || videoId.length !== 11) {
            return;
        }

        // Create player
        playerRef.current = new window.YT.Player('main-youtube-player', {
            videoId,
            playerVars: {
                autoplay: 1, // Auto-play on load
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                autohide: 1,
                enablejsapi: 1,
                origin: window.location.origin,
            },
            events: {
                onReady: (event: any) => {
                    event.target.playVideo();
                },
                onStateChange: (event: any) => {
                    setIsPlaying(event.data === 1); // 1 = Playing

                    if (event.data === 0) {
                        // Ended -> Play Next (Use ref to avoid stale closure)
                        handlersRef.current.playNext();
                    }

                    // 🔥 Update MediaSession status
                    if ('mediaSession' in navigator) {
                        if (event.data === 1) navigator.mediaSession.playbackState = 'playing';
                        else if (event.data === 2) navigator.mediaSession.playbackState = 'paused';
                    }
                },
                onError: (e: any) => {
                    console.error("YouTube Player Error:", e.data);
                }
            },
        });

        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch (e) { /* ignore */ }
                playerRef.current = null;
            }
        };
    }, [youtubeApiReady, videos.length]); // Wait for API AND Videos

    // 2. Handle Video Change (Load new video without destroying player)
    useEffect(() => {
        const video = videos[currentVideoIndex];
        if (!video || !playerRef.current || !playerRef.current.loadVideoById) return;

        const currentId = video.youtube_video_id;

        // Load new video (Use argument syntax instead of object syntax for better compatibility)
        if (currentId && currentId.length === 11) {
            try {
                playerRef.current.loadVideoById(currentId);
            } catch (err) {
                console.error("Failed to load video:", err);
            }
        }

        // 🔥 Update MediaSession Metadata when video changes
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: video.title || 'RhythmJoy Video',
                artist: 'RhythmJoy Learning',
                artwork: [
                    { src: `https://img.youtube.com/vi/${currentId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo());
            navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo());
            navigator.mediaSession.setActionHandler('previoustrack', () => handlersRef.current.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => handlersRef.current.playNext());
        }

    }, [currentVideoIndex, videos]); // Run when index or video list changes

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

    const handleUpdateVideoContent = async () => {
        if (!isAdmin) return;
        const video = videos[currentVideoIndex];
        if (!video) return;

        const { error } = await supabase
            .from('learning_resources')
            .update({ content: editVideoContent })
            .eq('id', video.id);

        if (error) {
            console.error("Video content update failed", error);
            alert("상세 메모 수정 실패");
        } else {
            setIsEditingVideoContent(false);
            setRefreshTrigger(prev => prev + 1);
        }
    };

    const handleUpdatePlaylistContent = async () => {
        if (!isAdmin) return;
        if (!playlist || playlist.id.startsWith('category:')) return;

        const { error } = await supabase
            .from('learning_resources')
            .update({ content: editVideoContent }) // Reuse state for simplicity
            .eq('id', playlist.id);

        if (error) {
            console.error("Playlist content update failed", error);
            alert("재생목록 상세 메모 수정 실패");
        } else {
            setIsEditingVideoContent(false);
            setRefreshTrigger(prev => prev + 1);
        }
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
                    .from('learning_resources') // Categories are now resources
                    .update({ title: editTitle }) // Use title instead of name
                    .eq('id', categoryId);
                if (error) throw error;
            } else if (playlist.id.startsWith('video:')) {
                const videoId = playlist.id.replace('video:', '');
                const { error } = await supabase
                    .from('learning_resources') // Changed from learning_videos
                    .update({ title: editTitle })
                    .eq('id', videoId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('learning_resources') // Changed from learning_playlists
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
                    .from('learning_resources')
                    .update({ description: editDesc })
                    .eq('id', videoId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('learning_resources')
                    .update({ description: editDesc }) // Playlist also uses description in learning_resources
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
        const isStandalone = playlist.id.startsWith('video:');
        const targetId = isStandalone ? playlist.id.replace('video:', '') : playlist.id;

        const existingMetadata = playlist.metadata || {};
        const newMetadata = {
            ...existingMetadata,
            year: editYear ? parseInt(editYear) : null,
            is_on_timeline: true
        };

        const { error } = await supabase
            .from('learning_resources')
            .update({
                metadata: newMetadata
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
            .from('learning_resources')
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

        const existingMetadata = video.metadata || {};
        const newMetadata = {
            ...existingMetadata,
            year: editVideoYear ? parseInt(editVideoYear) : null,
            is_on_timeline: editVideoIsOnTimeline
        };

        const { error } = await supabase
            .from('learning_resources')
            .update({
                metadata: newMetadata
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
            .from('learning_resources')
            .update({ description: editVideoMemo })
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
                {/* Header (Show only if modal) */}
                {onClose && (
                    <div className="ld-header">
                        <button onClick={onClose} className="ld-back-button">
                            ← 닫기
                        </button>
                    </div>
                )}

                {/* YouTube Player Wrapper (Fixed Top) */}
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
                                transform: `translate(-50%, -50%) scale(${overlay.overlay_scale || 1})`
                            }}
                        >
                            {overlay.label}
                        </div>
                    ))}
                </div>

                {/* Scrollable Content Container (Desktop) */}
                <div className="ld-content-scroll-container">
                    {/* Tab Navigation */}
                    <div className="ld-tab-navigation">
                        <button
                            className={`ld-tab-btn ${activeTab === 'bookmarks' ? 'active' : ''}`}
                            onClick={() => setActiveTab('bookmarks')}
                        >
                            북마크
                        </button>
                        <button
                            className={`ld-tab-btn ${activeTab === 'playlist' ? 'active' : ''}`}
                            onClick={() => setActiveTab('playlist')}
                        >
                            재생목록
                        </button>
                    </div>

                    {/* Tab Content Area */}
                    <div className="ld-tab-content">
                        {/* Bookmarks Tab Content */}
                        <div className={`ld-tab-pane ld-tab-pane-bookmarks ${activeTab === 'bookmarks' ? 'active' : ''}`}>
                            {(bookmarks.length > 0 || canEdit) && (
                                <div className="ld-bookmark-section">
                                    <div className="ld-bookmark-toolbar-wrapper">
                                        <h3 className="ld-section-title-small">타임스탬프</h3>
                                        {canEdit && (
                                            <div className="ld-bookmark-toolbar">
                                                <button onClick={handleAddBookmark} className="ld-bookmark-tool-btn primary">
                                                    <span className="ld-tool-icon">+</span> 추가
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <BookmarkList
                                        bookmarks={bookmarks}
                                        onSeek={seekTo}
                                        onDelete={handleDeleteBookmark}
                                        onEdit={(id) => handleEditBookmark(id)}
                                        isAdmin={canEdit}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Playlist Tab Content */}
                        <div className={`ld-tab-pane ld-tab-pane-playlist ${activeTab === 'playlist' ? 'active' : ''}`}>
                            <div className="ld-playlist-section-inline">
                                <div className="ld-playlist-container-inline">
                                    {videos.map((video, idx) => (
                                        <div
                                            key={video.id}
                                            onClick={() => handleVideoClick(idx)}
                                            className={`ld-video-item ${currentVideoIndex === idx ? 'ld-video-item-active' : 'ld-video-item-inactive'}`}
                                        >
                                            <div className="ld-video-thumbnail-wrapper-small">
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
                                                <h3 className={`ld-video-title-small ${currentVideoIndex === idx ? 'ld-video-title-active' : 'ld-video-title-inactive'}`}>
                                                    {idx + 1}. {video.title}
                                                </h3>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Video Metadata (Title & Memo) */}
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
                                        {/* 영상 제목 수정 버튼 제거: 원본 정보 보호 */}
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
                                        {/* Toggle Is On Timeline */}
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '11px', color: '#d1d5db', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={editVideoIsOnTimeline}
                                                onChange={(e) => setEditVideoIsOnTimeline(e.target.checked)}
                                            />
                                            타임라인 표시
                                        </label>
                                        <div className="ld-edit-actions-mini" style={{ justifyContent: 'flex-end', marginTop: '4px' }}>
                                            <button onClick={handleUpdateVideoYear} className="ld-save-button-mini">저장</button>
                                            <button onClick={() => setIsEditingVideoYear(false)} className="ld-cancel-button-mini">취소</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {currentVideo.year && <span className="ld-year-badge">#{currentVideo.year}</span>}
                                        {currentVideo.is_on_timeline && <span className="ld-timeline-badge">Timeline</span>}
                                        {canEdit && (
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

                        {/* Description (Memo) */}
                        <div className="ld-video-memo-wrapper">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.85em', color: '#9ca3af' }}>영상 원본 정보</span>
                                {/* 기본 정보 수정 버튼 제거: 사용자는 전용 섹션에서만 수정하도록 차단 */}
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

                        {/* User Extended Note (New Section) */}
                        <div className="ld-video-content-wrapper" style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#60a5fa' }}>사용자 상세 메모</h3>
                                {canEdit && !isEditingVideoContent && (
                                    <button
                                        onClick={() => {
                                            setEditVideoContent(currentVideo.content || '');
                                            setIsEditingVideoContent(true);
                                        }}
                                        className="ld-edit-button-small"
                                        style={{ fontSize: '11px', padding: '4px 8px' }}
                                    >
                                        ✎ 상세 내용 수정
                                    </button>
                                )}
                            </div>

                            {isEditingVideoContent ? (
                                <div className="ld-edit-container">
                                    <textarea
                                        className="ld-edit-textarea"
                                        value={editVideoContent}
                                        onChange={(e) => setEditVideoContent(e.target.value)}
                                        placeholder="이 영상의 상세 배경, 강의 노트, 학습 팁 등 구체적인 내용을 입력하세요."
                                        rows={10}
                                        style={{ lineHeight: 1.6, width: '100%', background: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '4px', padding: '12px' }}
                                    />
                                    <div className="ld-edit-actions" style={{ marginTop: '10px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setIsEditingVideoContent(false)} className="ld-cancel-button" style={{ padding: '6px 12px', background: '#374151', color: '#d1d5db', border: 'none', borderRadius: '4px' }}>취소</button>
                                        <button onClick={handleUpdateVideoContent} className="ld-save-button" style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px' }}>저장</button>
                                    </div>
                                </div>
                            ) : (
                                <div className={`ld-video-content-display ${!currentVideo.content ? 'no-content' : ''}`} style={{ minHeight: '60px' }}>
                                    {currentVideo.content ? (
                                        <div style={{ lineHeight: 1.7, fontSize: '0.95rem', color: '#e5e7eb', whiteSpace: 'pre-wrap' }}>
                                            {renderTextWithLinks(currentVideo.content)}
                                        </div>
                                    ) : (
                                        <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '0.9rem' }}>공유하고 싶은 상세 노트를 추가해 보세요.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="ld-history-section-wrapper">
                        <HistoryContextWidget year={currentVideo.year || playlist.year || null} />
                    </div>



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
                                {canEdit && (
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
                                            <button
                                                onClick={startEditingDesc}
                                                className="ld-edit-button-small"
                                            >
                                                ✎ 설명 수정
                                            </button>
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
                                <>
                                    <h2 className="ld-sidebar-playlist-title">
                                        {playlist.title}
                                        {canEdit && (
                                            <button
                                                onClick={startEditingTitle}
                                                className="ld-edit-button-small"
                                                style={{ marginLeft: '8px', fontSize: '12px', padding: '2px 6px' }}
                                            >
                                                ✎
                                            </button>
                                        )}
                                    </h2>
                                    {playlist.description && (
                                        <p className="ld-sidebar-description">
                                            {playlist.description}
                                        </p>
                                    )}
                                </>
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
