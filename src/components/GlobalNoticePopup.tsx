import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import '../styles/components/GlobalNoticePopup.css';

let activeNoticeCacheLoaded = false;
let activeNoticeCache: any = null;
let activeNoticePromise: Promise<any> | null = null;
const NOTICE_DEBUG = import.meta.env.VITE_NOTICE_DEBUG === 'true';

const fetchActiveNotice = async () => {
    if (activeNoticeCacheLoaded) return activeNoticeCache;
    if (activeNoticePromise) return activeNoticePromise;

    activeNoticePromise = supabase
        .from('global_notices')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
            if (error) throw error;
            activeNoticeCache = data;
            activeNoticeCacheLoaded = true;
            return data;
        })
        .finally(() => {
            activeNoticePromise = null;
        });

    return activeNoticePromise;
};

export default function GlobalNoticePopup() {
    const [notice, setNotice] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [dontShowToday, setDontShowToday] = useState(false);

    useEffect(() => {
        let isMounted = true;
        checkNotice(() => isMounted);
        return () => {
            isMounted = false;
        };
    }, []);

    const checkNotice = async (isMounted = () => true) => {
        try {
            // 1. Fetch the LATEST ACTIVE notice
            const data = await fetchActiveNotice();
            if (!isMounted()) return;
            if (NOTICE_DEBUG) console.debug('[NoticePopup] Notice status from DB:', data);

            // 2. Check visibility conditions
            if (data) {
                // Check local storage for THIS notice ID
                const hideUntil = localStorage.getItem(`hideNoticeUntil_${data.id}`);
                if (hideUntil) {
                    if (new Date() < new Date(hideUntil)) {
                        return; // Don't show
                    } else {
                        localStorage.removeItem(`hideNoticeUntil_${data.id}`);
                    }
                }

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
        if (dontShowToday) {
            handleSaveDontShow();
        }
        setIsVisible(false);
    };

    const handleSaveDontShow = () => {
        if (!notice) return;
        // Hide for 24 hours
        const tomorrow = new Date();
        tomorrow.setHours(tomorrow.getHours() + 24);
        localStorage.setItem(`hideNoticeUntil_${notice.id}`, tomorrow.toISOString());
    };

    const toggleDontShow = () => {
        setDontShowToday(!dontShowToday);
    };


    if (!isVisible || !notice) return null;

    return createPortal(
        <div className="global-notice-popup-overlay">
            <div className="global-notice-popup" onClick={e => e.stopPropagation()}>
                <div className="notice-popup-header">
                    <div className="title-area">
                        <i className="ri-notification-3-line"></i>
                        <h3>{notice.title}</h3>
                    </div>
                    <button className="notice-close-btn" onClick={handleClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="notice-popup-content">
                    <div className="notice-text-content">
                        {notice.content.split('\n').map((line: string, i: number) => (
                            <p key={i}>{line}</p>
                        ))}
                    </div>
                    {notice.image_url && (
                        <div className="notice-image-container-v2">
                            <img
                                id="notice-dynamic-img"
                                src={`${notice.image_url}${notice.image_url.includes('?') ? '&' : '?'}v=${Date.now()}`}
                                alt="Notice"
                            />
                        </div>
                    )}
                </div>

                <div className="notice-popup-footer">
                    <label className="dont-show-label" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={dontShowToday}
                            onChange={toggleDontShow}
                        />
                        {/* <span className="checkbox-custom"></span> */}
                        오늘 하루 보지 않기
                    </label>
                    <button className="notice-confirm-btn" onClick={handleClose}>
                        입장
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
