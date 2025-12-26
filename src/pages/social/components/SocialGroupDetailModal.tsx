import React from 'react';
import { createPortal } from 'react-dom';
import { useModalHistory } from '../../../hooks/useModalHistory';
import type { SocialGroup } from '../types';
import { supabase } from '../../../lib/supabase';
import './SocialGroupDetailModal.css';

interface SocialGroupDetailModalProps {
    group: SocialGroup;
    onClose: () => void;
    onEdit: () => void;
    onViewSchedule: () => void;
    isAdmin: boolean;
}

export default function SocialGroupDetailModal({
    group,
    onClose,
    onEdit,
    onViewSchedule,
    isAdmin
}: SocialGroupDetailModalProps) {
    useModalHistory(true, onClose);

    return createPortal(
        <div className="sgdm-overlay" onClick={onClose}>
            <div className="sgdm-container" onClick={(e) => e.stopPropagation()}>
                {/* Close Button */}
                <button onClick={onClose} className="sgdm-close-btn">
                    <i className="ri-close-line"></i>
                </button>

                {/* Header Image */}
                <div className="sgdm-image-wrapper">
                    {group.image_url || group.image_thumbnail ? (
                        <img
                            src={group.image_medium || group.image_url || group.image_thumbnail}
                            alt={group.name}
                            className="sgdm-image"
                        />
                    ) : (
                        <div className="sgdm-image-placeholder">
                            <i className="ri-team-line"></i>
                        </div>
                    )}
                    <div className="sgdm-gradient-overlay"></div>
                </div>

                <div className="sgdm-content">
                    {/* Title Section */}
                    <div className="sgdm-header">
                        <span className="sgdm-type-badge">
                            {group.type === 'club' ? '동호회' : group.type === 'bar' ? '스윙바' : '기타'}
                        </span>
                        <h2 className="sgdm-title">{group.name}</h2>
                        {/* 관리자 전용 작성자 정보 표시 */}
                        {isAdmin && (
                            <div className="sgdm-admin-author">
                                <i className="ri-user-settings-line"></i>
                                <span>
                                    생성: {group.created_at ? new Date(group.created_at).toLocaleDateString() : '날짜 없음'} | 계정: {group.board_users?.nickname || '정보 없음'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="sgdm-description-box">
                        <h3 className="sgdm-section-title">소개</h3>
                        <p className="sgdm-description">
                            {group.description || '등록된 소개글이 없습니다.'}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="sgdm-actions">
                        <button onClick={onViewSchedule} className="sgdm-btn primary">
                            <i className="ri-calendar-event-line"></i>
                            일정 모아보기
                        </button>

                        <button onClick={onEdit} className="sgdm-btn secondary">
                            <i className="ri-edit-line"></i>
                            정보 수정 / 관리
                        </button>
                    </div>

                    {/* Admin/Creator Info (Optional) */}
                    {/* <div className="sgdm-meta">
                        <span>등록일: {new Date(group.created_at).toLocaleDateString()}</span>
                    </div> */}
                </div>
            </div>
        </div>,
        document.body
    );
}
