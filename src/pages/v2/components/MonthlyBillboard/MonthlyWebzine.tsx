
import React, { useState } from 'react';
import { useMonthlyBillboard } from '../../hooks/useMonthlyBillboard';

const MonthlyWebzine = () => {
    const { data, loading } = useMonthlyBillboard();
    const [viewMode, setViewMode] = useState<'percent' | 'count'>('percent');

    if (loading || !data) {
        return (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
                <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '12px', color: '#71717a', fontSize: '13px' }}>1월 전체 데이터 분석 중...<br />(잠시만 기다려주세요)</p>
            </div>
        );
    }

    const { weeklyFlow, dailyFlow, leadTime, topContents, meta } = data;

    // Helper for Bar Chart (Weekly)
    const maxSupply = Math.max(...weeklyFlow.classStartDays, ...weeklyFlow.socialRunDays, 1);
    const getBarHeight = (val: number) => Math.max((val / maxSupply) * 60, 4); // max 60px

    // --- Chart Data Logic (Toggle) ---
    const sourceData = viewMode === 'percent' ? dailyFlow.hourlyData : dailyFlow.rawHourlyData;

    // Y-Axis Scale
    const maxVal = Math.max(...sourceData.map(h => Math.max(h.class, h.event)), 1);

    // SVG Config
    const width = 300;
    const height = 120;
    const stepX = width / 23;

    // Create points string
    const classPoints = sourceData.map((d, i) => `${i * stepX},${height - (d.class / maxVal) * (height - 20)}`).join(' ');
    const eventPoints = sourceData.map((d, i) => `${i * stepX},${height - (d.event / maxVal) * (height - 20)}`).join(' ');

    return (
        <div style={{ padding: '24px 4px', color: '#fff', fontFamily: "'Pretendard', sans-serif" }}>

            {/* 1. Header & Intro */}
            <div style={{ marginBottom: '40px', padding: '0 12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase' }}>Monthly Insight • January 2026</div>
                <h1 style={{ fontSize: '28px', fontWeight: '800', margin: '0 0 16px 0', lineHeight: '1.3', color: '#fff' }}>
                    동호회의 주말,<br />
                    외부 강습의 평일.
                </h1>
                <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#a1a1aa', backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ margin: '0 0 6px 0', color: '#fff', fontSize: '12px' }}><i className="ri-database-2-fill"></i> 데이터 분석 기준</p>
                    <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', fontSize: '12px' }}>
                        <li><strong>기간</strong>: {meta.range} (전체)</li>
                        <li><strong>표본</strong>: 총 {meta.totalLogs.toLocaleString()}건 활동 로그 분석</li>
                        <li><strong>방식</strong>: 시간대별 활동(클릭) 로그 전수 조사</li>
                    </ul>
                </div>
            </div>

            {/* 2. Weekly Flow (Supply Side) */}
            <section style={sectionStyle}>
                <h3 style={sectionTitleStyle}>
                    1. 스윙 라이프사이클
                </h3>
                <p style={descStyle}>
                    <strong style={{ color: '#fff' }}>"역할의 분담"</strong><br />
                    월/화요일엔 외부 강습이 시작되고(43%),<br />
                    주말엔 동호회 소셜(72%)이 열립니다.
                </p>

                {/* Chart */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '120px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '12px' }}>
                    {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                        <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12%' }}>
                            <div style={{ width: '60%', height: `${getBarHeight(weeklyFlow.socialRunDays[idx])}px`, backgroundColor: '#ef4444', marginBottom: '2px', borderRadius: '2px', opacity: 0.9 }}></div>
                            <div style={{ width: '60%', height: `${getBarHeight(weeklyFlow.classStartDays[idx])}px`, backgroundColor: '#3b82f6', borderRadius: '2px', opacity: 0.9 }}></div>
                            <span style={{ fontSize: '11px', marginTop: '8px', color: '#71717a' }}>{day}</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', fontSize: '11px', color: '#a1a1aa', justifyContent: 'center', gap: '16px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: '8px', height: '8px', background: '#ef4444', marginRight: '6px', borderRadius: '2px' }}></span>소셜/행사</span>
                    <span style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: '8px', height: '8px', background: '#3b82f6', marginRight: '6px', borderRadius: '2px' }}></span>강습 시작</span>
                </div>
            </section>


            {/* 3. Daily Flow (Hourly Patterns) */}
            <section style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>
                        2. 시간대별 행동 패턴
                    </h3>
                    <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '16px', padding: '2px' }}>
                        <button
                            onClick={() => setViewMode('percent')}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '14px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                border: 'none',
                                backgroundColor: viewMode === 'percent' ? 'rgba(255,255,255,0.15)' : 'transparent',
                                color: viewMode === 'percent' ? '#fff' : '#71717a',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            패턴 비교(%)
                        </button>
                        <button
                            onClick={() => setViewMode('count')}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '14px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                border: 'none',
                                backgroundColor: viewMode === 'count' ? 'rgba(255,255,255,0.15)' : 'transparent',
                                color: viewMode === 'count' ? '#fff' : '#71717a',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            실제 수치(건)
                        </button>
                    </div>
                </div>

                <p style={descStyle}>
                    <strong style={{ color: '#fff' }}>"{dailyFlow.classPeakHour}시 / {dailyFlow.eventPeakHour}시 집중"</strong><br />
                    점심시간 전후와 퇴근 시간대에 트래픽이 집중되며,<br />
                    강습과 행사 모두 비슷한 시간대 패턴을 보입니다.
                </p>

                <div style={{ position: 'relative', height: '140px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '10px', marginTop: '20px' }}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                        {/* Grid */}
                        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

                        {/* Class Line (Blue) */}
                        <polyline points={classPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Event Line (Red) */}
                        <polyline points={eventPoints} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>

                    {/* Peak Labels (Only in Percent Mode) */}
                    {viewMode === 'percent' && (
                        <>
                            <div style={{ position: 'absolute', left: `${(dailyFlow.classPeakHour / 23) * 100}%`, top: '0', transform: 'translate(-50%, -50%)', backgroundColor: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', zIndex: 2 }}>
                                {dailyFlow.classPeakHour}시 강습
                            </div>
                            <div style={{ position: 'absolute', left: `${(dailyFlow.eventPeakHour / 23) * 100}%`, top: '35%', transform: 'translate(-50%, -50%)', backgroundColor: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', zIndex: 2 }}>
                                {dailyFlow.eventPeakHour}시 행사
                            </div>
                        </>
                    )}
                </div>

                {/* Legend & X-Axis */}
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '12px', gap: '8px' }}>
                    {/* Legend */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '10px', color: '#a1a1aa' }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: '8px', height: '8px', background: '#3b82f6', marginRight: '6px', borderRadius: '2px' }}></span>강습 클릭</span>
                        <span style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: '8px', height: '8px', background: '#ef4444', marginRight: '6px', borderRadius: '2px' }}></span>행사 클릭</span>
                    </div>
                    {/* Time Scale */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#52525b', padding: '0 2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px' }}>
                        <span>00</span>
                        <span>03</span>
                        <span>06</span>
                        <span>09</span>
                        <span>12</span>
                        <span>15</span>
                        <span>18</span>
                        <span>21</span>
                        <span>24</span>
                    </div>
                </div>
            </section>

            {/* 4. Lead Time Cards */}
            <section style={sectionStyle}>
                <h3 style={sectionTitleStyle}>
                    3. 등록 시점별 노출 추이
                </h3>
                <p style={descStyle}>
                    <span style={{ color: '#fbbf24' }}>⚠ 분석의 한계</span><br />
                    실제 신청률 데이터가 없으므로,<br />
                    현재는 <strong>'노출 기간'에 따른 누적 조회수 차이</strong>만을<br />
                    간접적으로 확인할 수 있습니다.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Class Card */}
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 'bold', marginBottom: '6px' }}>강습(Class)</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#93c5fd', marginBottom: '8px' }}>4주 전</div>
                        <p style={{ fontSize: '11px', color: '#bfdbfe', lineHeight: '1.4' }}>
                            미리 등록 시<br />
                            <strong style={{ color: '#fff' }}>평균 {leadTime.classD28}회 조회</strong><br />
                            <span style={{ color: '#60a5fa', opacity: 0.7, fontSize: '10px' }}>(1주 전: {leadTime.classD7}회)</span>
                        </p>
                    </div>

                    {/* Event Card */}
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 'bold', marginBottom: '6px' }}>행사(Event)</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#fca5a5', marginBottom: '8px' }}>6주 전</div>
                        <p style={{ fontSize: '11px', color: '#fecaca', lineHeight: '1.4' }}>
                            미리 등록 시<br />
                            <strong style={{ color: '#fff' }}>평균 {leadTime.eventD42}회 조회</strong><br />
                            <span style={{ color: '#f87171', opacity: 0.7, fontSize: '10px' }}>(2주 전: {leadTime.eventD14}회)</span>
                        </p>
                    </div>
                </div>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '16px', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                    💡 <strong>데이터 기반 제언</strong><br />
                    유의미한 노출 도달을 위해서는<br />
                    최소 <strong>4주(강습) / 6주(행사)</strong> 전에 홍보를 시작하는 것이 유리합니다.
                </p>
            </section>

            {/* 5. Top 20 Ranking */}
            <section style={{ marginBottom: '40px', padding: '0 12px' }}>
                <h3 style={{ ...sectionTitleStyle, paddingLeft: 0, borderLeft: 'none', marginBottom: '16px' }}>
                    4. 1월의 화제 (Top 20)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topContents.map((item, index) => (
                        <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px 16px',
                            backgroundColor: 'rgba(255,255,255,0.02)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.03)'
                        }}>
                            <div style={{
                                width: '28px',
                                fontSize: '16px',
                                fontWeight: '800',
                                color: index < 3 ? '#fbbf24' : '#52525b',
                                marginRight: '12px',
                                fontStyle: 'italic'
                            }}>
                                {index + 1}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{
                                    fontSize: '10px',
                                    color: item.type === 'class' ? '#60a5fa' : '#f87171',
                                    fontWeight: 'bold',
                                    marginBottom: '3px',
                                    textTransform: 'uppercase'
                                }}>

                                    {item.type === 'board_post' ? 'INFO' : item.type}
                                </div>
                                <div style={{
                                    fontSize: '14px',
                                    color: '#f4f4f5',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontWeight: '500'
                                }}>
                                    {item.title}
                                </div>
                            </div>
                            <div style={{ fontSize: '12px', color: '#71717a', fontWeight: '500' }}>
                                {item.count}회
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <div style={{ textAlign: 'center', fontSize: '11px', color: '#52525b', paddingBottom: '20px' }}>
                Data Source: RhythmJoy Analytics ({meta.range})
            </div>

        </div>
    );
};

// Dark Mode Styles
const sectionStyle: React.CSSProperties = {
    marginBottom: '32px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: '24px 16px',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.04)',
    margin: '0 12px 32px 12px'
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: '700',
    marginBottom: '16px',
    color: '#e4e4e7',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
};

const descStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#a1a1aa',
    marginBottom: '24px',
    lineHeight: '1.6'
};

export default MonthlyWebzine;
