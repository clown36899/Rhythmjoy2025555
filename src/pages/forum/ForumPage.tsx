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
        }
    ];

    return (
        <div className="forum-hub-container">
            <div className="forum-hub-content">
                <header className="forum-hub-header">
                    <h2 className="forum-hub-title">포럼 허브</h2>
                    <p className="forum-hub-subtitle">원하는 서비스로 바로 연결됩니다</p>
                </header>

                <div className="forum-bento-grid">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            className={`forum-bento-card forum-bento-card--${item.id}`}
                            onClick={() => navigate(item.path)}
                        >
                            <div className="bento-card-bg" style={{ '--card-color': item.color } as React.CSSProperties}></div>
                            <div className="bento-card-content">
                                <div className="bento-icon-wrapper">
                                    <i className={`${item.icon} bento-icon`}></i>
                                </div>
                                <div className="bento-text-wrapper">
                                    <h3 className="bento-title">{item.title}</h3>
                                    <p className="bento-desc">{item.description}</p>
                                </div>
                            </div>
                            <div className="bento-card-shine"></div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ForumPage;
