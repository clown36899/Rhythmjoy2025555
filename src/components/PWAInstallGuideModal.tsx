import { createPortal } from 'react-dom';
import { getMobilePlatform, isPWAMode } from '../lib/pwaDetect';
import './PWAInstallGuideModal.css';

interface PWAInstallGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const PWAInstallGuideModal = ({ isOpen, onClose }: PWAInstallGuideModalProps) => {
    if (!isOpen) return null;

    const platform = getMobilePlatform();
    const isIOS = platform === 'ios';
    const isAndroid = platform === 'android';
    const isAlreadyPWA = isPWAMode();

    // PWA 모드에서는 굳이 이 모달을 보여줄 필요가 없지만, 
    // 설정에서 강제로 여는 경우를 대비해 안내 문구를 조정합니다.
    const title = isAlreadyPWA ? '앱 설치 정보' : '앱 설치 안내';

    return createPortal(
        <div className="PWAInstallGuideModal PIGM-overlay" onClick={onClose}>
            <div className="PIGM-container" onClick={(e) => e.stopPropagation()}>
                <div className="PIGM-header">
                    <h2 className="PIGM-title">
                        <i className="ri-download-cloud-2-fill"></i> {title}
                    </h2>
                    <button className="PIGM-closeBtn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="PIGM-body">
                    {/* 알림 기능 관련 핵심 안내 */}
                    <div className="PIGM-heroSection">
                        <div className="PIGM-iconCircle">
                            <i className="ri-notification-badge-line"></i>
                        </div>
                        <div className="PIGM-heroText">
                            {isIOS ? (
                                <>
                                    <p className="PIGM-mainDesc">
                                        아이폰에서 <strong>알림 서비스</strong>를 이용하려면<br />
                                        반드시 앱 설치(홈 화면 추가)가 필요합니다.
                                    </p>
                                    <p className="PIGM-subDesc">
                                        애플의 정책상 홈 화면에 추가된 '웹 앱' 형태에서만<br />
                                        실시간 알림 권한을 승인할 수 있습니다.
                                    </p>
                                </>
                            ) : isAndroid ? (
                                <>
                                    <p className="PIGM-mainDesc">
                                        안드로이드는 <strong>브라우저 상태</strong>에서도<br />
                                        알림 서비스를 바로 이용하실 수 있습니다!
                                    </p>

                                </>
                            ) : (
                                <>
                                    <p className="PIGM-mainDesc">
                                        앱을 설치하면 <strong>실시간 알림</strong>과<br />
                                        더 쾌적한 환경을 제공합니다.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="PIGM-divider"></div>

                    {/* 설치 단계 안내 */}
                    <div className="PIGM-infoSection">
                        <h3 className="PIGM-sectionTitle">수동 설치 방법 (3초 완료)</h3>

                        {isIOS ? (
                            <div className="PIGM-steps">
                                <div className="PIGM-stepItem">
                                    <div className="PIGM-stepNum">1</div>
                                    <div className="PIGM-stepContent">
                                        Safari 브라우저 하단의 <i className="ri-upload-2-line"></i> <strong>공유</strong> 버튼 클릭
                                    </div>
                                </div>
                                <div className="PIGM-stepItem">
                                    <div className="PIGM-stepNum">2</div>
                                    <div className="PIGM-stepContent">
                                        메뉴를 아래로 내려 <strong>'홈 화면에 추가'</strong> 선택
                                    </div>
                                </div>
                                <div className="PIGM-stepItem">
                                    <div className="PIGM-stepNum">3</div>
                                    <div className="PIGM-stepContent">
                                        우측 상단 <strong>'추가'</strong>를 누르면 홈 화면에 생성!
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="PIGM-steps">
                                <div className="PIGM-stepItem">
                                    <div className="PIGM-stepNum">1</div>
                                    <div className="PIGM-stepContent">
                                        브라우저 우측 상단 <strong>⋮ (메뉴)</strong> 버튼 클릭
                                    </div>
                                </div>
                                <div className="PIGM-stepItem">
                                    <div className="PIGM-stepNum">2</div>
                                    <div className="PIGM-stepContent">
                                        <strong>'앱 설치'</strong> 또는 <strong>'홈 화면에 추가'</strong> 선택
                                    </div>
                                </div>
                                <div className="PIGM-stepItem">
                                    <div className="PIGM-stepNum">3</div>
                                    <div className="PIGM-stepContent">
                                        바탕화면에 생성된 <strong>아이콘</strong>으로 접속하면 완료!
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {isIOS && (
                        <div className="PIGM-tipBox">
                            <i className="ri-information-line"></i>
                            <span>아이폰에서는 홈 화면에 추가된 아이콘으로 접속해야 알림 기능을 사용할 수 있습니다.</span>
                        </div>
                    )}
                </div>

                <div className="PIGM-footer">
                    <button className="PIGM-confirmBtn" onClick={onClose}>확인했습니다</button>
                </div>
            </div>
        </div>,
        document.body
    );
};
