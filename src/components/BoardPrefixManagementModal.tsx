import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import "./BoardPrefixManagementModal.css";

export interface BoardPrefix {
  id: number;
  name: string;
  color: string;
  admin_only: boolean;
  display_order: number;
  created_at: string;
}

interface BoardPrefixManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VIBRANT_PALETTE = [
  '#E63946', '#F1D302', '#52ADA2', '#1D3557', '#457B9D', '#2A9D8F', // Strong Basics
  '#E76F51', '#264653', '#A8DADC', '#F4A261', '#9D4EDD', '#FF006E', // Modern Vibrant
  '#3A86FF', '#8338EC', '#FFBE0B', '#FB5607', '#D90429', '#EF233C', // Neon/Bold
  '#0081A7', '#00AFB9', '#F07167', '#FED9B7', '#80ADD7', '#0ABDE3'  // Cool Tones
];

// Helper to pick a random color not in the current list
const getRandomUniqueColor = (existingColors: string[]) => {
  const unused = VIBRANT_PALETTE.filter(c => !existingColors.includes(c));
  const pool = unused.length > 0 ? unused : VIBRANT_PALETTE; // Fallback to full palette if all used
  return pool[Math.floor(Math.random() * pool.length)];
};

export default function BoardPrefixManagementModal({
  isOpen,
  onClose
}: BoardPrefixManagementModalProps) {
  const [prefixes, setPrefixes] = useState<BoardPrefix[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Category State
  const [selectedCategory, setSelectedCategory] = useState<string>('free'); // Default to free or first available
  const [categories, setCategories] = useState<{ code: string, name: string }[]>([]);

  const [newPrefix, setNewPrefix] = useState({
    name: '',
    color: '#3B82F6',
    admin_only: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadCategories(); // Load available board categories first
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Load prefixes whenever category changes
  useEffect(() => {
    if (isOpen && selectedCategory) {
      loadPrefixes();
      // Reset form when category changes
      setShowAddForm(false);
      setEditingId(null);
      setNewPrefix({ name: '', color: '#3B82F6', admin_only: false });
    }
  }, [isOpen, selectedCategory]);

  // Random color when form opens (ONLY if not editing)
  useEffect(() => {
    if (showAddForm && !editingId) {
      const existingColors = prefixes.map(p => p.color);
      setNewPrefix(prev => ({
        ...prev,
        color: getRandomUniqueColor(existingColors)
      }));
    }
  }, [showAddForm, editingId]); // Run when form opens or edit mode changes

  const loadCategories = async () => {
    const { data } = await supabase.from('board_categories').select('code, name').order('display_order');
    if (data && data.length > 0) {
      setCategories(data);
      // If current selectedCategory is not in the list (or it's initial load), set to first one
      if (!data.find(c => c.code === selectedCategory)) {
        setSelectedCategory(data[0].code);
      }
    }
  };

  const loadPrefixes = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('board_prefixes')
        .select('*')
        .order('display_order', { ascending: true });

      if (selectedCategory) {
        query = query.eq('board_category_code', selectedCategory);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPrefixes(data || []);
    } catch (error: any) {
      console.error('머릿말 로드 실패:', error);

      // Handle missing column error (Migration not applied)
      if (error?.code === '42703' || error?.message?.includes('board_category_code')) {
        alert('데이터베이스 업데이트가 필요합니다.\n\nSupabase 대시보드에서 다음 SQL을 실행해주세요:\n\nALTER TABLE board_prefixes ADD COLUMN IF NOT EXISTS board_category_code text REFERENCES board_categories(code) ON DELETE CASCADE;');
      } else {
        alert('머릿말을 불러오는 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrefix = async () => {
    // Check removed: unassigned category is no longer an option
    if (!newPrefix.name.trim()) {
      alert('머릿말 이름을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        // UPDATE Existing
        const { error } = await supabase
          .from('board_prefixes')
          .update({
            name: newPrefix.name,
            color: newPrefix.color,
            admin_only: newPrefix.admin_only
          })
          .eq('id', editingId);

        if (error) throw error;
        alert('머릿말이 수정되었습니다.');

      } else {
        // INSERT New
        const maxOrder = prefixes.length > 0
          ? Math.max(...prefixes.map(p => p.display_order))
          : 0;

        const { error } = await supabase
          .from('board_prefixes')
          .insert({
            name: newPrefix.name,
            color: newPrefix.color,
            admin_only: newPrefix.admin_only,
            display_order: maxOrder + 1,
            board_category_code: selectedCategory
          });

        if (error) throw error;
        alert('머릿말이 추가되었습니다!');
      }

      // Cleanup
      setNewPrefix({ name: '', color: '#3B82F6', admin_only: false });
      setShowAddForm(false);
      setEditingId(null);
      loadPrefixes();

    } catch (error) {
      console.error('머릿말 저장 실패:', error);
      alert('머릿말 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (prefix: BoardPrefix) => {
    setEditingId(prefix.id);
    setNewPrefix({
      name: prefix.name,
      color: prefix.color,
      admin_only: prefix.admin_only
    });
    setShowAddForm(true);
  };

  const handleDeletePrefix = async (id: number, name: string) => {
    if (!confirm(`"${name}" 머릿말을 삭제하시겠습니까?\n\n이 머릿말을 사용하는 게시글은 머릿말이 제거됩니다.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('board_prefixes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('머릿말이 삭제되었습니다.');
      loadPrefixes();
    } catch (error) {
      console.error('머릿말 삭제 실패:', error);
      alert('머릿말 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setNewPrefix({ name: '', color: '#3B82F6', admin_only: false });
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="bpm-overlay">
      <div className="bpm-container" translate="no">
        <div className="bpm-header">
          <h2 className="bpm-title">머릿말 관리</h2>
          <button onClick={onClose} className="bpm-close-btn">
            <i className="bpm-close-icon ri-close-line"></i>
          </button>
        </div>

        <div className="bpm-category-selector" style={{ padding: '0 20px 10px', borderBottom: '1px solid #eee' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', marginRight: '10px' }}>게시판 선택:</label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              // Close form when switching to avoid editing a prefix in the wrong category view
              handleCloseForm();
            }}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
          >
            {categories.map(cat => (
              <option key={cat.code} value={cat.code}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div className="bpm-content">
          {loading ? (
            <div className="bpm-loading">
              <i className="bpm-loading-icon ri-loader-4-line"></i>
              <p className="bpm-loading-text">로딩 중...</p>
            </div>
          ) : (
            <div className="bpm-content-inner">
              <div className="bpm-prefix-list">
                {prefixes.length === 0 && <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>등록된 머릿말이 없습니다.</div>}
                {prefixes.map((prefix) => (
                  <div key={prefix.id} className="bpm-prefix-item">
                    <div className="bpm-prefix-info">
                      <span
                        className="bpm-prefix-badge"
                        style={{ backgroundColor: prefix.color }}
                      >
                        {prefix.name}
                      </span>
                      {prefix.admin_only && (
                        <span className="bpm-prefix-admin-badge">
                          관리자 전용
                        </span>
                      )}
                    </div>

                    <div className="bpm-prefix-actions" style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleEditClick(prefix)}
                        className="bpm-prefix-edit-btn"
                        style={{
                          padding: '6px', border: 'none', background: 'transparent',
                          cursor: 'pointer', color: '#666', borderRadius: '4px',
                          transition: 'background 0.2s'
                        }}
                        title="수정"
                      >
                        <i className="ri-pencil-line"></i>
                      </button>
                      <button
                        onClick={() => handleDeletePrefix(prefix.id, prefix.name)}
                        className="bpm-prefix-delete-btn"
                      >
                        <i className="bpm-prefix-delete-icon ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {showAddForm ? (
                <div className="bpm-add-form">
                  <div className="bpm-add-form-inner">
                    <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '15px', color: '#333' }}>
                      {editingId ? '머릿말 수정' : '새 머릿말 추가'}
                    </h3>

                    <div className="bpm-form-group">
                      <label className="bpm-form-label">머릿말 이름</label>
                      <input
                        type="text"
                        value={newPrefix.name}
                        onChange={(e) => setNewPrefix(prev => ({ ...prev, name: e.target.value }))}
                        className="bpm-form-input"
                        placeholder="예: 후기, 질문, 정보 등"
                      />
                    </div>

                    <div className="bpm-form-group">
                      <label className="bpm-form-label">{editingId ? '배지 색상 변경' : '배지 색상 (자동 선택됨)'}</label>
                      <div className="bpm-color-selection">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <div
                            style={{
                              width: '40px', height: '40px', borderRadius: '8px',
                              backgroundColor: newPrefix.color,
                              border: '2px solid #ddd',
                              flexShrink: 0
                            }}
                          />

                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="color"
                              value={newPrefix.color}
                              onChange={(e) => setNewPrefix(prev => ({ ...prev, color: e.target.value }))}
                              style={{
                                width: '32px', height: '32px', padding: 0, border: 'none',
                                background: 'transparent', cursor: 'pointer',
                              }}
                              title="직접 색상 선택"
                            />
                          </div>

                          <button
                            onClick={() => {
                              const existingColors = prefixes.map(p => p.color);
                              setNewPrefix(prev => ({ ...prev, color: getRandomUniqueColor(existingColors) }));
                            }}
                            className="bpm-shuffle-btn"
                            style={{
                              padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd',
                              background: 'white', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <i className="ri-shuffle-line"></i> {editingId ? '랜덤 변경' : '랜덤'}
                          </button>
                        </div>

                        <div className="bpm-palette-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
                          {VIBRANT_PALETTE.map(color => (
                            <button
                              key={color}
                              onClick={() => setNewPrefix(prev => ({ ...prev, color }))}
                              style={{
                                width: '100%', paddingTop: '100%', // Square aspect ratio
                                backgroundColor: color,
                                borderRadius: '4px',
                                border: newPrefix.color === color ? '2px solid #333' : '1px solid #ddd',
                                cursor: 'pointer',
                                position: 'relative'
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bpm-form-group">
                      <label className="bpm-checkbox-label">
                        <input
                          type="checkbox"
                          checked={newPrefix.admin_only}
                          onChange={(e) => setNewPrefix(prev => ({ ...prev, admin_only: e.target.checked }))}
                          className="bpm-checkbox"
                        />
                        <span className="bpm-checkbox-text">관리자 전용 머릿말</span>
                      </label>
                    </div>

                    <div className="bpm-form-footer">
                      <button
                        onClick={handleCloseForm}
                        className="bpm-form-btn bpm-form-btn-cancel"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleSavePrefix}
                        disabled={isSubmitting}
                        className="bpm-form-btn bpm-form-btn-submit"
                      >
                        {isSubmitting ? '저장 중...' : (editingId ? '수정 저장' : '추가')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)} className="bpm-add-btn">
                  <i className="bpm-add-btn-icon ri-add-line"></i>
                  새 머릿말 추가 ({categories.find(c => c.code === selectedCategory)?.name})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
