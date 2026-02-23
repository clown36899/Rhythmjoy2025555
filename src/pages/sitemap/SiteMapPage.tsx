import React from 'react';
import { useNavigate } from 'react-router-dom';
import SimpleHeader from '../../components/SimpleHeader';
import { SITE_MENU_SECTIONS } from '../../config/menuConfig';
import './SiteMapPage.css';

export default function SiteMapPage() {
    const navigate = useNavigate();

    return (
        <div style={{ paddingBottom: '80px' }}>
            <SimpleHeader title="사이트 맵" />

            <div className="sitemap-container">
                <div className="sitemap-header">
                    <h2 className="sitemap-title">전체 메뉴 보기</h2>
                    <p className="sitemap-subtitle">원하는 메뉴를 쉽고 빠르게 찾아보세요</p>
                </div>

                {SITE_MENU_SECTIONS.map((section, idx) => (
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
