import { chromium } from 'playwright';

async function scrapeArticle(articleId) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = `https://cafe.naver.com/f-e/cafes/10342583/articles/${articleId}`;

    try {
        await page.goto(url, { waitUntil: 'networkidle' });

        // Wait for iframe
        const frameHandle = await page.waitForSelector('#cafe_main');
        const frame = await frameHandle.contentFrame();

        if (!frame) {
            console.error('Could not find cafe_main iframe');
            await browser.close();
            return;
        }

        // Wait for content (Naver Cafe detail content)
        await frame.waitForSelector('.article_viewer', { timeout: 10000 });

        const data = await frame.evaluate(() => {
            const title = document.querySelector('.title_text')?.innerText || '';
            const date = document.querySelector('.article_info .date')?.innerText || '';
            const content = document.querySelector('.article_viewer')?.innerText || '';
            // Get all images in the viewer
            const images = Array.from(document.querySelectorAll('.article_viewer img'))
                .map(img => img.src)
                .filter(src => src.startsWith('http') && !src.includes('static.naver.net')); // Avoid static naver icons

            return { title, date, content, images };
        });

        console.log(JSON.stringify(data, null, 2));

    } catch (e) {
        console.error('Error during scraping:', e);
    } finally {
        await browser.close();
    }
}

const articleId = process.argv[2];
if (!articleId) {
    console.error('Please provide an articleId');
    process.exit(1);
}

scrapeArticle(articleId);
