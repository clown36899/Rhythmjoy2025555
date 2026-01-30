import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import { useAuth } from '../contexts/AuthContext';
import './PWAInstallButton.css';

export const PWAInstallButton = () => {
    const { promptEvent, setPromptEvent, isInstalled } = useInstallPrompt();
    const { user } = useAuth();
    const [showInstructions, setShowInstructions] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState(0);

    // PWA 앱 내에서 실행 중인지 실시간 확인
    const [isRunningInPWA, setIsRunningInPWA] = useState(false);

    useEffect(() => {
        const checkPWA = () => {
            // 1. display-mode 체크 (다양한 모드 지원)
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches ||
                window.matchMedia('(display-mode: window-controls-overlay)').matches;

            // 2. iOS standalone 체크
            const iosStandalone = (window.navigator as any).standalone === true;

            // 3. URL 파라미터 체크 (manifest start_url fallback)
            const urlParams = new URLSearchParams(window.location.search);
            const isPWASource = urlParams.get('utm_source') === 'pwa';

            setIsRunningInPWA(isStandalone || iosStandalone || isPWASource);
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
        // PWA가 이미 설치되어 있으면 앱 열기
        if (isInstalled) {
            handleOpenApp();
            return;
        }

        // ✅ [Auth Check] 설치 전 로그인 필수 확인
        if (!user) {
            // 로그인 모달 트리거 (MobileShell에서 수신)
            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: { message: '앱을 설치하려면 먼저 로그인이 필요합니다.\n로그인 후 설치를 진행해주세요.' }
            }));
            return;
        }

        // 1. React Context의 promptEvent 확인
        // 2. 전역 window.deferredPrompt 확인 (최후의 수단 fallback)
        const activePrompt = promptEvent || (window as any).deferredPrompt;

        if (activePrompt) {
            try {
                await activePrompt.prompt();
                const { outcome } = await activePrompt.userChoice;

                if (outcome === 'accepted') {
                    // 데스크탑인 경우 (모바일이 아님) -> 프로그레스 바 없이 바로 완료 처리
                    // 데스크탑은 설치 즉시 새 창이 뜨므로 여기서 뭘 보여줄 필요가 없음
                    const isDesktop = !isIOS && !/Android/i.test(navigator.userAgent);

                    if (isDesktop) {
                        setIsInstalling(false);
                        setPromptEvent(null);
                        (window as any).deferredPrompt = null;
                        return;
                    }

                    // 모바일인 경우에만 진행바 표시
                    // 설치 시작 시간 기록
                    const installStartTime = Date.now();

                    // 설치 시작 - 프로그레스 표시
                    setIsInstalling(true);
                    setInstallProgress(0);

                    // 프로그레스 애니메이션
                    const progressInterval = setInterval(() => {
                        setInstallProgress(prev => {
                            if (prev >= 95) return 95;
                            return prev + 1;
                        });
                    }, 300);

                    let verifyInterval: NodeJS.Timeout;
                    let isFinishCalled = false;

                    // 설치 완료 처리 함수
                    const finishInstallation = () => {
                        if (isFinishCalled) return;
                        isFinishCalled = true;

                        clearInterval(progressInterval);
                        clearInterval(verifyInterval);

                        // 95% -> 100% 부드럽게 채우기 (0.5초 동안)
                        const finalInterval = setInterval(() => {
                            setInstallProgress(prev => {
                                if (prev >= 100) {
                                    clearInterval(finalInterval);

                                    // 100% 도달 후 0.5초 뒤에 "앱 열기" 상태로 전환
                                    setTimeout(() => {
                                        setIsInstalling(false);
                                        setInstallProgress(0);

                                        // PWA 상태 갱신을 위해 새로고침
                                        window.location.reload();
                                    }, 500);
                                    return 100;
                                }
                                return prev + 5; // 빠르게 증가
                            });
                        }, 50);

                        window.removeEventListener('appinstalled', handleAppInstalled);
                    };

                    // appinstalled 이벤트 리스너
                    const handleAppInstalled = () => {
                        const timeElapsed = Date.now() - installStartTime;

                        // 4초 미만 무시
                        if (timeElapsed < 4000) {
                            return;
                        }

                        // 진짜 신호가 오면 -> 여기서부터 3초 뒤에 완료 처리 시작
                        setTimeout(() => {
                            finishInstallation();
                        }, 3000);
                    };
                    window.addEventListener('appinstalled', handleAppInstalled);

                    // API 확인용 루프 (혹시 모를 대기용)
                    verifyInterval = setInterval(async () => {
                        try {
                            // nothing
                        } catch (e) {
                            // ignore
                        }
                    }, 2000);

                    // 60초 타임아웃
                    setTimeout(() => {
                        if (isInstalling && !isFinishCalled) {
                            clearInterval(progressInterval);
                            clearInterval(verifyInterval);
                            window.removeEventListener('appinstalled', handleAppInstalled);

                            alert('설치 완료 확인 시간이 초과되었습니다.\n새로고침 해주세요.');
                            window.location.reload();
                        }
                    }, 60000);

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
                            <h3>{isIOS ? 'iOS 앱 설치' : '앱 설치 안내'}</h3>
                            <button className="ios-install-close" onClick={() => setShowInstructions(false)}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>

                        <div className="ios-install-content">
                            {/* 알림 기능 안내 문구 */}
                            <div className="ios-install-desc" style={{
                                padding: '0 20px 20px',
                                textAlign: 'center',
                                fontSize: '15px',
                                color: '#e4e4e7',
                                lineHeight: '1.5'
                            }}>
                                <i className="ri-notification-3-fill" style={{ color: '#FEE500', marginRight: '6px' }}></i>
                                <strong>알림 기능</strong>을 사용하려면<br />앱 설치가 필요합니다.
                            </div>

                            {/* [버튼 영역] Android/PC는 버튼 무조건 표시 (앱 열기 대응) */}
                            {!isIOS && (
                                <div style={{ padding: '0 20px 20px' }}>
                                    <div
                                        onClick={() => {
                                            // 설치된 상태면 열기 (handleInstallClick 내부 로직)
                                            // 설치 가능한 상태면 프롬프트 실행
                                            handleInstallClick();
                                            // 프롬프트가 실행되면 모달 닫기
                                            if (promptEvent || isInstalled) setShowInstructions(false);
                                        }}
                                        className={`pwa-install-button ${isInstalling ? 'installing' : ''}`}
                                        style={{
                                            position: 'relative',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            width: '100%',
                                            maxWidth: 'none',
                                            margin: '0',
                                            padding: '12px', // 기본 패딩 확인
                                            borderRadius: '12px',
                                            backgroundColor: isInstalled ? '#3b82f6' : '#22c55e' // 구분감 살짝? 아니면 기존 CSS 사용
                                        }}
                                    >
                                        {/* CSS 클래스 스타일 상속을 위해 추가 스타일 최소화 */}
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

                                    {/* 설치 프롬프트가 없을 때만 수동 안내 유도 메시지 */}
                                    {!isInstalled && !promptEvent && (
                                        <p style={{ marginTop: '12px', fontSize: '13px', color: '#fb7185', textAlign: 'center' }}>
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
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
