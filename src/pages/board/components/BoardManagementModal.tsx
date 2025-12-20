import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import './BoardManagementModal.css'; // Use dedicated CSS

interface BoardManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
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

    useEffect(() => {
        if (isOpen) {
            loadCategories();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

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

        try {
            await Promise.all([
                supabase.from('board_categories').update({ display_order: targetCat.display_order }).eq('code', currentCat.code),
                supabase.from('board_categories').update({ display_order: currentCat.display_order }).eq('code', targetCat.code)
            ]);
        } catch (error) {
            console.error('Reorder failed:', error);
            alert('순서 변경 실패');
            loadCategories(); // Revert
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="bmm-overlay" onClick={onClose}>
            <div className="bmm-container" onClick={e => e.stopPropagation()}>
                <div className="bmm-header">
                    <h2 className="bmm-title">게시판 관리</h2>
                    <button onClick={() => { onUpdate(); onClose(); }} className="bmm-close-btn">
                        <i className="ri-close-line" style={{ fontSize: '20px' }}></i>
                    </button>
                </div>

                <div className="bmm-content">
                    {loading ? (
                        <div className="bmm-loading">
                            <i className="ri-loader-4-line ri-spin" style={{ fontSize: '24px', marginBottom: '8px' }}></i>
                            <div>로딩 중...</div>
                        </div>
                    ) : (
                        <table className="bmm-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '80px', textAlign: 'center' }}>순서</th>
                                    <th>코드</th>
                                    <th>이름 (수정)</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>상태</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((cat, index) => (
                                    <tr key={cat.code}>
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
                                            <input
                                                type="text"
                                                defaultValue={cat.name}
                                                onBlur={(e) => {
                                                    if (e.target.value !== cat.name) {
                                                        handleNameChange(cat.code, e.target.value);
                                                    }
                                                }}
                                                className="bmm-input"
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleToggleActive(cat.code, cat.is_active)}
                                                className={`bmm-btn ${cat.is_active ? 'bmm-btn-active' : 'bmm-btn-inactive'}`}
                                            >
                                                {cat.is_active ? '공개' : '비공개'}
                                            </button>
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
