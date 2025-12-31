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
            if (window.matchMedia('(display-mode: standalone)').matches) {
                console.log('✅ [InstallPromptProvider] Already installed (standalone mode)');
                setIsInstalled(true);
                return true;
            }
            if ((window.navigator as any).standalone === true) {
                console.log('✅ [InstallPromptProvider] Already installed (iOS standalone)');
                setIsInstalled(true);
                return true;
            }
            console.log('📱 [InstallPromptProvider] Not installed yet');
            return false;
        };

        if (checkIfInstalled()) {
            return;
        }

        // beforeinstallprompt 이벤트 리스너 (전역에서 한 번만 등록)
        const handler = (e: Event) => {
            console.log('🎉 [InstallPromptProvider] beforeinstallprompt event captured!');
            e.preventDefault();
            setPromptEvent(e as BeforeInstallPromptEvent);
        };

        // PWA 설치 완료 감지
        const handleAppInstalled = () => {
            console.log('✅ [InstallPromptProvider] App installed!');
            setIsInstalled(true);
            setPromptEvent(null);
        };

        console.log('👂 [InstallPromptProvider] Registering global event listeners...');
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            console.log('🔻 [InstallPromptProvider] Cleaning up event listeners');
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', handleAppInstalled);
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
