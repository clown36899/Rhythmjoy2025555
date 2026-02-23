import React, { useState, useEffect } from 'react';
import { isPWAMode } from '../lib/pwaDetect';
import { useAuth } from '../contexts/AuthContext';
import '../styles/components/PwaTransitionOverlay.css';

export const PwaTransitionOverlay: React.FC = () => {
    const { user } = useAuth();
    const [isVisible, setIsVisible] = useState(false);

    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMobile = isIOS || isAndroid;
    const isDesktop = !isIOS && !isAndroid;

    useEffect(() => {
        if (!user) {
            setIsVisible(false);
            return;
        }

        const isStandalone = isPWAMode();
        const urlParams = new URLSearchParams(window.location.search);
        const isForced = urlParams.get('debug_pwa') === 'true';

        if (isStandalone && !isForced) {
            // PWA 모드에서 로그인되어 있다면 '확증된 PWA 사용자'로 기록 (브라우저와 세션 공유됨)
            try {
                localStorage.setItem(`pwa_verified_user_${user.id}`, 'true');
            } catch (e) {
                console.warn('[PwaTransitionOverlay] Failed to save PWA verification to localStorage:', e);
            }
            setIsVisible(false);
            return;
        }

        /**
         * [근본적 해결] 세션 공유 기반 감지 로직
         * 1. 사용자가 로그인되어 있고
         * 2. 이 기기/브라우저에서 PWA를 실행한 기록이 확증되었을 때만 (`pwa_verified_user_{id}`)
         * 3. 현재 브라우저 탭 모드라면 강제로 이동 모달을 띄움
         * 
         * 이 방식은 PWA 설치를 '추측'하지 않고 '확인'된 경우에만 작동하므로
         * 설치 안 된 사용자에게 모달이 뜨는 문제를 완벽히 해결합니다.
         */
        let isVerifiedPwaUser = false;
        try {
            isVerifiedPwaUser = localStorage.getItem(`pwa_verified_user_${user.id}`) === 'true';
        } catch (e) {
            console.warn('[PwaTransitionOverlay] Failed to read PWA verification from localStorage:', e);
        }

        if ((isVerifiedPwaUser || isForced) && !isStandalone) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    }, [user]);

    const handleLaunchApp = () => {
        if (isAndroid) {
            // 안드로이드 크롬에서 설치된 PWA(WebAPK)를 강제로 깨우기 위한 Intent
            // fallback_url을 지정하지 않거나 신중하게 관리하여 브라우저 복귀 방지
            const domain = window.location.hostname;
            const path = window.location.pathname;
            const search = window.location.search || '?utm_source=pwa';

            // 문법: intent://[host][path]#[fragment]#Intent;scheme=[scheme];action=[action];category=[category];end
            // 마지막 end 뒤에는 세미콜론(;)이 없어야 함
            const intentUrl = `intent://${domain}${path}${search}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

            window.location.href = intentUrl;
        } else {
            // iOS 및 기타 데스크톱: 새 창에서 열기 시도 (설치된 경우 앱으로 핸들링됨)
            const url = window.location.origin + '/?utm_source=pwa';
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="PwaTransitionOverlay">
            <div className="PTO-container" onClick={e => e.stopPropagation()}>
                <h2 className="PTO-title">
                    데이터 안전을 위해<br />전용 앱을 사용해 주세요
                </h2>

                <p className="PTO-description">
                    {isIOS
                        ? "현재 브라우저에서는 세션 데이터가 유실될 수 있습니다.\n홈 화면에 설치된 '댄스빌보드' 앱을\n반드시 실행해 주세요."
                        : isAndroid
                            ? "로그인 후에는 데이터 겹침 방지를 위해\n전용 앱(PWA) 사용이 필수입니다.\n아래 버튼을 눌러 앱으로 이동해 주세요."
                            : "데스크톱 전용 앱이 이미 설치되어 있습니다.\n정확한 데이터 관리를 위해\n전용 앱에서 이용해 주세요."}
                </p>

                {isIOS && (
                    <div className="PTO-ios-guide">
                        <div className="PTO-ios-subtitle">앱 실행 방법</div>
                        <div className="PTO-ios-step">
                            <i className="ri-home-line"></i>
                            <div className="PTO-ios-step-text">홈 화면으로 이동</div>
                        </div>
                        <div className="PTO-ios-step">
                            <i className="ri-cursor-fill"></i>
                            <div className="PTO-ios-step-text"><strong>'댄스빌보드'</strong> 아이콘 클릭</div>
                        </div>
                    </div>
                )}

                {!isIOS && (
                    <div className="PTO-actions">
                        <button className="PTO-btn-primary" onClick={handleLaunchApp}>
                            앱 바로가기 (PWA 실행)
                        </button>
                    </div>
                )}

                {isDesktop && (
                    <div className="PTO-ios-guide" style={{ marginTop: '20px' }}>
                        <div className="PTO-ios-step">
                            <i className="ri-question-line"></i>
                            <div className="PTO-ios-step-text">반응이 없다면 주소창 우측의 <strong>'앱 열기'</strong> 아이콘을 눌러주세요.</div>
                        </div>
                    </div>
                )}

                <p className="PTO-footer-note">
                    * 설치된 앱이 없다면 브라우저 메뉴에서<br />앱 설치를 먼저 진행해 주세요.
                </p>
            </div>
        </div>
    );
};
