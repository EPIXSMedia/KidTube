/* ========================================
   KidTube - Video Fetching & Category Logic
   Uses Piped API (no API key needed)
   ======================================== */

const VideoManager = (() => {
    // Category definitions with search queries
    // Queries use {lang} placeholder replaced at runtime with selected language
    const CATEGORIES = {
        'indian-kids': {
            name: 'Kids Videos',
            queries: [
                '{lang} kids rhymes shorts',
                '{lang} nursery rhymes for children shorts',
                '{lang} cartoon for kids shorts',
                '{lang} kids songs shorts',
                'kids fun videos shorts {lang}',
                'children entertainment {lang} shorts'
            ]
        },
        'devotional': {
            name: 'Devotional',
            queries: [
                '{lang} devotional songs for kids shorts',
                'bhajan for children {lang} shorts',
                'kids aarti {lang} shorts',
                'devotional stories for kids {lang} shorts',
                '{lang} kids prayer songs shorts',
                'god stories for children {lang} shorts'
            ]
        },
        'good-habits': {
            name: 'Good Habits',
            queries: [
                'good habits for kids {lang} shorts',
                'good manners children animation {lang} shorts',
                'kids moral stories {lang} shorts',
                'healthy habits for children {lang} shorts',
                'kids hygiene tips {lang} shorts',
                'children discipline {lang} shorts'
            ]
        },
        'kids-arts': {
            name: 'Arts & Crafts',
            queries: [
                'kids art and craft shorts',
                'easy drawing for kids shorts',
                'kids painting tutorial shorts',
                'paper craft for children shorts',
                'origami for kids shorts',
                'kids DIY craft ideas shorts'
            ]
        },
        'kids-knowledge': {
            name: 'Knowledge',
            queries: [
                'kids general knowledge {lang} shorts',
                'fun facts for children {lang} shorts',
                'learn alphabets numbers {lang} shorts',
                'kids educational videos {lang} shorts',
                'amazing facts for kids {lang} shorts',
                'GK quiz for kids {lang} shorts'
            ]
        },
        'nursery-rhymes': {
            name: 'Nursery Rhymes',
            queries: [
                '{lang} nursery rhymes shorts',
                '{lang} kids poems shorts',
                '{lang} baby songs shorts',
                'twinkle twinkle {lang} shorts',
                '{lang} rhymes for toddlers shorts',
                'abc song {lang} kids shorts'
            ]
        },
        'moral-stories': {
            name: 'Moral Stories',
            queries: [
                '{lang} moral stories for kids shorts',
                '{lang} panchatantra stories shorts',
                '{lang} bedtime stories kids shorts',
                'kids animated stories {lang} shorts',
                '{lang} fairy tales children shorts',
                'aesop fables {lang} kids shorts'
            ]
        },
        'math-learning': {
            name: 'Math',
            queries: [
                'kids math learning {lang} shorts',
                'counting for kids {lang} shorts',
                'math tricks kids shorts',
                'learn numbers {lang} children shorts',
                'fun math for kids shorts',
                'addition subtraction kids {lang} shorts'
            ]
        },
        'science-fun': {
            name: 'Science',
            queries: [
                'kids science experiments shorts',
                'fun science for kids {lang} shorts',
                'science facts children shorts',
                'how things work kids shorts',
                'easy science experiments shorts',
                'kids science {lang} shorts'
            ]
        },
        'yoga-kids': {
            name: 'Yoga & Exercise',
            queries: [
                'kids yoga shorts',
                'yoga for children shorts',
                'kids exercise shorts',
                'morning exercise kids shorts',
                'kids fitness fun shorts',
                'stretching for kids shorts'
            ]
        },
        'cooking-kids': {
            name: 'Cooking',
            queries: [
                'kids cooking {lang} shorts',
                'easy recipes for kids shorts',
                'kids kitchen fun shorts',
                'cooking with kids shorts',
                'healthy snacks kids shorts',
                'simple cooking children shorts'
            ]
        },
        'animal-facts': {
            name: 'Animals',
            queries: [
                'animal facts for kids shorts',
                'wild animals for children shorts',
                'kids animal videos {lang} shorts',
                'cute animals kids shorts',
                'learn about animals kids shorts',
                'zoo animals for children shorts'
            ]
        },
        'space-facts': {
            name: 'Space',
            queries: [
                'space facts for kids shorts',
                'planets for children shorts',
                'solar system kids shorts',
                'kids space exploration shorts',
                'astronomy for kids shorts',
                'universe facts children shorts'
            ]
        }
    };

    // Piped API instances — tried in order, auto-rotates on failure
    const PIPED_INSTANCES = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.r4fo.com',
        'https://pipedapi.adminforge.de'
    ];
    let currentInstanceIndex = 0;

    let videoCache = {};  // categoryId -> video[]
    let pageTokens = {};  // categoryId -> nextPageToken (Piped nextpage)
    let lastError = null; // Track last API error for UI

    function getLastError() {
        return lastError;
    }

    function clearLastError() {
        lastError = null;
    }

    function getCategories() {
        return CATEGORIES;
    }

    function getCategoryName(categoryId) {
        return CATEGORIES[categoryId]?.name || categoryId;
    }

    // Pick a random language from enabled languages for query diversity
    function getRandomLanguage() {
        if (typeof ParentalControls !== 'undefined') {
            const langs = ParentalControls.getEnabledLanguages();
            if (langs.length > 0) {
                return langs[Math.floor(Math.random() * langs.length)];
            }
        }
        return 'english';
    }

    // Replace {lang} placeholder in query with actual language
    function buildQuery(template) {
        const lang = getRandomLanguage();
        return template.replace(/\{lang\}/g, lang);
    }

    // Create a timeout signal (fallback for older browsers without AbortSignal.timeout)
    function createTimeoutSignal(ms) {
        if (typeof AbortSignal.timeout === 'function') {
            return AbortSignal.timeout(ms);
        }
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    }

    // Extract video ID from Piped URL like "/watch?v=abc123"
    function extractVideoId(url) {
        if (!url) return null;
        const match = url.match(/[?&]v=([^&]+)/);
        return match ? match[1] : null;
    }

    // Fetch videos for a category using Piped API (no API key needed)
    // Tries multiple Piped instances for reliability
    async function fetchVideos(categoryId, loadMore = false) {
        const category = CATEGORIES[categoryId];
        if (!category) throw new Error('Invalid category');

        // Return cached videos if available and not loading more
        if (!loadMore && videoCache[categoryId] && videoCache[categoryId].length > 0) {
            return videoCache[categoryId];
        }

        const queryTemplate = category.queries[Math.floor(Math.random() * category.queries.length)];
        const query = buildQuery(queryTemplate);
        const nextpage = loadMore ? (pageTokens[categoryId] || '') : '';

        let lastErr = null;

        // Try each Piped instance until one works
        for (let i = 0; i < PIPED_INSTANCES.length; i++) {
            const instanceIdx = (currentInstanceIndex + i) % PIPED_INSTANCES.length;
            const instance = PIPED_INSTANCES[instanceIdx];

            let url;
            if (loadMore && nextpage) {
                url = `${instance}/nextpage/search?q=${encodeURIComponent(query)}&filter=videos&nextpage=${encodeURIComponent(nextpage)}`;
            } else {
                url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
            }

            try {
                const response = await fetch(url, { signal: createTimeoutSignal(8000) });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                // Remember which instance worked
                currentInstanceIndex = instanceIdx;
                lastError = null;

                // Save pagination token
                pageTokens[categoryId] = data.nextpage || '';

                // Map Piped items to our video format
                const videos = (data.items || [])
                    .filter(item => {
                        const videoId = extractVideoId(item.url);
                        if (!videoId) return false;
                        // Accept shorts (isShort flag) or short videos (< 4 min)
                        if (item.isShort) return true;
                        if (item.duration > 0 && item.duration <= 240) return true;
                        return false;
                    })
                    .map(item => ({
                        id: extractVideoId(item.url),
                        title: item.title || '',
                        channel: item.uploaderName || '',
                        thumbnail: item.thumbnail || '',
                        categoryId: categoryId
                    }));

                if (!videoCache[categoryId]) {
                    videoCache[categoryId] = [];
                }

                if (loadMore) {
                    videoCache[categoryId] = [...videoCache[categoryId], ...videos];
                } else {
                    videoCache[categoryId] = videos;
                }

                return videoCache[categoryId];
            } catch (err) {
                console.warn(`Piped instance ${instance} failed:`, err.message);
                lastErr = err;
                continue; // try next instance
            }
        }

        // All instances failed
        console.error('All Piped instances failed:', lastErr);
        lastError = { type: 'server', message: lastErr?.message || 'All video sources unavailable' };
        const err = new Error('All video sources are currently unavailable');
        err.errorType = 'server';
        throw err;
    }

    // Get cached videos for a category
    function getCachedVideos(categoryId) {
        return videoCache[categoryId] || [];
    }

    // Clear cache for a category or all
    function clearCache(categoryId) {
        if (categoryId) {
            videoCache[categoryId] = [];
            pageTokens[categoryId] = '';
        } else {
            videoCache = {};
            pageTokens = {};
        }
    }

    return {
        getCategories,
        getCategoryName,
        fetchVideos,
        getCachedVideos,
        clearCache,
        getLastError,
        clearLastError
    };
})();
