import React, { createContext, useContext, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptContextType {
    promptEvent: BeforeInstallPromptEvent | null;
    setPromptEvent: React.Dispatch<React.SetStateAction<BeforeInstallPromptEvent | null>>;
    isInstalled: boolean;
}

const InstallPromptContext = createContext<InstallPromptContextType | undefined>(undefined);

export const InstallPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        console.log('🔍 [InstallPromptProvider] Initializing...');

        // PWA가 이미 설치되었는지 확인
        const checkIfInstalled = () => {
            // 1. Standalone 모드 체크 (실제로 PWA로 실행 중)
            if (window.matchMedia('(display-mode: standalone)').matches) {
                console.log('✅ [InstallPromptProvider] Already installed (standalone mode)');
                setIsInstalled(true);
                // localStorage에 설치 기록
                localStorage.setItem('pwa_installed', 'true');
                return true;
            }
            if ((window.navigator as any).standalone === true) {
                console.log('✅ [InstallPromptProvider] Already installed (iOS standalone)');
                setIsInstalled(true);
                // localStorage에 설치 기록
                localStorage.setItem('pwa_installed', 'true');
                return true;
            }

            // 2. localStorage에 설치 기록이 있는지 확인 (이전에 설치한 적 있음)
            const wasInstalled = localStorage.getItem('pwa_installed') === 'true';
            if (wasInstalled) {
                console.log('✅ [InstallPromptProvider] Previously installed (from localStorage)');
                setIsInstalled(true);
                return true;
            }

            console.log('📱 [InstallPromptProvider] Not installed yet');
            return false;
        };

        if (checkIfInstalled()) {
            return;
        }

        // 초기 로드 시 index.html에서 캡처한 프롬프트가 있는지 확인
        if ((window as any).deferredPrompt) {
            console.log('📦 [InstallPromptProvider] Found early captured prompt');
            setPromptEvent((window as any).deferredPrompt);
        }

        // beforeinstallprompt 이벤트 리스너 (전역에서 한 번만 등록)
        const handler = (e: Event) => {
            console.log('🎉 [InstallPromptProvider] beforeinstallprompt event captured!');
            e.preventDefault();
            setPromptEvent(e as BeforeInstallPromptEvent);
            (window as any).deferredPrompt = e; // 전역 객체도 업데이트
        };

        // index.html에서 보낸 커스텀 이벤트 처리
        const handleCustomPrompt = (e: any) => {
            console.log('🛰️ [InstallPromptProvider] Custom pwaPromptReady event received');
            if (e.detail) {
                setPromptEvent(e.detail);
            }
        };

        // PWA 설치 완료 감지
        const handleAppInstalled = () => {
            console.log('✅ [InstallPromptProvider] App installed!');
            setIsInstalled(true);
            setPromptEvent(null);
            // localStorage에 설치 기록
            localStorage.setItem('pwa_installed', 'true');
        };

        console.log('👂 [InstallPromptProvider] Registering global event listeners...');
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('pwaPromptReady' as any, handleCustomPrompt);

        return () => {
            console.log('🔻 [InstallPromptProvider] Cleaning up event listeners');
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('pwaPromptReady' as any, handleCustomPrompt);
        };
    }, []);

    return (
        <InstallPromptContext.Provider value={{ promptEvent, setPromptEvent, isInstalled }}>
            {children}
        </InstallPromptContext.Provider>
    );
};

export const useInstallPrompt = () => {
    const context = useContext(InstallPromptContext);
    if (!context) {
        throw new Error('useInstallPrompt must be used within InstallPromptProvider');
    }
    return context;
};
