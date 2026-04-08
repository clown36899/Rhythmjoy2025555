import React from 'react';
import { useNavigate } from 'react-router-dom';
import './forum.css';

const ForumPage: React.FC = () => {
    const navigate = useNavigate();

    const menuItems = [
        {
            id: 'board',
            title: '게시판',
            description: '자유로운 소통 공간',
            icon: 'ri-chat-3-line',
            path: '/board?category=free',
            color: '#a855f7'
        },
        {
            id: 'library',
            title: '라이브러리',
            description: '자료 보관소',
            icon: 'ri-book-open-line',
            path: '/board?category=history',
            color: '#3b82f6'
        },
        {
            id: 'links',
            title: '사이트 모음',
            description: '유용한 관련 링크',
            icon: 'ri-links-line',
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
        },
        {
            id: 'anonymous',
            title: '익명게시판',
            description: '익명으로 남기는 이야기',
            icon: 'ri-user-secret-line',
            path: '/board?category=anonymous',
            color: '#64748b'
        },
        {
            id: 'trade',
            title: '양도/양수',
            description: '소중한 티켓 양도',
            icon: 'ri-exchange-line',
            path: '/board?category=trade',
            color: '#8b5cf6'
        },
        {
            id: 'market',
            title: '벼룩시장',
            description: '중고 물품 거래',
            icon: 'ri-store-2-line',
            path: '/board?category=market',
            color: '#f43f5e'
        }
    ];

    return (
        <div className="forum-hub-container">
            <div className="forum-hub-content">
                <div className="forum-grid">
                    {menuItems.map((item) => (
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
                            </div>
                            <span className="forum-icon-label">{item.title}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ForumPage;
