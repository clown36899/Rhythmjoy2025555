import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import './userreg.css';

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
      /* RPC 함수 모호성 에러(ambiguous function) 회피를 위해 직접 Insert 사용 */
      const { error } = await supabase
        .from('board_users')
        .insert({
          user_id: userId,
          nickname: formData.nickname,
          real_name: formData.real_name,
          phone: formData.phone,
          gender: formData.gender
        });

      if (error) throw error;

      alert('회원가입이 완료되었습니다!');
      onRegistered(formData);
      onClose();
    } catch (error: any) {
      console.error('회원가입 실패:', error);
      alert(`회원가입 중 오류가 발생했습니다:\n${error.message || error.details || JSON.stringify(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="userreg-overlay">
      <div className="userreg-modal">
        {/* Header */}
        <div className="userreg-header">
          <div className="userreg-header-top">
            <h2 className="userreg-title">
              {previewMode ? '회원가입 폼 미리보기' : '회원가입'}
            </h2>
            <button
              onClick={onClose}
              className="userreg-close-btn"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>
          {previewMode && (
            <div className="userreg-preview-notice">
              <p className="userreg-preview-text">
                <i className="ri-eye-line"></i>
                관리자 미리보기 모드 - 실제 가입은 되지 않습니다
              </p>
            </div>
          )}
          <p className="userreg-subtitle">
            게시판 이용을 위해 정보를 입력해주세요
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="userreg-form">
          {/* 닉네임 */}
          <div className="userreg-field">
            <label className="userreg-label">
              닉네임 <span className="userreg-required">*</span>
            </label>
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleInputChange}
              required
              className="userreg-input"
              placeholder="게시판에 표시될 닉네임"
            />
          </div>

          {/* 본명 */}
          <div className="userreg-field">
            <label className="userreg-label">
              본명 <span className="userreg-required">*</span>
            </label>
            <input
              type="text"
              name="real_name"
              value={formData.real_name}
              onChange={handleInputChange}
              required
              className="userreg-input"
              placeholder="실명을 입력하세요"
            />
          </div>

          {/* 전화번호 */}
          <div className="userreg-field">
            <label className="userreg-label">
              전화번호 <span className="userreg-required">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              required
              className="userreg-input"
              placeholder="010-0000-0000"
            />
          </div>

          {/* 성별 */}
          <div className="userreg-field">
            <label className="userreg-label">
              성별 <span className="userreg-required">*</span>
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              required
              className="userreg-select"
            >
              <option value="">선택하세요</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
              <option value="other">기타</option>
            </select>
          </div>

          {/* 안내 메시지 */}
          <div className="userreg-notice">
            <p className="userreg-notice-text">
              <i className="ri-information-line"></i>
              입력하신 정보는 게시판 관리 목적으로만 사용됩니다.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="userreg-footer">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="userreg-submit-btn"
          >
            {isSubmitting ? '가입 중...' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
