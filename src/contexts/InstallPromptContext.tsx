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
        // console.log('🔍 [InstallPromptProvider] Initializing...');

        // 1. 초기 로드 시 감지 로직
        const checkInitialState = () => {
            // A. Standalone 모드 (확실히 설치됨/앱으로 실행중)
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches;
            const isIOSStandalone = (window.navigator as any).standalone === true;

            if (isStandalone || isIOSStandalone) {
                // console.log('✅ [InstallPromptProvider] Running in standalone mode');
                setIsInstalled(true);
                localStorage.setItem('pwa_installed', 'true');
                return;
            }

            // B. 브라우저 환경이지만 설치 이벤트가 이미 발생했는지 확인 (window.deferredPrompt)
            // 이 값이 존재하면 브라우저가 "설치 안 됨"이라고 판단한 것임
            if ((window as any).deferredPrompt) {
                // console.log('📉 [InstallPromptProvider] Found deferredPrompt -> App is NOT installed');
                setIsInstalled(false);
                setPromptEvent((window as any).deferredPrompt);
                localStorage.removeItem('pwa_installed'); // 설치 기록 제거
                return;
            }

            // C. localStorage 기록 확인 (이전에 설치했다고 기록됨)
            // 주의: 브라우저는 설치 여부를 API로 알려주지 않으므로, 이 기록을 믿습니다.
            // 단, 나중에 beforeinstallprompt 이벤트가 발생하면 오판이었음을 확인하고 기록을 지웁니다.
            const storedInstalled = localStorage.getItem('pwa_installed');
            if (storedInstalled === 'true') {
                // console.log('✅ [InstallPromptProvider] Previously installed (from localStorage)');
                setIsInstalled(true);
            } else {
                // console.log('📱 [InstallPromptProvider] No install record found');
            }
        };

        checkInitialState();

        // 2. beforeinstallprompt 이벤트 리스너 (브라우저가 "설치 가능함"을 알릴 때)
        // 이 이벤트가 발생한다는 것은 => "현재 기기에 앱이 설치되어 있지 않음"을 의미합니다.
        const handler = (e: Event) => {
            // console.log('🎉 [InstallPromptProvider] beforeinstallprompt event captured!');
            e.preventDefault();

            // 설치 안 된 상태로 강제 전환
            setIsInstalled(false);
            localStorage.removeItem('pwa_installed');

            setPromptEvent(e as BeforeInstallPromptEvent);
            (window as any).deferredPrompt = e;
        };

        // index.html에서 보낸 커스텀 이벤트 처리
        // index.html에서 보낸 커스텀 이벤트 처리
        const handleCustomPrompt = (e: any) => {
            // console.log('🛰️ [InstallPromptProvider] Custom pwaPromptReady event received');
            if (e.detail) {
                setPromptEvent(e.detail);
            }
        };

        // PWA 설치 완료 감지
        // PWA 설치 완료 감지
        const handleAppInstalled = () => {
            // console.log('✅ [InstallPromptProvider] App installed!');
            setIsInstalled(true);
            setPromptEvent(null);
            // localStorage에 설치 기록
            localStorage.setItem('pwa_installed', 'true');
        };

        // console.log('👂 [InstallPromptProvider] Registering global event listeners...');
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('pwaPromptReady' as any, handleCustomPrompt);

        return () => {
            // console.log('🔻 [InstallPromptProvider] Cleaning up event listeners');
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
