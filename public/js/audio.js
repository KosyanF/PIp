// ==========================================
// audio.js — Stable-Tec Audio Engine
// ==========================================
// Процедурная генерация звуков через Web Audio API
// Каналы: ui, event, ambient, radio
// Все звуки синтезированные — никаких внешних файлов
// ==========================================

(function () {
    'use strict';

    let ctx = null;          // AudioContext
    let masterGain = null;   // Master volume
    let channels = {};       // { ui, event, ambient, radio } → GainNode
    let enabled = true;
    let initialized = false;

    // Громкости по умолчанию
    const DEFAULT_VOLUMES = { master: 0.25, ui: 0.6, event: 0.7, ambient: 0.3, radio: 0.4 };

    // Загрузить сохранённые настройки
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('pipboy_audio') || '{}');
            return {
                master:  s.master  ?? DEFAULT_VOLUMES.master,
                ui:      s.ui      ?? DEFAULT_VOLUMES.ui,
                event:   s.event   ?? DEFAULT_VOLUMES.event,
                ambient: s.ambient ?? DEFAULT_VOLUMES.ambient,
                radio:   s.radio   ?? DEFAULT_VOLUMES.radio,
                enabled: s.enabled ?? true,
            };
        } catch (e) { return { ...DEFAULT_VOLUMES, enabled: true }; }
    }

    function saveSettings() {
        try {
            const s = { enabled };
            s.master = masterGain ? masterGain.gain.value : DEFAULT_VOLUMES.master;
            for (const ch in channels) s[ch] = channels[ch].gain.value;
            localStorage.setItem('pipboy_audio', JSON.stringify(s));
        } catch (e) { /* ignore */ }
    }

    // ── INIT (ленивый, по первому user gesture) ──
    function ensureContext() {
        if (ctx) return ctx;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.connect(ctx.destination);

            const settings = loadSettings();
            enabled = settings.enabled;
            masterGain.gain.value = enabled ? settings.master : 0;

            ['ui', 'event', 'ambient', 'radio'].forEach(ch => {
                channels[ch] = ctx.createGain();
                channels[ch].gain.value = settings[ch] ?? DEFAULT_VOLUMES[ch];
                channels[ch].connect(masterGain);
            });

            initialized = true;
        } catch (e) {
            console.warn('[Audio] Web Audio API не доступен:', e.message);
            ctx = null;
        }
        return ctx;
    }

    // Разблокировать AudioContext по user gesture
    function unlock() {
        if (!ctx) ensureContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // ── ПРИМИТИВЫ ──

    // Короткий тональный beep
    function beep(channel, freq, duration, type, vol) {
        if (!enabled || !ensureContext()) return;
        const ch = channels[channel] || channels.ui;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime((vol || 0.3), ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ch);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    // Шумовой burst (white noise)
    function noiseBurst(channel, duration, vol) {
        if (!enabled || !ensureContext()) return;
        const ch = channels[channel] || channels.ui;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (vol || 0.1);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol || 0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        source.connect(gain);
        gain.connect(ch);
        source.start(ctx.currentTime);
    }

    // Двухтональный сигнал
    function dualTone(channel, f1, f2, dur1, dur2, type, vol) {
        if (!enabled || !ensureContext()) return;
        beep(channel, f1, dur1, type, vol);
        setTimeout(() => beep(channel, f2, dur2, type, vol), dur1 * 700);
    }

    // Фильтрованный шум (для радио, ambient)
    function filteredNoise(channel, duration, freq, Q, vol) {
        if (!enabled || !ensureContext()) return;
        const ch = channels[channel] || channels.ambient;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq || 800;
        filter.Q.value = Q || 1;
        const gain = ctx.createGain();
        gain.gain.value = vol || 0.05;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ch);
        source.start(ctx.currentTime);
    }

    // ── AMBIENT LOOPS ──
    let ambientNode = null;
    let ambientGainNode = null;

    function startAmbientHum() {
        if (!enabled || !ensureContext() || ambientNode) return;

        // Тихий трансформаторный гул: 60Hz + гармоники
        ambientNode = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        ambientGainNode = ctx.createGain();
        const gain2 = ctx.createGain();

        ambientNode.type = 'sine';
        ambientNode.frequency.value = 60;
        ambientGainNode.gain.value = 0.02;

        osc2.type = 'sine';
        osc2.frequency.value = 120;
        gain2.gain.value = 0.008;

        ambientNode.connect(ambientGainNode);
        ambientGainNode.connect(channels.ambient);
        osc2.connect(gain2);
        gain2.connect(channels.ambient);

        ambientNode.start();
        osc2.start();

        // Сохраняем для остановки
        ambientNode._partner = osc2;
        ambientNode._partnerGain = gain2;
    }

    function stopAmbientHum() {
        if (ambientNode) {
            try { ambientNode.stop(); } catch (e) { /* */ }
            try { ambientNode._partner?.stop(); } catch (e) { /* */ }
            ambientNode = null;
            ambientGainNode = null;
        }
    }

    // Радио-шум (включается при вкладке Радио)
    let radioNoiseNode = null;

    function startRadioNoise() {
        if (!enabled || !ensureContext() || radioNoiseNode) return;

        // Длинный looping noise buffer
        const dur = 2;
        const bufferSize = ctx.sampleRate * dur;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        radioNoiseNode = ctx.createBufferSource();
        radioNoiseNode.buffer = buffer;
        radioNoiseNode.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 600;
        filter.Q.value = 0.5;

        const gain = ctx.createGain();
        gain.gain.value = 0.015;

        radioNoiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(channels.radio);
        radioNoiseNode.start();
    }

    function stopRadioNoise() {
        if (radioNoiseNode) {
            try { radioNoiseNode.stop(); } catch (e) { /* */ }
            radioNoiseNode = null;
        }
    }

    // ── ИМЕНОВАННЫЕ ЗВУКИ ──

    const SFX = {
        // UI
        tabClick() {
            beep('ui', 1200, 0.04, 'square', 0.15);
        },

        buttonClick() {
            beep('ui', 600, 0.05, 'square', 0.1);
        },

        tabSwitch() {
            beep('ui', 900, 0.03, 'square', 0.12);
            setTimeout(() => beep('ui', 50, 0.08, 'sine', 0.04), 30);
        },

        // Events
        newMessage() {
            dualTone('event', 800, 1100, 0.08, 0.1, 'sine', 0.2);
        },

        newRadio() {
            noiseBurst('event', 0.08, 0.08);
            setTimeout(() => beep('event', 600, 0.15, 'sine', 0.15), 80);
        },

        newQuest() {
            beep('event', 1000, 0.06, 'square', 0.25);
            setTimeout(() => dualTone('event', 700, 1200, 0.1, 0.12, 'sine', 0.2), 80);
        },

        connectionLost() {
            noiseBurst('event', 0.15, 0.2);
            setTimeout(() => beep('event', 200, 0.2, 'sawtooth', 0.15), 50);
        },

        connectionRestored() {
            dualTone('event', 500, 800, 0.06, 0.08, 'sine', 0.15);
        },

        // Специальные
        bootUp() {
            // Звук включения системы: нарастающий тон + шум
            if (!enabled || !ensureContext()) return;
            noiseBurst('event', 0.3, 0.06);
            setTimeout(() => {
                beep('event', 200, 0.3, 'sine', 0.1);
                setTimeout(() => beep('event', 400, 0.2, 'sine', 0.15), 200);
                setTimeout(() => beep('event', 800, 0.15, 'sine', 0.2), 350);
            }, 100);
        },

        gmBoot() {
            // GM boot — ниже, холоднее
            if (!enabled || !ensureContext()) return;
            beep('event', 100, 0.4, 'sine', 0.08);
            setTimeout(() => beep('event', 150, 0.3, 'sine', 0.1), 300);
            setTimeout(() => noiseBurst('event', 0.1, 0.04), 500);
        },

        deleteMarker() {
            beep('ui', 400, 0.08, 'sine', 0.1);
            setTimeout(() => noiseBurst('ui', 0.04, 0.05), 40);
        },

        questComplete() {
            dualTone('event', 600, 900, 0.08, 0.12, 'sine', 0.2);
        },

        error() {
            beep('event', 200, 0.12, 'sawtooth', 0.2);
        },

        sendMessage() {
            beep('ui', 1000, 0.04, 'sine', 0.12);
        },
    };

    // ── PUBLIC API ──

    window.Audio = {
        play(name) {
            unlock();
            if (SFX[name]) SFX[name]();
        },

        setVolume(channel, value) {
            const v = Math.max(0, Math.min(1, value));
            if (channel === 'master' && masterGain) {
                masterGain.gain.value = v;
            } else if (channels[channel]) {
                channels[channel].gain.value = v;
            }
            saveSettings();
        },

        getVolume(channel) {
            if (channel === 'master') return masterGain ? masterGain.gain.value : DEFAULT_VOLUMES.master;
            return channels[channel] ? channels[channel].gain.value : DEFAULT_VOLUMES[channel] || 0;
        },

        setEnabled(val) {
            enabled = !!val;
            if (masterGain) {
                if (!enabled) {
                    masterGain.gain.value = 0;
                    stopAmbientHum();
                    stopRadioNoise();
                } else {
                    const s = loadSettings();
                    masterGain.gain.value = s.master;
                }
            }
            saveSettings();
        },

        isEnabled() { return enabled; },

        startAmbient() { startAmbientHum(); },
        stopAmbient()  { stopAmbientHum(); },

        startRadioNoise() { startRadioNoise(); },
        stopRadioNoise()  { stopRadioNoise(); },

        // Для первого user gesture
        unlock,

        // Доступ к именам звуков (для дебага)
        getSFXNames() { return Object.keys(SFX); },
    };

})();
