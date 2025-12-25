import React from 'react';
import type { SocialGroup } from '../types';
import './GroupDirectory.css';

interface GroupDirectoryProps {
    groups: SocialGroup[];
    favorites: number[];
    onToggleFavorite: (groupId: number) => void;
    onGroupClick: (group: SocialGroup) => void;
    onEditGroup: (group: SocialGroup) => void;
    isAdmin: boolean;
}

const GroupDirectory: React.FC<GroupDirectoryProps> = ({
    groups,
    favorites,
    onToggleFavorite,
    onGroupClick,
    onEditGroup,
    isAdmin
}) => {
    return (
        <section className="group-directory-container">
            <div className="section-header-area">
                <h2 className="section-title">집단 디렉토리</h2>
                <span className="count-badge">{groups.length}개 단체</span>
            </div>

            <div className="group-list">
                {groups.map((group) => {
                    const isFavorited = favorites.includes(group.id);

                    return (
                        <div
                            key={group.id}
                            className="group-wide-card"
                            onClick={() => onGroupClick(group)}
                        >
                            <div className="group-wide-image">
                                {group.image_url ? (
                                    <img src={group.image_url} alt={group.name} loading="lazy" />
                                ) : (
                                    <div className="group-placeholder">
                                        <i className="ri-team-line"></i>
                                    </div>
                                )}
                                <div className="group-type-tag">{group.type === 'club' ? '동호회' : group.type === 'bar' ? '스윙바' : '기타'}</div>
                            </div>

                            <div className="group-wide-info">
                                <div className="group-wide-header">
                                    <h3 className="group-wide-name">{group.name}</h3>
                                    <button
                                        className={`fav-btn ${isFavorited ? 'active' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleFavorite(group.id);
                                        }}
                                    >
                                        <i className={isFavorited ? "ri-star-fill" : "ri-star-line"}></i>
                                    </button>
                                </div>
                                <p className="group-wide-desc">{group.description || '아직 설명이 없습니다.'}</p>

                                <div className="group-wide-footer">
                                    <button
                                        className="view-calendar-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onGroupClick(group);
                                        }}
                                    >
                                        <i className="ri-calendar-line"></i> 일정 달력
                                    </button>
                                    {isAdmin && (
                                        <button
                                            className="admin-edit-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditGroup(group);
                                            }}
                                        >
                                            <i className="ri-edit-circle-line"></i> 정보 수정
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default GroupDirectory;
