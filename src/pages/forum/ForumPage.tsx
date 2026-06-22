import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    isTempoToolItemHidden,
    useTempoToolVisibilitySettings,
} from '../../hooks/useTempoToolVisibilitySettings';
import './forum.css';

type ForumMenuItem = {
    id: string;
    visibilityId?: string;
    title: string;
    description: string;
    icon: string;
    path: string;
    color: string;
    status?: string;
};

const ForumPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const {
        settings: tempoToolVisibilitySettings,
        isLoading: isTempoToolVisibilityLoading,
    } = useTempoToolVisibilitySettings();

    const menuItems: ForumMenuItem[] = [
        {
            id: 'media',
            visibilityId: 'forum-media',
            title: 'SNS 아카이브',
            description: '유튜브·인스타 영상',
            icon: 'ri-movie-2-line',
            path: '/forum/media',
            color: '#38bdf8',
            status: '준비중',
        },
        {
            id: 'library',
            visibilityId: 'forum-library',
            title: '라이브러리',
            description: '자료 보관소',
            icon: 'ri-book-open-line',
            path: '/board?category=history',
            color: '#3b82f6'
        },
        {
            id: 'links',
            visibilityId: 'forum-links',
            title: '사이트 모음',
            description: '유용한 관련 링크',
            icon: 'ri-earth-line',
            path: '/links',
            color: '#10b981'
        },
        {
            id: 'bpm-tapper',
            title: 'BPM 측정기',
            description: '실시간 비트 측정',
            icon: 'ri-pulse-line',
            path: '/bpm-tapper',
            color: '#ec4899'
        },
        {
            id: 'metronome',
            title: '메트로놈',
            description: '고정밀 리듬 연주',
            icon: 'ri-timer-flash-line',
            path: '/metronome',
            color: '#f59e0b'
        }
    ];

    return (
        <div className="forum-hub-container">
            <div className="forum-hub-content">
                <header className="forum-hub-header">
                    <h1 className="forum-hub-title">포럼</h1>
                    <p className="forum-hub-subtitle">자료, 링크, 연습 도구를 한 곳에서 엽니다.</p>
                </header>
                <div className="forum-grid">
                    {menuItems
                        .filter((item) => {
                            if (isAdmin) return true;
                            if (isTempoToolVisibilityLoading) return false;
                            return !isTempoToolItemHidden(tempoToolVisibilitySettings, item.visibilityId ?? item.id);
                        })
                        .map((item) => {
                            const isHidden = isTempoToolItemHidden(tempoToolVisibilitySettings, item.visibilityId ?? item.id);
                            const status = isAdmin && isHidden ? '숨김' : item.status;

                            return (
                                <button
                                    key={item.id}
                                    className={`forum-icon-item forum-icon-item--${item.id}`}
                                    onClick={() => navigate(item.path)}
                                    style={{ '--brand-color': item.color } as React.CSSProperties}
                                    data-analytics-id={item.id}
                                    data-analytics-type="nav_item"
                                    data-analytics-title={item.title}
                                    data-analytics-section="forum_hub"
                                >
                                    <div className="forum-icon-box">
                                        <i className={`${item.icon} forum-icon-glyph`}></i>
                                        {status && (
                                            <span className={`forum-icon-status ${isHidden ? 'forum-icon-status--hidden' : ''}`.trim()}>
                                                {status}
                                            </span>
                                        )}
                                    </div>
                                    <span className="forum-icon-copy">
                                        <strong className="forum-icon-label">{item.title}</strong>
                                        <em>{item.description}</em>
                                    </span>
                                </button>
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

export default ForumPage;
