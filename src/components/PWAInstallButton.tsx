import { useInstallPrompt } from '../contexts/InstallPromptContext';
import './PWAInstallButton.css';

export const PWAInstallButton = () => {
    const { promptEvent, setPromptEvent, isInstalled } = useInstallPrompt();

    const handleInstallClick = async () => {
        if (!promptEvent) return; // Type guard

        console.log('📱 PWA 설치 프롬프트 표시');
        try {
            await promptEvent.prompt();
            const { outcome } = await promptEvent.userChoice;
            console.log(`사용자 선택: ${outcome}`);

            if (outcome === 'accepted') {
                console.log('✅ 사용자가 PWA 설치를 수락했습니다');
            } else {
                console.log('❌ 사용자가 PWA 설치를 거부했습니다');
            }

            setPromptEvent(null);
        } catch (error) {
            console.error('설치 프롬프트 오류:', error);
        }
    };

    // 설치 불가능한 경우 버튼 숨김 (이미 설치됨 OR 프롬프트 없음)
    if (isInstalled || !promptEvent) {
        console.log('[PWA Install Button] Button hidden -',
            isInstalled ? 'Already installed' : 'Install prompt not available');
        return null;
    }

    console.log('✨ [PWA Install Button] Button visible with install prompt!');

    return (
        <button
            onClick={handleInstallClick}
            className="pwa-install-button"
            title="앱 설치하기"
        >
            <i className="ri-download-cloud-line"></i>
            <span className="pwa-install-text">앱 설치</span>
        </button>
    );
};
