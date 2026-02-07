/* ========================================
   YouTube Shorts - Player Management
   Handles iframe embedding, autoplay,
   and vertical swipe/scroll navigation
   ======================================== */

const PlayerManager = (() => {
    let currentVideoIndex = 0;
    let videos = [];
    let isMuted = true;  // Start muted (browsers require muted autoplay)
    let isTransitioning = false;
    let onVideoChangeCallback = null;
    let onNeedMoreVideosCallback = null;

    // Touch/swipe tracking
    let touchStartY = 0;
    let touchDeltaY = 0;
    let isSwiping = false;
    const SWIPE_THRESHOLD = 80;

    const feed = () => document.getElementById('video-feed');

    // Build a clean embed URL that won't trigger Error 153
    function buildEmbedUrl(videoId) {
        const params = new URLSearchParams({
            autoplay: '1',
            mute: isMuted ? '1' : '0',
            rel: '0',              // No related videos
            modestbranding: '1',   // Minimal YouTube branding
            playsinline: '1',
            iv_load_policy: '3',   // No annotations
            disablekb: '1',        // Disable keyboard controls (prevent navigating away)
            fs: '0',               // Disable fullscreen button
            cc_load_policy: '0',   // No captions by default
            showinfo: '0',         // Hide video info
            enablejsapi: '1'       // Enable JS API for auto-advance
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
        videos = videoList;
        currentVideoIndex = startIndex;
        if (videos.length > 0) {
            loadVideo(currentVideoIndex);
        }
    }

    function createIframe(videoId) {
        const iframe = document.createElement('iframe');
        iframe.src = buildEmbedUrl(videoId);
        iframe.allow = 'autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('frameborder', '0');

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
            }, 800);
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

        const iframe = createIframe(video.id);
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
            }, 450);
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
            // Remove src to stop playback (most reliable method for cross-origin)
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
