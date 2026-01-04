import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import styles from './PlaylistImportModal.module.css'; // Re-using same layout styles

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    level?: number;
    children?: Category[];
}

export const DocumentCreateModal = ({ onClose, onSuccess }: Props) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [year, setYear] = useState<string>('');
    const [isOnTimeline, setIsOnTimeline] = useState(false);
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isPublic, setIsPublic] = useState(true);

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
        try {
            setIsLoading(true);
            setError(null);

            if (!title.trim()) throw new Error('제목을 입력해주세요.');
            if (!categoryId) throw new Error('카테고리를 선택해주세요.');

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const { error: insertError } = await supabase
                .from('learning_documents')
                .insert({
                    title,
                    content,
                    year: year ? parseInt(year) : null,
                    is_on_timeline: isOnTimeline,
                    category_id: categoryId,
                    is_public: isPublic,
                    author_id: user.id
                });

            if (insertError) throw insertError;

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error(err);
            setError(err.message || '저장 실패');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal} style={{ maxWidth: '600px', width: '90%' }}>
                <div className={styles.header}>
                    <h3 className={styles.title}>새 문서(Markdown) 작성</h3>
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
                        <label className={styles.label}>제목 <span className={styles.required}>*</span></label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="문서 제목을 입력하세요"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>연도 (역사 타임라인용)</label>
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
                                checked={isOnTimeline}
                                onChange={(e) => setIsOnTimeline(e.target.checked)}
                                className={styles.checkbox}
                            />
                            <span>역사 타임라인(캔버스)에 표시</span>
                        </label>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className={styles.checkbox}
                            />
                            <span>공개 문서로 설정 (체크 해제 시 비공개)</span>
                        </label>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>내용 (Markdown 지원 예정)</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="문서 내용을 입력하세요..."
                            className={styles.input}
                            style={{ minHeight: '200px', resize: 'vertical' }}
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
                        disabled={isLoading || !title || !categoryId}
                        className={styles.importButton}
                    >
                        {isLoading ? '저장 중...' : '문서 저장'}
                    </button>
                </div>
            </div>
        </div>
    );
};
