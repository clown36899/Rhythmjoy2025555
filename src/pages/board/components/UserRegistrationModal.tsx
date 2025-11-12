import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (userData: UserData) => void;
  userId: string;
  previewMode?: boolean; // 관리자 미리보기 모드
}

export interface UserData {
  nickname: string;
  real_name: string;
  phone: string;
  gender: string;
}

export default function UserRegistrationModal({
  isOpen,
  onClose,
  onRegistered,
  userId,
  previewMode = false
}: UserRegistrationModalProps) {
  const [formData, setFormData] = useState<UserData>({
    nickname: '',
    real_name: '',
    phone: '',
    gender: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 미리보기 모드면 실제 저장하지 않음
    if (previewMode) {
      alert('미리보기 모드입니다. 실제 가입은 되지 않습니다.');
      return;
    }

    if (!formData.nickname.trim()) {
      alert('닉네임을 입력해주세요.');
      return;
    }

    if (!formData.real_name.trim()) {
      alert('본명을 입력해주세요.');
      return;
    }

    if (!formData.phone.trim()) {
      alert('전화번호를 입력해주세요.');
      return;
    }

    if (!formData.gender) {
      alert('성별을 선택해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.rpc('register_board_user', {
        p_user_id: userId,
        p_nickname: formData.nickname,
        p_real_name: formData.real_name,
        p_phone: formData.phone,
        p_gender: formData.gender
      });

      if (error) throw error;

      alert('회원가입이 완료되었습니다!');
      onRegistered(formData);
      onClose();
    } catch (error) {
      console.error('회원가입 실패:', error);
      alert('회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999999]">
      <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[90svh] relative z-[999999] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-white flex-1 text-center">
              {previewMode ? '회원가입 폼 미리보기' : '회원가입'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>
          {previewMode && (
            <div className="bg-blue-900/30 border border-blue-500/50 rounded px-3 py-2 mb-2">
              <p className="text-blue-300 text-xs">
                <i className="ri-eye-line mr-1"></i>
                관리자 미리보기 모드 - 실제 가입은 되지 않습니다
              </p>
            </div>
          )}
          <p className="text-gray-400 text-sm text-center">
            게시판 이용을 위해 정보를 입력해주세요
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 닉네임 */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              닉네임 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleInputChange}
              required
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="게시판에 표시될 닉네임"
            />
          </div>

          {/* 본명 */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              본명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="real_name"
              value={formData.real_name}
              onChange={handleInputChange}
              required
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="실명을 입력하세요"
            />
          </div>

          {/* 전화번호 */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              전화번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              required
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="010-0000-0000"
            />
          </div>

          {/* 성별 */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              성별 <span className="text-red-500">*</span>
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              required
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
              <option value="other">기타</option>
            </select>
          </div>

          {/* 안내 메시지 */}
          <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-3">
            <p className="text-blue-300 text-sm">
              <i className="ri-information-line mr-1"></i>
              입력하신 정보는 게시판 관리 목적으로만 사용됩니다.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-700 flex-shrink-0 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '가입 중...' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
