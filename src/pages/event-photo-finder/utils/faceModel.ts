// Don't import face-api.js statically to avoid huge bundle size on initial load
import type * as FaceApiTypes from 'face-api.js';

export class FaceModel {
    private static instance: FaceModel;
    private isLoaded = false;
    private faceapi: typeof FaceApiTypes | null = null;

    private constructor() { }

    public static getInstance(): FaceModel {
        if (!FaceModel.instance) {
            FaceModel.instance = new FaceModel();
        }
        return FaceModel.instance;
    }

    public async loadModels(): Promise<void> {
        if (this.isLoaded && this.faceapi) return;

        const MODEL_URL = '/models';

        try {
            // Dynamic import to split chunk
            const faceapi = await import('face-api.js');
            this.faceapi = faceapi;

            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), // Face detection
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // Face alignment
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL), // Face descriptor
            ]);
            console.log('✅ Face API models loaded successfully');
            this.isLoaded = true;
        } catch (error) {
            console.error('❌ Failed to load Face API models:', error);
            throw new Error('AI 모델을 불러오는데 실패했습니다.');
        }
    }

    public isReady(): boolean {
        return this.isLoaded && !!this.faceapi;
    }

    public getApi(): typeof FaceApiTypes {
        if (!this.faceapi) {
            throw new Error('Face API is not loaded. Call loadModels() first.');
        }
        return this.faceapi;
    }
}
