import React from 'react';
import type { SocialGroup } from '../types';
import './GroupDirectory.css';

interface GroupDirectoryProps {
    groups: SocialGroup[];
    favorites: number[];
    onToggleFavorite: (groupId: number) => void;
    onGroupClick: (group: SocialGroup) => void;
    onEditGroup: (group: SocialGroup) => void;
    onAddSchedule: (groupId: number) => void;
    isAdmin: boolean;
    hideTitle?: boolean;
}

const GroupDirectory: React.FC<GroupDirectoryProps> = ({
    groups,
    favorites,
    onToggleFavorite,
    onGroupClick,
    onEditGroup,
    onAddSchedule,
    isAdmin,
    hideTitle = false
}) => {
    return (
        <section className={`group-directory-container ${hideTitle ? 'no-title' : ''}`}>
            {!hideTitle && (
                <div className="section-header-area">
                    <h2 className="section-title">등록된 단체</h2>
                    <span className="count-badge">{groups.length}개 단체</span>
                </div>
            )}

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
                                        <>
                                            <button
                                                className="admin-add-item-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAddSchedule(group.id);
                                                }}
                                            >
                                                <i className="ri-add-line"></i> 일정 추가
                                            </button>
                                            <button
                                                className="admin-edit-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEditGroup(group);
                                                }}
                                            >
                                                <i className="ri-edit-circle-line"></i> 정보 수정
                                            </button>
                                        </>
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
