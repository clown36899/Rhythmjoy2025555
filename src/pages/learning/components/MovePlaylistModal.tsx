import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import styles from './MovePlaylistModal.module.css';

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

interface Props {
    playlistId: string;
    currentCategoryId: string | null;
    itemType?: 'playlist' | 'document' | 'standalone_video';
    onClose: () => void;
    onSuccess: () => void;
}

export const MovePlaylistModal = ({ playlistId, currentCategoryId, itemType = 'playlist', onClose, onSuccess }: Props) => {
    const [categoryId, setCategoryId] = useState<string | null>(currentCategoryId);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(false);

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

    const handleMove = async () => {
        try {
            setIsLoading(true);

            const table = itemType === 'playlist' ? 'learning_playlists' :
                itemType === 'standalone_video' ? 'learning_videos' : 'learning_documents';

            const { error } = await supabase
                .from(table)
                .update({ category_id: categoryId })
                .eq('id', playlistId);

            if (error) throw error;

            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            alert('이동 실패');
        } finally {
            setIsLoading(false);
        }
    };

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
                    <h3 className={styles.title}>폴더 이동</h3>
                    <button onClick={onClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>이동할 폴더 선택</label>
                        <select
                            className={styles.select}
                            value={categoryId || ''}
                            onChange={(e) => setCategoryId(e.target.value || null)}
                        >
                            <option value="">(폴더 없음 / 최상위)</option>
                            {flatCategoryList.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {'\u00A0\u00A0'.repeat(cat.level || 0)} {cat.level && cat.level > 0 ? '└ ' : ''}{cat.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.cancelButton}>취소</button>
                    <button onClick={handleMove} disabled={isLoading} className={styles.saveButton}>
                        {isLoading ? '이동 중...' : '이동'}
                    </button>
                </div>
            </div>
        </div>
    );
};
