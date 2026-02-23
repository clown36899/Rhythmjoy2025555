import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactDir = '/Users/inteyeo/.gemini/antigravity/brain/2e20fe6f-18ba-4c74-abf6-387ca4f7f0bb';
const outputDir = path.join(__dirname, 'public/default-thumbnails');

// 출력 디렉토리 생성
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = {
    micro: 100,
    thumbnail: 400,
    medium: 1080
};

async function processImage(inputPath, baseName) {
    console.log(`Processing ${baseName}...`);

    for (const [sizeName, width] of Object.entries(sizes)) {
        const outputPath = path.join(outputDir, `${baseName}_${sizeName}.webp`);

        await sharp(inputPath)
            .resize(width, null, {
                fit: 'inside',
                withoutEnlargement: false
            })
            .webp({ quality: 85 })
            .toFile(outputPath);

        console.log(`✓ Created ${baseName}_${sizeName}.webp (${width}px)`);
    }
}

async function main() {
    try {
        // Single default image
        const defaultPath = path.join(artifactDir, 'default_simple_pattern_1765745636528.png');
        if (fs.existsSync(defaultPath)) {
            await processImage(defaultPath, 'default');
        } else {
            console.error('Default image not found!');
            return;
        }

        console.log('\n✅ All thumbnails generated successfully!');
        console.log(`Output directory: ${outputDir}`);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
