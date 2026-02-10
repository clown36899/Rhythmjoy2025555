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
            icon: 'ri-chat-3-fill',
            path: '/board?category=free',
            color: '#a855f7'
        },
        {
            id: 'library',
            title: '라이브러리',
            description: '자료 보관소',
            icon: 'ri-book-open-fill',
            path: '/board?category=history',
            color: '#3b82f6'
        },
        {
            id: 'bpm-tapper',
            title: 'BPM 측정기',
            description: '실시간 비트 측정',
            icon: 'ri-pulse-fill',
            path: '/bpm-tapper',
            color: '#ec4899'
        },
        {
            id: 'metronome',
            title: '메트로놈',
            description: '고정밀 리듬 연주',
            icon: 'ri-timer-flash-fill',
            path: '/metronome',
            color: '#f59e0b'
        }
    ];

    return (
        <div className="forum-hub-container">
            <div className="forum-hub-content">
                <header className="forum-hub-header">
                    <h2 className="forum-hub-title">포럼 허브</h2>
                    <p className="forum-hub-subtitle">원하는 서비스로 바로 연결됩니다</p>
                </header>

                <div className="forum-grid">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            className={`forum-icon-item forum-icon-item--${item.id}`}
                            onClick={() => navigate(item.path)}
                            style={{ '--brand-color': item.color } as React.CSSProperties}
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
