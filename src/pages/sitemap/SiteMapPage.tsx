import React from 'react';
import { useNavigate } from 'react-router-dom';
import SimpleHeader from '../../components/SimpleHeader';
import './SiteMapPage.css';

export default function SiteMapPage() {
    const navigate = useNavigate();

    const sections = [
        {
            title: "메인 서비스 (Service)",
            items: [
                { icon: 'ri-home-4-line', title: '홈', desc: '이벤트 및 강습 모아보기', path: '/v2', type: 'home' },
                { icon: 'ri-calendar-event-line', title: '소셜 (이벤트)', desc: '소셜 파티 및 행사 정보', path: '/social', type: 'social' },
                { icon: 'ri-calendar-line', title: '전체 일정', desc: '월별 전체 일정 달력', path: '/calendar', type: 'calendar' },
                { icon: 'ri-building-line', title: '연습실', desc: '연습실 정보 및 위치', path: '/practice', type: 'practice' },
                { icon: 'ri-shopping-bag-3-line', title: '쇼핑', desc: '댄스 관련 상품 쇼핑', path: '/shopping', type: 'shopping' },
            ]
        },
        {
            title: "게시판 (Community)",
            items: [
                { icon: 'ri-megaphone-line', title: '공지사항', desc: '사이트 주요 공지', path: '/board?category=notice', type: 'board' },
                { icon: 'ri-chat-3-line', title: '자유게시판', desc: '자유로운 소통 공간', path: '/board?category=free', type: 'board' },
                { icon: 'ri-user-secret-line', title: '익명 게시판', desc: '솔직한 이야기 (익명)', path: '/board?category=anonymous', type: 'board' },
                { icon: 'ri-code-box-line', title: '개발일지', desc: '업데이트 내역', path: '/board?category=dev-log', type: 'board' },
            ]
        },
        {
            title: "라이브러리 (Library)",
            items: [
                { icon: 'ri-book-mark-line', title: '댄스 라이브러리', desc: '학습 자료 및 영상', path: '/learning', type: 'library' },
                { icon: 'ri-history-line', title: '히스토리', desc: '댄스 역사 타임라인', path: '/history', type: 'library' },
            ]
        },
        {
            title: "나의 메뉴 (My Menu)",
            items: [
                { icon: 'ri-star-line', title: '내 즐겨찾기', desc: '찜한 행사/강습/연습실', path: '/v2?view=favorites', type: 'personal' },
                { icon: 'ri-file-list-3-line', title: '내 활동', desc: '내가 쓴 글 / 등록한 행사', path: '/my-activities?tab=posts', type: 'personal' },
            ]
        },
        {
            title: "안내 (Info)",
            items: [
                { icon: 'ri-book-open-line', title: '이용가이드', desc: '사이트 이용 방법', path: '/guide', type: 'default' },
            ]
        }
    ];

    return (
        <div style={{ paddingBottom: '80px' }}>
            <SimpleHeader title="사이트 맵" />

            <div className="sitemap-container">
                <div className="sitemap-header">
                    <h2 className="sitemap-title">전체 메뉴 보기</h2>
                    <p className="sitemap-subtitle">원하는 메뉴를 쉽고 빠르게 찾아보세요</p>
                </div>

                {sections.map((section, idx) => (
                    <div key={idx} className="sitemap-section">
                        <h3 className="sitemap-section-title">{section.title}</h3>
                        <div className="sitemap-grid">
                            {section.items.map((item, itemIdx) => (
                                <div
                                    key={itemIdx}
                                    className={`sitemap-card ${item.type}`}
                                    onClick={() => navigate(item.path)}
                                >
                                    <div className="sitemap-icon-box">
                                        <i className={item.icon}></i>
                                    </div>
                                    <div className="sitemap-card-title">{item.title}</div>
                                    <div className="sitemap-card-desc">{item.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
