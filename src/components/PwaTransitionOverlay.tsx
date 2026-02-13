import React, { useState, useEffect } from 'react';
import { isPWAMode } from '../lib/pwaDetect';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import '../styles/components/PwaTransitionOverlay.css';

export const PwaTransitionOverlay: React.FC = () => {
    const { isInstalled } = useInstallPrompt();
    const [isVisible, setIsVisible] = useState(false);

    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMobile = isIOS || isAndroid;
    const isDesktop = !isIOS && !isAndroid;

    useEffect(() => {
        const isStandalone = isPWAMode();
        const urlParams = new URLSearchParams(window.location.search);
        const isForced = urlParams.get('debug_pwa') === 'true';

        console.log('[PWA Overlay Debug]', {
            isStandalone,
            isInstalled,
            isMobile,
            isDesktop,
            isForced
        });

        // 이미 PWA 모드면 표시 안 함 (강제 모드 제외)
        if (isStandalone && !isForced) return;

        // 설치된 것으로 판단될 때 혹은 강제 모드일 때 표시
        if (isInstalled || isForced) {
            setIsVisible(true);
        }
    }, [isInstalled]);

    const handleLaunchApp = () => {
        // target="_blank"로 같은 도메인의 URL을 열면 브라우저가 설치된 PWA로 핸들링할 확률이 높음
        const url = window.location.origin + '/?utm_source=pwa';
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    if (!isVisible) return null;

    return (
        <div className="PwaTransitionOverlay">
            <div className="PTO-container" onClick={e => e.stopPropagation()}>
                <h2 className="PTO-title">
                    전용 앱으로 이용하면<br />데이터가 안전합니다
                </h2>

                <p className="PTO-description">
                    {isIOS
                        ? "앱이 이미 설치되어 있습니다.\n데이터 겹침 이슈 방지를 위해\n홈 화면의 앱을 실행해 주세요."
                        : isAndroid
                            ? "이미 앱이 설치된 상태입니다.\n데이터 겹침 이슈 방지를 위해\n전용 앱(PWA)에서 이용해 주세요."
                            : "데스크톱 앱이 설치되어 있습니다.\n데이터 겹침 이슈 방지를 위해\n전용 앱을 실행해 주세요."}
                </p>

                {isIOS && (
                    <div className="PTO-ios-guide">
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
                            앱 바로가기
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
            </div>
        </div>
    );
};
