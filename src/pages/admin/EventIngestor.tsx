import React, { useState, useEffect, useMemo } from 'react';
import { useEvents } from '../v2/components/EventList/hooks/useEvents';
import './EventIngestor.css';

interface ScrapedEvent {
    id: string;
    keyword?: string;
    source_url: string;
    poster_url?: string;
    screenshot_url?: string; // 레거시 지원
    extracted_text: string;
    structured_data?: {
        date: string;
        day?: string;
        title: string;
        status: string;
        djs?: string[];
        times?: string[];
        location?: string;
        fee?: string;
        note?: string;
    };
    parsed_data: {
        date: string;
        title: string;
    };
    created_at: string;
}

const EventIngestor: React.FC = () => {
    const { events: existingEvents, loading: existingLoading } = useEvents({ isAdminMode: true });
    const [scrapedEvents, setScrapedEvents] = useState<ScrapedEvent[]>([]);
    const [loadingScraped, setLoadingScraped] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchScraped = async () => {
            try {
                const res = await fetch(`/src/data/scraped_events.json?t=${Date.now()}`);
                if (!res.ok) throw new Error("Failed to fetch");
                const data = await res.json();
                setScrapedEvents(data);
            } catch (e) {
                console.error("Failed to load scraped events:", e);
            } finally {
                setLoadingScraped(false);
            }
        };
        fetchScraped();
    }, []);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const buildEventDetail = (e: ScrapedEvent) => {
        const data = e.structured_data;
        const imageUrl = e.poster_url || e.screenshot_url;
        const issues: string[] = [];
        if (!imageUrl) issues.push('이미지 누락');
        if (!data?.date) issues.push('날짜 누락');
        if (!data?.djs || data.djs.length === 0) issues.push('DJ 미확인');
        if (issues.length === 0) issues.push('이미지/데이터 정합성 검증 필요');

        const lines = [
            `- 키워드: ${e.keyword || '알수없음'}`,
            `  URL: ${e.source_url}`,
            `  날짜: ${data?.date || '미확인'} (${data?.day || '?'})`,
            `  제목: ${data?.title || '미확인'}`,
            `  DJ: ${data?.djs?.join(', ') || '미확인'}`,
            `  현재 이미지: ${imageUrl || '없음'}`,
            `  문제점: ${issues.join(', ')}`,
        ];
        return lines.join('\n');
    };

    const copyBatchPrompt = () => {
        if (selectedIds.size === 0) return alert("항목을 선택해주세요.");

        const targets = scrapedEvents.filter(e => selectedIds.has(e.id));
        const prompt = [
            `Event Ingestion Recipe 가이드에 따라서 아래 이벤트들만 정밀 재수집해줘.`,
            `전체 소스를 재검색하지 말고, 각 이벤트의 URL에서 해당 날짜의 포스트만 찾아서 이미지와 데이터를 수정해줘.`,
            ``,
            `## 재수집 대상 (${targets.length}건)`,
            ...targets.map((e, i) => `\n### ${i + 1}. ${e.structured_data?.title || e.id}\n${buildEventDetail(e)}`),
            ``,
            `## 요구사항`,
            `- 이미지: 포스터 전체가 크롭 없이 캡처되어야 함`,
            `- 날짜: 2026년 달력 기준 요일 일치 검증 필수`,
            `- 수집된 이미지는 public/scraped 폴더에 저장할 것`,
            `- 위 이벤트만 수정하고 나머지 scraped_events.json 데이터는 건드리지 말 것`,
        ].join('\n');

        navigator.clipboard.writeText(prompt);
        alert("정밀 재수집 요청이 복사되었습니다. 채팅창에 붙여넣으세요!");
    };

    const { newList, duplicateList } = useMemo(() => {
        // 1. URL + Date 기반 내부 중복 제거 및 키워드 병합
        const uniqueMap = new Map<string, ScrapedEvent & { allKeywords: string[] }>();

        scrapedEvents.forEach(event => {
            const date = event.structured_data?.date || event.parsed_data?.date || 'unknown';
            const url = event.source_url;
            const key = `${url}_${date}`;

            if (uniqueMap.has(key)) {
                const existing = uniqueMap.get(key)!;
                if (event.keyword && !existing.allKeywords.includes(event.keyword)) {
                    existing.allKeywords.push(event.keyword);
                }
            } else {
                uniqueMap.set(key, {
                    ...event,
                    allKeywords: event.keyword ? [event.keyword] : []
                });
            }
        });

        const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
            const dateA = a.structured_data?.date || a.parsed_data?.date || '';
            const dateB = b.structured_data?.date || b.parsed_data?.date || '';
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

        const newItemList: any[] = [];
        const duplicateItemList: any[] = [];

        sorted.forEach(scraped => {
            const sDate = scraped.structured_data?.date || scraped.parsed_data?.date;
            const sTitle = scraped.structured_data?.title || scraped.parsed_data?.title;

            // DB에 이미 존재하는지 체크
            const isDuplicate = existingEvents.some(existing => {
                const sameDate = existing.date === sDate;
                const sameTitle = (existing.title || '').includes(sTitle || '') ||
                    (sTitle || '').includes(existing.title || '');
                return sameDate && sameTitle;
            });

            if (isDuplicate) {
                duplicateItemList.push(scraped);
            } else {
                newItemList.push(scraped);
            }
        });

        return { newList: newItemList, duplicateList: duplicateItemList };
    }, [scrapedEvents, existingEvents]);

    if (existingLoading || loadingScraped) {
        return <div className="event-ingestor-container">데이터를 불러오는 중...</div>;
    }

    return (
        <div className="event-ingestor-container">
            <header className="event-ingestor-header">
                <div className="header-top">
                    <h1>이벤트 인제스터 🔥</h1>
                    <div className="batch-actions">
                        <button
                            className={`btn-batch-copy ${selectedIds.size > 0 ? 'active' : ''}`}
                            onClick={copyBatchPrompt}
                        >
                            선택({selectedIds.size}) 재수집 요청 복사
                        </button>
                    </div>
                </div>
                <div className="ingestor-stats">
                    <span>수집된 총 항목: <b>{scrapedEvents.length}</b></span>
                    <span>신규 가능: <b>{newList.length}</b></span>
                    <span>중복 발견: <b>{duplicateList.length}</b></span>
                </div>
            </header>

            <main>
                <section className="ingestor-section">
                    <h2>
                        <span className="icon">🆕</span> 신규 이벤트 후보
                        <span className="count-badge">{newList.length}</span>
                    </h2>
                    {newList.length === 0 ? (
                        <p className="no-data">새로운 수집 데이터가 없습니다.</p>
                    ) : (
                        <div className="ingestor-grid">
                            {newList.map(item => (
                                <EventCard
                                    key={item.id}
                                    event={item}
                                    isDuplicate={false}
                                    isSelected={selectedIds.has(item.id)}
                                    onSelect={() => toggleSelect(item.id)}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {duplicateList.length > 0 && (
                    <section className="ingestor-section duplicate-section">
                        <h2>
                            <span className="icon">⚠️</span> 발견된 중복 항목 (DB 존재)
                            <span className="count-badge">{duplicateList.length}</span>
                        </h2>
                        <div className="ingestor-grid">
                            {duplicateList.map(item => (
                                <EventCard
                                    key={item.id}
                                    event={item}
                                    isDuplicate={true}
                                    isSelected={selectedIds.has(item.id)}
                                    onSelect={() => toggleSelect(item.id)}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};

interface EventCardProps {
    event: ScrapedEvent;
    isDuplicate: boolean;
    isSelected: boolean;
    onSelect: () => void;
}

const EventCard: React.FC<EventCardProps & { event: any }> = ({ event, isDuplicate, isSelected, onSelect }) => {
    const data = event.structured_data || {
        date: event.parsed_data?.date || 'unknown',
        title: event.parsed_data?.title || 'No Title',
        status: 'UNKNOWN'
    };

    const imageUrl = event.poster_url || event.screenshot_url;
    const keywords = event.allKeywords || (event.keyword ? [event.keyword] : []);

    const copySinglePrompt = () => {
        const issues: string[] = [];
        if (!imageUrl) issues.push('이미지 누락');
        if (!data?.djs || data.djs.length === 0) issues.push('DJ 미확인');
        if (issues.length === 0) issues.push('이미지/데이터 정합성 검증 필요');

        const prompt = [
            `Event Ingestion Recipe 가이드에 따라서 아래 이벤트 1건만 정밀 재수집해줘.`,
            `전체 소스를 재검색하지 말고, 이 URL에서 해당 날짜의 포스트만 찾아서 수정해줘.`,
            ``,
            `- 키워드: ${keywords.join(', ')}`,
            `  URL: ${event.source_url}`,
            `  날짜: ${data?.date || '미확인'} (${data?.day || '?'})`,
            `  제목: ${data?.title || '미확인'}`,
            `  DJ: ${data?.djs?.join(', ') || '미확인'}`,
            `  현재 이미지: ${imageUrl || '없음'}`,
            `  문제점: ${issues.join(', ')}`,
            ``,
            `요구사항:`,
            `- 이미지: 포스터 전체가 크롭 없이 캡처되어야 함`,
            `- 날짜: 2026년 달력 기준 요일 일치 검증 필수`,
            `- 수집된 이미지는 public/scraped 폴더에 저장할 것`,
            `- 이 이벤트만 수정하고 나머지 scraped_events.json 데이터는 건드리지 말 것`,
        ].join('\n');
        navigator.clipboard.writeText(prompt);
        alert("정밀 재수집 요청이 복사되었습니다.");
    };

    return (
        <div className={`ingestor-card ${data.status === 'CLOSED' ? 'status-closed' : ''} ${isSelected ? 'is-selected' : ''}`}>
            <div className="card-header">
                <div className="header-left">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onSelect}
                        className="card-checkbox"
                    />
                    <div className="keyword-tags">
                        {keywords.map((kw: string) => (
                            <span key={kw} className="source-tag">{kw}</span>
                        ))}
                    </div>
                </div>
                {isDuplicate && <span className="duplicate-badge">DUPLICATE</span>}
                <span className="date-badge">{data.date.slice(5)} ({data.day || '일'})</span>
            </div>

            <div className="poster-section" onClick={onSelect}>
                {imageUrl ? (
                    <img src={imageUrl} alt="Event Poster" className="poster-img" />
                ) : (
                    <div className="no-image">이미지 없음</div>
                )}
                {isSelected && <div className="selection-overlay">✓</div>}
            </div>

            <div className="info-section">
                <h3 className="event-title">{data.title}</h3>

                <div className="detail-compact">
                    <div className="detail-line">
                        <b>장소</b> <span>{data.location || '해피홀'}</span>
                    </div>
                    {(data.djs || []).length > 0 && (
                        <div className="detail-line">
                            <b>DJ</b> <span>{data.djs?.join(', ')}</span>
                        </div>
                    )}
                    {(data.times || []).length > 0 && (
                        <div className="detail-line">
                            <b>시간</b> <span>{data.times?.join(', ')}</span>
                        </div>
                    )}
                </div>

                {event.extracted_text && (
                    <div className="extracted-box" title="추출된 본문 텍스트">
                        {event.extracted_text}
                    </div>
                )}

                <div className="card-actions">
                    <button
                        className="btn-register btn-sm"
                        onClick={() => window.open(event.source_url, '_blank')}
                    >
                        원본
                    </button>
                    <button
                        className="btn-rescrape btn-sm"
                        onClick={copySinglePrompt}
                    >
                        🔄 재수집
                    </button>
                    <button
                        className="btn-register btn-sm primary"
                        onClick={() => alert('등록 연동 준비 중')}
                    >
                        등록
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EventIngestor;
