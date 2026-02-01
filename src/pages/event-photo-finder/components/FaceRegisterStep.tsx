import React, { useState, useRef } from 'react';
import { FaceModel } from '../utils/faceModel';
import './FaceRegisterStep.css';

interface FaceRegisterStepProps {
    onComplete: (faceVector: Float32Array[]) => void;
}

const STEPS = [
    {
        title: '정면 사진',
        desc: '정면을 바라보고 촬영해주세요',
        angleDesc: '얼굴이 중앙에 오도록 해주세요😊'
    },
    {
        title: '왼쪽 측면',
        desc: '고개를 왼쪽으로 살짝 돌려주세요',
        angleDesc: '오른쪽 귀가 보이게 해주세요 👈'
    },
    {
        title: '오른쪽 측면',
        desc: '고개를 오른쪽으로 살짝 돌려주세요',
        angleDesc: '왼쪽 귀가 보이게 해주세요 👉'
    },
];

export const FaceRegisterStep: React.FC<FaceRegisterStepProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [faces, setFaces] = useState<Float32Array[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const model = FaceModel.getInstance();
            if (!model.isReady()) {
                await model.loadModels();
            }

            const faceapi = model.getApi();
            const img = await faceapi.bufferToImage(file);

            const detection = await faceapi
                .detectSingleFace(img)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                alert('얼굴을 찾을 수 없습니다. 다시 시도해주세요.');
                return;
            }

            const newFaces = [...faces, detection.descriptor];
            setFaces(newFaces);

            if (currentStep < 2) {
                setCurrentStep(prev => prev + 1);
            } else {
                onComplete(newFaces);
            }

        } catch (error) {
            console.error(error);
            alert('분석 중 오류가 발생했습니다.');
        } finally {
            setIsAnalyzing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const stepInfo = STEPS[currentStep];

    return (
        <div className="FaceRegisterStep">
            {/* Progress Bar */}
            <div className="frs-progress-container">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className={`frs-progress-bar ${i <= currentStep ? 'is-active' : ''}`}
                    />
                ))}
            </div>

            <div className="frs-content">
                <div className="frs-icon">
                    {currentStep === 0 ? '📸' : currentStep === 1 ? '👈' : '👉'}
                </div>
                <h2 className="frs-title">{stepInfo.title}</h2>
                <p className="frs-desc">{stepInfo.desc}</p>
                <p className="frs-tip">
                    {stepInfo.angleDesc}
                </p>
            </div>

            <div className="frs-action-area">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="frs-upload-btn"
                    disabled={isAnalyzing}
                >
                    {isAnalyzing ? (
                        <span className="is-analyzing">분석 중...</span>
                    ) : (
                        <>
                            <span className="frs-upload-icon">📁</span>
                            사진 업로드
                        </>
                    )}
                </button>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
            </div>
        </div>
    );
};
