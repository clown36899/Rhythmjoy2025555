
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { DEFAULT_GENRE_WEIGHTS, type GenreWeightSettings } from "../pages/v2/utils/eventListUtils";
import "./GenreWeightSettingsModal.css";

interface GenreWeightSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function GenreWeightSettingsModal({ isOpen, onClose }: GenreWeightSettingsModalProps) {
    const [weights, setWeights] = useState<GenreWeightSettings>(DEFAULT_GENRE_WEIGHTS);
    const [dynamicGenres, setDynamicGenres] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Load settings from DB AND fetch existing genres
    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch configured weights
            const settingsPromise = supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'genre_weights')
                .maybeSingle();

            // 2. Fetch actual genres from events (to be dynamic) - ONLY for 'class' category
            // We fetch all genres to ensure we capture everything currently in use
            const eventsPromise = supabase
                .from('events')
                .select('genre')
                .eq('category', 'class') // Context: User requested only class genres
                .not('genre', 'is', null);

            const [settingsResult, eventsResult] = await Promise.all([settingsPromise, eventsPromise]);

            // Process Weights
            let loadedWeights = { ...DEFAULT_GENRE_WEIGHTS };
            if (settingsResult.data && settingsResult.data.value) {
                loadedWeights = { ...loadedWeights, ...settingsResult.data.value };
            }

            // Process Genres
            const existingGenres = new Set<string>();
            if (eventsResult.data) {
                eventsResult.data.forEach(item => {
                    if (item.genre) {
                        // Split by comma if multiple genres and trim
                        const splits = item.genre.split(',');
                        splits.forEach((g: string) => {
                            const clean = g.trim();
                            if (clean) existingGenres.add(clean);
                        });
                    }
                });
            }

            // Convert to array and sort
            // Also ensure we include any genres that have custom weights even if not currently in events (optional, but safer)
            // But user said "only currently existing", so let's prioritize existingGenres.
            // However, to avoid losing settings for temporarily missing genres, we could merge.
            // For now, adhering to "지금 있는 장르만" (Only existing genres) literally.

            const sortedGenres = Array.from(existingGenres).sort();
            setDynamicGenres(sortedGenres);
            setWeights(loadedWeights);

        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleWeightChange = (genre: string, value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0) return;

        setWeights(prev => ({
            ...prev,
            [genre]: numValue
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Check if row exists first? 
            // Upsert based on unique key
            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'genre_weights',
                    value: weights,
                    description: 'Probability weights for class exposure by genre'
                }, { onConflict: 'key' });

            if (error) throw error;

            alert('저장되었습니다. 새로고침 후 반영됩니다.');
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (confirm('모든 가중치를 기본값(1.0)으로 초기화하시겠습니까?')) {
            setWeights(DEFAULT_GENRE_WEIGHTS);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="genre-settings-overlay">
            <div className="genre-settings-container" translate="no">
                <div className="genre-settings-header">
                    <h3>강습 노출 확률 설정</h3>
                    <button onClick={onClose} className="close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="genre-settings-body">
                    <p className="description">
                        강습 목록에서 해당 장르가 상단에 노출될 확률 가중치를 설정합니다.<br />
                        <strong>1.0 = 기본</strong>, 2.0 = 2배 높음, 0.5 = 절반
                    </p>

                    {isLoading ? (
                        <div className="loading">불러오는 중...</div>
                    ) : (
                        <div className="weights-grid">
                            {dynamicGenres.map((genre) => (
                                <div key={genre} className="weight-item">
                                    <label>{genre}</label>
                                    <div className="input-wrapper">
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            // value={weights[genre] !== undefined ? weights[genre] : 1.0}
                                            // Handle undefined by defaulting to 1.0, but also check if we have a weight state
                                            value={weights[genre] ?? 1.0}
                                            onChange={(e) => handleWeightChange(genre, e.target.value)}
                                        />
                                        <span className="multiplier">x</span>
                                    </div>
                                </div>
                            ))}
                            {dynamicGenres.length === 0 && (
                                <div className="no-data" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
                                    등록된 장르가 없습니다.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="genre-settings-footer">
                    <button className="reset-btn" onClick={handleReset} disabled={isSaving}>
                        초기화
                    </button>
                    <div className="action-buttons">
                        <button className="cancel-btn" onClick={onClose} disabled={isSaving}>
                            취소
                        </button>
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
