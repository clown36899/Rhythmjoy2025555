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

export default function BoardPrefixManagementModal({
  isOpen,
  onClose
}: BoardPrefixManagementModalProps) {
  const [prefixes, setPrefixes] = useState<BoardPrefix[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPrefix, setNewPrefix] = useState({
    name: '',
    color: '#3B82F6',
    admin_only: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadPrefixes();
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const loadPrefixes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('board_prefixes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setPrefixes(data || []);
    } catch (error) {
      console.error('머릿말 로드 실패:', error);
      alert('머릿말을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPrefix = async () => {
    if (!newPrefix.name.trim()) {
      alert('머릿말 이름을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const maxOrder = prefixes.length > 0 
        ? Math.max(...prefixes.map(p => p.display_order)) 
        : 0;

      const { error } = await supabase
        .from('board_prefixes')
        .insert({
          name: newPrefix.name,
          color: newPrefix.color,
          admin_only: newPrefix.admin_only,
          display_order: maxOrder + 1
        });

      if (error) throw error;

      alert('머릿말이 추가되었습니다!');
      setNewPrefix({ name: '', color: '#3B82F6', admin_only: false });
      setShowAddForm(false);
      loadPrefixes();
    } catch (error) {
      console.error('머릿말 추가 실패:', error);
      alert('머릿말 추가 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
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

  if (!isOpen) return null;

  const modalContent = (
    <div className="bpm-overlay">
      <div className="bpm-container">
        <div className="bpm-header">
          <h2 className="bpm-title">머릿말 관리</h2>
          <button onClick={onClose} className="bpm-close-btn">
            <i className="bpm-close-icon ri-close-line"></i>
          </button>
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
                    <button
                      onClick={() => handleDeletePrefix(prefix.id, prefix.name)}
                      className="bpm-prefix-delete-btn"
                    >
                      <i className="bpm-prefix-delete-icon ri-delete-bin-line"></i>
                    </button>
                  </div>
                ))}
              </div>

              {showAddForm ? (
                <div className="bpm-add-form">
                  <div className="bpm-add-form-inner">
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
                      <label className="bpm-form-label">배지 색상</label>
                      <div className="bpm-color-row">
                        <input
                          type="color"
                          value={newPrefix.color}
                          onChange={(e) => setNewPrefix(prev => ({ ...prev, color: e.target.value }))}
                          className="bpm-color-picker"
                        />
                        <input
                          type="text"
                          value={newPrefix.color}
                          onChange={(e) => setNewPrefix(prev => ({ ...prev, color: e.target.value }))}
                          className="bpm-color-input"
                          placeholder="#3B82F6"
                        />
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
                        onClick={() => {
                          setShowAddForm(false);
                          setNewPrefix({ name: '', color: '#3B82F6', admin_only: false });
                        }}
                        className="bpm-form-btn bpm-form-btn-cancel"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleAddPrefix}
                        disabled={isSubmitting}
                        className="bpm-form-btn bpm-form-btn-submit"
                      >
                        {isSubmitting ? '추가 중...' : '추가'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)} className="bpm-add-btn">
                  <i className="bpm-add-btn-icon ri-add-line"></i>
                  새 머릿말 추가
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
