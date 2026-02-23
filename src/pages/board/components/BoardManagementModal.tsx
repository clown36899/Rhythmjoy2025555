import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import LocalLoading from '../../../components/LocalLoading';
import './BoardManagementModal.css'; // Use dedicated CSS

interface BoardManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

interface ManageableCategory {
    code: string;
    name: string;
    is_active: boolean;
    display_order: number;
}

export default function BoardManagementModal({ isOpen, onClose, onUpdate }: BoardManagementModalProps) {
    const [categories, setCategories] = useState<ManageableCategory[]>([]);
    const [loading, setLoading] = useState(true);

    const [reorderedItemCode, setReorderedItemCode] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadCategories();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    // Clear highlight after delay
    useEffect(() => {
        if (reorderedItemCode) {
            const timer = setTimeout(() => {
                setReorderedItemCode(null);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [reorderedItemCode]);

    const loadCategories = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('board_categories')
                .select('*')
                .order('display_order', { ascending: true });

            if (error) throw error;
            setCategories(data || []);
        } catch (error) {
            console.error('Failed to load categories:', error);
            alert('게시판 목록 로딩 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBoard = async () => {
        const randomSuffix = Math.random().toString(36).substring(2, 6); // 4 char random
        const newCode = `brd_${randomSuffix}`;
        const newName = '새 게시판';

        // Find max display order
        const maxOrder = categories.length > 0
            ? Math.max(...categories.map(c => c.display_order))
            : 0;

        try {
            const { error } = await supabase
                .from('board_categories')
                .insert({
                    code: newCode,
                    name: newName,
                    is_active: true,
                    display_order: maxOrder + 1
                });

            if (error) throw error;

            await loadCategories();
            setReorderedItemCode(newCode); // Highlight new item

            // Trigger global refresh
            if (onUpdate) onUpdate();
            window.dispatchEvent(new Event('refreshBoardCategories'));

        } catch (error) {
            console.error('Create board failed:', error);
            alert('게시판 생성 실패');
        }
    };

    const handleToggleActive = async (code: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('board_categories')
                .update({ is_active: !currentStatus })
                .eq('code', code);

            if (error) throw error;

            // Optimistic update
            setCategories(prev => prev.map(c =>
                c.code === code ? { ...c, is_active: !currentStatus } : c
            ));

            setReorderedItemCode(code); // Highlight

            if (onUpdate) onUpdate();
            window.dispatchEvent(new Event('refreshBoardCategories'));
        } catch (error) {
            console.error('Update failed:', error);
            alert('변경 실패');
        }
    };

    const handleNameChange = async (code: string, newName: string) => {
        if (!newName.trim()) return;
        try {
            const { error } = await supabase
                .from('board_categories')
                .update({ name: newName })
                .eq('code', code);

            if (error) throw error;

            // Optimistic update
            setCategories(prev => prev.map(c =>
                c.code === code ? { ...c, name: newName } : c
            ));

            setReorderedItemCode(code); // Highlight
            alert('저장되었습니다.');

            if (onUpdate) onUpdate();
            window.dispatchEvent(new Event('refreshBoardCategories'));
        } catch (error) {
            console.error('Name update failed:', error);
            alert('이름 변경 실패');
        }
    };

    const handleMoveCategory = async (index: number, direction: 'up' | 'down') => {
        if (loading) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === categories.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const currentCat = categories[index];
        const targetCat = categories[targetIndex];

        // Optimistic update
        const newCategories = [...categories];
        newCategories[index] = { ...targetCat, display_order: currentCat.display_order };
        newCategories[targetIndex] = { ...currentCat, display_order: targetCat.display_order };
        // Sort by display_order to maintain visual order
        newCategories.sort((a, b) => a.display_order - b.display_order);
        setCategories(newCategories);

        setReorderedItemCode(currentCat.code); // Highlight moved item

        try {
            await Promise.all([
                supabase.from('board_categories').update({ display_order: targetCat.display_order }).eq('code', currentCat.code),
                supabase.from('board_categories').update({ display_order: currentCat.display_order }).eq('code', targetCat.code)
            ]);

            if (onUpdate) onUpdate();
            window.dispatchEvent(new Event('refreshBoardCategories'));
        } catch (error) {
            console.error('Reorder failed:', error);
            alert('순서 변경 실패');
            loadCategories(); // Revert
        }
    };

    const handleDeleteCategory = async (code: string) => {
        // Safety Check: Core Boards Protection (Updated: Only free/anonymous are protected)
        const protectedBoards = ['free', 'anonymous'];
        if (protectedBoards.includes(code)) {
            alert('삭제할 수 없는 기본 중요 게시판입니다.');
            return;
        }

        if (!window.confirm('정말 삭제하시겠습니까?\n\n주의: 게시판에 작성된 글들은 화면에서 사라지지만, 데이터베이스에는 안전하게 보존됩니다.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('board_categories')
                .delete()
                .eq('code', code);

            if (error) throw error;

            // Optimistic update
            setCategories(prev => prev.filter(c => c.code !== code));

            alert('삭제되었습니다.');
            if (onUpdate) onUpdate();
            window.dispatchEvent(new Event('refreshBoardCategories'));
        } catch (error) {
            console.error('Delete failed:', error);
            alert('삭제 실패 (남아있는 데이터가 있을 수 있습니다)');
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="bmm-overlay" onClick={onClose}>
            <div className="bmm-container" translate="no" onClick={e => e.stopPropagation()}>
                <div className="bmm-header">
                    <h2 className="bmm-title">게시판 관리</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleCreateBoard}
                            className="bmm-btn"
                            style={{ backgroundColor: '#2563eb', color: 'white' }}
                        >
                            <i className="ri-add-line" style={{ marginRight: '4px' }}></i>
                            게시판 추가
                        </button>
                        <button onClick={() => { if (onUpdate) onUpdate(); onClose(); }} className="bmm-close-btn">
                            <i className="ri-close-line" style={{ fontSize: '20px' }}></i>
                        </button>
                    </div>
                </div>

                <div className="bmm-content">
                    {loading ? (
                        <div className="bmm-loading">
                            <LocalLoading message="로딩 중..." size="lg" />
                        </div>
                    ) : (
                        <table className="bmm-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '80px', textAlign: 'center' }}>순서</th>
                                    <th>코드</th>
                                    <th>이름 (수정)</th>
                                    <th style={{ width: '130px', textAlign: 'center' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((cat, index) => (
                                    <tr
                                        key={cat.code}
                                        className={reorderedItemCode === cat.code ? 'highlight-row' : ''}
                                    >
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => handleMoveCategory(index, 'up')}
                                                    disabled={index === 0}
                                                    className="bmm-order-btn"
                                                    style={{ opacity: index === 0 ? 0.3 : 1 }}
                                                >
                                                    <i className="ri-arrow-up-s-line"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleMoveCategory(index, 'down')}
                                                    disabled={index === categories.length - 1}
                                                    className="bmm-order-btn"
                                                    style={{ opacity: index === categories.length - 1 ? 0.3 : 1 }}
                                                >
                                                    <i className="ri-arrow-down-s-line"></i>
                                                </button>
                                            </div>
                                        </td>
                                        <td style={{ color: '#888', fontSize: '0.85rem' }}>{cat.code}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <input
                                                    id={`bmm-name-input-${cat.code}`}
                                                    type="text"
                                                    defaultValue={cat.name}
                                                    className="bmm-input"
                                                    style={{ flex: 1 }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        const input = document.getElementById(`bmm-name-input-${cat.code}`) as HTMLInputElement;
                                                        if (input && input.value !== cat.name) {
                                                            handleNameChange(cat.code, input.value);
                                                        }
                                                    }}
                                                    className="bmm-save-btn"
                                                >
                                                    저장
                                                </button>
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <button
                                                    onClick={() => handleToggleActive(cat.code, cat.is_active)}
                                                    className={`bmm-btn ${cat.is_active ? 'bmm-btn-active' : 'bmm-btn-inactive'}`}
                                                    style={{ minWidth: '60px' }}
                                                >
                                                    {cat.is_active ? '공개' : '비공개'}
                                                </button>

                                                {!['free', 'anonymous'].includes(cat.code) && (
                                                    <button
                                                        onClick={() => handleDeleteCategory(cat.code)}
                                                        className="bmm-delete-btn"
                                                        title="게시판 삭제"
                                                    >
                                                        <i className="ri-delete-bin-line"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
