import { useState, useEffect } from 'react';
import './PWAInstallModal.css';

interface PWAInstallModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Platform = 'ios' | 'android' | 'desktop';

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
    const [platform, setPlatform] = useState<Platform>('desktop');

    useEffect(() => {
        // 플랫폼 감지
        const userAgent = navigator.userAgent.toLowerCase();
        const isIOS = /iphone|ipad|ipod/.test(userAgent);
        const isAndroid = /android/.test(userAgent);

        if (isIOS) {
            setPlatform('ios');
        } else if (isAndroid) {
            setPlatform('android');
        } else {
            setPlatform('desktop');
        }
    }, []);

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="pwa-install-modal-overlay" onClick={handleBackdropClick}>
            <div className="pwa-install-modal">
                <div className="pwa-install-modal-header">
                    <h2>📱 앱 설치 방법</h2>
                    <button onClick={onClose} className="pwa-install-modal-close">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="pwa-install-modal-tabs">
                    <button
                        className={`pwa-install-tab ${platform === 'ios' ? 'active' : ''}`}
                        onClick={() => setPlatform('ios')}
                    >
                        <i className="ri-apple-fill"></i>
                        <span>iOS</span>
                    </button>
                    <button
                        className={`pwa-install-tab ${platform === 'android' ? 'active' : ''}`}
                        onClick={() => setPlatform('android')}
                    >
                        <i className="ri-android-fill"></i>
                        <span>Android</span>
                    </button>
                    <button
                        className={`pwa-install-tab ${platform === 'desktop' ? 'active' : ''}`}
                        onClick={() => setPlatform('desktop')}
                    >
                        <i className="ri-computer-line"></i>
                        <span>Desktop</span>
                    </button>
                </div>

                <div className="pwa-install-modal-content">
                    {platform === 'ios' && (
                        <div className="pwa-install-instructions">
                            <div className="pwa-install-platform-badge">
                                <i className="ri-apple-fill"></i>
                                <span>iPhone / iPad (Safari)</span>
                            </div>

                            <ol className="pwa-install-steps">
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-upload-2-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>공유 버튼 탭</strong>
                                        <p>화면 하단(또는 상단)의 <strong>공유 아이콘</strong>을 탭하세요</p>
                                    </div>
                                </li>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-add-box-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>"홈 화면에 추가" 선택</strong>
                                        <p>메뉴에서 <strong>"홈 화면에 추가"</strong>를 찾아 탭하세요</p>
                                    </div>
                                </li>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-check-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>추가 확인</strong>
                                        <p>오른쪽 상단의 <strong>"추가"</strong> 버튼을 탭하세요</p>
                                    </div>
                                </li>
                            </ol>

                            <div className="pwa-install-note">
                                <i className="ri-information-line"></i>
                                <p><strong>참고:</strong> iOS에서는 Safari 브라우저에서만 홈 화면 추가가 가능합니다.</p>
                            </div>
                        </div>
                    )}

                    {platform === 'android' && (
                        <div className="pwa-install-instructions">
                            <div className="pwa-install-platform-badge">
                                <i className="ri-android-fill"></i>
                                <span>Android (Chrome)</span>
                            </div>

                            <ol className="pwa-install-steps">
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-more-2-fill"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>메뉴 열기</strong>
                                        <p>화면 오른쪽 상단의 <strong>⋮ (점 3개)</strong> 메뉴를 탭하세요</p>
                                    </div>
                                </li>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-download-cloud-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>"앱 설치" 또는 "홈 화면에 추가" 선택</strong>
                                        <p>메뉴에서 해당 옵션을 찾아 탭하세요</p>
                                    </div>
                                </li>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-check-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>설치 확인</strong>
                                        <p>팝업에서 <strong>"설치"</strong> 또는 <strong>"추가"</strong> 버튼을 탭하세요</p>
                                    </div>
                                </li>
                            </ol>

                            <div className="pwa-install-note success">
                                <i className="ri-lightbulb-line"></i>
                                <p><strong>팁:</strong> 주소창에 설치 아이콘이 표시되면 바로 탭해도 됩니다!</p>
                            </div>
                        </div>
                    )}

                    {platform === 'desktop' && (
                        <div className="pwa-install-instructions">
                            <div className="pwa-install-platform-badge">
                                <i className="ri-computer-line"></i>
                                <span>Desktop (Chrome / Edge)</span>
                            </div>

                            <ol className="pwa-install-steps">
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-download-cloud-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>주소창 설치 아이콘 클릭</strong>
                                        <p>주소창 오른쪽의 <strong>설치 아이콘</strong>을 클릭하세요</p>
                                    </div>
                                </li>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-check-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>설치 확인</strong>
                                        <p>팝업에서 <strong>"설치"</strong> 버튼을 클릭하세요</p>
                                    </div>
                                </li>
                            </ol>

                            <div className="pwa-install-divider">
                                <span>또는</span>
                            </div>

                            <ol className="pwa-install-steps" start={1}>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-more-2-fill"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>브라우저 메뉴 열기</strong>
                                        <p>오른쪽 상단의 <strong>⋮ (점 3개)</strong> 메뉴를 클릭하세요</p>
                                    </div>
                                </li>
                                <li>
                                    <div className="step-icon">
                                        <i className="ri-download-cloud-line"></i>
                                    </div>
                                    <div className="step-content">
                                        <strong>"앱 설치" 선택</strong>
                                        <p>메뉴에서 <strong>"댄스빌보드 설치..."</strong> 또는 <strong>"앱 설치"</strong>를 클릭하세요</p>
                                    </div>
                                </li>
                            </ol>

                            <div className="pwa-install-note">
                                <i className="ri-information-line"></i>
                                <p><strong>참고:</strong> 최근에 앱을 삭제한 경우, 잠시 후 다시 시도해주세요.</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pwa-install-modal-footer">
                    <button onClick={onClose} className="pwa-install-modal-btn">
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
};
