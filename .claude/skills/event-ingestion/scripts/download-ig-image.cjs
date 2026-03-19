const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadIgImage(profileUrl, postUrlPart, outputPath) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    console.log(`Navigating to profile: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    console.log(`Looking for post containing: ${postUrlPart}`);
    const postLink = await page.$(`a[href*="${postUrlPart}"]`);

    if (!postLink) {
        // Try scrolling
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
    }

    const postLink2 = await page.$(`a[href*="${postUrlPart}"]`);
    if (!postLink2) {
        console.error('Could not find the post on the profile page.');
        await browser.close();
        return false;
    }

    console.log('Found post, clicking...');
    await postLink2.click();
    await page.waitForTimeout(4000);

    console.log('Looking for high-res images...');
    // In the dialog, look for images that are not tiny profile pics.
    const images = await page.$$eval('img', imgs => imgs.map(i => i.src));

    // Filter scontent images, avoid s150x150, trying to get the large one
    const validImages = images.filter(src => src.includes('scontent') && !src.includes('150x150') && !src.includes('s150x150'));

    if (validImages.length === 0) {
        console.error('No suitable high-res image found.');
        await browser.close();
        return false;
    }

    // Usually the largest image or the last one in the main view is the post image.
    // Let's take the first valid image that looks like a post (often 1080x1080 or large).
    const imageUrl = validImages[validImages.length - 1]; // Often the first valid is profile, subsequent is post. Or we can just grab the dialog image.

    console.log(`Found image URL: ${imageUrl}`);

    // Download image
    const file = fs.createWriteStream(outputPath);
    https.get(imageUrl, function (response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close();  // close() is async, call cb after close completes.
            console.log(`Downloaded successfully to ${outputPath}`);
        });
    }).on('error', function (err) {
        fs.unlink(outputPath, () => { });
        console.error('Error downloading:', err.message);
    });

    await browser.close();
    return true;
}

const run = async () => {
    // 1. Swing Friends
    await downloadIgImage('https://www.instagram.com/swing_friends_busan/', 'DVXXtOcyM2U', 'public/scraped/swingfriends_260307_poster.png');
    // 2. Happy Hall
    await downloadIgImage('https://www.instagram.com/happyhall2004/', 'DVX-8HuvM4X', 'public/scraped/happyhall_260306_poster.png');
    // 3. Savoy (already got it, but let's make sure it's the right one just in case)
    await downloadIgImage('https://www.instagram.com/savoy_seoul/', 'DVX3_UWSV_o', 'public/scraped/savoy_260305_poster.png');
};

run().catch(console.error);
