import { useState, useEffect } from 'react';
import './PWAInstallButton.css';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallButton = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // PWA가 이미 설치되었는지 확인
        const checkIfInstalled = () => {
            // Standalone 모드 = PWA로 실행 중
            if (window.matchMedia('(display-mode: standalone)').matches) {
                setIsInstalled(true);
                return true;
            }
            // iOS Safari standalone 모드
            if ((window.navigator as any).standalone === true) {
                setIsInstalled(true);
                return true;
            }
            return false;
        };

        if (checkIfInstalled()) {
            return;
        }

        // beforeinstallprompt 이벤트 리스너
        const handleBeforeInstallPrompt = (e: Event) => {
            console.log('📱 PWA 설치 프롬프트 감지됨');
            // 기본 브라우저 설치 배너 방지
            e.preventDefault();
            // 나중에 사용하기 위해 이벤트 저장
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        // PWA 설치 완료 감지
        const handleAppInstalled = () => {
            console.log('✅ PWA 설치 완료!');
            setIsInstalled(true);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            console.log('설치 프롬프트를 사용할 수 없습니다');
            return;
        }

        console.log('📱 PWA 설치 프롬프트 표시');
        // 설치 프롬프트 표시
        await deferredPrompt.prompt();

        // 사용자 선택 결과 대기
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`사용자 선택: ${outcome}`);

        if (outcome === 'accepted') {
            console.log('✅ 사용자가 PWA 설치를 수락했습니다');
        } else {
            console.log('❌ 사용자가 PWA 설치를 거부했습니다');
        }

        // 프롬프트는 한 번만 사용 가능
        setDeferredPrompt(null);
    };

    // 설치 버튼을 표시하지 않는 경우:
    // 1. 이미 설치됨
    // 2. 설치 프롬프트가 없음 (iOS Safari 등)
    if (isInstalled || !deferredPrompt) {
        return null;
    }

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
