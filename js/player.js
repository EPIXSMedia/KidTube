/* ========================================
   YouTube Shorts - Player Management
   Handles iframe embedding, autoplay,
   preloading, and vertical swipe/scroll
   ======================================== */

const PlayerManager = (() => {
    let currentVideoIndex = 0;
    let videos = [];
    let isMuted = true;
    let isTransitioning = false;
    let onVideoChangeCallback = null;
    let onNeedMoreVideosCallback = null;

    // Preload cache: index → { iframe, loaded }
    const preloaded = new Map();
    const MAX_PRELOAD = 3;

    // Touch/swipe tracking
    let touchStartY = 0;
    let touchDeltaY = 0;
    let isSwiping = false;
    const SWIPE_THRESHOLD = 80;

    const feed = () => document.getElementById('video-feed');

    // Hidden container — uses real dimensions so iframes fully load
    function getPreloadContainer() {
        let container = document.getElementById('preload-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'preload-container';
            container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;overflow:hidden;pointer-events:none;opacity:0;z-index:-1;';
            document.body.appendChild(container);
        }
        return container;
    }

    // Build embed URL — preloads always use autoplay=1, mute=1 so they buffer
    function buildEmbedUrl(videoId, forPreload = false) {
        const params = new URLSearchParams({
            autoplay: '1',
            mute: forPreload ? '1' : (isMuted ? '1' : '0'),
            rel: '0',
            modestbranding: '1',
            playsinline: '1',
            iv_load_policy: '3',
            disablekb: '1',
            fs: '0',
            cc_load_policy: '0',
            showinfo: '0',
            enablejsapi: '1',
            origin: window.location.origin
        });
        return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
    }

    // Send command to YouTube iframe via postMessage
    function postCommand(iframe, command, args) {
        if (!iframe || !iframe.contentWindow) return;
        const msg = JSON.stringify({
            event: 'command',
            func: command,
            args: args || []
        });
        try {
            iframe.contentWindow.postMessage(msg, 'https://www.youtube.com');
        } catch (e) {
            try { iframe.contentWindow.postMessage(msg, '*'); } catch (e2) {}
        }
    }

    // Retry a command multiple times — YouTube API may not be ready immediately
    function postCommandRetry(iframe, command, args, retries = 4, delay = 300) {
        postCommand(iframe, command, args);
        for (let i = 1; i <= retries; i++) {
            setTimeout(() => postCommand(iframe, command, args), delay * i);
        }
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
        clearPreloads();
        videos = videoList;
        currentVideoIndex = startIndex;
        if (videos.length > 0) {
            loadVideo(currentVideoIndex);
        }
    }

    // Update video list without reloading current video (for appending new videos)
    function updateVideos(videoList, currentIdx) {
        videos = videoList;
        currentVideoIndex = currentIdx;
        clearPreloads();
        preloadUpcoming();
    }

    function createIframe(videoId, forPreload = false) {
        const iframe = document.createElement('iframe');
        iframe.src = buildEmbedUrl(videoId, forPreload);
        iframe.allow = 'autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');

        iframe.addEventListener('load', () => {
            const listenMsg = JSON.stringify({ event: 'listening', id: 1, channel: 'widget' });
            try {
                iframe.contentWindow.postMessage(listenMsg, 'https://www.youtube.com');
            } catch (e) {
                try { iframe.contentWindow.postMessage(listenMsg, '*'); } catch (e2) {}
            }
        });

        return iframe;
    }

    // Preload upcoming videos — they autoplay muted off-screen to buffer
    function preloadUpcoming() {
        const container = getPreloadContainer();

        for (let i = 1; i <= MAX_PRELOAD; i++) {
            const nextIdx = currentVideoIndex + i;
            if (nextIdx < videos.length && !preloaded.has(nextIdx)) {
                const video = videos[nextIdx];
                const iframe = createIframe(video.id, true);
                iframe.dataset.videoIndex = nextIdx;
                container.appendChild(iframe);
                preloaded.set(nextIdx, { iframe, loaded: false });

                iframe.addEventListener('load', () => {
                    const entry = preloaded.get(nextIdx);
                    if (entry) entry.loaded = true;
                }, { once: true });
            }
        }

        // Preload previous
        const prevIdx = currentVideoIndex - 1;
        if (prevIdx >= 0 && !preloaded.has(prevIdx)) {
            const video = videos[prevIdx];
            const iframe = createIframe(video.id, true);
            iframe.dataset.videoIndex = prevIdx;
            container.appendChild(iframe);
            preloaded.set(prevIdx, { iframe, loaded: false });

            iframe.addEventListener('load', () => {
                const entry = preloaded.get(prevIdx);
                if (entry) entry.loaded = true;
            }, { once: true });
        }

        // Clean up distant preloads
        for (const [idx, entry] of preloaded) {
            if (Math.abs(idx - currentVideoIndex) > MAX_PRELOAD + 1) {
                entry.iframe.remove();
                preloaded.delete(idx);
            }
        }
    }

    function clearPreloads() {
        for (const [, entry] of preloaded) {
            entry.iframe.remove();
        }
        preloaded.clear();
    }

    function loadVideo(index) {
        if (index < 0 || index >= videos.length || isTransitioning) return;

        const video = videos[index];
        const feedEl = feed();

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
                if (loading.parentNode) loading.remove();
            }, 300);
            // Ensure mute state matches user preference after load
            const muteCmd = isMuted ? 'mute' : 'unMute';
            postCommandRetry(iframe, muteCmd);
        };

        slide.appendChild(iframe);

        const oldSlide = feedEl.querySelector('#current-slide');
        if (oldSlide) oldSlide.remove();

        feedEl.appendChild(slide);
        currentVideoIndex = index;

        if (onVideoChangeCallback) {
            onVideoChangeCallback(video, index, videos.length);
        }

        if (index >= videos.length - 3 && onNeedMoreVideosCallback) {
            onNeedMoreVideosCallback();
        }

        // Start preloading next videos immediately
        preloadUpcoming();
    }

    function navigateToVideo(newIndex, direction) {
        if (isTransitioning || newIndex < 0 || newIndex >= videos.length) return;
        if (newIndex === currentVideoIndex) return;

        isTransitioning = true;

        const feedEl = feed();
        const oldSlide = feedEl.querySelector('#current-slide');
        const video = videos[newIndex];

        const newSlide = document.createElement('div');
        newSlide.className = `video-slide ${direction === 'up' ? 'slide-down' : 'slide-up'}`;
        newSlide.id = 'new-slide';

        let iframe;
        let wasPreloaded = false;

        // Use preloaded iframe if available — move it without DOM detach
        if (preloaded.has(newIndex)) {
            const entry = preloaded.get(newIndex);
            iframe = entry.iframe;
            wasPreloaded = entry.loaded;
            preloaded.delete(newIndex);
        } else {
            iframe = createIframe(video.id);
        }

        // Append slide to DOM first, then move iframe into it (avoids detach)
        feedEl.appendChild(newSlide);
        newSlide.appendChild(iframe);

        // Trigger slide animation
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

                // Apply mute state after transition — retry for unmute only
                if (wasPreloaded) {
                    const muteCmd = isMuted ? 'mute' : 'unMute';
                    postCommandRetry(iframe, muteCmd);
                    // Single playVideo nudge (don't retry — retries restart buffering)
                    postCommand(iframe, 'playVideo');
                }

                if (onVideoChangeCallback) {
                    onVideoChangeCallback(video, newIndex, videos.length);
                }

                if (newIndex >= videos.length - 3 && onNeedMoreVideosCallback) {
                    onNeedMoreVideosCallback();
                }

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
        const cmd = isMuted ? 'mute' : 'unMute';
        // Mute/unmute current video via postMessage (no reload)
        const currentIframe = feed().querySelector('#current-slide iframe');
        if (currentIframe) {
            postCommand(currentIframe, cmd);
            setTimeout(() => postCommand(currentIframe, cmd), 300);
        }
        // Update preloaded iframes in-place (don't destroy their buffer)
        for (const [, entry] of preloaded) {
            postCommand(entry.iframe, cmd);
        }
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
        updateVideos,
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
