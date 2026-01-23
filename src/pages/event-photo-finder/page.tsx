import React, { useState, useEffect } from 'react';
import { FaceRegisterStep } from './components/FaceRegisterStep';
import { FolderSelector } from './components/FolderSelector';
import { ResultGallery } from './components/ResultGallery';
import { usePhotoProcessor } from './hooks/usePhotoProcessor';
import { localDB } from './utils/localDB';
import '../../styles/components/MobileShell.css'; // Import global shell styles

const EventPhotoFinderPage: React.FC = () => {
    const [step, setStep] = useState<'REGISTER' | 'SELECT' | 'PROCESSING' | 'RESULT'>('REGISTER');
    const [userFaces, setUserFaces] = useState<Float32Array[]>([]);
    const [matchedPhotos, setMatchedPhotos] = useState<any[]>([]);
    const { processPhotos, status } = usePhotoProcessor();

    // Load existing results on mount
    useEffect(() => {
        const checkExisting = async () => {
            const photos = await localDB.getAllPhotos();
            if (photos.length > 0) {
                setMatchedPhotos(photos);
                // Optional: Can prompt user to resume or start over
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

        // Fetch results
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
        <div className="shell-container" style={{ backgroundColor: '#000000', minHeight: '100vh' }}>
            {/* Global Fixed Header Style */}
            <header className="shell-header global-header-fixed">
                <div className="header-left-content">
                    <div className="header-events-content">
                        <img src="/logo.png" alt="Dance Billboard Logo" className="header-logo" />
                        {/* <h1 className="header-title">
                            내 사진 찾기 AI
                        </h1> */}
                    </div>
                </div>
            </header>

            {/* Main Content Area with padding for fixed header */}
            <main className="p-4 max-w-lg mx-auto pb-20 h-full pt-[70px]">
                {step === 'REGISTER' && (
                    <div className="space-y-6">
                        <div className="bg-gray-800 rounded-xl p-6 text-center border border-gray-700 shadow-lg mb-6">
                            <h2 className="text-xl font-bold mb-4">내 사진 찾기 AI</h2>
                            <p className="text-gray-400 text-sm mb-6">
                                AI가 수백 장의 사진 중에서<br />
                                회원님의 얼굴을 자동으로 찾아드립니다.
                            </p>

                            <div className="text-xs text-left bg-blue-900/20 p-4 rounded-lg border border-blue-900/50 mb-6">
                                <h3 className="font-bold text-blue-400 mb-2">✨ 이렇게 작동해요</h3>
                                <ol className="list-decimal pl-4 space-y-1 text-gray-300">
                                    <li>본인의 얼굴을 3가지 각도로 등록합니다.</li>
                                    <li>전달받은 행사 사진 폴더를 선택합니다.</li>
                                    <li>AI가 폰에서 사진을 분석해 내 사진만 골라줍니다.</li>
                                </ol>
                            </div>

                            <div className="text-xs text-gray-500 text-center">
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
                    <div className="text-center py-20 space-y-8">
                        <div className="relative w-32 h-32 mx-auto">
                            <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                            <div
                                className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"
                            ></div>
                            <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
                                {status.progress}%
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold animate-pulse">사진 분석 중...</h3>
                            <p className="text-gray-400">
                                {status.processed} / {status.total}장 처리됨
                            </p>
                            <p className="text-sm text-blue-400">
                                찾은 사진: {status.matchCount}장 ✨
                            </p>
                            <p className="text-xs text-gray-500 mt-4">
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
