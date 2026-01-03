import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { extractPlaylistId, fetchPlaylistInfo, fetchPlaylistVideos } from '../utils/youtube';
import styles from './PlaylistImportModal.module.css';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

export const PlaylistImportModal = ({ onClose, onSuccess }: Props) => {
    const [url, setUrl] = useState('');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isPublic, setIsPublic] = useState(true); // 기본값: 공개

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
        try {
            setIsLoading(true);
            setError(null);
            setStatus('재생목록 정보 가져오는 중...');

            if (!categoryId) {
                throw new Error('카테고리(폴더)를 선택해주세요.');
            }

            const playlistId = extractPlaylistId(url);
            if (!playlistId) {
                throw new Error('유효한 유튜브 재생목록 URL이 아닙니다.');
            }

            // 1. 재생목록 정보 가져오기
            const playlistInfo = await fetchPlaylistInfo(playlistId);

            // 2. 비디오 목록 가져오기
            setStatus(`비디오 목록 가져오는 중... (${playlistInfo.title})`);
            const videos = await fetchPlaylistVideos(playlistId);

            if (videos.length === 0) {
                throw new Error('재생목록에 영상이 없습니다.');
            }

            // 3. DB 저장 - 사용자 정보 가져오기
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            setStatus('DB에 저장하는 중...');

            // 3-1. 재생목록 저장 (category_id 추가)
            const { data: playlist, error: playlistError } = await supabase
                .from('learning_playlists')
                .insert({
                    title: playlistInfo.title,
                    description: playlistInfo.description,
                    thumbnail_url: playlistInfo.thumbnail,
                    author_id: user.id,
                    is_public: isPublic, // 사용자가 선택한 공개/비공개 설정
                    youtube_playlist_id: playlistInfo.id,
                    category_id: categoryId // 선택한 폴더 ID
                })
                .select()
                .single();

            if (playlistError) throw playlistError;

            // 3-2. 비디오 저장
            const videoData = videos.map((video, index) => ({
                playlist_id: playlist.id,
                youtube_video_id: video.resourceId.videoId,
                title: video.title,
                order_index: index,
                memo: video.description?.slice(0, 100),
            }));

            const { error: videoError } = await supabase
                .from('learning_videos')
                .insert(videoData);

            if (videoError) throw videoError;

            setStatus('완료!');
            onSuccess();
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

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>유튜브 재생목록 가져오기</h3>
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
                            placeholder="https://www.youtube.com/playlist?list=..."
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
};
