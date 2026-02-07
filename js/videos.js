/* ========================================
   KidTube - Video Fetching & Category Logic
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

    let apiKey = '';
    let videoCache = {};  // categoryId -> video[]
    let pageTokens = {};  // categoryId -> nextPageToken

    function setApiKey(key) {
        apiKey = key;
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

    // Fetch videos for a category from YouTube API
    async function fetchVideos(categoryId, loadMore = false) {
        if (!apiKey) throw new Error('API key not set');

        const category = CATEGORIES[categoryId];
        if (!category) throw new Error('Invalid category');

        // Return cached videos if available and not loading more
        if (!loadMore && videoCache[categoryId] && videoCache[categoryId].length > 0) {
            return videoCache[categoryId];
        }

        // Pick a random query from the category and fill in language
        const queryTemplate = category.queries[Math.floor(Math.random() * category.queries.length)];
        const query = buildQuery(queryTemplate);
        const pageToken = loadMore ? (pageTokens[categoryId] || '') : '';

        const params = new URLSearchParams({
            part: 'snippet',
            q: query,
            type: 'video',
            videoDuration: 'short',       // Only short videos (< 4 min)
            videoEmbeddable: 'true',      // Only videos that allow embedding
            safeSearch: 'strict',          // Kid-safe content
            maxResults: '15',
            order: 'relevance',
            key: apiKey
        });

        if (pageToken) {
            params.set('pageToken', pageToken);
        }

        const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || 'API request failed');
            }

            const data = await response.json();
            pageTokens[categoryId] = data.nextPageToken || '';

            const videos = data.items
                .filter(item => item.id?.videoId)
                .map(item => ({
                    id: item.id.videoId,
                    title: decodeHTMLEntities(item.snippet.title),
                    channel: item.snippet.channelTitle,
                    thumbnail: item.snippet.thumbnails?.high?.url ||
                               item.snippet.thumbnails?.medium?.url ||
                               item.snippet.thumbnails?.default?.url,
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
            console.error('Failed to fetch videos:', err);
            throw err;
        }
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

    // Decode HTML entities in titles (reuse single element)
    const _decodeEl = document.createElement('textarea');
    function decodeHTMLEntities(text) {
        _decodeEl.innerHTML = text;
        return _decodeEl.value;
    }

    return {
        setApiKey,
        getCategories,
        getCategoryName,
        fetchVideos,
        getCachedVideos,
        clearCache
    };
})();
