import {
    playSound,
    seekTo,
    setNextTrack,
    setPlayback,
    setPlaylistPlayback,
    setPreviousTrack,
    setRepeat,
    setShuffle,
    stopSound,
} from "src/api/kenku";
import {
    MediaType,
    PendingTimer,
    PlaybackSettingsSnapshot,
    PlaybackSnapshot,
    RepeatMode,
    SoundscapeItem,
} from "src/api/types";
import ObsidianFMPlugin from "src/main";

export class PlaybackController {
    public suppressRestore = false;
    public previewSnapshot: PlaybackSnapshot | null = null;
    private previewSettingsSnapshot: PlaybackSettingsSnapshot | null = null;
    public randomGroupTimers: Map<string, NodeJS.Timeout[]> = new Map();
    public watchPreview: NodeJS.Timer | null = null;

    private additivePreviewStarted = false;
    private previewUpdateListeners: Array<() => void> = [];

    constructor(private plugin: ObsidianFMPlugin) { }

    // ------------------------------------------------------------
    // BASIC HELPERS
    // ------------------------------------------------------------
    private get state() {
        return this.plugin.playback;
    }

    private get baseUrl() {
        return this.plugin.settings.baseUrl;
    }

    private updateUI() {
        this.plugin.inlineButtons.updateAll(performance.now());
    }

    // ------------------------------------------------------------
    // PREVIEW WATCHER + EVENTS
    // ------------------------------------------------------------
    private startPreviewWatcher() {
        if (this.watchPreview) return;

        this.watchPreview = setInterval(() => {
            // PlaybackSync will set previewing=false when nothing is playing
            if (!this.state.previewing && this.previewSnapshot) {
                this.exitPreviewMode();
                this.stopPreviewWatcher();
            }
        }, 200);
    }

    private stopPreviewWatcher() {
        if (this.watchPreview) {
            clearInterval(this.watchPreview);
            this.watchPreview = null;
        }
    }

    public onPreviewUpdate(callback: () => void) {
        this.previewUpdateListeners.push(callback);
    }

    public notifyPreviewUpdate() {
        for (const cb of this.previewUpdateListeners) {
            try { cb(); } catch (e) { console.error(e); }
        }
    }

    // ------------------------------------------------------------
    // UNIVERSAL STOP
    // ------------------------------------------------------------
    async stopAll() {
        const s = this.state;

        // Stop track
        if (s.currentTrackId) {
            await stopSound(this.baseUrl, "track", s.currentTrackId);
            s.currentTrackId = null;
            s.currentPlaylistId = null;
        }

        // Stop soundscape
        if (s.currentSoundscapeId) {
            await this.stopSoundscape(s.currentSoundscapeId);
        }

        // Stop all SFX
        for (const id of [...s.currentSounds.keys()]) {
            await stopSound(this.baseUrl, "sound", id);
            s.currentSounds.delete(id);
        }

        this.updateUI();
    }

    async playByType(id: string, type: MediaType) {
        switch (type) {
            case "track":
                await this.playTrack(id);
                break;
            case "playlist":
                await this.playPlaylist(id);
                break;
            case "sound":
            case "soundboard":
                await this.playSoundEffect(id);
                break;
        }
    }

    // ------------------------------------------------------------
    // TRACK / PLAYLIST
    // ------------------------------------------------------------
    async playTrack(
        id: string,
        opts?: { shuffle?: boolean; repeat?: RepeatMode; volume?: number }
    ) {
        await playSound(this.baseUrl, id, "track");
        if (opts) {
            await setPlayback(this.baseUrl, opts.shuffle, opts.repeat, opts.volume);
        }

        const s = this.state;
        s.currentTrackId = id;
        s.paused = false;
        s.resetTrackBaseline(performance.now());

        this.updateUI();
    }

    async playPlaylist(
        id: string,
        opts?: { shuffle?: boolean; repeat?: RepeatMode; volume?: number }
    ) {
        await playSound(this.baseUrl, id, "playlist");
        if (opts) {
            await setPlayback(this.baseUrl, opts.shuffle, opts.repeat, opts.volume);
        }

        const s = this.state;
        s.currentPlaylistId = id;
        s.paused = false;
        s.resetTrackBaseline(performance.now());

        this.updateUI();
    }

    // ------------------------------------------------------------
    // SOUND EFFECT
    // ------------------------------------------------------------
    async playSoundEffect(id: string) {
        await playSound(this.baseUrl, id, "sound");
        this.state.currentSounds.set(id, {
            progress: 0,
            duration: 0,
            frozen: false,
        });
        this.state.resetSoundBaseline(performance.now());
        this.updateUI();
    }

    async stopSoundEffect(id: string) {
        await stopSound(this.baseUrl, "sound", id);
        this.state.currentSounds.delete(id);
        this.updateUI();
    }

    async stopEntireSoundboard(boardId: string) {
        const board = this.plugin.soundboardMap.get(boardId);
        if (!board) return;

        for (const id of board.sounds) {
            await stopSound(this.baseUrl, "sound", id);
            this.state.currentSounds.delete(id);
        }

        this.state.resetSoundBaseline(performance.now());
        this.updateUI();
    }

    async seekPlayback(to: number) {
        const s = this.state;
        await seekTo(this.baseUrl, to);

        s.trackProgress = to;
        s.resetTrackBaseline(performance.now());
        this.updateUI();
    }

    // ------------------------------------------------------------
    // SOUNDSCAPE
    // ------------------------------------------------------------
    async playSoundscape(id: string, items: SoundscapeItem[]) {
        const s = this.state;

        if (s.currentSoundscapeId && s.currentSoundscapeId !== id) {
            await this.stopSoundscape(s.currentSoundscapeId);
        }

        for (const item of items) {
            if (item.type === "loop") {
                await playSound(this.baseUrl, item.id, "sound");
                s.currentSounds.set(item.id, {
                    progress: 0,
                    duration: 0,
                    frozen: false,
                });
            }

            if (item.type === "random-group") {
                this.startRandomGroupScheduler(id, item);
            }
        }

        s.currentSoundscapeId = id;
        s.resetSoundBaseline(performance.now());
        this.updateUI();
    }
    private startRandomGroupScheduler(
        soundscapeId: string,
        item: Extract<SoundscapeItem, { type: "random-group" }>
    ) {
        if (!this.randomGroupTimers.has(soundscapeId)) {
            this.randomGroupTimers.set(soundscapeId, []);
        }

        const timers = this.randomGroupTimers.get(soundscapeId)!;
        const s = this.state;

        const scheduleNext = () => {
            const delaySeconds = Math.random() * (item.max - item.min) + item.min;
            const delayMs = delaySeconds * 1000;

            const timerId = `${soundscapeId}:${item.label}:${performance.now()}`;

            // Only add timers for REAL soundscapes, not preview
            if (soundscapeId !== "__preview_soundscape__") {
                const pending: PendingTimer = {
                    id: timerId,
                    label: item.label,
                    duration: delaySeconds,
                    startedAt: performance.now(),
                    soundscapeId,
                };

                s.pendingTimers.push(pending);
            }

            const t = setTimeout(async () => {
                // Remove UI timer (real soundscapes only)
                if (soundscapeId !== "__preview_soundscape__") {
                    s.pendingTimers = s.pendingTimers.filter(pt => pt.id !== timerId);
                }

                const available = item.ids.filter(
                    (id) => !this.state.currentSounds.has(id)
                );

                if (available.length === 0) {
                    scheduleNext();
                    return;
                }

                const id =
                    available[Math.floor(Math.random() * available.length)];

                try {
                    await playSound(this.baseUrl, id, "sound");
                } catch {
                    // ignore errors
                }

                scheduleNext();
            }, delayMs);

            timers.push(t);
        };

        scheduleNext();
    }

    async stopSoundscape(id: string) {
        const s = this.state;

        for (const [sid] of s.currentSounds) {
            await stopSound(this.baseUrl, "sound", sid);
        }
        s.currentSounds.clear();

        const timers = this.randomGroupTimers.get(id);
        if (timers) {
            for (const t of timers) clearTimeout(t);
            this.randomGroupTimers.delete(id);
        }

        // Remove UI timers for this soundscape
        s.pendingTimers = s.pendingTimers.filter(t => t.soundscapeId !== id);

        s.currentSoundscapeId = null;
        this.updateUI();
    }

    // ------------------------------------------------------------
    // PAUSE / RESUME / FLAGS
    // ------------------------------------------------------------
    async Pause() {
        const s = this.state;
        if (!s.currentTrackId) return;

        await setPlaylistPlayback(this.baseUrl, false);
        s.paused = true;
        this.updateUI();
    }

    async Resume(opts?: {
        shuffle?: boolean;
        repeat?: RepeatMode;
        volume?: number;
    }) {
        const s = this.state;
        if (!s.currentTrackId) return;

        if (opts) {
            await setPlayback(this.baseUrl, opts.shuffle, opts.repeat, opts.volume);
        }

        await setPlaylistPlayback(this.baseUrl, true);

        s.paused = false;
        s.resetTrackBaseline(performance.now());
        this.updateUI();
    }

    async toggleShuffle() {
        const s = this.state;
        const newState = !s.shuffle;

        await setShuffle(this.baseUrl, newState);
        s.shuffle = newState;

        this.updateUI();
    }

    async cycleRepeat() {
        const order = ["off", "playlist", "track"] as const;
        const current = this.state.repeat ?? "off";
        const idx = order.indexOf(current);
        const next = order[(idx + 1) % order.length];

        await setRepeat(this.baseUrl, next);
        this.state.repeat = next;

        this.updateUI();
    }

    async previousTrack() {
        await setPreviousTrack(this.baseUrl);
    }

    async nextTrack() {
        await setNextTrack(this.baseUrl);
    }

    // ------------------------------------------------------------
    // PREVIEW MODE
    // ------------------------------------------------------------
    captureState(): PlaybackSnapshot {
        const s = this.state;

        return {
            paused: s.paused,
            track: s.currentTrackId,
            sounds: [...s.currentSounds.keys()],
            playlistID: s.currentPlaylistId,
            soundscapeID: s.currentSoundscapeId,
            trackProgress: s.trackProgress,
        };
    }

    async restoreState(snapshot: PlaybackSnapshot) {
        const s = this.state;

        let restoredSomething = false;

        if (snapshot.track) {
            await playSound(this.baseUrl, snapshot.track, "track");
            s.currentTrackId = snapshot.track;
            s.currentPlaylistId = snapshot.playlistID;

            if (snapshot.trackProgress != null) {
                await seekTo(this.baseUrl, snapshot.trackProgress);
            }

            restoredSomething = true;
        }

        for (const id of snapshot.sounds) {
            await playSound(this.baseUrl, id, "sound");
            s.currentSounds.set(id, { progress: 0, duration: 0 });
        }

        s.currentSoundscapeId = snapshot.soundscapeID;
        // Restart random-group timers for restored soundscape
        if (snapshot.soundscapeID) {
            // Clear any old timers just in case
            const oldTimers = this.randomGroupTimers.get(snapshot.soundscapeID);
            if (oldTimers) {
                for (const t of oldTimers) clearTimeout(t);
                this.randomGroupTimers.delete(snapshot.soundscapeID);
            }

            // Look up the soundscape definition from inline buttons
            const sc = this.plugin.inlineButtons.getSoundscapeById(snapshot.soundscapeID);
            if (sc) {
                for (const item of sc.items) {
                    if (item.type === "random-group") {
                        this.startRandomGroupScheduler(snapshot.soundscapeID, item);
                    }
                }
            }
        }

        if (this.previewSettingsSnapshot) {
            await setPlayback(
                this.baseUrl,
                this.previewSettingsSnapshot.shuffle,
                this.previewSettingsSnapshot.repeat,
                this.previewSettingsSnapshot.volume
            );
            this.previewSettingsSnapshot = null;
        }

        if (snapshot.paused && restoredSomething) {
            await new Promise((res) => setTimeout(res, 50));
            await this.Pause();
        }

        s.resetSoundBaseline(performance.now());
        s.resetTrackBaseline(performance.now());
        this.updateUI();
    }

    public async stopPreviewAudioOnly() {
        const s = this.state;

        // Stop only preview items
        for (const p of s.previewItems) {
            if (p.type === "sound") {
                await stopSound(this.baseUrl, "sound", p.id);
                s.currentSounds.delete(p.id);
            }

            if (p.type === "track" || p.type === "playlist") {
                await stopSound(this.baseUrl, p.type, p.id);
                s.currentTrackId = null;
                s.currentPlaylistId = null;
            }
        }

        s.previewItems = [];
        this.notifyPreviewUpdate();
    }

    async enterPreviewMode(
        id: string,
        type: MediaType,
        opts?: {
            additive?: boolean;
            override?: {
                shuffle?: boolean;
                repeat?: RepeatMode;
                volume?: number;
                muted?: boolean;
            };
        }
    ) {
        const s = this.state;
        const additive = opts?.additive ?? false;

        if (!this.previewSnapshot) {
            this.previewSnapshot = this.captureState();
            this.additivePreviewStarted = false;
        }

        if (!this.previewSettingsSnapshot) {
            this.previewSettingsSnapshot = {
                shuffle: this.state.shuffle,
                repeat: this.state.repeat,
                volume: this.state.volume,
                muted: this.state.muted,
            };
        }

        if (!additive) {
            await this.stopAll();
            s.previewItems = [];
        }

        if (additive && !this.additivePreviewStarted) {
            await this.stopAll();
            s.previewItems = [];
            this.additivePreviewStarted = true;
        }

        // Play the new preview item
        await playSound(this.baseUrl, id, type);
        s.previewing = true;

        // Only apply playback overrides for music (track/playlist)
        if (opts?.override && (type === "track" || type === "playlist")) {
            await setPlayback(
                this.baseUrl,
                opts.override.shuffle,
                opts.override.repeat,
                opts.override.volume,
                opts.override.muted
            );
        }

        if (type === "soundboard") {
            const board = this.plugin.soundboardMap.get(id);
            if (board) {
                for (const sfxId of board.sounds) {
                    s.previewItems.push({ id: sfxId, type: "sound" });
                }
            }
        } else {
            s.previewItems.push({ id, type });
        }

        this.notifyPreviewUpdate();
        this.startPreviewWatcher();
        this.updateUI();
    }

    async exitPreviewMode() {
        this.stopPreviewWatcher();

        const s = this.state;

        s.previewing = false;
        s.previewSoundscapeActive = false;

        await this.stopPreviewAudioOnly();

        const timers = this.randomGroupTimers.get("__preview_soundscape__");
        if (timers) {
            for (const t of timers) clearTimeout(t);
            this.randomGroupTimers.delete("__preview_soundscape__");
        }

        // Safety: remove preview timers (should be none)
        s.pendingTimers = s.pendingTimers.filter(
            t => t.soundscapeId !== "__preview_soundscape__"
        );

        if (!this.suppressRestore && this.previewSnapshot) {
            const snap = this.previewSnapshot;
            this.previewSnapshot = null;
            this.additivePreviewStarted = false;
            await this.restoreState(snap);
        } else {
            this.previewSnapshot = null;
            this.additivePreviewStarted = false;
        }

        this.notifyPreviewUpdate();
        this.updateUI();
    }

    async previewSoundscape(items: SoundscapeItem[]) {
        const s = this.state;

        // Capture snapshot once
        if (!this.previewSnapshot) {
            this.previewSnapshot = this.captureState();
            this.additivePreviewStarted = false;
        }

        // Stop everything before preview
        await this.stopAll();
        s.previewItems = [];
        s.previewing = true;
        s.previewSoundscapeActive = true;

        // Use a special ID so timers are grouped
        const previewId = "__preview_soundscape__";

        // Start loop items and random-group timers
        for (const item of items) {
            if (item.type === "loop") {
                await playSound(this.baseUrl, item.id, "sound");
                s.currentSounds.set(item.id, { progress: 0, duration: 0, frozen: false });
            }

            if (item.type === "random-group") {
                this.startRandomGroupScheduler(previewId, item);
            }
        }

        // Track preview items so stopPreviewAudioOnly can clean them
        s.previewItems = items.map(i =>
            i.type === "loop"
                ? { id: i.id, type: "sound" }
                : { id: "__random_group__", type: "sound" }
        );

        this.startPreviewWatcher();
        this.updateUI();
    }
}