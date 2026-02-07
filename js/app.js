/* ========================================
   YouTube Shorts - Kid Safe Edition
   Main App Controller
   ======================================== */

const App = (() => {
    // Hardcoded API key (no setup screen needed)
    const API_KEY = 'AIzaSyDep5wt_AnB-F65To-4FB99Zgs3xTvxTb4';

    let isLoadingMore = false;
    let isInitialized = false;
    let mixedVideos = [];

    async function init() {
        // Initialize PIN pad
        ParentalControls.initPinPad();

        // Set the API key directly
        VideoManager.setApiKey(API_KEY);
        ParentalControls.setApiKey(API_KEY);

        // Check daily reset
        ParentalControls.checkDailyReset();

        // Check if PIN is set up (first time only)
        if (!ParentalControls.hasPIN()) {
            hideSplash();
            await setupFirstTime();
        } else {
            await startApp();
        }
    }

    async function setupFirstTime() {
        const result = await ParentalControls.requestPIN('setup');
        if (result) {
            await startApp();
        }
    }

    // ---- Start App ----

    async function startApp() {
        if (isInitialized) return;
        isInitialized = true;

        // Check bedtime
        if (ParentalControls.isBedtime()) {
            showBedtimeScreen();
            hideSplash();
            return;
        }

        const appEl = document.getElementById('app');
        appEl.classList.remove('hidden');

        // Show Shorts logo but hide category tabs (mixed feed, no tab switching)
        document.getElementById('category-tabs').classList.add('hidden');

        // Initialize player
        PlayerManager.init({
            onVideoChange: handleVideoChange,
            onNeedMoreVideos: handleNeedMoreVideos
        });

        // Set up mute toggle + unmute overlay
        setupMuteToggle();
        setupUnmuteOverlay();

        // Set up settings
        setupSettings();

        // Listen for online/offline changes
        window.addEventListener('online', () => {
            loadMixedFeed();
        });
        window.addEventListener('offline', () => {
            showOfflineScreen();
        });

        // Load mixed feed from all enabled categories
        await loadMixedFeed();

        // Start timer if enabled
        startTimerIfNeeded();

        // Hide splash
        hideSplash();
    }

    // ---- Mixed Feed ----

    function getRandomCategory() {
        const cats = ParentalControls.getEnabledCategories();
        return cats[Math.floor(Math.random() * cats.length)];
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Filter out videos from blocked channels
    function filterBlocked(videos) {
        return videos.filter(v => !ParentalControls.isChannelBlocked(v.channel));
    }

    async function loadMixedFeed() {
        const feedEl = document.getElementById('video-feed');
        feedEl.innerHTML = `
            <div class="video-slide slide-center">
                <div class="video-loading">
                    <div class="loader"></div>
                    <p>Loading videos...</p>
                </div>
            </div>
        `;

        try {
            const enabledCats = ParentalControls.getEnabledCategories();

            // Fetch from up to 3 random categories for a good initial mix
            const catsToFetch = shuffle([...enabledCats]).slice(0, 3);
            const results = await Promise.allSettled(
                catsToFetch.map(cat => VideoManager.fetchVideos(cat))
            );

            mixedVideos = [];
            results.forEach(r => {
                if (r.status === 'fulfilled' && r.value.length > 0) {
                    mixedVideos.push(...r.value);
                }
            });

            // Filter out blocked channels and shuffle
            mixedVideos = filterBlocked(mixedVideos);
            shuffle(mixedVideos);

            if (mixedVideos.length === 0) {
                if (!navigator.onLine) {
                    showOfflineScreen();
                } else {
                    feedEl.innerHTML = `
                        <div class="video-slide slide-center">
                            <div class="video-loading">
                                <p>No videos found. Check your settings.</p>
                            </div>
                        </div>
                    `;
                }
                return;
            }

            PlayerManager.setVideos(mixedVideos, 0);
            PlayerManager.updateNavButtons();
        } catch (err) {
            console.error('Failed to load mixed feed:', err);
            feedEl.innerHTML = `
                <div class="video-slide slide-center">
                    <div class="video-loading">
                        <p>Something went wrong. Please try again.</p>
                    </div>
                </div>
            `;
        }
    }

    // ---- Video Change Handler ----

    function handleVideoChange(video, index, total) {
        document.getElementById('video-title').textContent = video.title;
        document.getElementById('video-channel').textContent = '@' + video.channel.replace(/\s+/g, '');
        document.getElementById('audio-name').textContent = video.channel + ' \u00B7 Original audio';
        PlayerManager.updateNavButtons();

        // Record to watch history
        ParentalControls.addToHistory(video);
    }

    async function handleNeedMoreVideos() {
        if (isLoadingMore) return;
        isLoadingMore = true;

        try {
            // Fetch more from a random enabled category
            const cat = getRandomCategory();
            const newVideos = await VideoManager.fetchVideos(cat, true);

            // Add new videos shuffled into the mix (filter blocked)
            const currentIndex = PlayerManager.getCurrentIndex();
            const existing = mixedVideos.slice(0, currentIndex + 1);
            const upcoming = mixedVideos.slice(currentIndex + 1);
            const fresh = filterBlocked(newVideos.filter(v => !mixedVideos.some(m => m.id === v.id)));
            const merged = [...existing, ...shuffle([...upcoming, ...fresh])];
            mixedVideos = merged;

            PlayerManager.setVideos(mixedVideos, currentIndex);
        } catch (err) {
            console.error('Failed to load more videos:', err);
        } finally {
            isLoadingMore = false;
        }
    }

    // ---- Mute Toggle ----

    function setupMuteToggle() {
        const muteBtn = document.getElementById('mute-toggle');
        const muteIcon = document.getElementById('mute-icon');

        muteBtn.addEventListener('click', () => {
            const muted = PlayerManager.toggleMute();
            if (muted) {
                muteIcon.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="white"/></svg>';
            } else {
                muteIcon.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3,9v6h4l5,5V4L7,9H3z M16.5,12c0-1.77-1.02-3.29-2.5-4.03v8.05C15.48,15.29,16.5,13.77,16.5,12z M14,3.23v2.06c2.89,0.86,5,3.54,5,6.71s-2.11,5.85-5,6.71v2.06c4.01-0.91,7-4.49,7-8.77S18.01,4.14,14,3.23z" fill="white"/></svg>';
            }
            muteBtn.querySelector('.action-label').textContent = muted ? 'Muted' : 'Sound';
        });
    }

    // ---- Unmute Overlay ----

    function setupUnmuteOverlay() {
        const overlay = document.getElementById('unmute-overlay');
        if (!overlay) return;

        // Show overlay once the first video starts loading
        overlay.classList.remove('hidden');

        overlay.addEventListener('click', () => {
            // Unmute if currently muted
            if (PlayerManager.getMuteState()) {
                const muted = PlayerManager.toggleMute();
                // Update the mute button icon to match
                const muteIcon = document.getElementById('mute-icon');
                const muteBtn = document.getElementById('mute-toggle');
                muteIcon.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3,9v6h4l5,5V4L7,9H3z M16.5,12c0-1.77-1.02-3.29-2.5-4.03v8.05C15.48,15.29,16.5,13.77,16.5,12z M14,3.23v2.06c2.89,0.86,5,3.54,5,6.71s-2.11,5.85-5,6.71v2.06c4.01-0.91,7-4.49,7-8.77S18.01,4.14,14,3.23z" fill="white"/></svg>';
                muteBtn.querySelector('.action-label').textContent = 'Sound';
            }
            overlay.classList.add('hidden');
        });
    }

    // ---- Settings ----

    function setupSettings() {
        const settingsBtn = document.getElementById('settings-btn');
        const settingsPanel = document.getElementById('settings-panel');
        const settingsClose = document.getElementById('settings-close-btn');
        const changePinBtn = document.getElementById('change-pin-btn');
        const resetBtn = document.getElementById('reset-app-btn');
        const extendTimeBtn = document.getElementById('extend-time-btn');
        const saveBtn = document.getElementById('save-settings-btn');

        // Open settings (requires PIN if set)
        settingsBtn.addEventListener('click', async () => {
            if (ParentalControls.hasPIN()) {
                const verified = await ParentalControls.requestPIN('verify');
                if (verified) openSettings();
            } else {
                openSettings();
            }
        });

        // Close settings
        settingsClose.addEventListener('click', () => closeSettings());
        settingsPanel.querySelector('.modal-overlay').addEventListener('click', () => closeSettings());

        // Save & Apply button
        saveBtn.addEventListener('click', () => {
            saveSettings();
        });

        // Clear watch history
        document.getElementById('clear-history-btn')?.addEventListener('click', () => {
            ParentalControls.clearWatchHistory();
            renderWatchHistory();
        });

        // Change PIN
        changePinBtn.addEventListener('click', async () => {
            closeSettings();
            await ParentalControls.requestPIN('change-old');
        });

        // Disable PIN (remove lock entirely)
        document.getElementById('disable-pin-btn')?.addEventListener('click', () => {
            if (confirm('This will remove the PIN lock. Anyone can access settings. Continue?')) {
                ParentalControls.removePIN();
                closeSettings();
            }
        });

        // Reset PIN (delete so next launch asks to set a new one)
        document.getElementById('reset-pin-btn')?.addEventListener('click', () => {
            if (confirm('This will delete your PIN. You will be asked to set a new PIN on next app launch. Continue?')) {
                ParentalControls.removePIN();
                closeSettings();
                location.reload();
            }
        });

        // Reset app
        resetBtn.addEventListener('click', () => {
            if (confirm('This will reset all settings, PIN, and cached data. Continue?')) {
                ParentalControls.resetAll();
                VideoManager.clearCache();
                PlayerManager.destroy();
                isInitialized = false;
                closeSettings();
                document.getElementById('app').classList.add('hidden');
                location.reload();
            }
        });

        // Extend time (from times-up modal)
        extendTimeBtn.addEventListener('click', async () => {
            const verified = await ParentalControls.requestPIN('verify');
            if (verified) {
                document.getElementById('times-up-modal').classList.add('hidden');
                ParentalControls.resetTimer();
            }
        });

        // Like/Share/Comment are decorative
        document.getElementById('like-btn')?.addEventListener('click', () => {});
        document.getElementById('share-btn')?.addEventListener('click', () => {});
        document.getElementById('comment-btn')?.addEventListener('click', () => {});

        // Dislike = block this channel and skip
        document.getElementById('dislike-btn')?.addEventListener('click', () => {
            const currentIndex = PlayerManager.getCurrentIndex();
            const video = mixedVideos[currentIndex];
            if (video && video.channel) {
                ParentalControls.blockChannel(video.channel);
                // Remove all videos from this channel
                mixedVideos = mixedVideos.filter(v => !ParentalControls.isChannelBlocked(v.channel));
                if (mixedVideos.length > 0) {
                    const newIndex = Math.min(currentIndex, mixedVideos.length - 1);
                    PlayerManager.setVideos(mixedVideos, newIndex);
                    PlayerManager.updateNavButtons();
                } else {
                    loadMixedFeed();
                }
            }
        });
    }

    function openSettings() {
        // Populate category checkboxes
        const enabledCats = ParentalControls.getEnabledCategories();
        document.querySelectorAll('#category-checkboxes input[type="checkbox"]').forEach(cb => {
            cb.checked = enabledCats.includes(cb.value);
        });

        // Populate language checkboxes
        const enabledLangs = ParentalControls.getEnabledLanguages();
        document.querySelectorAll('#language-checkboxes input[type="checkbox"]').forEach(cb => {
            cb.checked = enabledLangs.includes(cb.value);
        });

        // Time limit
        document.getElementById('time-limit-toggle').checked = ParentalControls.isTimeLimitEnabled();
        document.getElementById('time-limit-select').value = ParentalControls.getTimeLimitMinutes().toString();
        updateTimeLimitOptionsVisibility();

        // Daily reset
        document.getElementById('daily-reset-toggle').checked = ParentalControls.isDailyResetEnabled();

        // Bedtime
        document.getElementById('bedtime-toggle').checked = ParentalControls.isBedtimeEnabled();
        document.getElementById('bedtime-select').value = ParentalControls.getBedtimeHour().toString();
        updateBedtimeOptionsVisibility();

        // Render blocked channels
        renderBlockedChannels();

        // Render watch history
        renderWatchHistory();

        document.getElementById('settings-panel').classList.remove('hidden');
    }

    function renderBlockedChannels() {
        const container = document.getElementById('blocked-channels-list');
        const blocked = ParentalControls.getBlockedChannels();
        if (blocked.length === 0) {
            container.innerHTML = '<p class="empty-state">No blocked channels</p>';
            return;
        }
        container.innerHTML = blocked.map(ch =>
            `<div class="blocked-item">
                <span class="blocked-item-name">${ch}</span>
                <button class="unblock-btn" data-channel="${ch}">Unblock</button>
            </div>`
        ).join('');
        container.querySelectorAll('.unblock-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                ParentalControls.unblockChannel(btn.dataset.channel);
                renderBlockedChannels();
            });
        });
    }

    function renderWatchHistory() {
        const container = document.getElementById('watch-history-list');
        const history = ParentalControls.getWatchHistory();
        if (history.length === 0) {
            container.innerHTML = '<p class="empty-state">No watch history yet</p>';
            return;
        }
        // Show last 30 entries
        container.innerHTML = history.slice(0, 30).map(item => {
            const date = new Date(item.time);
            const timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `<div class="history-item">
                <div class="history-item-info">
                    <div class="history-item-title">${item.title}</div>
                    <div class="history-item-meta">${item.channel} &middot; ${timeStr}</div>
                </div>
            </div>`;
        }).join('');
    }

    function saveSettings() {
        // Save categories
        const selectedCats = [];
        document.querySelectorAll('#category-checkboxes input[type="checkbox"]').forEach(cb => {
            if (cb.checked) selectedCats.push(cb.value);
        });
        if (selectedCats.length === 0) {
            alert('Please select at least one category.');
            return;
        }
        ParentalControls.setEnabledCategories(selectedCats);

        // Save languages
        const selectedLangs = [];
        document.querySelectorAll('#language-checkboxes input[type="checkbox"]').forEach(cb => {
            if (cb.checked) selectedLangs.push(cb.value);
        });
        if (selectedLangs.length === 0) {
            alert('Please select at least one language.');
            return;
        }
        ParentalControls.setEnabledLanguages(selectedLangs);

        // Save time limit
        ParentalControls.setTimeLimitEnabled(document.getElementById('time-limit-toggle').checked);
        ParentalControls.setTimeLimitMinutes(parseInt(document.getElementById('time-limit-select').value, 10));

        // Save daily reset
        ParentalControls.setDailyResetEnabled(document.getElementById('daily-reset-toggle').checked);

        // Save bedtime
        ParentalControls.setBedtimeEnabled(document.getElementById('bedtime-toggle').checked);
        ParentalControls.setBedtimeHour(parseInt(document.getElementById('bedtime-select').value, 10));

        // Clear video cache so new settings take effect
        VideoManager.clearCache();
        mixedVideos = [];

        // Restart timer
        startTimerIfNeeded();

        // Close settings and reload mixed feed
        closeSettings();
        loadMixedFeed();
    }

    function closeSettings() {
        document.getElementById('settings-panel').classList.add('hidden');
    }

    function updateTimeLimitOptionsVisibility() {
        const options = document.getElementById('time-limit-options');
        const enabled = document.getElementById('time-limit-toggle').checked;
        options.style.opacity = enabled ? '1' : '0.4';
        options.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    function updateBedtimeOptionsVisibility() {
        const options = document.getElementById('bedtime-options');
        const enabled = document.getElementById('bedtime-toggle').checked;
        options.style.opacity = enabled ? '1' : '0.4';
        options.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    // ---- Offline Screen ----

    function showOfflineScreen() {
        const feedEl = document.getElementById('video-feed');
        feedEl.innerHTML = `
            <div class="video-slide slide-center">
                <div class="video-loading">
                    <div style="font-size:56px;margin-bottom:16px">&#9729;&#65039;</div>
                    <h2 style="margin-bottom:8px;font-size:22px">No Internet</h2>
                    <p>We can't load videos right now.</p>
                    <p style="margin-top:4px">Check your connection and try again.</p>
                    <button id="retry-connection-btn" class="btn-primary" style="margin-top:20px;width:auto;padding:12px 32px">Try Again</button>
                </div>
            </div>
        `;
        document.getElementById('retry-connection-btn')?.addEventListener('click', () => {
            loadMixedFeed();
        });
    }

    // ---- Bedtime Screen ----

    function showBedtimeScreen() {
        const appEl = document.getElementById('app');
        appEl.classList.remove('hidden');
        document.getElementById('category-tabs').classList.add('hidden');

        const feedEl = document.getElementById('video-feed');
        feedEl.innerHTML = `
            <div class="video-slide slide-center">
                <div class="video-loading">
                    <div style="font-size:56px;margin-bottom:16px">&#127769;</div>
                    <h2 style="margin-bottom:8px;font-size:22px">Bedtime!</h2>
                    <p>It's time to sleep. See you tomorrow!</p>
                    <p class="hint" style="margin-top:12px">A parent can enter the PIN to override.</p>
                </div>
            </div>
        `;
        document.querySelector('.action-buttons').classList.add('hidden');
        document.getElementById('video-info').classList.add('hidden');

        // Settings button still visible for parent override
        document.getElementById('settings-btn').addEventListener('click', async () => {
            const verified = await ParentalControls.requestPIN('verify');
            if (verified) {
                document.querySelector('.action-buttons').classList.remove('hidden');
                document.getElementById('video-info').classList.remove('hidden');
                isInitialized = false;
                await startApp();
            }
        }, { once: true });
    }

    // ---- Timer ----

    function startTimerIfNeeded() {
        if (ParentalControls.isTimeLimitEnabled()) {
            ParentalControls.startTimer({
                onTimesUp: handleTimesUp,
                onTick: null
            });
        } else {
            ParentalControls.stopTimer();
            const display = document.getElementById('timer-display');
            if (display) display.classList.add('hidden');
        }
    }

    function handleTimesUp() {
        PlayerManager.pausePlayback();
        document.getElementById('times-up-modal').classList.remove('hidden');
    }

    // ---- Splash Screen ----

    function hideSplash() {
        const splash = document.getElementById('splash-screen');
        splash.classList.add('fade-out');
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }

    // ---- Lockdown (prevent kids from navigating away) ----

    function lockdown() {
        // Block right-click
        document.addEventListener('contextmenu', (e) => e.preventDefault());

        // Block keyboard shortcuts that navigate away
        document.addEventListener('keydown', (e) => {
            // Block Ctrl+L (address bar), Ctrl+T (new tab), Ctrl+N (new window),
            // Ctrl+W (close tab), F5 (refresh), Ctrl+R (refresh)
            if (e.ctrlKey && ['l', 't', 'n', 'w', 'r'].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
            if (['F5', 'F11'].includes(e.key)) {
                e.preventDefault();
            }
            // Block Alt+Left/Right (browser back/forward)
            if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
            }
        });

        // Block drag/drop (prevents dragging links out)
        document.addEventListener('dragstart', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());

        // Block any <a> link clicks that might somehow appear
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        // Prevent back button navigation (push state trap)
        history.pushState(null, '', location.href);
        window.addEventListener('popstate', () => {
            history.pushState(null, '', location.href);
        });
    }

    // ---- Boot ----
    lockdown();

    // Toggle visibility listeners for time limit and bedtime
    document.getElementById('time-limit-toggle')?.addEventListener('change', updateTimeLimitOptionsVisibility);
    document.getElementById('bedtime-toggle')?.addEventListener('change', updateBedtimeOptionsVisibility);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init };
})();
