import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import styles from './PlaylistImportModal.module.css';

interface Props {
    onClose: () => void;
    onSuccess: (data: any) => void;
    context: 'drawer' | 'canvas';
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    level?: number;
    children?: Category[];
}

export const CanvasCreateModal = ({ onClose, onSuccess, context }: Props) => {
    const { isAdmin } = useAuth();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [year, setYear] = useState('');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const handleCreate = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            setIsLoading(true);
            setError(null);

            if (!title.trim()) throw new Error('캔버스 제목을 입력해주세요.');

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            // Even if "Node only", if it's a sub-canvas it needs a category entry to hold its own nodes
            // But if the user says "Don't add to drawer", we can perhaps omit parent_id or add a 'hidden' flag.
            // For now, let's create it as a category with subtype 'canvas' but pass it back for node creation.
            const { data: newCategory, error: insertError } = await supabase
                .from('learning_categories')
                .insert({
                    name: title,
                    description: description,
                    parent_id: context === 'drawer' ? (categoryId || null) : null, // If canvas context, usually root-level or orphan in drawer terms
                    user_id: user.id,
                    year: year ? parseInt(year) : null,
                    metadata: {
                        subtype: 'canvas',
                        created_at: new Date().toISOString(),
                        is_hidden_from_drawer: context === 'canvas' // Marker to hide from drawer if desired
                    }
                })
                .select()
                .single();

            if (insertError) throw insertError;

            console.log('✅ [CanvasCreateModal] Success:', newCategory);
            onSuccess(newCategory);
            onClose();
        } catch (err: any) {
            console.error(err);
            setError(err.message || '저장 실패');
        } finally {
            setIsLoading(false);
        }
    };

    const modalContent = (
        <div className={styles.overlay}>
            <div className={styles.modal} style={{ maxWidth: '500px', width: '90%' }}>
                <div className={styles.header}>
                    <h3 className={styles.title}>새 캔버스 생성</h3>
                    <button onClick={onClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>캔버스 제목 <span className={styles.required}>*</span></label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="캔버스의 이름을 입력하세요"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>상위 폴더 (선택사항)</label>
                        <select
                            className={styles.select}
                            value={categoryId || ''}
                            onChange={(e) => setCategoryId(e.target.value)}
                        >
                            <option value="">최상위 (Root)</option>
                            {flatCategoryList.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {'\u00A0\u00A0'.repeat(cat.level || 0)} {cat.level && cat.level > 0 ? '└ ' : ''}{cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>연도 (타임라인 배치용)</label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="예: 1940"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>설명 / 주제 요약</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="이 캔버스의 목적이나 주제를 설명하세요..."
                            className={styles.input}
                            style={{ minHeight: '100px', resize: 'vertical' }}
                        />
                    </div>

                    {error && (
                        <div className={`${styles.message} ${styles.error}`}>
                            {error}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.cancelButton}>취소</button>
                    <button
                        onClick={handleCreate}
                        disabled={isLoading || !title}
                        className={styles.importButton}
                    >
                        {isLoading ? '생성 중...' : '캔버스 생성'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
