import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import './PWAInstallButton.css';

export const PWAInstallButton = () => {
    const { promptEvent, setPromptEvent, isInstalled } = useInstallPrompt();
    const [showInstructions, setShowInstructions] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState(0);

    // PWA 앱 내에서 실행 중인지 확인 (여러 방법 조합)
    const isRunningInPWA = useMemo(() => {
        // 1. display-mode 체크 (standalone, fullscreen, minimal-ui 모두 PWA로 간주)
        const displayMode = window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            window.matchMedia('(display-mode: minimal-ui)').matches;

        // 2. iOS standalone 체크
        const iosStandalone = (window.navigator as any).standalone === true;

        // 3. URL에 utm_source=pwa 또는 start_url 체크
        const urlParams = new URLSearchParams(window.location.search);
        const isPWASource = urlParams.get('utm_source') === 'pwa';

        const result = displayMode || iosStandalone || isPWASource;
        console.log('[PWAInstallButton] Detection:', { displayMode, iosStandalone, isPWASource, result });
        return result;
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
        // PWA가 이미 설치되어 있으면 앱 열기
        if (isInstalled) {
            handleOpenApp();
            return;
        }

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
                    console.log('✅ 사용자가 설치를 수락했습니다');
                    // 설치 시작 - 프로그레스 표시
                    setIsInstalling(true);
                    setInstallProgress(0);

                    // 프로그레스 애니메이션 (천천히 증가, 95%까지만)
                    const progressInterval = setInterval(() => {
                        setInstallProgress(prev => {
                            if (prev >= 95) {
                                return 95; // 95%에서 무한 대기 (설치 완료될 때까지)
                            }
                            return prev + 1; // 1%씩 천천히 증가
                        });
                    }, 300);

                    // appinstalled 이벤트를 기다림
                    const handleInstallComplete = async () => {
                        console.log('🎉 appinstalled 이벤트 발생! (검증 시작)');

                        // 검증 루프 시작 (2초 간격)
                        const verifyInterval = setInterval(async () => {
                            try {
                                // 1. getInstalledRelatedApps API 지원 여부 확인
                                if ('getInstalledRelatedApps' in navigator) {
                                    const relatedApps = await (navigator as any).getInstalledRelatedApps();
                                    console.log('🔍 설치된 앱 목록 확인:', relatedApps);

                                    // 목록에 우리 앱이 있으면 진짜 설치 완료!
                                    if (relatedApps.length > 0) {
                                        console.log('✅ 진짜 설치 확인됨!');
                                        finishInstallation();
                                        return;
                                    }
                                } else {
                                    // API 미지원 브라우저는 3초 딜레이 후 완료 처리 (fallback)
                                    console.warn('⚠️ 검증 API 미지원 - 시간 기반 완료 처리');
                                    setTimeout(finishInstallation, 3000);
                                    return;
                                }
                            } catch (e) {
                                console.error('검증 중 오류:', e);
                                // 오류 시에도 fallback으로 완료 처리
                                setTimeout(finishInstallation, 3000);
                            }
                        }, 2000);

                        // 설치 완료 처리 함수
                        const finishInstallation = () => {
                            clearInterval(progressInterval);
                            clearInterval(verifyInterval);
                            setInstallProgress(100);

                            // 100% 완료 후 1초 뒤 PWA 열기
                            setTimeout(() => {
                                setIsInstalling(false);
                                setInstallProgress(0);
                                window.location.href = '/';
                            }, 1000);

                            window.removeEventListener('appinstalled', handleInstallComplete);
                        };

                        // 30초 안전장치 (검증 실패해도 완료 처리)
                        setTimeout(() => {
                            if (isInstalling) {
                                console.log('⏰ 검증 타임아웃 - 강제 완료');
                                finishInstallation();
                            }
                        }, 30000);
                    };

                    // 전역 이벤트 리스너 등록
                    window.addEventListener('appinstalled', handleInstallComplete);
                    console.log('👂 appinstalled 이벤트 리스너 등록됨');

                    // 타임아웃 제거: 설치가 느려도 끝까지 기다림
                    // 사용자가 설치를 중간에 취소하면 브라우저 제어권 밖이므로 
                    // 그냥 설치중 상태로 남겨두는 게 오해 소지가 적음 (새로고침하면 리셋됨)

                    setPromptEvent(null);
                    (window as any).deferredPrompt = null;
                }
            } catch (error) {
                console.error('설치 프롬프트 실행 중 오류:', error);
                setIsInstalling(false);
                setInstallProgress(0);
                setShowInstructions(true);
            }
        } else {
            // promptEvent가 없는 경우 - iOS이거나 설치 불가능한 환경
            // iOS는 수동 설치만 가능하므로 안내 표시
            if (isIOS) {
                setShowInstructions(true);
            } else {
                // Android/Desktop에서 promptEvent 없으면 아무것도 안 함
                console.warn('⚠️ [PWAInstallButton] No install prompt available');
            }
        }
    };

    return (
        <>
            <div
                onClick={isInstalling ? undefined : (isInstalled ? handleOpenApp : handleInstallClick)}
                className={`pwa-install-button ${isInstalling ? 'installing' : ''}`}
                style={{ position: 'relative', overflow: 'hidden', cursor: isInstalling ? 'default' : 'pointer' }}
            >
                {isInstalling && (
                    <div
                        className="pwa-install-progress"
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${installProgress}%`,
                            background: 'linear-gradient(90deg, #667eea, #764ba2)',
                            transition: 'width 0.3s ease',
                            zIndex: 0
                        }}
                    />
                )}
                <i className={isInstalled ? "ri-external-link-line" : "ri-download-cloud-line"} style={{ position: 'relative', zIndex: 1 }}></i>
                <span className="manual-label-wrapper" style={{ position: 'relative', zIndex: 1 }}>
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
                </div>,
                document.body
            )}
        </>
    );
};

