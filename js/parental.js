/* ========================================
   Parental Controls
   PIN, Time limit, Categories, Languages
   ======================================== */

const ParentalControls = (() => {
    const STORAGE_KEYS = {
        PIN: 'kidtube_pin',
        TIME_LIMIT_ENABLED: 'kidtube_time_limit_enabled',
        TIME_LIMIT_MINUTES: 'kidtube_time_limit_minutes',
        API_KEY: 'kidtube_api_key',
        ENABLED_CATEGORIES: 'kidtube_enabled_categories',
        ENABLED_LANGUAGES: 'kidtube_enabled_languages',
        BEDTIME_ENABLED: 'kidtube_bedtime_enabled',
        BEDTIME_HOUR: 'kidtube_bedtime_hour',
        DAILY_RESET: 'kidtube_daily_reset',
        LAST_RESET_DATE: 'kidtube_last_reset_date',
        WATCH_HISTORY: 'kidtube_watch_history',
        BLOCKED_CHANNELS: 'kidtube_blocked_channels'
    };

    // All available categories
    const ALL_CATEGORIES = [
        'indian-kids', 'devotional', 'good-habits', 'kids-arts', 'kids-knowledge',
        'nursery-rhymes', 'moral-stories', 'math-learning', 'science-fun',
        'yoga-kids', 'cooking-kids', 'animal-facts', 'space-facts'
    ];

    // All available languages
    const ALL_LANGUAGES = ['english', 'hindi', 'telugu', 'tamil', 'kannada', 'malayalam'];

    // Default enabled categories
    const DEFAULT_CATEGORIES = ['indian-kids', 'devotional', 'good-habits', 'kids-arts', 'kids-knowledge'];

    // Default enabled languages
    const DEFAULT_LANGUAGES = ['english', 'hindi'];

    let timerInterval = null;
    let remainingSeconds = 0;
    let onTimesUpCallback = null;
    let onTimerTickCallback = null;
    let pinResolve = null;
    let pinMode = 'verify';

    // ---- PIN Management ----

    function hasPIN() {
        return !!localStorage.getItem(STORAGE_KEYS.PIN);
    }

    function getPIN() {
        return localStorage.getItem(STORAGE_KEYS.PIN) || '';
    }

    function setPIN(pin) {
        localStorage.setItem(STORAGE_KEYS.PIN, pin);
    }

    function verifyPIN(pin) {
        return pin === getPIN();
    }

    function removePIN() {
        localStorage.removeItem(STORAGE_KEYS.PIN);
    }

    function requestPIN(mode = 'verify') {
        return new Promise((resolve) => {
            pinResolve = resolve;
            pinMode = mode;

            const modal = document.getElementById('pin-modal');
            const title = document.getElementById('pin-modal-title');
            const subtitle = document.getElementById('pin-modal-subtitle');
            const errorEl = document.getElementById('pin-error');

            clearPinDots();
            errorEl.classList.add('hidden');

            switch (mode) {
                case 'setup':
                    title.textContent = 'Set a Parent PIN';
                    subtitle.textContent = 'Choose a 4-digit PIN';
                    break;
                case 'change-old':
                    title.textContent = 'Change PIN';
                    subtitle.textContent = 'Enter your current PIN';
                    break;
                case 'change-new':
                    title.textContent = 'Change PIN';
                    subtitle.textContent = 'Enter your new PIN';
                    break;
                default:
                    title.textContent = 'Enter Parent PIN';
                    subtitle.textContent = 'Enter your 4-digit PIN';
            }

            modal.classList.remove('hidden');
        });
    }

    function initPinPad() {
        let currentPin = '';

        document.querySelectorAll('.pin-key').forEach(key => {
            key.addEventListener('click', () => {
                const val = key.dataset.key;
                if (!val) return;

                const errorEl = document.getElementById('pin-error');

                if (val === 'back') {
                    if (currentPin.length > 0) {
                        currentPin = currentPin.slice(0, -1);
                        updatePinDots(currentPin.length);
                        errorEl.classList.add('hidden');
                    }
                    return;
                }

                if (currentPin.length >= 4) return;

                currentPin += val;
                updatePinDots(currentPin.length);

                if (currentPin.length === 4) {
                    setTimeout(() => {
                        handlePinEntry(currentPin);
                        currentPin = '';
                    }, 200);
                }
            });
        });

        document.getElementById('pin-cancel-btn').addEventListener('click', () => {
            closePinModal(false);
            currentPin = '';
        });
    }

    function handlePinEntry(pin) {
        const errorEl = document.getElementById('pin-error');

        switch (pinMode) {
            case 'setup':
                setPIN(pin);
                closePinModal(true);
                break;
            case 'verify':
                if (verifyPIN(pin)) {
                    closePinModal(true);
                } else {
                    errorEl.textContent = 'Incorrect PIN. Try again.';
                    errorEl.classList.remove('hidden');
                    clearPinDots();
                    shakeModal();
                }
                break;
            case 'change-old':
                if (verifyPIN(pin)) {
                    pinMode = 'change-new';
                    document.getElementById('pin-modal-subtitle').textContent = 'Enter your new PIN';
                    clearPinDots();
                    errorEl.classList.add('hidden');
                } else {
                    errorEl.textContent = 'Incorrect PIN. Try again.';
                    errorEl.classList.remove('hidden');
                    clearPinDots();
                    shakeModal();
                }
                break;
            case 'change-new':
                setPIN(pin);
                closePinModal(true);
                break;
        }
    }

    function closePinModal(result) {
        document.getElementById('pin-modal').classList.add('hidden');
        clearPinDots();
        if (pinResolve) {
            pinResolve(result);
            pinResolve = null;
        }
    }

    function updatePinDots(count) {
        for (let i = 0; i < 4; i++) {
            document.getElementById(`dot-${i}`).classList.toggle('filled', i < count);
        }
    }

    function clearPinDots() {
        for (let i = 0; i < 4; i++) {
            document.getElementById(`dot-${i}`).classList.remove('filled');
        }
    }

    function shakeModal() {
        const content = document.querySelector('.pin-modal-content');
        content.style.animation = 'none';
        content.offsetHeight;
        content.style.animation = 'shake 0.4s';
    }

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-10px); }
            40% { transform: translateX(10px); }
            60% { transform: translateX(-10px); }
            80% { transform: translateX(10px); }
        }
    `;
    document.head.appendChild(shakeStyle);

    // ---- Category Management ----

    function getEnabledCategories() {
        const stored = localStorage.getItem(STORAGE_KEYS.ENABLED_CATEGORIES);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) {}
        }
        return [...DEFAULT_CATEGORIES];
    }

    function setEnabledCategories(categories) {
        localStorage.setItem(STORAGE_KEYS.ENABLED_CATEGORIES, JSON.stringify(categories));
    }

    function getAllCategories() {
        return ALL_CATEGORIES;
    }

    // ---- Language Management ----

    function getEnabledLanguages() {
        const stored = localStorage.getItem(STORAGE_KEYS.ENABLED_LANGUAGES);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) {}
        }
        return [...DEFAULT_LANGUAGES];
    }

    function setEnabledLanguages(languages) {
        localStorage.setItem(STORAGE_KEYS.ENABLED_LANGUAGES, JSON.stringify(languages));
    }

    function getAllLanguages() {
        return ALL_LANGUAGES;
    }

    // ---- Bedtime ----

    function isBedtimeEnabled() {
        return localStorage.getItem(STORAGE_KEYS.BEDTIME_ENABLED) === 'true';
    }

    function setBedtimeEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.BEDTIME_ENABLED, enabled.toString());
    }

    function getBedtimeHour() {
        return parseInt(localStorage.getItem(STORAGE_KEYS.BEDTIME_HOUR) || '21', 10);
    }

    function setBedtimeHour(hour) {
        localStorage.setItem(STORAGE_KEYS.BEDTIME_HOUR, hour.toString());
    }

    function isBedtime() {
        if (!isBedtimeEnabled()) return false;
        const now = new Date();
        return now.getHours() >= getBedtimeHour();
    }

    // ---- Daily Timer Reset ----

    function isDailyResetEnabled() {
        return localStorage.getItem(STORAGE_KEYS.DAILY_RESET) === 'true';
    }

    function setDailyResetEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.DAILY_RESET, enabled.toString());
    }

    function checkDailyReset() {
        if (!isDailyResetEnabled()) return;
        const today = new Date().toDateString();
        const lastReset = localStorage.getItem(STORAGE_KEYS.LAST_RESET_DATE);
        if (lastReset !== today) {
            localStorage.setItem(STORAGE_KEYS.LAST_RESET_DATE, today);
        }
    }

    // ---- Time Limit ----

    function isTimeLimitEnabled() {
        return localStorage.getItem(STORAGE_KEYS.TIME_LIMIT_ENABLED) === 'true';
    }

    function setTimeLimitEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.TIME_LIMIT_ENABLED, enabled.toString());
    }

    function getTimeLimitMinutes() {
        return parseInt(localStorage.getItem(STORAGE_KEYS.TIME_LIMIT_MINUTES) || '30', 10);
    }

    function setTimeLimitMinutes(minutes) {
        localStorage.setItem(STORAGE_KEYS.TIME_LIMIT_MINUTES, minutes.toString());
    }

    function startTimer(callbacks = {}) {
        onTimesUpCallback = callbacks.onTimesUp || null;
        onTimerTickCallback = callbacks.onTick || null;

        if (!isTimeLimitEnabled()) {
            hideTimerDisplay();
            return;
        }

        stopTimer();
        remainingSeconds = getTimeLimitMinutes() * 60;
        showTimerDisplay();
        updateTimerDisplay();

        timerInterval = setInterval(() => {
            remainingSeconds--;

            if (remainingSeconds <= 0) {
                stopTimer();
                if (onTimesUpCallback) onTimesUpCallback();
                return;
            }

            updateTimerDisplay();

            if (onTimerTickCallback) onTimerTickCallback(remainingSeconds);
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function resetTimer() {
        remainingSeconds = getTimeLimitMinutes() * 60;
        if (isTimeLimitEnabled()) {
            startTimer({ onTimesUp: onTimesUpCallback, onTick: onTimerTickCallback });
        }
    }

    function updateTimerDisplay() {
        const display = document.getElementById('timer-display');
        const text = document.getElementById('timer-text');
        if (!display || !text) return;

        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        text.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        display.classList.remove('warning', 'critical');
        if (remainingSeconds <= 60) display.classList.add('critical');
        else if (remainingSeconds <= 300) display.classList.add('warning');
    }

    function showTimerDisplay() {
        const display = document.getElementById('timer-display');
        if (display) display.classList.remove('hidden');
    }

    function hideTimerDisplay() {
        const display = document.getElementById('timer-display');
        if (display) display.classList.add('hidden');
    }

    // ---- Watch History ----

    const MAX_HISTORY = 100;

    function getWatchHistory() {
        const stored = localStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) {}
        }
        return [];
    }

    function addToHistory(video) {
        const history = getWatchHistory();
        // Don't add duplicates back-to-back
        if (history.length > 0 && history[0].id === video.id) return;
        history.unshift({
            id: video.id,
            title: video.title,
            channel: video.channel,
            time: new Date().toISOString()
        });
        // Keep only last MAX_HISTORY entries
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        localStorage.setItem(STORAGE_KEYS.WATCH_HISTORY, JSON.stringify(history));
    }

    function clearWatchHistory() {
        localStorage.removeItem(STORAGE_KEYS.WATCH_HISTORY);
    }

    // ---- Blocked Channels ----

    function getBlockedChannels() {
        const stored = localStorage.getItem(STORAGE_KEYS.BLOCKED_CHANNELS);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) {}
        }
        return [];
    }

    function blockChannel(channelName) {
        const blocked = getBlockedChannels();
        const normalized = channelName.trim().toLowerCase();
        if (!blocked.includes(normalized)) {
            blocked.push(normalized);
            localStorage.setItem(STORAGE_KEYS.BLOCKED_CHANNELS, JSON.stringify(blocked));
        }
    }

    function unblockChannel(channelName) {
        let blocked = getBlockedChannels();
        blocked = blocked.filter(c => c !== channelName.trim().toLowerCase());
        localStorage.setItem(STORAGE_KEYS.BLOCKED_CHANNELS, JSON.stringify(blocked));
    }

    function isChannelBlocked(channelName) {
        const blocked = getBlockedChannels();
        return blocked.includes(channelName.trim().toLowerCase());
    }

    // ---- API Key ----

    function getApiKey() { return localStorage.getItem(STORAGE_KEYS.API_KEY) || ''; }
    function setApiKey(key) { localStorage.setItem(STORAGE_KEYS.API_KEY, key); }
    function hasApiKey() { return !!localStorage.getItem(STORAGE_KEYS.API_KEY); }

    // ---- Reset ----

    function resetAll() {
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        stopTimer();
    }

    return {
        hasPIN, setPIN, verifyPIN, removePIN, requestPIN, initPinPad,
        isTimeLimitEnabled, setTimeLimitEnabled, getTimeLimitMinutes, setTimeLimitMinutes,
        startTimer, stopTimer, resetTimer,
        getEnabledCategories, setEnabledCategories, getAllCategories,
        getEnabledLanguages, setEnabledLanguages, getAllLanguages,
        isBedtimeEnabled, setBedtimeEnabled, getBedtimeHour, setBedtimeHour, isBedtime,
        isDailyResetEnabled, setDailyResetEnabled, checkDailyReset,
        getApiKey, setApiKey, hasApiKey,
        addToHistory, getWatchHistory, clearWatchHistory,
        blockChannel, unblockChannel, getBlockedChannels, isChannelBlocked,
        resetAll
    };
})();
