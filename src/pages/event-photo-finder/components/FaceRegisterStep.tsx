import React, { useState, useRef } from 'react';
import type * as FaceApiTypes from 'face-api.js';
import { FaceModel } from '../utils/faceModel';

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
            // Load model if not ready (should be preloaded really)
            const model = FaceModel.getInstance();
            if (!model.isReady()) {
                await model.loadModels();
            }

            const faceapi = model.getApi();

            // Convert file to image element
            const img = await faceapi.bufferToImage(file);

            // Detect Face
            const detection = await faceapi
                .detectSingleFace(img)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                alert('얼굴을 찾을 수 없습니다. 다시 시도해주세요.');
                return;
            }

            // TODO: Add angle validation logic here (checking landmarks)

            const newFaces = [...faces, detection.descriptor];
            setFaces(newFaces);

            if (currentStep < 2) {
                setCurrentStep(prev => prev + 1);
            } else {
                // Complete
                onComplete(newFaces);
            }

        } catch (error) {
            console.error(error);
            alert('분석 중 오류가 발생했습니다.');
        } finally {
            setIsAnalyzing(false);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const stepInfo = STEPS[currentStep];

    return (
        <div className="space-y-6">
            {/* Progress Bar */}
            <div className="flex gap-1 mb-8">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${i <= currentStep ? 'bg-blue-500' : 'bg-gray-700'
                            }`}
                    />
                ))}
            </div>

            <div className="text-center space-y-2">
                <div className="text-4xl mb-4 animate-bounce">
                    {currentStep === 0 ? '📸' : currentStep === 1 ? '👈' : '👉'}
                </div>
                <h2 className="text-2xl font-bold">{stepInfo.title}</h2>
                <p className="text-gray-400">{stepInfo.desc}</p>
                <p className="text-sm text-blue-400 font-medium bg-blue-900/20 py-2 rounded-lg">
                    {stepInfo.angleDesc}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="col-span-2 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold flex flex-col items-center justify-center gap-2 border border-gray-600 transition-all active:scale-95"
                    disabled={isAnalyzing}
                >
                    {isAnalyzing ? (
                        <span className="animate-pulse">분석 중...</span>
                    ) : (
                        <>
                            <span className="text-2xl">📁</span>
                            사진 업로드
                        </>
                    )}
                </button>

                {/* Hidden File Input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                />
            </div>
        </div>
    );
};
