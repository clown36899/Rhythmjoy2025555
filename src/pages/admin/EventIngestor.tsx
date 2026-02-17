import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useEvents } from '../v2/components/EventList/hooks/useEvents';
import { supabase } from '../../lib/supabase';
import { createResizedImages } from '../../utils/imageResize';
import { useAuth } from '../../contexts/AuthContext';
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

interface VenueRecord {
    id: string | number;
    name: string;
    address?: string;
}

const EventIngestor: React.FC = () => {
    const { user } = useAuth();
    const { events: existingEvents, loading: existingLoading } = useEvents({ isAdminMode: true });
    const [scrapedEvents, setScrapedEvents] = useState<ScrapedEvent[]>([]);
    const [loadingScraped, setLoadingScraped] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showComparison, setShowComparison] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
    const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
    const [registeringId, setRegisteringId] = useState<string | null>(null);
    const [venues, setVenues] = useState<VenueRecord[]>([]);

    // 전체화면 모드: 650px 제한 해제 (스크롤 허용)
    useEffect(() => {
        document.documentElement.classList.add('ingestor-fullscreen');
        return () => {
            document.documentElement.classList.remove('ingestor-fullscreen');
        };
    }, []);

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

    // Venues 로딩 (장소 자동 매칭용)
    useEffect(() => {
        const fetchVenues = async () => {
            const { data } = await supabase
                .from('venues')
                .select('id, name, address')
                .eq('is_active', true);
            if (data) setVenues(data);
        };
        fetchVenues();
    }, []);

    // 장소명으로 venue 매칭
    const matchVenue = useCallback((locationName: string): VenueRecord | null => {
        if (!locationName || venues.length === 0) return null;
        const norm = (s: string) => s.replace(/[\s()（）\-_]/g, '').toLowerCase();
        const target = norm(locationName);
        return venues.find(v => {
            const vn = norm(v.name);
            return vn.includes(target) || target.includes(vn);
        }) || null;
    }, [venues]);

    // ===== DB 등록 함수 =====
    const handleRegisterEvent = useCallback(async (scraped: ScrapedEvent) => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        if (registeringId) {
            alert('등록 진행 중입니다. 완료될 때까지 기다려주세요.');
            return;
        }

        const data = scraped.structured_data;
        if (!data?.date || !data?.title) {
            alert('날짜 또는 제목 데이터가 없어 등록할 수 없습니다.');
            return;
        }

        // 제목 포맷: DJ 이름 | 제목
        const djNames = data.djs?.join(', ');
        const formattedTitle = djNames ? `DJ ${djNames} | ${data.title}` : data.title;

        // 시간 추출
        const startTime = data.times?.[0]?.split('~')[0]?.trim() || '';

        // 장소 매칭
        const matchedVenue = matchVenue(data.location || '');

        if (!confirm(`다음 이벤트를 DB에 등록하시겠습니까?\n\n제목: ${formattedTitle}\n날짜: ${data.date}\n장소: ${data.location || '미정'}${matchedVenue ? ` → venue: ${matchedVenue.name}` : ''}\nDJ: ${djNames || '없음'}`)) {
            return;
        }

        setRegisteringId(scraped.id);

        try {
            // 1. 이미지 업로드 (4버전)
            let imageUrl: string | null = null;
            let imageMicro: string | null = null;
            let imageThumbnail: string | null = null;
            let imageMedium: string | null = null;
            let imageFull: string | null = null;
            let storagePath: string | null = null;

            const posterUrl = scraped.poster_url || scraped.screenshot_url;
            if (posterUrl) {
                try {
                    // 로컬 이미지 fetch → Blob → File
                    const imgRes = await fetch(posterUrl);
                    const imgBlob = await imgRes.blob();
                    const imgFile = new File([imgBlob], 'poster.png', { type: imgBlob.type });

                    // 4버전 리사이즈
                    const resized = await createResizedImages(imgFile);

                    const timestamp = Date.now();
                    const randomStr = Math.random().toString(36).substring(2, 7);
                    const folderName = `${timestamp}_${randomStr}`;
                    const basePath = `social-events/${folderName}`;
                    storagePath = basePath;

                    const uploadImage = async (size: string, blob: Blob) => {
                        const path = `${basePath}/${size}.webp`;
                        const { error } = await supabase.storage.from('images').upload(path, blob, {
                            contentType: 'image/webp',
                            upsert: true
                        });
                        if (error) throw error;
                        return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
                    };

                    const [microUrl, thumbUrl, medUrl, fullUrl] = await Promise.all([
                        uploadImage('micro', resized.micro),
                        uploadImage('thumbnail', resized.thumbnail),
                        uploadImage('medium', resized.medium),
                        uploadImage('full', resized.full)
                    ]);

                    imageMicro = microUrl;
                    imageThumbnail = thumbUrl;
                    imageMedium = medUrl;
                    imageFull = fullUrl;
                    imageUrl = fullUrl;
                } catch (imgErr) {
                    console.error('이미지 업로드 실패:', imgErr);
                    if (!confirm('이미지 업로드에 실패했습니다. 이미지 없이 등록하시겠습니까?')) {
                        setRegisteringId(null);
                        return;
                    }
                }
            }

            // 2. 이벤트 데이터 구성
            const eventData: any = {
                title: formattedTitle,
                date: data.date,
                start_date: data.date,
                time: startTime,
                location: data.location || '',
                category: 'social',
                genre: 'DJ,소셜',
                link1: scraped.source_url || '',
                link_name1: scraped.keyword || '',
                description: scraped.extracted_text || '',
                user_id: user.id,
                group_id: 2, // 댄스빌보드 (관리자 일괄 등록)
                day_of_week: new Date(data.date).getDay(),
                image: imageUrl,
                image_micro: imageMicro,
                image_thumbnail: imageThumbnail,
                image_medium: imageMedium,
                image_full: imageFull,
                storage_path: storagePath,
                venue_id: matchedVenue?.id || null,
                venue_name: matchedVenue?.name || data.location || null,
            };

            // 3. DB insert
            const { data: result, error } = await supabase
                .from('events')
                .insert([eventData])
                .select()
                .maybeSingle();

            if (error) throw error;

            console.log('✅ 이벤트 등록 성공:', result);
            setRegisteredIds(prev => new Set(prev).add(scraped.id));
            alert(`등록 완료! (ID: ${result?.id})\n제목: ${formattedTitle}`);

        } catch (err: any) {
            console.error('이벤트 등록 실패:', err);
            alert(`등록 실패: ${err.message}`);
        } finally {
            setRegisteringId(null);
        }
    }, [user, registeringId, matchVenue]);

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

    // ===== 퍼지 매칭 유틸 =====
    const normalize = (s: string) => s.replace(/[\s!\-_.,()（）]/g, '').toLowerCase();

    const tokenize = (s: string): string[] => {
        const stopwords = ['dj', '소셜', 'social', 'monthly', 'live', 'night', 'club', 'band', 'in', 'the', 'of'];
        const cleaned = s.replace(/[^가-힣a-zA-Z0-9]/g, ' ');
        return cleaned.split(/\s+/).filter(t => t.length >= 2 && !stopwords.includes(t.toLowerCase()));
    };

    const tokenOverlap = (a: string, b: string): number => {
        const tokensA = tokenize(a);
        const tokensB = tokenize(b);
        if (tokensA.length === 0 || tokensB.length === 0) return 0;
        let matchCount = 0;
        tokensA.forEach(ta => {
            if (tokensB.some(tb => ta.includes(tb) || tb.includes(ta))) matchCount++;
        });
        return matchCount / Math.max(tokensA.length, tokensB.length);
    };

    const calcMatchScore = (scraped: ScrapedEvent, db: any): { score: number; reasons: string[] } => {
        const sDate = scraped.structured_data?.date || '';
        const sTitle = normalize(scraped.structured_data?.title || scraped.id);
        const sDjs = (scraped.structured_data?.djs || []).map(normalize);
        const dbDate = db.date || '';
        const dbTitle = normalize(db.title || '');
        const dbDjs = ((db as any).dj ? [normalize((db as any).dj)] : []);
        const dbOrganizer = normalize(db.organizer || '');

        let score = 0;
        const reasons: string[] = [];

        // 1단계: 날짜 일치 (최우선, 40점)
        if (sDate === dbDate) {
            score += 40;
            reasons.push('날짜 일치');
        } else return { score: 0, reasons: [] };

        // 2단계: DJ 일치 (최대 30점) — 날짜 다음으로 중요
        let djMatched = false;
        const allSDjs = sDjs;
        // DB 제목에서 DJ 이름 추출 시도 (제목에 DJ가 포함된 경우)
        const dbTitleDjs = dbTitle.match(/dj\s*([^\s,()]+)/gi)?.map(m => normalize(m)) || [];
        const allDbDjs = [...dbDjs, ...dbTitleDjs];

        if (allSDjs.length > 0 && allDbDjs.length > 0) {
            djMatched = allSDjs.some(sd => allDbDjs.some(dd => sd.includes(dd) || dd.includes(sd)));
            if (djMatched) {
                score += 30;
                reasons.push('DJ 일치');
            }
        }
        // DJ 이름이 상대 제목에 포함되는지도 체크
        if (!djMatched && allSDjs.length > 0) {
            djMatched = allSDjs.some(sd => dbTitle.includes(sd));
            if (djMatched) {
                score += 25;
                reasons.push('DJ→DB제목 포함');
            }
        }
        if (!djMatched && allDbDjs.length > 0) {
            const djInScraped = allDbDjs.some(dd => sTitle.includes(dd));
            if (djInScraped) {
                djMatched = true;
                score += 25;
                reasons.push('DB DJ→수집제목 포함');
            }
        }

        // 3단계: 제목 유사도 (최대 25점)
        if (sTitle === dbTitle) {
            score += 25;
            reasons.push('제목 완전일치');
        } else if (sTitle.includes(dbTitle) || dbTitle.includes(sTitle)) {
            score += 20;
            reasons.push('제목 포함관계');
        } else {
            const overlap = tokenOverlap(
                scraped.structured_data?.title || '',
                db.title || ''
            );
            if (overlap >= 0.4) {
                score += Math.round(overlap * 25);
                reasons.push(`제목 토큰 ${Math.round(overlap * 100)}%`);
            } else if (overlap > 0) {
                score += Math.round(overlap * 15);
                reasons.push(`제목 부분일치 ${Math.round(overlap * 100)}%`);
            }
            // DJ가 같으면 제목이 달라도 같은 이벤트일 가능성 높음
            if (djMatched && overlap < 0.4) {
                score += 10;
                reasons.push('DJ일치+제목상이 보정');
            }
        }

        // DJ가 양쪽 다 있는데 불일치하면 감점
        if (!djMatched && allSDjs.length > 0 && allDbDjs.length > 0) {
            score -= 20;
            reasons.push('DJ 불일치 (-20)');
        }

        // 4단계: 주최/키워드 일치 (보너스 5점)
        const sKeyword = normalize(scraped.keyword || '');
        if (sKeyword && dbOrganizer && (sKeyword.includes(dbOrganizer) || dbOrganizer.includes(sKeyword))) {
            score += 5;
            reasons.push('주최 유사');
        }

        return { score, reasons };
    };

    // 비교 데이터: 수집 이벤트별 같은 날짜 DB 이벤트 전체 그룹
    const comparisonData = useMemo(() => {
        if (!showComparison) return [] as Array<{
            scrapedId: string; scrapedTitle: string; scrapedDate: string; scrapedDjs: string;
            dbMatches: Array<{ dbId: number; dbTitle: string; dbDjs: string; score: number; matchReasons: string[] }>;
            bestStatus: 'match' | 'likely' | 'low' | 'new';
        }>;

        const groups: Array<{
            scrapedId: string; scrapedTitle: string; scrapedDate: string; scrapedDjs: string;
            dbMatches: Array<{ dbId: number; dbTitle: string; dbDjs: string; score: number; matchReasons: string[] }>;
            bestStatus: 'match' | 'likely' | 'low' | 'new';
        }> = [];

        scrapedEvents.forEach(scraped => {
            const sDate = scraped.structured_data?.date || '';
            const sTitle = scraped.structured_data?.title || scraped.id;
            const sDjs = scraped.structured_data?.djs?.join(', ') || '';

            // 같은 날짜 모든 DB 이벤트
            const dbMatches: Array<{ dbId: number; dbTitle: string; dbDjs: string; score: number; matchReasons: string[] }> = [];
            existingEvents.forEach(db => {
                if ((db.date || '') !== sDate) return;
                const { score, reasons } = calcMatchScore(scraped, db);
                dbMatches.push({
                    dbId: db.id as number,
                    dbTitle: db.title || '',
                    dbDjs: (db as any).dj || '',
                    score,
                    matchReasons: reasons,
                });
            });
            dbMatches.sort((a, b) => b.score - a.score);

            let bestStatus: 'match' | 'likely' | 'low' | 'new' = 'new';
            if (dbMatches.length > 0) {
                const top = dbMatches[0].score;
                if (top >= 65) bestStatus = 'match';
                else if (top >= 45) bestStatus = 'likely';
                else bestStatus = 'low';
            }

            groups.push({ scrapedId: scraped.id, scrapedTitle: sTitle, scrapedDate: sDate, scrapedDjs: sDjs, dbMatches, bestStatus });
        });

        return groups.sort((a, b) => a.scrapedDate.localeCompare(b.scrapedDate));
    }, [showComparison, scrapedEvents, existingEvents]);

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
                            className={`btn-compare ${showComparison ? 'active' : ''}`}
                            onClick={() => setShowComparison(!showComparison)}
                        >
                            {showComparison ? '📊 비교 닫기' : '📊 기존 이벤트 비교'}
                        </button>
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
                    <span>DB 등록 이벤트: <b>{existingEvents.length}</b></span>
                    <span>신규 가능: <b>{newList.filter(i => !dismissedIds.has(i.id)).length}</b></span>
                    <span>중복 발견: <b>{duplicateList.length}</b></span>
                    {dismissedIds.size > 0 && <span>제외됨: <b>{dismissedIds.size}</b></span>}
                </div>
            </header>

            <main>
                {/* 비교 테이블 */}
                {showComparison && (
                    <section className="ingestor-section comparison-section">
                        <h2>
                            <span className="icon">📊</span> 수집 ↔ DB 비교 결과
                            <span className="count-badge">{comparisonData.length}</span>
                            <span className="count-badge" data-type="match">
                                ✅ {comparisonData.filter(r => r.bestStatus === 'match').length}
                            </span>
                            <span className="count-badge" data-type="likely">
                                🔗 {comparisonData.filter(r => r.bestStatus === 'likely').length}
                            </span>
                            <span className="count-badge" data-type="low">
                                ❓ {comparisonData.filter(r => r.bestStatus === 'low').length}
                            </span>
                            <span className="count-badge" data-type="new">
                                🆕 {comparisonData.filter(r => r.bestStatus === 'new').length}
                            </span>
                        </h2>
                        <div className="comparison-table-wrap">
                            <table className="comparison-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>날짜</th>
                                        <th>수집 제목</th>
                                        <th>수집 DJ</th>
                                        <th>점수</th>
                                        <th>DB 제목</th>
                                        <th>DB DJ</th>
                                        <th>매칭 근거</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonData.map((group) => {
                                        const rowCount = Math.max(group.dbMatches.length, 1);
                                        return Array.from({ length: rowCount }, (_, idx) => {
                                            const db = group.dbMatches[idx];
                                            return (
                                                <tr key={`${group.scrapedId}-${idx}`} className={`comparison-row status-${idx === 0 ? group.bestStatus : (db && db.score >= 65 ? 'match' : db && db.score >= 45 ? 'likely' : 'low')}`}>
                                                    {idx === 0 && (
                                                        <>
                                                            <td rowSpan={rowCount} className="dismiss-cell">
                                                                <button
                                                                    className={`btn-dismiss-card ${dismissedIds.has(group.scrapedId) ? 'dismissed' : ''}`}
                                                                    onClick={() => {
                                                                        setDismissedIds(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(group.scrapedId)) next.delete(group.scrapedId);
                                                                            else next.add(group.scrapedId);
                                                                            return next;
                                                                        });
                                                                    }}
                                                                    title={dismissedIds.has(group.scrapedId) ? '복원' : '신규 목록에서 제외'}
                                                                >
                                                                    {dismissedIds.has(group.scrapedId) ? '↩' : '✕'}
                                                                </button>
                                                            </td>
                                                            <td rowSpan={rowCount}>{group.scrapedDate}</td>
                                                            <td rowSpan={rowCount}>{group.scrapedTitle}</td>
                                                            <td rowSpan={rowCount}>{group.scrapedDjs || '-'}</td>
                                                        </>
                                                    )}
                                                    {db ? (
                                                        <>
                                                            <td>
                                                                <span className={`score-badge ${db.score >= 80 ? 'high' : db.score >= 60 ? 'mid' : 'low'}`}>
                                                                    {db.score}
                                                                </span>
                                                            </td>
                                                            <td>{db.dbTitle}</td>
                                                            <td>{db.dbDjs || '-'}</td>
                                                            <td className="reasons-cell">
                                                                {db.matchReasons.length > 0 ? db.matchReasons.join(', ') : '-'}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td><span className="status-chip chip-new">🆕 신규</span></td>
                                                            <td colSpan={3}>DB에 같은 날짜 이벤트 없음</td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        });
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                <section className="ingestor-section">
                    <h2>
                        <span className="icon">🆕</span> 신규 이벤트 후보
                        <span className="count-badge">{newList.filter(i => !dismissedIds.has(i.id)).length}</span>
                        {dismissedIds.size > 0 && (
                            <span className="count-badge dismissed-count">제외 {dismissedIds.size}</span>
                        )}
                    </h2>
                    {newList.filter(i => !dismissedIds.has(i.id)).length === 0 ? (
                        <p className="no-data">새로운 수집 데이터가 없습니다.</p>
                    ) : (
                        <div className="ingestor-grid">
                            {newList.filter(i => !dismissedIds.has(i.id)).map(item => (
                                <EventCard
                                    key={item.id}
                                    event={item}
                                    isDuplicate={false}
                                    isSelected={selectedIds.has(item.id)}
                                    onSelect={() => toggleSelect(item.id)}
                                    onDismiss={() => {
                                        setDismissedIds(prev => {
                                            const next = new Set(prev);
                                            next.add(item.id);
                                            return next;
                                        });
                                    }}
                                    onRegister={() => handleRegisterEvent(item)}
                                    isRegistered={registeredIds.has(item.id)}
                                    isRegistering={registeringId === item.id}
                                    matchInfo={(() => {
                                        const g = comparisonData.find(c => c.scrapedId === item.id);
                                        if (!g || g.dbMatches.length === 0) return undefined;
                                        const top = g.dbMatches[0];
                                        return { score: top.score, status: g.bestStatus, dbTitle: top.dbTitle, matchReasons: top.matchReasons };
                                    })()}
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
    onDismiss?: () => void;
    onRegister?: () => void;
    isRegistered?: boolean;
    isRegistering?: boolean;
    matchInfo?: { score: number; status: string; dbTitle: string; matchReasons: string[] };
}

const EventCard: React.FC<EventCardProps & { event: any }> = ({ event, isDuplicate, isSelected, onSelect, onDismiss, onRegister, isRegistered, isRegistering, matchInfo }) => {
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
                    {isRegistered ? (
                        <span className="btn-register btn-sm registered">✅ 등록완료</span>
                    ) : (
                        <button
                            className={`btn-register btn-sm primary ${isRegistering ? 'loading' : ''}`}
                            onClick={onRegister}
                            disabled={isRegistering || !onRegister}
                        >
                            {isRegistering ? '⏳ 등록중...' : '📥 등록'}
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            className="btn-dismiss-card btn-sm"
                            onClick={onDismiss}
                        >
                            ✕ 제외
                        </button>
                    )}
                    {matchInfo && (
                        <span className={`card-match-badge ${matchInfo.score >= 65 ? 'match' : 'likely'}`}
                            title={`DB: ${matchInfo.dbTitle}\n근거: ${matchInfo.matchReasons.join(', ')}`}
                        >
                            {matchInfo.score >= 65 ? '✅' : '🔗'} {matchInfo.score}점
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EventIngestor;
