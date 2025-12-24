import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { createResizedImages } from '../../../utils/imageResize';
import { retryOperation } from '../../../utils/asyncUtils';
import './QuickMemoEditor.css';

interface QuickMemoEditorProps {
    onPostCreated: () => void;
    category: string;
}

export default function QuickMemoEditor({ onPostCreated, category }: QuickMemoEditorProps) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bannedWords, setBannedWords] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadBannedWords();
    }, []);

    const loadBannedWords = async () => {
        try {
            const { data } = await supabase.from('board_banned_words').select('word');
            if (data) setBannedWords(data.map(w => w.word));
        } catch (error) {
            console.error('금지어 로드 실패:', error);
        }
    };

    const checkBannedWords = (text: string) => {
        for (const word of bannedWords) {
            if (text.includes(word)) return word;
        }
        return null;
    };

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setImagePreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!content.trim()) {
            alert('내용을 입력해주세요.');
            return;
        }

        if (category === 'anonymous' && !nickname.trim()) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        if (category === 'anonymous' && !password.trim()) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        const bannedContent = checkBannedWords(content);
        const bannedTitle = checkBannedWords(title);
        const bannedNickname = checkBannedWords(nickname);

        if (bannedContent || bannedTitle || bannedNickname) {
            alert(`금지어("${bannedContent || bannedTitle || bannedNickname}")가 포함되어 있습니다.`);
            return;
        }

        setIsSubmitting(true);

        try {
            let imageUrls = { image: null as string | null, image_thumbnail: null as string | null };

            if (imageFile) {
                const timestamp = Date.now();
                const fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.webp`;
                const resized = await createResizedImages(imageFile);

                const uploadImage = async (path: string, file: Blob) => {
                    const { error } = await supabase.storage.from("images").upload(path, file);
                    if (error) throw error;
                    return supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
                };

                const [thumbUrl, mainUrl] = await Promise.all([
                    retryOperation(() => uploadImage(`board-images/thumbnails/${fileName}`, resized.thumbnail)),
                    retryOperation(() => uploadImage(`board-images/medium/${fileName}`, resized.medium))
                ]);
                imageUrls.image = mainUrl;
                imageUrls.image_thumbnail = thumbUrl;
            }

            const { error } = await supabase.from('board_posts').insert([{
                title: title.trim() || content.substring(0, 20),
                content: content,
                author_name: nickname,
                author_nickname: nickname,
                user_id: null, // Always null for anonymity as requested
                category: category,
                image: imageUrls.image,
                image_thumbnail: imageUrls.image_thumbnail,
                password: password.trim() || null,
                views: 0
            }]);

            if (error) throw error;

            // Reset
            setTitle('');
            setContent('');
            setNickname('');
            setPassword('');
            setImageFile(null);
            setImagePreview(null);
            onPostCreated();
            alert('메모가 등록되었습니다!');

        } catch (error) {
            console.error('메모 등록 실패:', error);
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="quick-memo-editor">
            <form onSubmit={handleSubmit} className="memo-form">
                <div className="memo-header">
                    <input
                        type="text"
                        placeholder="닉네임"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="memo-nickname-input"
                    />
                    <div className="memo-actions">
                        <button
                            type="button"
                            className="memo-image-btn"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <i className="ri-image-add-line"></i>
                        </button>
                        <button
                            type="submit"
                            className="memo-submit-btn"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <i className="ri-loader-4-line spin"></i> : '등록'}
                        </button>
                    </div>
                </div>

                <div className="memo-sub-header">
                    <input
                        type="password"
                        placeholder="비밀번호 (등록/삭제용)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="memo-password-input full-width"
                        required
                    />
                </div>

                <input
                    type="text"
                    placeholder="제목 (선택사항)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="memo-title-input"
                />

                <textarea
                    placeholder="여기에 메모를 남겨보세요..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="memo-textarea"
                />

                {imagePreview && (
                    <div className="memo-preview-area">
                        <img src={imagePreview} alt="Preview" />
                        <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="remove-preview">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>
                )}

                <input
                    type="file"
                    hidden
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageSelect}
                />
            </form>
        </div>
    );
}
