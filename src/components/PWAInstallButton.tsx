import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import { isPWAMode } from '../lib/pwaDetect';
import './PWAInstallButton.css';

export const PWAInstallButton = () => {
    const { promptEvent, setPromptEvent, isInstalled } = useInstallPrompt();
    const [showInstructions, setShowInstructions] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState(0);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // PWA 앱 내에서 실행 중인지 실시간 확인
    const [isRunningInPWA, setIsRunningInPWA] = useState(false);

    useEffect(() => {
        const checkPWA = () => {
            setIsRunningInPWA(isPWAMode());
        };

        checkPWA(); // 초기 실행

        // 외부에서 가이드 호출을 위한 리스너
        const handleForceShowInstructions = () => {
            setShowInstructions(true);
        };
        window.addEventListener('showPWAInstructions', handleForceShowInstructions);

        // 모드 변경 감지 리스너 등록
        const mediaQuery = window.matchMedia('(display-mode: standalone)');
        try {
            mediaQuery.addEventListener('change', checkPWA);
        } catch (e) {
            // 구형 브라우저 호환성
            (mediaQuery as any).addListener?.(checkPWA);
        }

        return () => {
            window.removeEventListener('showPWAInstructions', handleForceShowInstructions);
            try {
                mediaQuery.removeEventListener('change', checkPWA);
            } catch (e) {
                (mediaQuery as any).removeListener?.(checkPWA);
            }
        };
    }, []);

    // PWA 앱 내에서는 버튼을 표시하지 않음
    if (isRunningInPWA) {
        return null;
    }

    // iOS/Android 감지
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    // 이미 설치된 PWA 열기
    const handleOpenApp = () => {
        // PWA가 설치되어 있으면 앱으로 열기 시도
        // 1. 새 창으로 열기 시도 (일부 브라우저에서 PWA 앱으로 열림)
        const newWindow = window.open('/', '_blank', 'noopener,noreferrer');

        // 2. 팝업이 차단되었거나 실패하면 현재 창에서 홈으로 이동
        setTimeout(() => {
            if (!newWindow || newWindow.closed) {
                window.location.href = '/';
            }
        }, 100);
    };

    const handleInstallClick = async () => {
        const activePrompt = promptEvent || (window as any).deferredPrompt;

        console.log('🔘 [PWAInstallButton] Install Clicked', {
            contextPrompt: !!promptEvent,
            windowPrompt: !!(window as any).deferredPrompt,
            isInstalled
        });

        // PWA가 이미 설치되어 있으면 앱 열기
        if (isInstalled) {
            console.log('ℹ️ [PWAInstallButton] Already installed according to state');
            handleOpenApp();
            return;
        }

        if (activePrompt) {
            try {
                console.log('🚀 [PWAInstallButton] Triggering native prompt...');
                await activePrompt.prompt();
                const { outcome } = await activePrompt.userChoice;
                console.log('🏁 [PWAInstallButton] User choice outcome:', outcome);

                if (outcome === 'accepted') {
                    const isDesktop = !isIOS && !/Android/i.test(navigator.userAgent);

                    if (isDesktop) {
                        setIsInstalling(false);
                        setPromptEvent(null);
                        (window as any).deferredPrompt = null;
                        return;
                    }

                    // 모바일 프로그레스 표시
                    const installStartTime = Date.now();
                    setIsInstalling(true);
                    setInstallProgress(0);

                    const progressInterval = setInterval(() => {
                        setInstallProgress(prev => (prev >= 95 ? 95 : prev + 1));
                    }, 300);

                    let isFinishCalled = false;
                    const finishInstallation = () => {
                        if (isFinishCalled) return;
                        isFinishCalled = true;
                        clearInterval(progressInterval);

                        const finalInterval = setInterval(() => {
                            setInstallProgress(prev => {
                                if (prev >= 100) {
                                    clearInterval(finalInterval);
                                    setTimeout(() => {
                                        setIsInstalling(false);
                                        setInstallProgress(0);
                                        setShowSuccessModal(true);
                                    }, 500);
                                    return 100;
                                }
                                return prev + 5;
                            });
                        }, 50);
                        window.removeEventListener('appinstalled', handleAppInstalled);
                    };

                    const handleAppInstalled = () => {
                        console.log('✅ [PWAInstallButton] appinstalled event caught!');
                        if (Date.now() - installStartTime < 3000) return;
                        setTimeout(finishInstallation, 2000);
                    };
                    window.addEventListener('appinstalled', handleAppInstalled);

                    setTimeout(() => {
                        if (isInstalling && !isFinishCalled) {
                            console.log('⏰ [PWAInstallButton] Install timeout - showing success anyway');
                            finishInstallation();
                        }
                    }, 45000);

                    setPromptEvent(null);
                    (window as any).deferredPrompt = null;
                }
            } catch (error) {
                console.error('❌ [PWAInstallButton] Prompt error:', error);
                setIsInstalling(false);
                setInstallProgress(0);
                setShowInstructions(true);
            }
        } else {
            console.warn('⚠️ [PWAInstallButton] No active prompt detected');
            if (isIOS) {
                setShowInstructions(true);
            } else {
                // 안드로이드/PC에서 프롬프트가 없으면 브라우저 수동 안내 시도
                setShowInstructions(true);
            }
        }
    };

    return (
        <>
            <div
                onClick={isInstalling ? undefined : (isInstalled ? handleOpenApp : handleInstallClick)}
                className={`pwa-install-button pwa-button-wrapper ${isInstalling ? 'installing' : ''} ${isInstalled ? 'installed' : ''}`}
                style={{ cursor: isInstalling ? 'default' : 'pointer' }}
            >
                {isInstalling && (
                    <div
                        className="pwa-progress-bar pwa-progress-bar-absolute"
                        style={{ width: `${installProgress}%` }}
                    />
                )}
                <i className={`${isInstalled ? "ri-external-link-line" : "ri-download-cloud-line"} pwa-content-layer`}></i>
                <span className="manual-label-wrapper pwa-content-layer">
                    {isInstalling ? (
                        <>
                            <span className="translated-part">Installing... {installProgress}%</span>
                            <span className="fixed-part ko" translate="no">설치 중... {installProgress}%</span>
                            <span className="fixed-part en" translate="no">Installing... {installProgress}%</span>
                        </>
                    ) : isInstalled ? (
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

            {/* 설치 안내 모달 - Portal로 body에 렌더링 */}
            {showInstructions && createPortal(
                <div className="ios-install-modal-overlay" onClick={() => setShowInstructions(false)}>
                    <div className="ios-install-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ios-install-header">
                            <h3>{isIOS ? 'iOS 앱 설치' : '앱 설치 안내'}</h3>
                            <button className="ios-install-close" onClick={() => setShowInstructions(false)}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>

                        <div className="ios-install-content">
                            {/* 알림 기능 안내 문구 */}
                            <div className="ios-notification-desc">
                                <i className="ri-notification-3-fill notification-icon-highlight"></i>
                                <strong>알림 기능</strong>을 사용하려면<br />앱 설치가 필요합니다.
                            </div>

                            {/* [버튼 영역] Android/PC는 버튼 무조건 표시 (앱 열기 대응) */}
                            {!isIOS && (
                                <div className="manual-install-btn-wrapper">
                                    <div
                                        onClick={() => {
                                            // 설치된 상태면 열기 (handleInstallClick 내부 로직)
                                            // 설치 가능한 상태면 프롬프트 실행
                                            handleInstallClick();
                                            // 프롬프트가 실행되면 모달 닫기
                                            if (promptEvent || isInstalled) setShowInstructions(false);
                                        }}
                                        className={`pwa-install-button manual-install-btn pwa-button-wrapper ${isInstalling ? 'installing' : ''} ${isInstalled ? 'installed' : ''}`}
                                    >
                                        {/* CSS 클래스 스타일 상속을 위해 추가 스타일 최소화 */}
                                        {isInstalling && (
                                            <div
                                                className="pwa-progress-bar pwa-progress-bar-absolute"
                                                style={{ width: `${installProgress}%` }}
                                            />
                                        )}
                                        <i className={`${isInstalled ? "ri-external-link-line" : "ri-download-cloud-line"} pwa-content-layer`}></i>
                                        <span className="manual-label-wrapper pwa-content-layer">
                                            {isInstalling ? (
                                                <>
                                                    <span className="translated-part">Installing... {installProgress}%</span>
                                                    <span className="fixed-part ko" translate="no">설치 중... {installProgress}%</span>
                                                    <span className="fixed-part en" translate="no">Installing... {installProgress}%</span>
                                                </>
                                            ) : isInstalled ? (
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

                                    {/* 설치 프롬프트가 없을 때만 수동 안내 유도 메시지 */}
                                    {!isInstalled && !promptEvent && (
                                        <p className="manual-install-note">
                                            * 자동 설치가 지원되지 않는 환경입니다.<br />아래 수동 설치 방법을 참고해주세요.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* [수동 설치 안내] iOS이거나, Android인데 프롬프트가 없을 때 */}
                            {(isIOS || (!promptEvent && !isInstalled)) && (
                                <>
                                    {isIOS ? (
                                        <>
                                            <div className="ios-install-step">
                                                <div className="ios-install-step-number">1</div>
                                                <div className="ios-install-step-text">
                                                    Safari 하단의 <i className="ri-upload-2-line ios-share-icon"></i> <strong>공유</strong> 버튼을 누르세요
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
                                            안내에 따라 <strong>추가</strong>를 누르면 완료!<br />
                                            홈화면에 추가된 아이콘을 통해 실행해주세요.
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 설치 완료 성공 모달 */}
            {showSuccessModal && createPortal(
                <div className="ios-install-modal-overlay" onClick={() => setShowSuccessModal(false)}>
                    <div className="ios-install-modal success-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ios-install-header">
                            <h3>설치 완료</h3>
                            <button className="ios-install-close" onClick={() => setShowSuccessModal(false)}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>

                        <div className="ios-install-content">
                            <div className="success-icon-wrapper">
                                <i className="ri-checkbox-circle-fill"></i>
                            </div>

                            <div className="success-message">
                                <strong>앱 설치가 완료되었습니다!</strong>
                                <p>이제 홈 화면에서 아이콘을 클릭하여<br />더 빠르고 쾌적하게 이용하실 수 있습니다.</p>
                            </div>

                            <div className="success-actions">
                                <button
                                    className="pwa-install-button primary"
                                    onClick={() => {
                                        handleOpenApp();
                                        setShowSuccessModal(false);
                                    }}
                                >
                                    <i className="ri-external-link-line"></i>
                                    <span>앱 열기 / 실행하기</span>
                                </button>

                                <p className="success-hint">
                                    * 앱 실행이 안 된다면 홈 화면에 생성된<br />
                                    <strong>'댄스빌보드'</strong> 아이콘을 눌러주세요.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
