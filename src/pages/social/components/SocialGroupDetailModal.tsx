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

                    {/* Location Section */}
                    {group.address && (
                        <div className="sgdm-section">
                            <h3 className="sgdm-section-title">위치</h3>
                            <p className="sgdm-address">
                                <i className="ri-map-pin-line"></i>
                                {group.address}
                            </p>
                            <div className="sgdm-map-buttons">
                                <button
                                    className="sgdm-map-btn naver"
                                    onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(group.address!)}`, '_blank')}
                                >
                                    <i className="ri-map-pin-2-fill" style={{ color: '#2db400' }}></i> 네이버지도
                                </button>
                                <button
                                    className="sgdm-map-btn google"
                                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(group.address!)}`, '_blank')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18px" height="18px" style={{ display: 'block' }}>
                                        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                                        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                                        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                                        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                                    </svg> 구글지도
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Link Section */}
                    {group.link && (
                        <div className="sgdm-section">
                            <h3 className="sgdm-section-title">관련 링크</h3>
                            <a href={group.link} target="_blank" rel="noopener noreferrer" className="sgdm-link-btn">
                                <i className="ri-link"></i>
                                {group.link}
                            </a>
                        </div>
                    )}

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
