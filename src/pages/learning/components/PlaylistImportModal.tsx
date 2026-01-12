import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { extractPlaylistId, fetchPlaylistInfo, fetchPlaylistVideos, extractVideoId, fetchVideoDetails } from '../utils/youtube';
import styles from './PlaylistImportModal.module.css';

interface Props {
    onClose: () => void;
    onSuccess: (result: any) => void;
    context: 'drawer' | 'canvas';
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

export const PlaylistImportModal = ({ onClose, onSuccess, context }: Props) => {
    const { isAdmin } = useAuth();
    const [url, setUrl] = useState('');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isPublic, setIsPublic] = useState(true); // 기본값: 공개
    const [year, setYear] = useState<string>(''); // 연도 필드 추가
    const isOnTimeline = true; // 타임라인 무조건 표시

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('learning_categories').select('*').order('created_at');
            if (data) {
                setCategories(buildTree(data));
            }
        };
        fetchCategories();
    }, []);

    const buildTree = (items: any[], parentId: string | null = null, level: number = 0): Category[] => {
        return items
            .filter(item => item.parent_id === parentId)
            .map(item => ({
                ...item,
                level,
                children: buildTree(items, item.id, level + 1)
            }));
    };

    const handleImport = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            setIsLoading(true);
            setError(null);
            setStatus('정보 가져오는 중...');

            if (!categoryId) {
                throw new Error('카테고리(폴더)를 선택해주세요.');
            }

            const playlistId = extractPlaylistId(url);
            const videoId = extractVideoId(url);

            if (!playlistId && !videoId) {
                throw new Error('유효한 유튜브 재생목록 또는 동영상 URL이 아닙니다.');
            }

            // 3. DB 저장 - 사용자 정보 가져오기
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            if (playlistId) {
                // --- 재생목록 처리 로직 (폴더 생성 방식) ---
                setStatus('재생목록 정보 가져오는 중...');
                const playlistInfo = await fetchPlaylistInfo(playlistId);

                setStatus(`비디오 목록 가져오는 중... (${playlistInfo.title})`);
                const videos = await fetchPlaylistVideos(playlistId);

                if (videos.length === 0) {
                    throw new Error('재생목록에 영상이 없습니다.');
                }

                setStatus('새 폴더 생성 중...');

                // 3-1. 새 폴더(카테고리) 생성
                const { data: newCategory, error: catError } = await supabase
                    .from('learning_categories')
                    .insert({
                        name: playlistInfo.title,
                        parent_id: categoryId, // 선택한 폴더의 하위로 생성
                        order_index: 0 // 맨 위로? 혹은 마지막? 일단 0
                    })
                    .select()
                    .maybeSingle();

                if (catError) throw catError;
                if (!newCategory) throw new Error('폴더 생성에 실패했습니다.');

                setStatus('영상 저장 중...');

                const videoData = videos.map((video, index) => ({
                    category_id: newCategory.id, // Newly created folder ID
                    user_id: user.id,
                    type: 'video',
                    title: video.title,
                    description: video.description,
                    image_url: video.thumbnail,
                    year: year ? parseInt(year) : null,
                    metadata: {
                        is_public: isPublic,
                        youtube_video_id: video.resourceId.videoId,
                        order_index: index,
                        is_on_timeline: context === 'canvas' || isOnTimeline,
                        created_at: new Date().toISOString()
                    }
                }));

                const { data: createdVideos, error: videoError } = await supabase
                    .from('learning_resources')
                    .insert(videoData)
                    .select();

                if (videoError) throw videoError;

                onSuccess({ type: 'playlist', folder: newCategory, videos: createdVideos });

            } else if (videoId) {
                // --- Single Video logic ---
                setStatus('동영상 정보 가져오는 중...');
                const videoInfo = await fetchVideoDetails(videoId);

                if (!videoInfo) {
                    throw new Error('동영상 정보를 가져올 수 없습니다.');
                }

                setStatus('DB에 저장하는 중...');

                const { data: newVideo, error: videoError } = await supabase
                    .from('learning_resources')
                    .insert({
                        category_id: categoryId,
                        user_id: user.id,
                        type: 'video',
                        title: videoInfo.title,
                        description: videoInfo.description,
                        image_url: videoInfo.thumbnail,
                        year: year ? parseInt(year) : null,
                        metadata: {
                            is_public: isPublic,
                            youtube_video_id: videoInfo.id,
                            is_on_timeline: context === 'canvas' || isOnTimeline,
                            created_at: new Date().toISOString()
                        }
                    })
                    .select()
                    .single();

                if (videoError) throw videoError;

                onSuccess({ type: 'video', resource: newVideo });
            }

            setStatus('완료!');
            // PlaylistImportModal expected results in onSuccess if type provided, but handles undefined for simple refresh.
            // Page.tsx (drawer context) uses fetchData which takes no args. 
            // Correct call according to definition or use callback style.
            onSuccess(undefined);
            onClose();

        } catch (err: any) {
            console.error(err);
            setError(err.message || '가져오기 실패');
        } finally {
            setIsLoading(false);
        }
    };

    // Flatten tree for select dropdown, adding indentation
    const flattenCategories = (cats: Category[]): Category[] => {
        let result: Category[] = [];
        cats.forEach(cat => {
            result.push(cat);
            if (cat.children) {
                result = [...result, ...flattenCategories(cat.children)];
            }
        });
        return result;
    };

    const flatCategoryList = flattenCategories(categories);

    const modalContent = (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>유튜브 영상/재생목록 가져오기</h3>
                    <button onClick={onClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            저장할 폴더 (카테고리) <span className={styles.required}>*</span>
                        </label>
                        <select
                            className={styles.select}
                            value={categoryId || ''}
                            onChange={(e) => setCategoryId(e.target.value)}
                        >
                            <option value="">폴더 선택...</option>
                            {flatCategoryList.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {'\u00A0\u00A0'.repeat(cat.level || 0)} {cat.level && cat.level > 0 ? '└ ' : ''}{cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            연도 (역사 타임라인용)
                        </label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="예: 1980"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className={styles.checkbox}
                            />
                            <span>공개 재생목록으로 설정 (체크 해제 시 비공개)</span>
                        </label>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            재생목록 URL <span className={styles.required}>*</span>
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.youtube.com/playlist?list=... 또는 영상 URL"
                            className={styles.input}
                        />
                    </div>

                    {error && (
                        <div className={`${styles.message} ${styles.error}`}>
                            {error}
                        </div>
                    )}

                    {status && (
                        <div className={`${styles.message} ${styles.status}`}>
                            {status}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button
                        onClick={onClose}
                        className={styles.cancelButton}
                    >
                        취소
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isLoading || !url || !categoryId}
                        className={styles.importButton}
                    >
                        {isLoading ? '가져오는 중...' : '가져오기'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
