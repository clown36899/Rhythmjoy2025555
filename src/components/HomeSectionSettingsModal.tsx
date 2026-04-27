import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
    DEFAULT_HOME_SECTION_VISIBILITY,
    type HomeSectionVisibility,
} from "../pages/v2/components/EventList/hooks/useHomeSectionVisibility";
import "./GenreWeightSettingsModal.css";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const SECTION_LABELS: { key: keyof HomeSectionVisibility; icon: string; label: string; description: string }[] = [
    { key: 'show_new_events_banner', icon: 'ri-notification-3-line', label: '신규 이벤트 배너', description: '최근 72시간 내 등록된 이벤트 슬라이드' },
    { key: 'show_favorites', icon: 'ri-star-line', label: '즐겨찾기', description: '내가 즐겨찾기한 이벤트 섹션' },
    { key: 'show_upcoming_events', icon: 'ri-fire-line', label: '예정된 행사', description: '앞으로 열리는 파티·행사' },
    { key: 'show_classes', icon: 'ri-calendar-check-line', label: '강습', description: '외부 강사 강습·워크샵' },
    { key: 'show_club_lessons', icon: 'ri-group-line', label: '동호회 강습', description: '동호회 주관 특별 강습' },
    { key: 'show_club_regular_classes', icon: 'ri-group-2-line', label: '동호회 정규강습', description: '동호회 정규 시즌 강습' },
];

export default function HomeSectionSettingsModal({ isOpen, onClose }: Props) {
    const [visibility, setVisibility] = useState<HomeSectionVisibility>(DEFAULT_HOME_SECTION_VISIBILITY);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) load();
    }, [isOpen]);

    const load = async () => {
        setIsLoading(true);
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'home_section_visibility')
                .maybeSingle();

            if (data?.value) {
                setVisibility({ ...DEFAULT_HOME_SECTION_VISIBILITY, ...data.value });
            } else {
                setVisibility(DEFAULT_HOME_SECTION_VISIBILITY);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const toggle = (key: keyof HomeSectionVisibility) => {
        setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'home_section_visibility',
                    value: visibility,
                    description: 'Home page section visibility settings',
                }, { onConflict: 'key' });

            if (error) throw error;
            alert('저장되었습니다. 새로고침 후 반영됩니다.');
            onClose();
        } catch (e) {
            console.error(e);
            alert('저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (confirm('모든 섹션을 기본값(전체 표시)으로 초기화하시겠습니까?')) {
            setVisibility(DEFAULT_HOME_SECTION_VISIBILITY);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="genre-settings-overlay">
            <div className="genre-settings-container" translate="no" style={{ maxWidth: 460 }}>
                <div className="genre-settings-header">
                    <h3>메인 화면 섹션 노출 설정</h3>
                    <button onClick={onClose} className="close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="genre-settings-body">
                    <p className="description">
                        메인 화면에 표시할 섹션을 선택합니다.<br />
                        토글 OFF 시 해당 섹션이 완전히 숨겨집니다.
                    </p>

                    {isLoading ? (
                        <div className="loading">불러오는 중...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {SECTION_LABELS.map(({ key, icon, label, description }) => (
                                <div
                                    key={key}
                                    onClick={() => toggle(key)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        padding: '12px 16px',
                                        borderRadius: 12,
                                        border: `1px solid ${visibility[key] ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                        background: visibility[key] ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none',
                                    }}
                                >
                                    <i className={icon} style={{ fontSize: 20, color: visibility[key] ? '#818cf8' : '#6b7280', flexShrink: 0 }}></i>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: visibility[key] ? '#e5e7eb' : '#9ca3af', fontWeight: 600, fontSize: '0.95rem' }}>{label}</div>
                                        <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{description}</div>
                                    </div>
                                    <div style={{
                                        width: 44,
                                        height: 24,
                                        borderRadius: 12,
                                        background: visibility[key] ? '#6366f1' : 'rgba(255,255,255,0.1)',
                                        position: 'relative',
                                        flexShrink: 0,
                                        transition: 'background 0.2s',
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: 3,
                                            left: visibility[key] ? 23 : 3,
                                            width: 18,
                                            height: 18,
                                            borderRadius: '50%',
                                            background: 'white',
                                            transition: 'left 0.2s',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="genre-settings-footer">
                    <button className="reset-btn" onClick={handleReset} disabled={isSaving}>초기화</button>
                    <div className="action-buttons">
                        <button className="cancel-btn" onClick={onClose} disabled={isSaving}>취소</button>
                        <button className="save-btn" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
