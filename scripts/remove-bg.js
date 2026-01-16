
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputPath = path.resolve('public/icons/guest_class_icon_v4_raw.jpg');
const outputPath = path.resolve('public/icons/guest_class_icon_v4.png');

async function processImage() {
    try {
        const { data, info } = await sharp(inputPath)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixelArray = new Uint8ClampedArray(data.buffer);
        const threshold = 240; // Whiteness threshold

        for (let i = 0; i < pixelArray.length; i += 4) {
            const r = pixelArray[i];
            const g = pixelArray[i + 1];
            const b = pixelArray[i + 2];

            // If pixel is white-ish, make it transparent
            if (r > threshold && g > threshold && b > threshold) {
                pixelArray[i + 3] = 0; // Alpha = 0
            }
        }

        await sharp(pixelArray, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        })
            .png()
            .toFile(outputPath);

        console.log('Background removed successfully:', outputPath);
    } catch (err) {
        console.error('Error processing image:', err);
    }
}

processImage();
