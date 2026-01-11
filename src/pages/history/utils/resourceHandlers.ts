
import { supabase } from '../../../lib/supabase';
import type { HistoryNodeData } from '../types';
import {
    extractPlaylistId,
    extractVideoId,
    fetchPlaylistInfo,
    fetchPlaylistVideos,
    fetchVideoDetails
} from '../../learning/utils/youtube';


export interface ResourceSaveResult {
    resourceId: string;
    resourceType: 'playlist' | 'video' | 'document' | 'person' | 'category' | 'general' | 'canvas';
}

export interface ResourceHandler {
    match(url: string, category: string): boolean;
    save(data: Partial<HistoryNodeData>, userId: string): Promise<ResourceSaveResult | null>;
}

export const RESOURCE_TABLE = 'learning_resources';

export class PlaylistHandler implements ResourceHandler {
    match(url: string, _category: string): boolean {
        return !!extractPlaylistId(url);
    }

    async save(data: Partial<HistoryNodeData>, userId: string): Promise<ResourceSaveResult | null> {
        if (!data.youtube_url) return null;

        const playlistId = extractPlaylistId(data.youtube_url);
        if (!playlistId) return null;

        // 1. Fetch Playlist Info AND Videos
        const playlistInfo = await fetchPlaylistInfo(playlistId);
        const videos = await fetchPlaylistVideos(playlistId);

        // 2. Create a Folder (type: 'general') in learning_resources
        console.log('🔵 [PlaylistHandler] Creating folder with type: general');
        const { data: folderResource, error: folderError } = await supabase
            .from(RESOURCE_TABLE)
            .insert({
                title: data.title || playlistInfo.title,
                type: 'general', // 폴더는 'general' 타입
                category_id: data.linked_category_id || null, // 부모 폴더 ID
                user_id: userId,
                description: `YouTube Playlist: ${playlistInfo.title}`,
                image_url: playlistInfo.thumbnail,
                metadata: {
                    source: 'youtube_playlist',
                    playlist_id: playlistId,
                    thumbnail_url: playlistInfo.thumbnail
                }
            })
            .select()
            .single();

        if (folderError) {
            console.error('Error creating playlist folder:', folderError);
            throw folderError;
        }

        if (!folderResource) throw new Error('Failed to create folder');

        console.log('✅ [PlaylistHandler] Folder created:', {
            id: folderResource.id,
            type: folderResource.type,
            title: folderResource.title
        });

        // 3. Batch Insert Videos into the Folder
        if (videos && videos.length > 0) {
            console.log(`🔵 [PlaylistHandler] Inserting ${videos.length} videos into folder ${folderResource.id}`);
            const videoInserts = videos.map(video => ({
                title: video.title,
                description: video.description || '',
                image_url: video.thumbnail,
                url: `https://www.youtube.com/watch?v=${video.id}`,
                type: 'video',
                category_id: folderResource.id, // 폴더의 ID를 부모로 설정
                user_id: userId,
                metadata: {
                    youtube_video_id: video.id,
                    duration: 0, // Duration not available in snippet
                    is_public: true,
                    original_playlist_id: playlistId // Optional: keep track of source
                }
            }));

            const { error: vidError } = await supabase
                .from(RESOURCE_TABLE)
                .insert(videoInserts);

            if (vidError) {
                console.error('Error inserting playlist videos:', vidError);
                // Non-fatal? Or should we rollback? For now, throw.
                throw vidError;
            }

            console.log(`✅ [PlaylistHandler] ${videos.length} videos inserted successfully`);
        }

        // 4. Return the folder resource info
        console.log('✅ [PlaylistHandler] Returning folder resource:', {
            resourceId: folderResource.id,
            resourceType: 'general'
        });
        return {
            resourceId: folderResource.id,
            resourceType: 'general' // 폴더 타입
        };
    }

    async delete(id: string) {
        // If it's a category, we delete from learning_categories
        // Cascading delete should handle resources if configured, otherwise we manually delete resources first.
        // Assuming Postgres FK constraint with ON DELETE CASCADE exists for resources.
        const { error } = await supabase.from('learning_categories').delete().eq('id', id);
        if (error) throw error;
    }
}

export class VideoHandler implements ResourceHandler {
    match(url: string, _category: string): boolean {
        return !!extractVideoId(url) && !extractPlaylistId(url);
    }

    async save(data: Partial<HistoryNodeData>, userId: string): Promise<ResourceSaveResult | null> {
        if (!data.youtube_url) return null;

        const videoId = extractVideoId(data.youtube_url);
        if (!videoId) return null;

        // 1. Fetch Video Info
        const videoInfo = await fetchVideoDetails(videoId);
        const title = data.title || videoInfo?.title || 'Untitled Video';
        const description = data.description || videoInfo?.description || '';

        // 2. Prepare Metadata
        const metadata = {
            youtube_video_id: videoId,
            duration: 0, // Duration not available in snippet
            is_public: true
        };

        if (data.linked_video_id) {
            // UPDATE existing
            const { data: updated, error } = await supabase
                .from(RESOURCE_TABLE)
                .update({
                    title: title,
                    description: description,
                    image_url: videoInfo?.thumbnail || null,
                    url: data.youtube_url,
                    updated_at: new Date().toISOString(),
                    // Don't overwrite metadata completely, merge it? Or replace?
                    // For now simple replace or merge if we fetched existing.
                    // Let's assume metadata update is safe.
                    metadata: metadata
                })
                .eq('id', data.linked_video_id)
                .select()
                .single();

            if (error) throw error;
            return { resourceId: updated.id, resourceType: 'video' };
        } else {
            // INSERT new
            const { data: saved, error } = await supabase
                .from(RESOURCE_TABLE)
                .insert({
                    title: title,
                    description: description,
                    image_url: videoInfo?.thumbnail || null, // Fixed: thumbnailUrl -> thumbnail
                    url: data.youtube_url,
                    type: 'video',
                    category_id: data.linked_category_id,
                    user_id: userId,
                    metadata: metadata
                })
                .select()
                .single();

            if (error) throw error;
            return { resourceId: saved.id, resourceType: 'video' };
        }
    }

    async delete(id: string) {
        const { error } = await supabase.from(RESOURCE_TABLE).delete().eq('id', id);
        if (error) throw error;
    }
}

export class DocumentHandler implements ResourceHandler {
    match(url: string, category: string): boolean {
        // 🔥 BLOCKER: Prevent DocumentHandler from stealing explicit container types
        if (category === 'canvas' || category === 'general' || category === 'folder') return false;

        if (!url) return true;
        return !url.includes('youtube.com') && !url.includes('youtu.be');
    }

    async save(data: Partial<HistoryNodeData>, userId: string): Promise<ResourceSaveResult | null> {
        const isPerson = data.category === 'person';
        const type = isPerson ? 'person' : 'document';

        // Check if we are updating an existing document/person based on ID
        const linkedId = data.linked_document_id;

        if (linkedId) {
            // UPDATE
            const { data: updated, error } = await supabase
                .from(RESOURCE_TABLE)
                .update({
                    title: data.title || 'Untitled Document',
                    description: data.description,
                    url: data.youtube_url || data.url || null,
                    category_id: data.linked_category_id, // Update category if changed? Or keep? Let's update.
                    image_url: data.image_url || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', linkedId)
                .select()
                .single();

            if (error) throw error;
            return {
                resourceId: updated.id,
                resourceType: isPerson ? 'person' : 'document'
            };
        } else {
            // INSERT
            const { data: saved, error } = await supabase
                .from(RESOURCE_TABLE)
                .insert({
                    title: data.title || 'Untitled Document',
                    description: data.description, // Mapped from description/content
                    url: data.youtube_url || data.url || null,
                    category_id: data.linked_category_id,
                    user_id: userId,
                    image_url: data.image_url || null,
                    type: type, // Explicit type!
                    metadata: {} // Empty metadata for now
                })
                .select()
                .single();

            if (error) throw error;

            return {
                resourceId: saved.id,
                resourceType: isPerson ? 'person' : 'document'
            };
        }
    }

    async delete(id: string) {
        const { error } = await supabase.from(RESOURCE_TABLE).delete().eq('id', id);
        if (error) throw error;
    }
}

export class CategoryHandler implements ResourceHandler {
    match(_url: string, category: string): boolean {
        return category === 'general' || category === 'folder' || category === 'canvas';
    }

    async save(data: Partial<HistoryNodeData>, userId: string): Promise<ResourceSaveResult | null> {
        // Check if we are updating existing
        const linkedId = data.linked_category_id;

        // Determine type based on category input
        const isCanvas = data.category === 'canvas';
        // ⚠️ SAFEST APPROACH: Use 'general' type (DB might restrict values) but differentiate via metadata
        const resourceType = 'general';
        const metadata = isCanvas ? { subtype: 'canvas' } : {};

        const insertData = {
            title: data.title || (isCanvas ? 'New Canvas' : 'New Folder'),
            description: data.description,
            type: resourceType,
            user_id: userId,
            image_url: data.image_url || null,
            category_id: (data as any).category_id || (data as any).linked_category_id || null, // Parent Folder
            is_unclassified: (data as any).is_unclassified ?? true, // Default to true if not specified
            metadata: metadata
        };

        if (linkedId) {
            const { data: updated, error } = await supabase
                .from(RESOURCE_TABLE)
                .update({
                    title: data.title,
                    description: data.description,
                    image_url: data.image_url,
                    type: resourceType,
                    metadata: metadata, // Update metadata
                    updated_at: new Date().toISOString()
                })
                .eq('id', linkedId)
                .select()
                .single();

            if (error) throw error;
            // Return 'canvas' resourceType so frontend logic handles it correctly, even if DB says 'general'
            return { resourceId: updated.id, resourceType: isCanvas ? 'canvas' : 'general' };
        } else {
            // INSERT
            const { data: saved, error } = await supabase
                .from(RESOURCE_TABLE)
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;
            return { resourceId: saved.id, resourceType: isCanvas ? 'canvas' : 'general' };
        }
    }
}

export const resourceHandlers: ResourceHandler[] = [
    new CategoryHandler(), // Check categories first
    new PlaylistHandler(),
    new VideoHandler(),
    new DocumentHandler()
];

export const findHandler = (url: string | undefined | null, category: string): ResourceHandler | undefined => {
    const safeUrl = url || '';
    console.log('🔍 [findHandler] Searching handler for:', { url: safeUrl, category });

    for (const handler of resourceHandlers) {
        const matches = handler.match(safeUrl, category);
        console.log(`  ${matches ? '✅' : '❌'} ${handler.constructor.name}: ${matches}`);
        if (matches) {
            console.log(`🎯 [findHandler] Selected: ${handler.constructor.name}`);
            return handler;
        }
    }

    console.log('❌ [findHandler] No handler found');
    return undefined;
};
