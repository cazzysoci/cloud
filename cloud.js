const { chromium } = require('playwright');
const playwrightStealth = require('playwright-extra').stealth;

module.exports = async function ModernCloudflareBypass(proxy, uagent, target, callback) {
    // Configure launch options for a real browser context
    const launchOptions = {
        headless: true,
        proxy: proxy ? { server: proxy } : undefined, // Handle case where proxy might be null/undefined
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            `--user-agent=${uagent}`
        ].filter(Boolean) // Remove any undefined values
    };

    const browser = await chromium.launch(launchOptions);
    
    try {
        // Create a new browser context
        const context = await browser.newContext({
            userAgent: uagent,
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US'
        });
        
        // Apply stealth evasions to the context
        await playwrightStealth(context);
        
        // Grant permissions that look human
        await context.grantPermissions(['geolocation']);
        
        // Set extra HTTP headers to mimic a real browser
        await context.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1',
        });

        const page = await context.newPage();
        
        // Add random delays to mimic human behavior
        await page.waitForTimeout(Math.random() * 2000 + 1000);
        
        // Navigate to the target URL
        const response = await page.goto(target, {
            waitUntil: 'domcontentloaded',
            timeout: 60000 // 60 second timeout
        });

        if (!response) {
            throw new Error('No response received from the server');
        }

        // Check if we were successful or got blocked
        const status = response.status();
        const finalUrl = page.url();
        const pageContent = await page.content();

        // Check for various Cloudflare challenge indicators
        const isCloudflareChallenge = status === 403 || 
                                    status === 503 ||
                                    /cloudflare.*(block|captcha|challenge|security|access denied)/i.test(pageContent) ||
                                    /cf[-_]browser[-_]verification/i.test(pageContent) ||
                                    await page.$('#challenge-form, .challenge-form, #trk_jschal_js, .cf-challenge') !== null;

        if (isCloudflareChallenge) {
            console.warn('[ModernCloudflareBypass]: Cloudflare challenge detected. Attempting to solve...');
            
            try {
                // Wait for challenge to load and attempt to solve
                await page.waitForSelector('input[type="checkbox"][name="cf_captcha_kind"], #challenge-success, .success', { 
                    timeout: 30000 
                });
                
                // Try to find and click the verify button
                const verifyButton = await page.$('input[type="submit"][value*="Verify"], button[type*="submit"]');
                if (verifyButton) {
                    await verifyButton.click();
                }
                
                // Wait for navigation or challenge completion
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 })
                          .catch(() => console.log('Navigation timeout, but might still be successful'));
                
                // Check if challenge was solved
                const currentContent = await page.content();
                if (/challenge|captcha|cloudflare/i.test(currentContent)) {
                    throw new Error('Challenge still present after attempted solve');
                }
                
            } catch (solveError) {
                console.error('[ModernCloudflareBypass]: Failed to solve challenge automatically:', solveError.message);
                await browser.close();
                return callback(null);
            }
        }

        // Get the cookies from the browser context
        const cookies = await context.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        console.log('[ModernCloudflareBypass]: Successfully obtained cookies');
        await browser.close();
        callback(cookieString);

    } catch (error) {
        console.error('[ModernCloudflareBypass]: Critical error during bypass attempt:', error.message);
        await browser.close();
        callback(null);
    }
};
