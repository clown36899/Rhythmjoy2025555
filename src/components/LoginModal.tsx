import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/domains/overlays.css';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
    const { signInWithKakao, signInWithGoogle, isAuthProcessing, user } = useAuth();

    useEffect(() => {
        if (user && isOpen) {
            onClose();
        }
    }, [user, isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="LoginModal" onClick={onClose} role="dialog" aria-modal="true">
            <div className="LM-container" onClick={e => e.stopPropagation()}>
                <div className="LM-header">
                    <button className="LM-closeBtn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="LM-message">
                    {message || '댄스빌보드 로그인.\n간편하게 로그인하고 이용해보세요.'}
                </div>

                <div className="LM-actions">
                    <button
                        className="LM-btn LM-btn-kakao"
                        onClick={() => signInWithKakao()}
                        disabled={isAuthProcessing}
                    >
                        <i className="ri-kakao-talk-fill"></i>
                        카카오로 로그인
                    </button>

                    <button
                        className="LM-btn LM-btn-google"
                        onClick={() => signInWithGoogle()}
                        disabled={isAuthProcessing}
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4" />
                            <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
                            <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" fill="#FBBC05" />
                            <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" fill="#EA4335" />
                        </svg>
                        Google로 로그인
                    </button>
                </div>

                <div className="LM-footer">
                    로그인 시 <span className="LM-link" onClick={() => window.open('/guide', '_blank')}>이용약관</span> 및 <span className="LM-link" onClick={() => window.open('/privacy', '_blank')}>개인정보처리방침</span>에 동의하는 것으로 간주합니다.
                </div>
            </div>
        </div>
    );
}
