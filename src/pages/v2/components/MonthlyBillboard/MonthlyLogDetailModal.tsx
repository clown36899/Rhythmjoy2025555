import React from 'react';

interface MonthlyLogDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        totalLogs: number;
        uniqueVisitors: number;
        clickRate: number;
        range: string;
    };
}

import { createPortal } from 'react-dom';

const MonthlyLogDetailModal: React.FC<MonthlyLogDetailModalProps> = ({ isOpen, onClose, data }) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="analytics-modal-overlay" onClick={onClose}>
            <button className="close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                <i className="ri-close-line"></i>
            </button>
            <div className="analytics-modal" onClick={e => e.stopPropagation()}>

                <div className="analytics-header">
                    <h2 className="analytics-title">상세 방문 데이터 분석</h2>
                    <p className="analytics-range">{data.range}</p>
                </div>

                <div className="analytics-main-layout">
                    <div className="analytics-stats-grid">
                        <div className="stat-card">
                            <span className="stat-label">총 상호작용</span>
                            <div className="stat-value">{data.totalLogs.toLocaleString()} <span className="stat-unit">로그</span></div>
                        </div>
                        <div className="stat-card highlight">
                            <span className="stat-label">실제 방문자 수</span>
                            <div className="stat-value">{data.uniqueVisitors.toLocaleString()} <span className="stat-unit">명</span></div>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">평균 클릭률 (CTR)</span>
                            <div className="stat-value">{data.clickRate} <span className="stat-unit">Clicks/User</span></div>
                        </div>
                    </div>

                    <div className="analytics-info-box">
                        <div className="info-title">데이터 산정 기준 (Reporting Protocol)</div>

                        <div className="info-section">
                            <div className="section-label">총 상호작용 (Total Interactions)</div>
                            <p className="section-desc">
                                사이트 내에서 발생한 모든 클릭, 페이지 전환, 버튼 클릭 등 모든 활동 로그의 단순 합산입니다.
                                서비스의 전체적인 활동량과 활성도를 측정하는 가장 기초적인 데이터 지표입니다.
                            </p>
                        </div>

                        <div className="info-section">
                            <div className="section-label">실제 방문자 수 (Unique Visitors)</div>
                            <p className="section-desc">
                                운영 통계 모달과 동일한 <strong>'6시간 단위 유니크 접근'</strong> 기준을 적용합니다.
                                로그인 ID 또는 브라우저 고유 지문을 통해 동일 기기의 중복 방문을 엄격히 제거하며, 관리자 및 시스템 테스트 계정의 활동은 통계에서 모두 자동 제외됩니다.
                            </p>
                        </div>

                        <div className="info-section">
                            <div className="section-label">평균 클릭률 (Engagement Rate)</div>
                            <p className="section-desc">
                                방문자 1인당 평균적으로 발생시킨 상호작용 횟수(Logs / Visitors)입니다.
                                단순히 유입된 인원수뿐만 아니라, 유입된 인원이 얼마나 깊이 있게 사이트의 콘텐츠를 탐색했는지를 보여주는 '몰입도' 지표입니다.
                            </p>
                        </div>
                    </div>
                </div>

                <style>{`
                    .analytics-modal-overlay {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.85); backdrop-filter: blur(12px);
                        z-index: 10001; /* Higher than StatsModal (1000) */
                        display: flex; align-items: center; justify-content: center;
                        animation: fadeIn 0.3s ease;
                    }
                    .analytics-modal {
                        width: 95%; max-width: 480px; max-height: 85vh;
                        background: #0d0d0d;
                        border-radius: 32px; border: 1px solid rgba(255,255,255,0.08);
                        padding: 32px 24px; position: relative;
                        box-shadow: 0 50px 100px rgba(0,0,0,0.6);
                        overflow-y: auto;
                        overscroll-behavior: contain;
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255,255,255,0.1) transparent;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }

                    @media (min-width: 900px) {
                        .analytics-modal { max-width: 960px; padding: 48px; }
                        .analytics-main-layout { 
                            display: grid; 
                            grid-template-columns: 340px 1fr; 
                            gap: 48px; 
                            align-items: flex-start;
                        }
                        .analytics-stats-grid { margin-bottom: 0; }
                    }

                    .analytics-modal::-webkit-scrollbar { width: 6px; }
                    .analytics-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

                    .analytics-header { margin-bottom: 32px; text-align: left; }
                    .analytics-title { font-size: 24px; font-weight: 900; color: #fff; margin: 0 0 6px 0; letter-spacing: -1px; }
                    .analytics-range { font-size: 14px; color: #fbbf24; font-weight: 700; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
                    
                    .analytics-stats-grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
                    .stat-card {
                        background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
                        border: 1px solid rgba(255,255,255,0.06);
                        padding: 24px; border-radius: 20px; display: flex; flex-direction: column; gap: 4px;
                        transition: all 0.3s ease;
                    }
                    .stat-card:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); }
                    .stat-card.highlight { 
                        background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(251, 191, 36, 0.02) 100%);
                        border-color: rgba(251, 191, 36, 0.3); 
                    }
                    .stat-label { font-size: 11px; color: #a1a1aa; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
                    .stat-value { font-size: 32px; font-weight: 900; color: #fff; display: flex; align-items: baseline; gap: 6px; line-height: 1; }
                    .stat-unit { font-size: 14px; color: #71717a; font-weight: 400; }
 
                    .analytics-info-box { display: flex; flex-direction: column; gap: 20px; }
                    .info-title { font-weight: 800; color: #fff; margin-bottom: 8px; font-size: 16px; letter-spacing: -0.5px; }
                    .info-section { 
                        background: rgba(255,255,255,0.02); 
                        border-radius: 20px; 
                        padding: 20px 24px;
                        display: flex; flex-direction: column; gap: 6px; 
                        border: 1px solid rgba(255,255,255,0.04);
                    }
                    .section-label { font-weight: 800; color: #fbbf24; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
                    .section-desc { margin: 0; opacity: 0.8; font-size: 13.5px; line-height: 1.6; color: #d4d4d8; word-break: keep-all; }
                    .section-desc strong { color: #fff; font-weight: 700; }
 
                    .close-btn {
                        position: fixed; 
                        top: 24px; 
                        right: 24px; 
                        width: 44px; height: 44px;
                        border-radius: 50%; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1);
                        color: #fff; font-size: 24px; cursor: pointer; 
                        display: flex; align-items: center; justify-content: center;
                        z-index: 10002; /* Above overlay (10001) */
                        backdrop-filter: blur(8px);
                        transition: all 0.2s ease;
                    }
                    .close-btn:hover {
                        background: rgba(255,255,255,0.25);
                        transform: scale(1.1);
                    }
 
                    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                `}</style>
            </div>
        </div>,
        document.body
    );
};

export default MonthlyLogDetailModal;
