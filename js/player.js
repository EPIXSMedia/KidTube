/* ========================================
   YouTube Shorts - Player Management
   Handles iframe embedding, autoplay,
   preloading, and vertical swipe/scroll
   ======================================== */

const PlayerManager = (() => {
    let currentVideoIndex = 0;
    let videos = [];
    let isMuted = true;  // Start muted (browsers require muted autoplay)
    let isTransitioning = false;
    let onVideoChangeCallback = null;
    let onNeedMoreVideosCallback = null;

    // Preload cache: index → iframe element
    const preloaded = new Map();
    const MAX_PRELOAD = 2; // preload next 2 videos

    // Touch/swipe tracking
    let touchStartY = 0;
    let touchDeltaY = 0;
    let isSwiping = false;
    const SWIPE_THRESHOLD = 80;

    const feed = () => document.getElementById('video-feed');

    // Hidden container for preloading iframes off-screen
    function getPreloadContainer() {
        let container = document.getElementById('preload-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'preload-container';
            container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
            document.body.appendChild(container);
        }
        return container;
    }

    // Build a clean embed URL
    function buildEmbedUrl(videoId, autoplay = true) {
        const params = new URLSearchParams({
            autoplay: autoplay ? '1' : '0',
            mute: isMuted ? '1' : '0',
            rel: '0',
            modestbranding: '1',
            playsinline: '1',
            iv_load_policy: '3',
            disablekb: '1',
            fs: '0',
            cc_load_policy: '0',
            showinfo: '0',
            enablejsapi: '1'
        });
        return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
    }

    function init(options = {}) {
        onVideoChangeCallback = options.onVideoChange || null;
        onNeedMoreVideosCallback = options.onNeedMoreVideos || null;
        setupTouchListeners();
        setupKeyboardListeners();
        setupNavButtons();
        setupAutoAdvance();
    }

    function setVideos(videoList, startIndex = 0) {
        // Clear old preloads
        clearPreloads();
        videos = videoList;
        currentVideoIndex = startIndex;
        if (videos.length > 0) {
            loadVideo(currentVideoIndex);
        }
    }

    function createIframe(videoId, autoplay = true) {
        const iframe = document.createElement('iframe');
        iframe.src = buildEmbedUrl(videoId, autoplay);
        iframe.allow = 'autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');

        // Tell YouTube iframe we want state change events
        iframe.addEventListener('load', () => {
            try {
                iframe.contentWindow.postMessage(JSON.stringify({
                    event: 'listening',
                    id: 1,
                    channel: 'widget'
                }), '*');
            } catch (e) {}
        });

        return iframe;
    }

    // Preload upcoming videos off-screen so they buffer ahead of time
    function preloadUpcoming() {
        const container = getPreloadContainer();

        for (let i = 1; i <= MAX_PRELOAD; i++) {
            const nextIdx = currentVideoIndex + i;
            if (nextIdx < videos.length && !preloaded.has(nextIdx)) {
                const video = videos[nextIdx];
                // Create iframe with autoplay OFF so it just buffers
                const iframe = createIframe(video.id, false);
                iframe.dataset.videoIndex = nextIdx;
                container.appendChild(iframe);
                preloaded.set(nextIdx, iframe);
            }
        }

        // Also preload previous if available
        const prevIdx = currentVideoIndex - 1;
        if (prevIdx >= 0 && !preloaded.has(prevIdx)) {
            const video = videos[prevIdx];
            const iframe = createIframe(video.id, false);
            iframe.dataset.videoIndex = prevIdx;
            container.appendChild(iframe);
            preloaded.set(prevIdx, iframe);
        }

        // Clean up preloads that are far away (keep only nearby)
        for (const [idx, iframe] of preloaded) {
            if (Math.abs(idx - currentVideoIndex) > MAX_PRELOAD + 1) {
                iframe.remove();
                preloaded.delete(idx);
            }
        }
    }

    function clearPreloads() {
        for (const [, iframe] of preloaded) {
            iframe.remove();
        }
        preloaded.clear();
    }

    function loadVideo(index) {
        if (index < 0 || index >= videos.length || isTransitioning) return;

        const video = videos[index];
        const feedEl = feed();

        // Create the video slide
        const slide = document.createElement('div');
        slide.className = 'video-slide slide-center';
        slide.id = 'current-slide';

        // Loading state
        const loading = document.createElement('div');
        loading.className = 'video-loading';
        loading.innerHTML = '<div class="loader"></div><p>Loading...</p>';
        slide.appendChild(loading);

        const iframe = createIframe(video.id);

        iframe.onload = () => {
            setTimeout(() => {
                if (loading.parentNode) {
                    loading.remove();
                }
            }, 300);
        };

        slide.appendChild(iframe);

        // Remove old slides
        const oldSlide = feedEl.querySelector('#current-slide');
        if (oldSlide) {
            oldSlide.remove();
        }

        feedEl.appendChild(slide);
        currentVideoIndex = index;

        if (onVideoChangeCallback) {
            onVideoChangeCallback(video, index, videos.length);
        }

        if (index >= videos.length - 3 && onNeedMoreVideosCallback) {
            onNeedMoreVideosCallback();
        }

        // Preload next videos after current one starts
        setTimeout(() => preloadUpcoming(), 500);
    }

    function navigateToVideo(newIndex, direction) {
        if (isTransitioning || newIndex < 0 || newIndex >= videos.length) return;
        if (newIndex === currentVideoIndex) return;

        isTransitioning = true;

        const feedEl = feed();
        const oldSlide = feedEl.querySelector('#current-slide');
        const video = videos[newIndex];

        // Create new slide off-screen
        const newSlide = document.createElement('div');
        newSlide.className = `video-slide ${direction === 'up' ? 'slide-down' : 'slide-up'}`;
        newSlide.id = 'new-slide';

        let iframe;

        // Check if we have a preloaded iframe for this video
        if (preloaded.has(newIndex)) {
            iframe = preloaded.get(newIndex);
            iframe.remove(); // Remove from preload container
            preloaded.delete(newIndex);
            // Switch to autoplay URL so it starts playing
            iframe.src = buildEmbedUrl(video.id, true);
        } else {
            iframe = createIframe(video.id);
        }

        newSlide.appendChild(iframe);
        feedEl.appendChild(newSlide);

        // Trigger animation
        requestAnimationFrame(() => {
            if (oldSlide) {
                oldSlide.className = `video-slide ${direction === 'up' ? 'slide-up' : 'slide-down'}`;
            }
            newSlide.className = 'video-slide slide-center';

            setTimeout(() => {
                if (oldSlide) oldSlide.remove();
                newSlide.id = 'current-slide';
                currentVideoIndex = newIndex;
                isTransitioning = false;

                if (onVideoChangeCallback) {
                    onVideoChangeCallback(video, newIndex, videos.length);
                }

                if (newIndex >= videos.length - 3 && onNeedMoreVideosCallback) {
                    onNeedMoreVideosCallback();
                }

                // Preload next batch
                preloadUpcoming();
            }, 300);
        });
    }

    function nextVideo() {
        if (currentVideoIndex < videos.length - 1) {
            navigateToVideo(currentVideoIndex + 1, 'up');
        }
    }

    function prevVideo() {
        if (currentVideoIndex > 0) {
            navigateToVideo(currentVideoIndex - 1, 'down');
        }
    }

    function toggleMute() {
        isMuted = !isMuted;
        // Clear preloads (they have old mute state)
        clearPreloads();
        // Reload current video with new mute state
        loadVideo(currentVideoIndex);
        return isMuted;
    }

    function getMuteState() {
        return isMuted;
    }

    function pausePlayback() {
        const feedEl = feed();
        const iframe = feedEl.querySelector('iframe');
        if (iframe) {
            iframe.src = '';
        }
    }

    function getCurrentIndex() {
        return currentVideoIndex;
    }

    function getVideoCount() {
        return videos.length;
    }

    // Touch/Swipe handling
    function setupTouchListeners() {
        const feedEl = feed();

        feedEl.addEventListener('touchstart', (e) => {
            if (isTransitioning) return;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }, { passive: true });

        feedEl.addEventListener('touchmove', (e) => {
            if (!isSwiping || isTransitioning) return;
            touchDeltaY = e.touches[0].clientY - touchStartY;
        }, { passive: true });

        feedEl.addEventListener('touchend', () => {
            if (!isSwiping || isTransitioning) return;
            isSwiping = false;

            if (Math.abs(touchDeltaY) > SWIPE_THRESHOLD) {
                if (touchDeltaY < 0) {
                    nextVideo();
                } else {
                    prevVideo();
                }
            }

            touchDeltaY = 0;
        }, { passive: true });
    }

    // Keyboard handling
    function setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (isTransitioning) return;

            switch (e.key) {
                case 'ArrowDown':
                case ' ':
                    e.preventDefault();
                    nextVideo();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    prevVideo();
                    break;
                case 'm':
                case 'M':
                    document.getElementById('mute-toggle')?.click();
                    break;
            }
        });
    }

    // Mouse wheel handling
    function setupScrollListener() {
        const feedEl = feed();
        let scrollTimeout;

        feedEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isTransitioning || scrollTimeout) return;

            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
            }, 600);

            if (e.deltaY > 0) {
                nextVideo();
            } else if (e.deltaY < 0) {
                prevVideo();
            }
        }, { passive: false });
    }

    // Nav button handling
    function setupNavButtons() {
        const upBtn = document.getElementById('nav-up');
        const downBtn = document.getElementById('nav-down');

        if (upBtn) {
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                prevVideo();
            });
        }

        if (downBtn) {
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                nextVideo();
            });
        }

        setupScrollListener();
    }

    // Auto-advance when YouTube video ends (state 0)
    function setupAutoAdvance() {
        window.addEventListener('message', (e) => {
            const currentIframe = feed().querySelector('#current-slide iframe');
            if (!currentIframe || e.source !== currentIframe.contentWindow) return;

            let data;
            try {
                data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            } catch (err) {
                return;
            }

            if (data.event === 'onStateChange' && data.info === 0) {
                setTimeout(() => nextVideo(), 500);
            }
        });
    }

    function updateNavButtons() {
        const upBtn = document.getElementById('nav-up');
        const downBtn = document.getElementById('nav-down');

        if (upBtn) {
            upBtn.classList.toggle('hidden', currentVideoIndex <= 0);
        }
        if (downBtn) {
            downBtn.classList.toggle('hidden', currentVideoIndex >= videos.length - 1);
        }
    }

    function destroy() {
        clearPreloads();
        const feedEl = feed();
        if (feedEl) feedEl.innerHTML = '';
        videos = [];
        currentVideoIndex = 0;
    }

    return {
        init,
        setVideos,
        loadVideo,
        nextVideo,
        prevVideo,
        toggleMute,
        getMuteState,
        pausePlayback,
        getCurrentIndex,
        getVideoCount,
        updateNavButtons,
        destroy
    };
})();
