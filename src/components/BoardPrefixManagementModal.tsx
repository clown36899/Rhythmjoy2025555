import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999999]">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90svh] relative z-[999999] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">머릿말 관리</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="text-center py-12">
              <i className="ri-loader-4-line text-3xl text-blue-500 animate-spin"></i>
              <p className="text-gray-400 mt-2">로딩 중...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 머릿말 목록 */}
              <div className="space-y-2">
                {prefixes.map((prefix) => (
                  <div
                    key={prefix.id}
                    className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="px-3 py-1 rounded text-white text-sm font-medium"
                        style={{ backgroundColor: prefix.color }}
                      >
                        {prefix.name}
                      </span>
                      {prefix.admin_only && (
                        <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded">
                          관리자 전용
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeletePrefix(prefix.id, prefix.name)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <i className="ri-delete-bin-line text-xl"></i>
                    </button>
                  </div>
                ))}
              </div>

              {/* 추가 폼 */}
              {showAddForm ? (
                <div className="bg-gray-700 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      머릿말 이름
                    </label>
                    <input
                      type="text"
                      value={newPrefix.name}
                      onChange={(e) => setNewPrefix(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-gray-600 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: 후기, 질문, 정보 등"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      배지 색상
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={newPrefix.color}
                        onChange={(e) => setNewPrefix(prev => ({ ...prev, color: e.target.value }))}
                        className="h-10 w-20 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={newPrefix.color}
                        onChange={(e) => setNewPrefix(prev => ({ ...prev, color: e.target.value }))}
                        className="flex-1 bg-gray-600 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="#3B82F6"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPrefix.admin_only}
                        onChange={(e) => setNewPrefix(prev => ({ ...prev, admin_only: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600"
                      />
                      <span className="text-gray-300 text-sm">관리자 전용 머릿말</span>
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewPrefix({ name: '', color: '#3B82F6', admin_only: false });
                      }}
                      className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded font-medium transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleAddPrefix}
                      disabled={isSubmitting}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? '추가 중...' : '추가'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <i className="ri-add-line text-xl"></i>
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
