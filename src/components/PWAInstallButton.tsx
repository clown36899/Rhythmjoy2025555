import { useState } from 'react';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import './PWAInstallButton.css';

export const PWAInstallButton = () => {
    const { promptEvent, setPromptEvent, isInstalled } = useInstallPrompt();
    const [showInstructions, setShowInstructions] = useState(false);

    // iOS/Android 감지
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    // 이미 설치된 PWA 열기
    const handleOpenApp = () => {
        // PWA를 새 창으로 열기 (standalone 모드로 실행)
        window.open('/', '_blank');
    };

    const handleInstallClick = async () => {
        // 1. React Context의 promptEvent 확인
        // 2. 전역 window.deferredPrompt 확인 (최후의 수단 fallback)
        const activePrompt = promptEvent || (window as any).deferredPrompt;

        if (activePrompt) {
            console.log('📱 PWA 설치 프롬프트 표시 (유효한 이벤트 발견)');
            try {
                await activePrompt.prompt();
                const { outcome } = await activePrompt.userChoice;
                console.log(`사용자 선택 결과: ${outcome}`);

                if (outcome === 'accepted') {
                    setPromptEvent(null);
                    (window as any).deferredPrompt = null;
                }
            } catch (error) {
                console.error('설치 프롬프트 실행 중 오류:', error);
                setShowInstructions(true);
            }
        } else {
            // 설치 가능한 이벤트가 전혀 없는 경우에만 안내 모달 표시
            console.warn('⚠️ [PWAInstallButton] No install prompt event available');
            setShowInstructions(true);
        }
    };

    return (
        <>
            <div
                onClick={isInstalled ? handleOpenApp : handleInstallClick}
                className="pwa-install-button"
            >
                <i className={isInstalled ? "ri-external-link-line" : "ri-download-cloud-line"}></i>
                <span className="manual-label-wrapper">
                    {isInstalled ? (
                        <>
                            <span className="translated-part">Open App</span>
                            <span className="fixed-part ko" translate="no">앱 열기</span>
                            <span className="fixed-part en" translate="no">Open App</span>
                        </>
                    ) : (
                        <>
                            <span className="translated-part">Install App</span>
                            <span className="fixed-part ko" translate="no">앱 설치하기</span>
                            <span className="fixed-part en" translate="no">Install App</span>
                        </>
                    )}
                </span>
            </div>

            {/* 설치 안내 모달 */}
            {showInstructions && (
                <div className="ios-install-modal-overlay" onClick={() => setShowInstructions(false)}>
                    <div className="ios-install-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ios-install-header">
                            <h3>{isIOS ? 'iOS 설치 방법' : '앱 설치 방법'}</h3>
                            <button className="ios-install-close" onClick={() => setShowInstructions(false)}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                        <div className="ios-install-content">
                            {isIOS ? (
                                <>
                                    <div className="ios-install-step">
                                        <div className="ios-install-step-number">1</div>
                                        <div className="ios-install-step-text">
                                            Safari 하단의 <i className="ri-share-line" style={{ color: '#3b82f6' }}></i> <strong>공유</strong> 버튼을 누르세요
                                        </div>
                                    </div>
                                    <div className="ios-install-step">
                                        <div className="ios-install-step-number">2</div>
                                        <div className="ios-install-step-text">
                                            <strong>"홈 화면에 추가"</strong>를 선택하세요
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="ios-install-step">
                                        <div className="ios-install-step-number">1</div>
                                        <div className="ios-install-step-text">
                                            브라우저 우측 상단의 <strong>⋮ (메뉴)</strong> 버튼을 누르세요
                                        </div>
                                    </div>
                                    <div className="ios-install-step">
                                        <div className="ios-install-step-number">2</div>
                                        <div className="ios-install-step-text">
                                            <strong>"앱 설치"</strong> 또는 <strong>"홈 화면에 추가"</strong>를 누르세요
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="ios-install-step">
                                <div className="ios-install-step-number">{isIOS ? '3' : '3'}</div>
                                <div className="ios-install-step-text">
                                    안내에 따라 <strong>추가</strong>를 누르면 완료!
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

