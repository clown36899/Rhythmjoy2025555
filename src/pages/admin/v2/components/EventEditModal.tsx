import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import VenueSelectModal from '../../../v2/components/VenueSelectModal';
import { createResizedImages } from '../../../../utils/imageResize';
import { supabase as prodSupabase } from '../../../../lib/supabase';
import { detectEventType, mapIngestorEvent, titleLooksDuplicate, toMapSafeVenueName, type MappedIngestorEvent, type VenueRecord } from '../utils/ingestorMapping';
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
            group_id: category === 'social' ? 2 : null,
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
            setProgress('이미지 리사이징 중...');

            // 1. 이미지 처리 (기존 로직 이식)
            let imageFiles: any = null;
            let imageUrls: any = {};
            let storagePath: string | null = null;

            if (formData.poster_url) {
                try {
                    const imgRes = await fetch(formData.poster_url);
                    const imgBlob = await imgRes.blob();
                    const imgFile = new File([imgBlob], 'poster.png', { type: imgBlob.type });
                    
                    imageFiles = await createResizedImages(imgFile);

                    const timestamp = Date.now();
                    const folderName = `${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
                    storagePath = `social-events/${folderName}`;

                    setProgress('이미지 업로드 중...');
                    const upload = async (size: string, file: File) => {
                        const path = `${storagePath}/${size}.webp`;
                        const { error } = await prodSupabase.storage.from('images').upload(path, file, {
                            contentType: 'image/webp',
                            upsert: true
                        });
                        if (error) throw error;
                        return prodSupabase.storage.from('images').getPublicUrl(path).data.publicUrl;
                    };

                    const [micro, thumb, med, full] = await Promise.all([
                        upload('micro', imageFiles.micro),
                        upload('thumbnail', imageFiles.thumbnail),
                        upload('medium', imageFiles.medium),
                        upload('full', imageFiles.full)
                    ]);

                    imageUrls = { micro, thumb, med, full };
                } catch (imgErr) {
                    console.error('이미지 처리 실패 (이미지 없이 계속):', imgErr);
                }
            }

            setProgress('DB 등록 중...');

            // 제목 포맷팅
            const formattedTitle = formData.djs.length > 0
                ? `DJ ${formData.djs.join(', ')} | ${formData.title}`
                : formData.title;
            const mapped = {
                ...mapIngestorEvent({
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
                }, venues),
                category: formData.category,
                genre: formData.genre || mapIngestorEvent(event, venues).genre,
                group_id: formData.category === 'social' ? 2 : null,
            };
            const duplicate = await findRegisteredDuplicate(formattedTitle, mapped);
            if (duplicate) {
                await fetch('/.netlify/functions/scraped-events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...event, is_collected: true }),
                });
                alert(`이미 운영 DB에 등록된 이벤트라 신규 등록을 건너뛰고 완료 처리했습니다.\n기존: ${duplicate.title}`);
                onSuccess(event.id);
                onClose();
                return;
            }

            const insertPayload = {
                    title: formattedTitle,
                    date: formData.date,
                    start_date: formData.date,
                    time: mapped.time,
                    location: mapped.location,
                    address: mapped.address,
                    venue_id: mapped.venue_id,
                    venue_name: mapped.venue_name,
                    location_link: mapped.location_link,
                    image: imageUrls.full || formData.poster_url || null,
                    image_micro: imageUrls.micro || null,
                    image_thumbnail: imageUrls.thumb || null,
                    image_medium: imageUrls.med || null,
                    image_full: imageUrls.full || null,
                    storage_path: storagePath,
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
                    user_id: (await prodSupabase.auth.getUser()).data.user?.id || '508e4c9e-b180-4c0f-aa98-3e99562a147a',
                    group_id: mapped.group_id,
                } as any;

            // 2. Supabase Insert
            const { data: result, error: insertError } = await prodSupabase
                .from('events' as any)
                .insert([insertPayload])
                .select()
                .maybeSingle();

            if (insertError) throw insertError;

            // 3. scraped_events.db에도 편집 내용 반영 + is_collected 처리
            await fetch('/.netlify/functions/scraped-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...event,
                    is_collected: true,
                    structured_data: {
                        ...event.structured_data,
                        title: formData.title,
                        date: formData.date,
                        location: formData.location,
                        address: formData.address,
                        venue_id: formData.venue_id,
                        venue_name: formData.venue_name,
                        location_link: formData.location_link,
                        djs: formData.djs,
                    }
                }),
            });

            alert(`등록 성공! (ID: ${result?.id})`);
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
