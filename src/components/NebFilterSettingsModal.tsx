import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
    DEFAULT_NEB_FILTER_SETTINGS,
    ALL_NEB_GENRES,
    type NebFilterSettings,
} from '../pages/v2/components/EventList/hooks/useNebFilterSettings';
import './NebFilterSettingsModal.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function NebFilterSettingsModal({ isOpen, onClose }: Props) {
    const [settings, setSettings] = useState<NebFilterSettings>(DEFAULT_NEB_FILTER_SETTINGS);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'neb_filter_settings')
            .maybeSingle()
            .then(({ data }) => {
                if (data?.value) setSettings({ ...DEFAULT_NEB_FILTER_SETTINGS, ...data.value });
                else setSettings(DEFAULT_NEB_FILTER_SETTINGS);
                setIsLoading(false);
            });
    }, [isOpen]);

    const toggleGenre = (genre: string) => {
        setSettings(prev => {
            const has = prev.include_genres.includes(genre);
            return {
                ...prev,
                include_genres: has
                    ? prev.include_genres.filter(g => g !== genre)
                    : [...prev.include_genres, genre],
            };
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert(
                    { key: 'neb_filter_settings', value: settings, description: 'NEB 광고 섹션 노출 필터 설정' },
                    { onConflict: 'key' }
                );
            if (error) throw error;
            alert('저장되었습니다. 새로고침 후 반영됩니다.');
            onClose();
        } catch {
            alert('저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="neb-settings-overlay">
            <div className="neb-settings-container" translate="no">
                <div className="neb-settings-header">
                    <h3>신규 이벤트 광고 섹션 설정</h3>
                    <button onClick={onClose} className="neb-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {isLoading ? (
                    <div className="neb-loading">불러오는 중...</div>
                ) : (
                    <div className="neb-settings-body">

                        {/* 노출 기준 */}
                        <div className="neb-section">
                            <div className="neb-section-title">노출 기준</div>
                            <div className="neb-radio-group">
                                <label className="neb-radio">
                                    <input
                                        type="radio"
                                        checked={settings.sort_by === 'created_at'}
                                        onChange={() => setSettings(p => ({ ...p, sort_by: 'created_at' }))}
                                    />
                                    <span>등록일 기준 <em>최근 등록된 이벤트 우선</em></span>
                                </label>
                                <label className="neb-radio">
                                    <input
                                        type="radio"
                                        checked={settings.sort_by === 'date'}
                                        onChange={() => setSettings(p => ({ ...p, sort_by: 'date' }))}
                                    />
                                    <span>이벤트 날짜 기준 <em>임박한 이벤트 우선</em></span>
                                </label>
                            </div>
                        </div>

                        {/* 시간 윈도우 (등록일 기준일 때만) */}
                        {settings.sort_by === 'created_at' && (
                            <div className="neb-section">
                                <div className="neb-section-title">노출 시간 윈도우</div>
                                <div className="neb-row">
                                    <input
                                        type="number"
                                        min={1}
                                        max={720}
                                        className="neb-number-input"
                                        value={settings.time_window_hours}
                                        onChange={e => setSettings(p => ({ ...p, time_window_hours: Number(e.target.value) }))}
                                    />
                                    <span className="neb-unit">시간 이내 등록된 이벤트</span>
                                </div>
                            </div>
                        )}

                        {/* 최대 노출 개수 */}
                        <div className="neb-section">
                            <div className="neb-section-title">최대 노출 개수</div>
                            <div className="neb-row">
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    className="neb-number-input"
                                    value={settings.max_items}
                                    onChange={e => setSettings(p => ({ ...p, max_items: Number(e.target.value) }))}
                                />
                                <span className="neb-unit">개</span>
                            </div>
                        </div>

                        {/* 포함 장르 */}
                        <div className="neb-section">
                            <div className="neb-section-title">포함 장르</div>
                            <div className="neb-checkbox-group">
                                {ALL_NEB_GENRES.map(genre => (
                                    <label key={genre} className="neb-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={settings.include_genres.includes(genre)}
                                            onChange={() => toggleGenre(genre)}
                                        />
                                        <span>{genre}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* 부족할 때 폴백 */}
                        <div className="neb-section">
                            <label className="neb-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.use_fallback}
                                    onChange={e => setSettings(p => ({ ...p, use_fallback: e.target.checked }))}
                                />
                                <span>부족 시 최신순 채우기 <em>기준 미달 시 최신 등록순으로 채움</em></span>
                            </label>
                        </div>
                    </div>
                )}

                <div className="neb-settings-footer">
                    <button
                        className="neb-reset-btn"
                        onClick={() => { if (confirm('기본값으로 초기화하시겠습니까?')) setSettings(DEFAULT_NEB_FILTER_SETTINGS); }}
                        disabled={isSaving}
                    >
                        초기화
                    </button>
                    <div className="neb-action-buttons">
                        <button className="neb-cancel-btn" onClick={onClose} disabled={isSaving}>취소</button>
                        <button className="neb-save-btn" onClick={handleSave} disabled={isSaving || isLoading}>
                            {isSaving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
