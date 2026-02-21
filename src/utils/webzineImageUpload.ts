import { supabase } from '../lib/supabase';
import { createResizedImages } from './imageResize';

export interface WebzineUploadResult {
    folderPath: string;    // "webzine/42/1700000000000_abc12"
    fullUrl: string;       // full.webp 공개 URL → 에디터 삽입용
    thumbnailUrl: string;  // 미리보기용
}

export async function uploadWebzineImage(
    file: File,
    postId: string | number,
    onProgress?: (step: string) => void
): Promise<WebzineUploadResult> {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 7);
    const folderPath = `webzine/${postId}/${timestamp}_${randomStr}`;

    onProgress?.('이미지 변환 중...');
    const resized = await createResizedImages(file);

    const uploadOne = async (path: string, fileBlob: File): Promise<string> => {
        const { error } = await supabase.storage.from('images').upload(path, fileBlob, {
            cacheControl: '31536000',
            contentType: fileBlob.type,
        });
        if (error) throw error;
        return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
    };

    onProgress?.('이미지 업로드 중...');
    const [, thumbnailUrl, , fullUrl] = await Promise.all([
        uploadOne(`${folderPath}/micro.webp`, resized.micro),
        uploadOne(`${folderPath}/thumbnail.webp`, resized.thumbnail),
        uploadOne(`${folderPath}/medium.webp`, resized.medium),
        uploadOne(`${folderPath}/full.webp`, resized.full),
    ]);

    return { folderPath, fullUrl, thumbnailUrl };
}

export async function deleteWebzineImageFolder(folderPath: string): Promise<void> {
    const { data: files } = await supabase.storage.from('images').list(folderPath);
    if (files && files.length > 0) {
        const filePaths = files.map(f => `${folderPath}/${f.name}`);
        await supabase.storage.from('images').remove(filePaths);
    }
}
