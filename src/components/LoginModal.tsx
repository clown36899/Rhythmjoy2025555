import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginModal.css';

// Import SVG icons if available, or use public assets
const KAKAO_ICON = "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png";
const GOOGLE_ICON = "https://lh3.googleusercontent.com/COxitq8kL_ls1kTVWwvN9A4FpXj_7D5o_h-J3qB8rYqX8r7k8o5f5b5c5d5e5f5g5h5i5j5k5l5m5n5o5p"; // Placeholder, using inline SVG is better usually but for now simple

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
    const { signInWithKakao, signInWithGoogle, isAuthProcessing } = useAuth();

    if (!isOpen) return null;

    return (
        <div className="login-modal-overlay" onClick={onClose}>
            <div className="login-modal-content" onClick={e => e.stopPropagation()}>
                <div className="login-modal-header">
                    <h2 className="login-modal-title">로그인</h2>
                    <button className="login-modal-close" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="login-modal-message">
                    {message || '로그인이 필요한 서비스입니다.\n간편하게 로그인하고 이용해보세요.'}
                </div>

                <div className="login-actions">
                    <button
                        className="login-btn login-btn-kakao"
                        onClick={() => {
                            signInWithKakao();
                            // Note: Kakao login redirects, so we don't necessarily need to close modal immediately,
                            // but usually it's good UX to leave it open until redirect happens or close it if we want.
                            // Since it redirects, the state will be lost anyway.
                        }}
                        disabled={isAuthProcessing}
                    >
                        <i className="ri-kakao-talk-fill" style={{ fontSize: '1.4rem' }}></i>
                        카카오로 시작하기
                    </button>

                    <button
                        className="login-btn login-btn-google"
                        onClick={() => {
                            signInWithGoogle();
                        }}
                        disabled={isAuthProcessing}
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4" />
                            <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
                            <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" fill="#FBBC05" />
                            <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" fill="#EA4335" />
                        </svg>
                        Google로 시작하기
                    </button>
                </div>
            </div>
        </div>
    );
}
