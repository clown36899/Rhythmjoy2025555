import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import VenueSelectModal from '../../../v2/components/VenueSelectModal';
import { supabase as prodSupabase } from '../../../../lib/cafe24Client';
import { ensureRecruitmentTags, getRecruitmentKindLabel, type RecruitmentKind } from '../../../../utils/danceTaxonomy';
import { detectEventType, getIngestorRecruitmentKind, mapIngestorEvent, titleLooksDuplicate, toMapSafeVenueName, type MappedIngestorEvent, type VenueRecord } from '../utils/ingestorMapping';
import './EventEditModal.css';

interface EventEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: any;
    venues?: VenueRecord[];
    onSuccess: (id: string) => void;
}

const EventEditModal: React.FC<EventEditModalProps> = ({ isOpen, onClose, event, venues = [], onSuccess }) => {
    const [formData, setFormData] = useState<any>(null);
    const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [progress, setProgress] = useState<string>('');

    useEffect(() => {
        if (event) {
            const mapped = mapIngestorEvent(event, venues);
            const recruitmentKind = getIngestorRecruitmentKind(event);

            setFormData({
                title: event.structured_data?.title || '',
                date: event.structured_data?.date || '',
                location: mapped.location,
                address: mapped.address,
                description: event.extracted_text || '',
                djs: event.structured_data?.djs || [],
                venue_id: mapped.venue_id,
                location_link: mapped.location_link,
                poster_url: event.poster_url || '',
                category: mapped.category,
                genre: mapped.genre,
                recruitment_kind: recruitmentKind || '',
                time: mapped.time,
                group_id: mapped.group_id,
                venue_name: mapped.venue_name,
            });
        }
    }, [event, isOpen, venues]);

    if (!isOpen || !formData) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleDJsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const djs = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        setFormData((prev: any) => ({ ...prev, djs }));
    };

    const handleCategoryChange = (category: string) => {
        const genre = category === 'social' ? '소셜' : category === 'class' ? '강습' : '파티';
        setFormData((prev: any) => ({
            ...prev,
            category,
            genre,
            recruitment_kind: '',
            group_id: category === 'social' ? 2 : null,
        }));
    };

    const handleRecruitmentKindChange = (value: string) => {
        const recruitmentKind = value as RecruitmentKind | '';
        const recruitmentLabel = getRecruitmentKindLabel(recruitmentKind);
        setFormData((prev: any) => ({
            ...prev,
            recruitment_kind: recruitmentKind,
            category: recruitmentKind ? 'event' : prev.category,
            genre: recruitmentLabel || (prev.category === 'social' ? '소셜' : prev.category === 'class' ? '강습' : '파티'),
            group_id: recruitmentKind ? null : prev.group_id,
        }));
    };

    const findRegisteredDuplicate = async (formattedTitle: string, mapped: MappedIngestorEvent) => {
        const date = formData.date;
        if (!date) return null;
        const { data, error } = await prodSupabase
            .from('events')
            .select('id,title,date,start_date,end_date,location,venue_name,venue_id,link1')
            .or(`date.eq.${date},start_date.eq.${date},and(start_date.lte.${date},end_date.gte.${date})`)
            .limit(80);
        if (error) throw error;

        return (data || []).find((row: any) => {
            if (event.source_url && row.link1 === event.source_url) return true;
            const sameVenue = mapped.venue_id && row.venue_id === mapped.venue_id
                || mapped.venue_name && [row.venue_name, row.location].filter(Boolean).some((v: string) => v.includes(mapped.venue_name || '') || (mapped.venue_name || '').includes(v));
            return sameVenue && titleLooksDuplicate(formattedTitle, row.title || '');
        }) || null;
    };

    const handleVenueSelect = (venue: any) => {
        const mapSafeLocation = toMapSafeVenueName(venue.name);
        setFormData((prev: any) => ({
            ...prev,
            location: mapSafeLocation,
            venue_name: mapSafeLocation,
            address: venue.address,
            venue_id: venue.id,
            location_link: venue.map_url || ''
        }));
        setIsVenueModalOpen(false);
    };

    const handleRegister = async () => {
        if (!formData.title || !formData.date) {
            alert('제목과 날짜는 필수입니다.');
            return;
        }

        try {
            setIsSubmitting(true);
            setProgress('DB 등록 및 이미지 저장 중...');

            // 제목 포맷팅
            const formattedTitle = formData.djs.length > 0
                ? `DJ ${formData.djs.join(', ')} | ${formData.title}`
                : formData.title;
            const baseMapped = mapIngestorEvent({
                    ...event,
                    structured_data: {
                        ...event.structured_data,
                        event_type: event.structured_data?.event_type || detectEventType(event),
                        location: formData.location,
                        address: formData.address,
                        venue_id: formData.venue_id,
                        venue_name: formData.venue_name,
                        location_link: formData.location_link,
                        times: formData.time ? [formData.time] : event.structured_data?.times,
                    },
                }, venues);
            const recruitmentKind = (formData.recruitment_kind || getIngestorRecruitmentKind(event)) as RecruitmentKind | null;
            const recruitmentLabel = getRecruitmentKindLabel(recruitmentKind);
            const mapped = {
                ...baseMapped,
                category: recruitmentKind ? 'event' : formData.category,
                genre: recruitmentLabel || formData.genre || baseMapped.genre,
                activity_type: recruitmentKind ? 'recruit' : baseMapped.activity_type,
                dance_tags: ensureRecruitmentTags(baseMapped.dance_tags, recruitmentKind),
                group_id: recruitmentKind ? null : (formData.category === 'social' ? 2 : null),
            };
            const duplicate = await findRegisteredDuplicate(formattedTitle, mapped);

            const insertPayload = {
                    title: formattedTitle,
                    date: formData.date,
                    start_date: formData.date,
                    end_date: formData.date,
                    time: mapped.time,
                    location: mapped.location,
                    address: mapped.address,
                    venue_id: mapped.venue_id,
                    venue_name: mapped.venue_name,
                    location_link: mapped.location_link,
                    image: formData.poster_url || null,
                    image_micro: null,
                    image_thumbnail: null,
                    image_medium: null,
                    image_full: null,
                    storage_path: null,
                    description: formData.description,
                    category: mapped.category || 'event',
                    scope: 'domestic',
                    link1: event.source_url || '',
                    link_name1: event.keyword || '',
                    genre: mapped.genre,
                    dance_scope: mapped.dance_scope,
                    dance_genre: mapped.dance_genre,
                    activity_type: mapped.activity_type,
                    dance_tags: mapped.dance_tags,
                    group_id: mapped.group_id,
                } as any;

            const scrapedStructuredData = {
                ...event.structured_data,
                title: formData.title,
                date: formData.date,
                location: formData.location,
                address: formData.address,
                venue_id: formData.venue_id,
                venue_name: formData.venue_name,
                location_link: formData.location_link,
                djs: formData.djs,
                activity_type: mapped.activity_type,
                genre: mapped.genre,
                subgenre: mapped.genre,
                tags: mapped.dance_tags,
            };

            // 2. Service-role 함수로 운영 DB 등록. 함수가 관리자 작성자 user_id를 강제한다.
            const registerRes = await fetch('/api/ingestor-register-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scrapedEventId: event.id,
                    eventData: insertPayload,
                    scrapedStructuredData,
                    existingEventId: duplicate?.id || null,
                }),
            });
            const registerJson = await registerRes.json().catch(() => ({}));
            if (!registerRes.ok) {
                throw new Error(registerJson.error || '운영 DB 등록에 실패했습니다.');
            }

            alert(`${registerJson.skipped ? '이미 등록된 이벤트라 이미지/완료 상태를 보정했습니다.' : '등록 성공!'} (ID: ${registerJson.event?.id})`);
            onSuccess(event.id);
            onClose();

        } catch (err: any) {
            console.error('등록 실패:', err);
            alert(`등록 중 오류 발생: ${err.message}`);
        } finally {
            setIsSubmitting(false);
            setProgress('');
        }
    };

    return createPortal(
        <div className="event-edit-overlay" onClick={onClose}>
            <div className="event-edit-container" onClick={e => e.stopPropagation()}>
                <header className="event-edit-header">
                    <h2>캘린더 DB 등록 및 수정</h2>
                    <button className="btn-close" onClick={onClose}>✕</button>
                </header>

                <div className="event-edit-body">
                    <div className="edit-grid">
                        <section className="preview-section">
                            <label>미리보기 / 편집용 이미지</label>
                            {formData.poster_url ? (
                                <img src={formData.poster_url} alt="poster" className="edit-poster-preview" />
                            ) : <div className="no-poster">이미지 없음</div>}
                            <div className="preview-tip">※ 수집된 스크린샷이 4종 리사이징되어 업로드됩니다.</div>
                        </section>

                        <section className="form-section">
                            <div className="form-group">
                                <label>이벤트 제목 <span className="required">*</span></label>
                                <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="파티명 입력" />
                            </div>

                            <div className="form-group">
                                <label>DJ 목록 (쉼표 구분)</label>
                                <input type="text" value={formData.djs.join(', ')} onChange={handleDJsChange} placeholder="DJ 미스터리, DJ 조이..." />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>분류 <span className="required">*</span></label>
                                    <select name="category" value={formData.category} onChange={(e) => handleCategoryChange(e.target.value)} className="category-select">
                                        <option value="social">소셜</option>
                                        <option value="event">파티/행사</option>
                                        <option value="class">강습</option>
                                        <option value="club">동호회</option>
                                    </select>
                                    <input type="text" name="genre" value={formData.genre || ''} onChange={handleChange} placeholder="장르" />
                                    <select
                                        name="recruitment_kind"
                                        value={formData.recruitment_kind || ''}
                                        onChange={(e) => handleRecruitmentKindChange(e.target.value)}
                                        className="category-select"
                                    >
                                        <option value="">모집 아님</option>
                                        <option value="oneday_recruit">원데이모집</option>
                                        <option value="public_recruit">일반인모집</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>날짜 <span className="required">*</span></label>
                                    <input type="date" name="date" value={formData.date} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>장소 명칭</label>
                                    <div className="input-with-action">
                                        <input type="text" name="location" value={formData.location} onChange={handleChange} />
                                        <button className="btn-venue-search" onClick={() => setIsVenueModalOpen(true)}>장소 검색</button>
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>상세 주소</label>
                                <input type="text" name="address" value={formData.address} onChange={handleChange} />
                            </div>

                            <div className="form-group">
                                <label>추출 텍스트 / 설명</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} rows={6} />
                            </div>
                        </section>
                    </div>
                </div>

                <footer className="event-edit-footer">
                    {isSubmitting && <div className="submit-progress">{progress}</div>}
                    <div className="btn-group">
                        <button className="btn-cancel" onClick={onClose} disabled={isSubmitting}>취소</button>
                        <button className="btn-submit" onClick={handleRegister} disabled={isSubmitting}>
                            {isSubmitting ? '처리 중...' : '캘린더 DB 등록'}
                        </button>
                    </div>
                </footer>

                {/* 장소 선택 모달 */}
                <VenueSelectModal
                    isOpen={isVenueModalOpen}
                    onClose={() => setIsVenueModalOpen(false)}
                    onSelect={handleVenueSelect}
                    onManualInput={(name, _link, addr) => {
                        const mapSafeLocation = toMapSafeVenueName(name);
                        setFormData((prev: any) => ({
                            ...prev,
                            location: mapSafeLocation,
                            venue_name: mapSafeLocation,
                            address: addr || '',
                            venue_id: null,
                            location_link: _link || ''
                        }));
                        setIsVenueModalOpen(false);
                    }}
                />
            </div>
        </div>,
        document.body
    );
};

export default EventEditModal;
