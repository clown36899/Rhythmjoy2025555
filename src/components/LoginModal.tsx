import { useEffect, useState, type MouseEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/domains/overlays.css';

const CAFE24_AUTH_ENABLED =
    import.meta.env.VITE_CAFE24_AUTH_BACKEND !== 'supabase' &&
    import.meta.env.VITE_CAFE24_EVENTS_BACKEND !== 'supabase';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
    const { signInWithKakao, signInWithGoogle, isAuthProcessing, user } = useAuth();
    const [pendingProvider, setPendingProvider] = useState<'kakao' | 'google' | null>(null);
    const [cafe24GoogleAvailable, setCafe24GoogleAvailable] = useState(!CAFE24_AUTH_ENABLED);

    useEffect(() => {
        if (isOpen && (user || isAuthProcessing)) {
            onClose();
        }
    }, [user, isAuthProcessing, isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) {
            setPendingProvider(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !CAFE24_AUTH_ENABLED) return;

        let cancelled = false;
        fetch('/api/auth/providers', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        })
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                if (!cancelled) setCafe24GoogleAvailable(Boolean(data?.google));
            })
            .catch(() => {
                if (!cancelled) setCafe24GoogleAvailable(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    if (!isOpen || user || isAuthProcessing) return null;

    const handleProviderLogin = async (
        event: MouseEvent<HTMLButtonElement>,
        provider: 'kakao' | 'google'
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (pendingProvider) return;

        setPendingProvider(provider);
        onClose();

        try {
            if (provider === 'kakao') {
                await signInWithKakao();
            } else {
                await signInWithGoogle();
            }
        } catch {
            setPendingProvider(null);
        }
    };

    return (
        <div className="LoginModal" onClick={onClose} role="dialog" aria-modal="true">
            <div className="LM-container" onClick={e => e.stopPropagation()}>
                <div className="LM-header">
                    <button type="button" className="LM-closeBtn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="LM-message">
                    {message || '댄스빌보드 로그인.\n간편하게 로그인하고 이용해보세요.'}
                </div>

                <div className="LM-actions">
                    <button
                        type="button"
                        className="LM-btn LM-btn-kakao"
                        onClick={(event) => handleProviderLogin(event, 'kakao')}
                        disabled={Boolean(pendingProvider)}
                        aria-busy={pendingProvider === 'kakao'}
                        data-analytics-id="login_kakao"
                        data-analytics-type="auth"
                        data-analytics-title="카카오 로그인 시도"
                        data-analytics-section="login_modal"
                    >
                        <i className="ri-kakao-talk-fill"></i>
                        {pendingProvider === 'kakao' ? '카카오 로그인 중...' : '카카오로 로그인'}
                    </button>

                    {(!CAFE24_AUTH_ENABLED || cafe24GoogleAvailable) && (
                        <button
                            type="button"
                            className="LM-btn LM-btn-google"
                            onClick={(event) => handleProviderLogin(event, 'google')}
                            disabled={Boolean(pendingProvider)}
                            aria-busy={pendingProvider === 'google'}
                            data-analytics-id="login_google"
                            data-analytics-type="auth"
                            data-analytics-title="Google 로그인 시도"
                            data-analytics-section="login_modal"
                        >
                            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4" />
                                <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
                                <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" fill="#FBBC05" />
                                <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" fill="#EA4335" />
                            </svg>
                            {pendingProvider === 'google' ? 'Google 로그인 중...' : 'Google로 로그인'}
                        </button>
                    )}
                </div>

                <div className="LM-footer">
                    로그인 시 <span className="LM-link" onClick={() => window.open('/guide', '_blank')}>이용약관</span> 및 <span className="LM-link" onClick={() => window.open('/privacy', '_blank')}>개인정보처리방침</span>에 동의하는 것으로 간주합니다.
                </div>
            </div>
        </div>
    );
}
