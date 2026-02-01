import React, { useState, useEffect } from 'react';
import { FaceRegisterStep } from './components/FaceRegisterStep';
import { FolderSelector } from './components/FolderSelector';
import { ResultGallery } from './components/ResultGallery';
import { usePhotoProcessor } from './hooks/usePhotoProcessor';
import { localDB } from './utils/localDB';
import '../../styles/components/MobileShell.css';
import './page.css';

const EventPhotoFinderPage: React.FC = () => {
    const [step, setStep] = useState<'REGISTER' | 'SELECT' | 'PROCESSING' | 'RESULT'>('REGISTER');
    const [userFaces, setUserFaces] = useState<Float32Array[]>([]);
    const [matchedPhotos, setMatchedPhotos] = useState<any[]>([]);
    const { processPhotos, status } = usePhotoProcessor();

    useEffect(() => {
        const checkExisting = async () => {
            const photos = await localDB.getAllPhotos();
            if (photos.length > 0) {
                setMatchedPhotos(photos);
            }
        };
        checkExisting();
    }, []);

    const handleFaceRegistered = (faces: Float32Array[]) => {
        setUserFaces(faces);
        setStep('SELECT');
    };

    const handleFilesSelected = async (files: File[]) => {
        setStep('PROCESSING');
        await processPhotos(files, userFaces);

        const results = await localDB.getAllPhotos();
        setMatchedPhotos(results);
        setStep('RESULT');
    };

    const handleRestart = () => {
        setStep('REGISTER');
        setUserFaces([]);
        setMatchedPhotos([]);
    };

    return (
        <div className="shell-container EventPhotoFinder" style={{ backgroundColor: '#000000', minHeight: '100vh' }}>
            <header className="shell-header global-header-fixed">
                <div className="header-left-content">
                    <div className="header-events-content">
                        <img src="/logo.png" alt="Dance Billboard Logo" className="header-logo" />
                    </div>
                </div>
            </header>

            <main className="epf-main">
                {step === 'REGISTER' && (
                    <div className="epf-register-view">
                        <div className="epf-welcome-card">
                            <h2 className="epf-title">내 사진 찾기 AI</h2>
                            <p className="epf-desc">
                                AI가 수백 장의 사진 중에서<br />
                                회원님의 얼굴을 자동으로 찾아드립니다.
                            </p>

                            <div className="epf-how-it-works">
                                <h3 className="epf-how-it-works-title">✨ 이렇게 작동해요</h3>
                                <ol className="epf-steps-list">
                                    <li>본인의 얼굴을 3가지 각도로 등록합니다.</li>
                                    <li>전달받은 행사 사진 폴더를 선택합니다.</li>
                                    <li>AI가 폰에서 사진을 분석해 내 사진만 골라줍니다.</li>
                                </ol>
                            </div>

                            <div className="epf-privacy-note">
                                * 사진은 서버로 전송되지 않고 폰에서만 처리됩니다.
                            </div>
                        </div>

                        <FaceRegisterStep onComplete={handleFaceRegistered} />
                    </div>
                )}

                {step === 'SELECT' && (
                    <FolderSelector
                        onFilesSelected={handleFilesSelected}
                        isProcessing={false}
                    />
                )}

                {step === 'PROCESSING' && (
                    <div className="epf-processing-area">
                        <div className="epf-spinner-wrapper">
                            <div className="epf-spinner-bg"></div>
                            <div className="epf-spinner-active"></div>
                            <div className="epf-progress-text">
                                {status.progress}%
                            </div>
                        </div>

                        <div className="epf-status-info">
                            <h3 className="epf-status-title">사진 분석 중...</h3>
                            <p className="epf-status-count">
                                {status.processed} / {status.total}장 처리됨
                            </p>
                            <p className="epf-match-count">
                                찾은 사진: {status.matchCount}장 ✨
                            </p>
                            <p className="epf-current-file">
                                현재 분석 중: {status.currentFile}<br />
                                잠시만 기다려주세요. 화면을 켜두세요!
                            </p>
                        </div>
                    </div>
                )}

                {step === 'RESULT' && (
                    <ResultGallery
                        photos={matchedPhotos}
                        onRestart={handleRestart}
                    />
                )}
            </main>
        </div>
    );
};

export default EventPhotoFinderPage;
