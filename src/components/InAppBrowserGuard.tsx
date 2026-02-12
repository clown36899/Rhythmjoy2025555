import React, { useEffect, useState } from 'react';
import { isPWAMode } from '../lib/pwaDetect';

export const InAppBrowserGuard: React.FC = () => {
    const [isIOS, setIsIOS] = useState(false);
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);

    useEffect(() => {
        // Run detection logic
        const userAgent = navigator.userAgent.toLowerCase();
        const targetUrl = window.location.href;

        // Check if running in PWA mode
        // If already in PWA, don't do anything
        if (isPWAMode()) {
            return;
        }

        // Check if we already attempted redirect in this session
        const hasAttemptedRedirect = sessionStorage.getItem('iab_redirect_attempted');
        if (hasAttemptedRedirect) {
            return;
        }

        const isAndroid = /android/i.test(userAgent);
        const checkIfIOS = /iphone|ipad|ipod/i.test(userAgent);

        // Refined In-app browser detection
        // Includes: Kakao, Instagram, Facebook (FBAV/FBAN), Line, and general 'wv' (WebView) presence if needed, 
        // but sticking to specific apps is safer to avoid blocking legitimate embedded browsers that act like proper browsers.
        const checkInApp = /kakao|instagram|fbav|fban|fb_iab|line/i.test(userAgent);

        // Infinite Loop Prevention:
        // Chrome on Android does NOT have these keywords in UA.
        // We trust that 'intent://' opens an external app (Chrome).
        // If for some reason Chrome behaves like an in-app browser (rare), this safeguard prevents loop?
        // Actually, the main safeguard is that Chrome's UA doesn't match the regex.

        setIsIOS(checkIfIOS);
        setIsInAppBrowser(checkInApp);

        // Logic 1: Android - Auto Redirect
        if (checkInApp && isAndroid) {
            // Mark that we attempted redirect
            sessionStorage.setItem('iab_redirect_attempted', 'true');

            // Android Intent: Open PWA if installed, otherwise fallback to Chrome browser
            const urlWithoutScheme = targetUrl.replace(/^https?:\/\//, '');
            // Removing package specification allows Android to check for installed PWA first
            // If PWA is installed, it will open the PWA app
            // If not, it will open in Chrome browser
            const intentUrl = `intent://${urlWithoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

            window.location.href = intentUrl;
        }

        // Logic 2: iOS - Just show UI (handled by rendering below)

    }, []);

    // Only render the overlay if it's iOS AND In-App Browser
    if (isIOS && isInAppBrowser) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.92)',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                textAlign: 'center',
                padding: '20px',
                boxSizing: 'border-box',
                pointerEvents: 'auto'
            }}>
                <div style={{ position: 'absolute', top: '2vh', right: '5vw', animation: 'bounce 2s infinite' }}>
                    <div style={{ fontSize: 'clamp(3rem, 5vw, 4rem)', fontWeight: 'bold', color: '#ffcc00' }}>↗</div>
                </div>

                <style>{`
                    @keyframes bounce {
                        0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
                        40% {transform: translateY(-10px);}
                        60% {transform: translateY(-5px);}
                    }
                `}</style>

                <h2 style={{
                    fontSize: 'clamp(1.5rem, 5vw, 2.2rem)',
                    fontWeight: '800',
                    marginBottom: '1.5rem',
                    wordBreak: 'keep-all',
                    lineHeight: 1.3
                }}>
                    ⚠️ 외부 브라우저 권장
                </h2>

                <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: 'clamp(20px, 4vw, 30px)',
                    borderRadius: '16px',
                    maxWidth: '340px',
                    width: '90%'
                }}>
                    <p style={{ fontSize: 'clamp(1rem, 3.5vw, 1.2rem)', marginBottom: '15px', lineHeight: '1.5', color: '#eee' }}>
                        인스타그램/카카오톡/페이스북 등<br />
                        인앱 브라우저에서는<br />
                        로그인 및 기능이 제한됩니다.
                    </p>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '15px', marginTop: '15px' }}>
                        <p style={{ fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', fontWeight: 'bold', color: '#ffcc00', marginBottom: '8px' }}>해결 방법</p>
                        <p style={{ margin: '5px 0', fontSize: 'clamp(0.85rem, 3vw, 1rem)' }}>1. 우측 상단 <b>(...)</b> 메뉴 클릭</p>
                        <p style={{ margin: '5px 0', fontSize: 'clamp(0.85rem, 3vw, 1rem)' }}>2. <b>[Safari로 열기]</b> 선택</p>
                    </div>
                </div>

                <button
                    onClick={() => setIsInAppBrowser(false)}
                    style={{
                        marginTop: 'clamp(30px, 5vh, 50px)',
                        padding: '12px 24px',
                        background: 'transparent',
                        color: '#bbb',
                        border: '1px solid #555',
                        borderRadius: '30px',
                        fontSize: 'clamp(0.8rem, 3vw, 0.95rem)',
                        cursor: 'pointer'
                    }}
                >
                    알겠습니다, 그냥 계속할게요 닫기 X
                </button>
            </div>
        );
    }

    // For Android (while directing) or normal browsers, render nothing (invisible guard)
    // Android user might see a flash of the site before being redirected, which is fine.
    // Ideally we could show a redirecting loader for Android but 'return null' is less intrusive for normal users if detection false positive.

    // For Android, we executed redirect above.
    // We render nothing (invisible guard) so the site looks normal if redirect fails or is slow,
    // and if the user comes back, they just see the site.
    if (isInAppBrowser && !isIOS) {
        return null;
    }

    return null;
};
