import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';

const SCRAPED_DIR = path.join(process.cwd(), 'public/scraped');

const MIME: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

export const handler: Handler = async (event) => {
    const file = event.queryStringParameters?.file;

    if (!file || file.includes('..') || file.includes('/')) {
        return { statusCode: 400, body: 'bad request' };
    }

    const filePath = path.join(SCRAPED_DIR, file);

    if (!fs.existsSync(filePath)) {
        return { statusCode: 404, body: 'not found' };
    }

    const ext = path.extname(file).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
        },
        isBase64Encoded: true,
        body: data.toString('base64'),
    };
};
