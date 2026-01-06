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
                        <i className="ri-google-fill" style={{ fontSize: '1.4rem' }}></i>
                        Google로 시작하기
                    </button>
                </div>
            </div>
        </div>
    );
}
