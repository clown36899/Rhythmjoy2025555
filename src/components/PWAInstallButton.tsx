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

    const [debugLogs, setDebugLogs] = useState<string[]>([]);

    const addLog = (msg: string) => {
        setDebugLogs(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString().split(' ')[0]} ${msg}`]);
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
            addLog('Prpt start'); // Prompt start
            try {
                await activePrompt.prompt();
                const { outcome } = await activePrompt.userChoice;
                addLog(`Choice: ${outcome}`);

                if (outcome === 'accepted') {
                    // 설치 시작 - 프로그레스 표시
                    setIsInstalling(true);
                    setInstallProgress(0);

                    // 프로그레스 애니메이션 (천천히 증가, 95%까지만)
                    const progressInterval = setInterval(() => {
                        setInstallProgress(prev => {
                            if (prev >= 95) {
                                return 95; // 95%에서 대기
                            }
                            return prev + 1; // 1%씩 천천히 증가
                        });
                    }, 300);

                    let verifyInterval: NodeJS.Timeout;

                    // 설치 완료 처리 함수 (진짜 완료될 때만 호출)
                    const finishInstallation = () => {
                        clearInterval(progressInterval);
                        clearInterval(verifyInterval);
                        setInstallProgress(100);
                        addLog('Done! Opening...');

                        setTimeout(() => {
                            setIsInstalling(false);
                            setInstallProgress(0);
                            window.location.href = '/';
                        }, 1000);

                        window.removeEventListener('appinstalled', handleAppInstalled);
                    };

                    // appinstalled 이벤트 리스너 (로그용)
                    const handleAppInstalled = () => {
                        addLog('Evt: appinstalled');
                        // 여기서는 아무것도 하지 않고 API가 감지할 때까지 계속 기다립니다.
                        // 사용자 폰 성능에 따라 5초가 걸릴지 10초가 걸릴지 모르기 때문입니다.
                    };
                    window.addEventListener('appinstalled', handleAppInstalled);

                    // 검증 루프 (API 확인 - 1초 간격)
                    addLog('Poll start (1s)');
                    verifyInterval = setInterval(async () => {
                        try {
                            if ('getInstalledRelatedApps' in navigator) {
                                const relatedApps = await (navigator as any).getInstalledRelatedApps();
                                const count = relatedApps.length;
                                addLog(`API: ${count} apps`);
                                if (count > 0) {
                                    addLog('Found app!');
                                    finishInstallation();
                                }
                            } else {
                                addLog('API not supp');
                            }
                        } catch (e) {
                            addLog(`Err: ${e}`);
                        }
                    }, 1000);

                    // 60초 타임아웃 (무한 대기 방지)
                    setTimeout(() => {
                        // 60초가 지나도 설치 확인이 안되면
                        if (isInstalling) {
                            clearInterval(progressInterval);
                            clearInterval(verifyInterval);
                            window.removeEventListener('appinstalled', handleAppInstalled);

                            addLog('Timeout(60s)');
                            // 강제로 성공 처리하지 않음! (사용자 요청)
                            // 대신 안내 메시지 표시
                            alert('설치 확인 타임아웃. 새로고침해주세요.');
                            setIsInstalling(false);
                        }
                    }, 60000);

                    setPromptEvent(null);
                    (window as any).deferredPrompt = null;
                }
            } catch (error) {
                addLog(`Err: ${error}`);
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
                addLog('No prompt evt');
            }
        }
    };

    return (
        <>
            {/* 디버그 로그 표시용 (Portal로 최상위 렌더링) */}
            {isInstalling && createPortal(
                <div style={{
                    position: 'fixed',
                    top: '100px', /* 헤더 피하기 위해 좀 더 내림 */
                    left: '10px',
                    background: 'rgba(0,0,0,0.9)',
                    color: '#00ff00',
                    padding: '8px',
                    fontSize: '12px',
                    lineHeight: '1.4',
                    zIndex: 999999, /* z-index 상향 */
                    pointerEvents: 'none',
                    borderRadius: '6px',
                    border: '1px solid #00ff00',
                    maxWidth: '200px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ borderBottom: '1px solid #333', marginBottom: '4px', fontWeight: 'bold' }}>PWA Debugger</div>
                    {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
                </div>,
                document.body
            )}

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

