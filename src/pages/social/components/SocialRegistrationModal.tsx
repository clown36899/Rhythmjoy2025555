import React from 'react';
import type { SocialGroup } from '../types';
import './SocialRegistrationModal.css';

interface SocialRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    userGroups: SocialGroup[];
    onSelectGroup: (group: SocialGroup) => void;
    onCreateGroup: () => void;
}

const SocialRegistrationModal: React.FC<SocialRegistrationModalProps> = ({
    isOpen,
    onClose,
    userGroups,
    onSelectGroup,
    onCreateGroup
}) => {
    if (!isOpen) return null;

    return (
        <div className="srm-overlay" onClick={onClose}>
            <div className="srm-content" onClick={e => e.stopPropagation()}>
                <div className="srm-header">
                    <h2 className="srm-title">소셜 일정 등록</h2>
                    <button className="srm-close-btn" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="srm-body">
                    <p className="srm-desc">
                        <i className="ri-information-fill" style={{ marginRight: '6px', color: '#60a5fa' }}></i>
                        소셜일정을 등록하려면 단체(주최자)를 선택해야 합니다.<br />
                        <span style={{ fontSize: '0.85rem', color: '#9ca3af', display: 'block', marginTop: '6px', paddingLeft: '22px' }}>
                            비밀번호로 추가하시려면 하단에 등록단체 리스트에서 일정등록 버튼으로 등록해주세요.
                        </span>
                    </p>

                    <div className="srm-list">
                        {/* 1. Existing Groups */}
                        {userGroups.length > 0 && (
                            <div className="srm-group-section">
                                <h3 className="srm-section-title">내 단체 선택</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {userGroups.map(group => (
                                        <div
                                            key={group.id}
                                            className="group-wide-card"
                                            onClick={() => onSelectGroup(group)}
                                            style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                                        >
                                            <div className="group-wide-image">
                                                <img
                                                    src={group.image_url || group.image_thumbnail || group.image_micro || '/logo.png'}
                                                    alt={group.name}
                                                    loading="lazy"
                                                    onError={(e) => e.currentTarget.src = '/logo.png'}
                                                />
                                                <div className="group-type-tag">{group.type === 'club' ? '동호회' : group.type === 'bar' ? '바' : '기타'}</div>
                                            </div>
                                            <div className="group-wide-info">
                                                <div className="group-wide-header">
                                                    <h3 className="group-wide-name">{group.name}</h3>
                                                </div>
                                                <p className="group-wide-desc">{group.description || '설명 없음'}</p>
                                                <div className="group-wide-footer">
                                                    <button className="admin-add-item-btn" style={{ width: '100%', justifyContent: 'center' }}>
                                                        <i className="ri-add-line"></i> 일정 등록하기
                                                    </button>
                                                    <p style={{ marginTop: '6px', fontSize: '0.75rem', color: '#ef4444', textAlign: 'center', wordBreak: 'keep-all' }}>
                                                        <i className="ri-alert-line" style={{ marginRight: '2px', verticalAlign: 'text-bottom' }}></i>
                                                        행사는 별도 등록, 소셜일정만 등록해주세요
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 2. Create New Group */}
                        <div className="srm-create-group-section">
                            <h3 className="srm-section-title">새로운 단체 등록</h3>
                            <button
                                className="srm-create-btn"
                                onClick={onCreateGroup}
                            >
                                <i className="ri-add-circle-fill"></i>
                                <span>새로운 단체 등록하기</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SocialRegistrationModal;
