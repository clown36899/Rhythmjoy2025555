import { supabase } from './src/lib/supabase.ts';

async function updateDefaultThumbnailsToWebP() {
    try {
        // 현재 설정 가져오기
        const { data: current, error: fetchError } = await supabase
            .from('billboard_settings')
            .select('default_thumbnail_class, default_thumbnail_event')
            .eq('id', 1)
            .single();

        if (fetchError) {
            console.error('Error fetching current settings:', fetchError);
            return;
        }

        console.log('Current settings:', current);

        // PNG를 WebP로 변환
        const convertToWebP = (url: string) => {
            if (!url) return url;
            return url.replace(/\.png$/i, '.webp');
        };

        const newClassUrl = convertToWebP(current?.default_thumbnail_class || '');
        const newEventUrl = convertToWebP(current?.default_thumbnail_event || '');

        console.log('New class URL:', newClassUrl);
        console.log('New event URL:', newEventUrl);

        // 업데이트
        const { error: updateError } = await supabase
            .from('billboard_settings')
            .update({
                default_thumbnail_class: newClassUrl,
                default_thumbnail_event: newEventUrl,
                updated_at: new Date().toISOString(),
            })
            .eq('id', 1);

        if (updateError) {
            console.error('Error updating settings:', updateError);
            return;
        }

        console.log('✅ Successfully updated default thumbnails to WebP format!');
    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

updateDefaultThumbnailsToWebP();
