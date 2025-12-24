import { useState, useCallback } from 'react';
import type * as FaceApiTypes from 'face-api.js';
import { localDB } from '../utils/localDB';
import { FaceModel } from '../utils/faceModel';

interface ProcessingStatus {
    isProcessing: boolean;
    progress: number; // 0-100
    currentFile: string;
    total: number;
    processed: number;
    matchCount: number;
}

export const usePhotoProcessor = () => {
    const [status, setStatus] = useState<ProcessingStatus>({
        isProcessing: false,
        progress: 0,
        currentFile: '',
        total: 0,
        processed: 0,
        matchCount: 0,
    });

    const processPhotos = useCallback(async (files: File[], userFaces: Float32Array[]) => {
        setStatus(prev => ({ ...prev, isProcessing: true, total: files.length, processed: 0, matchCount: 0 }));

        // Ensure models are loaded
        const model = FaceModel.getInstance();
        if (!model.isReady()) await model.loadModels();
        const faceapi = model.getApi();

        const BATCH_SIZE = 50; // Process 50 photos, then cleanup/pause
        let matchCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                setStatus(prev => ({
                    ...prev,
                    currentFile: file.name,
                    progress: Math.round((i / files.length) * 100)
                }));

                // 1. Load Image
                // Use faceapi.bufferToImage for better compatibility with File object
                const img = await faceapi.bufferToImage(file);

                // 2. Detect Face
                const detection = await faceapi
                    .detectSingleFace(img)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                // 3. Compare with User Faces
                if (detection) {
                    let isMatch = false;
                    let maxSimilarity = 0;

                    // Compare with all registered user angles
                    for (const userFace of userFaces) {
                        const distance = faceapi.euclideanDistance(userFace, detection.descriptor);
                        const similarity = (1 - distance) * 100;
                        if (similarity > maxSimilarity) maxSimilarity = similarity;
                    }

                    // Threshold check (70% accuracy)
                    if (maxSimilarity >= 60) { // Using 60 as base, 70 is strict
                        isMatch = true;
                    }

                    if (isMatch) {
                        // 4. Save to IndexedDB
                        await localDB.addPhoto(file, detection.descriptor);
                        matchCount++;
                    }
                }

                // Cleanup image memory
                img.remove();

                // 5. Memory Management & UI Non-blocking
                // Every BATCH_SIZE or heavy processing, pause briefly
                if (i % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
            }

            setStatus(prev => ({
                ...prev,
                processed: i + 1,
                matchCount
            }));
        }

        setStatus(prev => ({
            ...prev,
            isProcessing: false,
            progress: 100,
            currentFile: '완료'
        }));
    }, []);

    return { processPhotos, status };
};
