import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import '../styles/components/GlobalNoticePopup.css';

export default function GlobalNoticePopup() {
    const FIXED_NOTICE_ID = 1; // singleton notice ID
    const [notice, setNotice] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        checkNotice();
    }, []);

    const checkNotice = async () => {
        // 1. Check local storage
        const hideUntil = localStorage.getItem('hideNoticeUntil');
        if (hideUntil) {
            if (new Date() < new Date(hideUntil)) {
                return; // Don't show
            } else {
                localStorage.removeItem('hideNoticeUntil');
            }
        }

        // 2. Fetch the singleton notice (ID 1)
        try {
            const { data, error } = await supabase
                .from('global_notices')
                .select('*')
                .eq('id', FIXED_NOTICE_ID) // Always target ID 1
                .maybeSingle();

            if (error) throw error;

            console.log('[NoticePopup] Notice status from DB:', data);

            // Show only if it exists AND is active
            if (data && data.is_active) {
                setNotice(data);
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        } catch (error) {
            console.error('[NoticePopup] Failed to fetch global notice:', error);
        }
    };

    const handleClose = () => {
        setIsVisible(false);
    };

    const handleDontShowToday = () => {
        // Hide for 24 hours
        const tomorrow = new Date();
        tomorrow.setHours(tomorrow.getHours() + 24);
        localStorage.setItem('hideNoticeUntil', tomorrow.toISOString());
        setIsVisible(false);
    };


    if (!isVisible || !notice) return null;

    return createPortal(
        <div className="global-notice-popup-overlay" onClick={handleClose}>
            <div className="global-notice-popup" onClick={e => e.stopPropagation()}>
                <div className="notice-popup-header">
                    <h3>{notice.title}</h3>
                    <button className="notice-close-btn" onClick={handleClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="notice-popup-content">
                    {notice.image_url && (
                        <div className="notice-image-container">
                            <img src={notice.image_url} alt="Notice" />
                        </div>
                    )}
                    <div className="notice-text-content">
                        {notice.content.split('\n').map((line: string, i: number) => (
                            <p key={i}>{line}</p>
                        ))}
                    </div>
                </div>

                <div className="notice-popup-footer">
                    <button className="dont-show-btn" onClick={handleDontShowToday}>
                        오늘 하루 보지 않기
                    </button>
                    <button className="close-btn" onClick={handleClose}>
                        닫기
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
