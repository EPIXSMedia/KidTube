const CACHE_NAME = 'youtube-kids-v12';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'css/styles.css',
    'js/app.js',
    'js/player.js',
    'js/videos.js',
    'js/parental.js',
    'manifest.json',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png'
];

// Install: cache all app shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for app shell
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Always go to network for YouTube API and embeds
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('youtube.com') ||
        url.hostname.includes('ytimg.com') ||
        url.hostname.includes('google.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache-first for app shell
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        })
    );
});
