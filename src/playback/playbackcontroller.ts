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
    SoundscapeContext,
    SoundscapeItem,
} from "src/api/types";
import { SoundscapeButton } from "src/inline/button types/soundscapebutton";
import ObsidianFMPlugin from "src/main";

export class PlaybackController {
    public suppressRestore = false;
    public previewSnapshot: PlaybackSnapshot | null = null;
    private previewSettingsSnapshot: PlaybackSettingsSnapshot | null = null;
    public randomGroupTimers: Map<string, NodeJS.Timeout[]> = new Map();
    public watchPreview: NodeJS.Timer | null = null;
    public previewOwnedSounds = new Set<string>();

    private additivePreviewStarted = false;
    private previewUpdateListeners: Array<() => void> = [];
    private currentSoundscapeContext: SoundscapeContext | null = null;


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

    private isSoundscapeOwned(id: string): boolean {
        return this.currentSoundscapeContext?.ownedSounds.has(id) ?? false;
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
        // Do not stop sounds owned by an active soundscape
        if (this.isSoundscapeOwned(id)) return;

        await stopSound(this.baseUrl, "sound", id);
        this.state.currentSounds.delete(id);
        this.updateUI();
    }

    async stopSoundboard(boardId: string) {
        const board = this.plugin.soundboardMap.get(boardId);
        if (!board) return;

        const s = this.state;

        for (const soundId of board.sounds) {
            // Skip soundscape-owned sounds
            if (this.isSoundscapeOwned(soundId)) continue;

            if (s.currentSounds.has(soundId)) {
                await this.stopSoundEffect(soundId);
            }
        }

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

        // Stop previous soundscape if different
        if (s.currentSoundscapeId && s.currentSoundscapeId !== id) {
            await this.stopSoundscape(s.currentSoundscapeId);
        }

        // Build new context
        const ctx = this.buildSoundscapeContext(id, items);

        // Register loops + play them
        for (const item of items) {
            if (item.type === "loop") {
                ctx.loopIds.add(item.id);

                const alreadyPlaying = s.currentSounds.has(item.id);

                if (!alreadyPlaying) {
                    ctx.ownedSounds.add(item.id);

                    await playSound(this.baseUrl, item.id, "sound");
                    s.currentSounds.set(item.id, {
                        progress: 0,
                        duration: 0,
                        frozen: false,
                    });
                }
            }

            if (item.type === "flavour-group") {
                this.startRandomGroupScheduler(id, item, ctx);
            }
        }

        this.currentSoundscapeContext = ctx;
        s.currentSoundscapeId = id;
        s.resetSoundBaseline(performance.now());
        this.updateUI();
    }

    private startRandomGroupScheduler(
        soundscapeId: string,
        item: Extract<SoundscapeItem, { type: "flavour-group" }>,
        ctx?: SoundscapeContext
    ) {
        if (!this.randomGroupTimers.has(soundscapeId)) {
            this.randomGroupTimers.set(soundscapeId, []);
        }

        const timers = this.randomGroupTimers.get(soundscapeId)!;
        const s = this.state;

        const scheduleNext = () => {
            const delaySeconds = Math.random() * (item.max - item.min) + item.min;
            const delayMs = delaySeconds * 1000;

            // Pick next sound NOW
            const available = item.ids.filter(id => !s.currentSounds.has(id));
            const nextSoundId = available.length > 0
                ? available[Math.floor(Math.random() * available.length)]
                : item.ids[Math.floor(Math.random() * item.ids.length)];

            const timerId = `${soundscapeId}:${item.label}:${performance.now()}`;

            if (soundscapeId !== "__preview_soundscape__") {
                const pending: PendingTimer = {
                    id: timerId,
                    label: item.label,
                    duration: delaySeconds,
                    startedAt: performance.now(),
                    soundscapeId,
                    nextSoundId, // NEW
                };

                s.pendingTimers.push(pending);
                ctx?.timerIds.add(timerId);
            }

            const t = setTimeout(async () => {
                // Remove UI timer
                if (soundscapeId !== "__preview_soundscape__") {
                    s.pendingTimers = s.pendingTimers.filter(pt => pt.id !== timerId);
                    ctx?.timerIds.delete(timerId);
                }

                // Play the pre‑chosen sound
                try {
                    const alreadyPlaying = s.currentSounds.has(nextSoundId);
                    if (!alreadyPlaying) {
                        await playSound(this.baseUrl, nextSoundId, "sound");
                        s.currentSounds.set(nextSoundId, { progress: 0, duration: 0, frozen: false });

                        ctx?.randomIds.add(nextSoundId);
                        ctx?.ownedSounds.add(nextSoundId);

                        if (soundscapeId === "__preview_soundscape__") {
                            this.previewOwnedSounds.add(nextSoundId);
                        }
                    }
                } catch { }

                scheduleNext();
            }, delayMs);

            timers.push(t);
        };

        scheduleNext();
    }

    async stopSoundscape(id: string) {
        const s = this.state;
        const ctx = this.currentSoundscapeContext;

        if (!ctx || ctx.id !== id) {
            // Fallback: old behaviour
            for (const [sid] of s.currentSounds) {
                await stopSound(this.baseUrl, "sound", sid);
            }
            s.currentSounds.clear();
            s.pendingTimers = s.pendingTimers.filter(t => t.soundscapeId !== id);
            s.currentSoundscapeId = null;
            this.updateUI();
            return;
        }

        // Stop all owned sounds
        for (const soundId of ctx.ownedSounds) {
            await stopSound(this.baseUrl, "sound", soundId);
            s.currentSounds.delete(soundId);
        }

        // Cancel timers belonging to this soundscape
        s.pendingTimers = s.pendingTimers.filter(t => !ctx.timerIds.has(t.id));

        // Cancel random-group schedulers
        const timers = this.randomGroupTimers.get(id);
        if (timers) {
            for (const t of timers) clearTimeout(t);
            this.randomGroupTimers.delete(id);
        }

        // Clear context
        this.currentSoundscapeContext = null;
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
            restoredSomething = true;
        }

        for (const id of snapshot.sounds) {
            await playSound(this.baseUrl, id, "sound");
            s.currentSounds.set(id, { progress: 0, duration: 0 });
        }

        s.currentSoundscapeId = snapshot.soundscapeID;
        // Restart random-group timers for restored soundscape
        // Restore soundscape
        if (snapshot.soundscapeID) {
            const scId = snapshot.soundscapeID;

            const scBtn = this.plugin.inlineButtons.getPlaybackButton(scId) as SoundscapeButton;
            if (scBtn) {
                const ctx = this.buildSoundscapeContext(scId, scBtn.items);

                // Re-register loops
                for (const item of scBtn.items) {
                    if (item.type === "loop") {
                        ctx.ownedSounds.add(item.id);
                    }
                    if (item.type === "flavour-group") {
                        this.startRandomGroupScheduler(scId, item, ctx);
                    }
                }

                this.currentSoundscapeContext = ctx;
            }

            s.currentSoundscapeId = scId;
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

        if (restoredSomething) {
            await new Promise((res) => setTimeout(res, 50));
            if (snapshot.paused) await this.Pause();
            if (snapshot.trackProgress != null) await seekTo(this.baseUrl, snapshot.trackProgress);
        }
        s.resetSoundBaseline(performance.now());
        s.resetTrackBaseline(performance.now());
        this.updateUI();
    }

    public async stopPreviewAudioOnly() {
        const s = this.state;

        for (const id of this.previewOwnedSounds) {
            await stopSound(this.baseUrl, "sound", id);
            s.currentSounds.delete(id);
        }

        this.previewOwnedSounds.clear();

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

        // Capture snapshot once
        if (!this.previewSnapshot) {
            this.previewSnapshot = this.captureState();
            this.additivePreviewStarted = false;
        }

        // Capture playback settings once
        if (!this.previewSettingsSnapshot) {
            this.previewSettingsSnapshot = {
                shuffle: this.state.shuffle,
                repeat: this.state.repeat,
                volume: this.state.volume,
                muted: this.state.muted,
            };
        }

        // Reset preview state if not additive
        if (!additive) {
            await this.stopAll();
            s.previewItems = [];
        }

        if (additive && !this.additivePreviewStarted) {
            await this.stopAll();
            s.previewItems = [];
            this.additivePreviewStarted = true;
        }

        if (type === "playlist") {
            const playlist = this.plugin.playlists.find(p => p.id === id);

            if (playlist && playlist.tracks.length > 0) {
                const randomTrack = playlist.tracks[Math.floor(Math.random() * playlist.tracks.length)];

                // Play the actual track
                await playSound(this.baseUrl, randomTrack, "track");

                // Track both the playlist and the track
                s.previewItems.push({ id, type: "playlist" });
                s.previewItems.push({ id: randomTrack, type: "track" });

                s.previewing = true;
                this.notifyPreviewUpdate();
                this.startPreviewWatcher();
                this.updateUI();
                return;
            }
        }

        if (type === "soundboard") {
            const board = this.plugin.soundboardMap.get(id);

            if (board && board.sounds.length > 0) {
                const randomSound = board.sounds[Math.floor(Math.random() * board.sounds.length)];

                // Play the actual sound
                await playSound(this.baseUrl, randomSound, "sound");

                // Track both the soundboard and the sound
                s.previewItems.push({ id, type: "soundboard" });
                s.previewItems.push({ id: randomSound, type: "sound" });

                s.previewing = true;
                this.notifyPreviewUpdate();
                this.startPreviewWatcher();
                this.updateUI();
                return;
            }
        }

        await playSound(this.baseUrl, id, type);
        s.previewing = true;

        if (opts?.override && (type === "track" || type === "playlist")) {
            await setPlayback(
                this.baseUrl,
                opts.override.shuffle,
                opts.override.repeat,
                opts.override.volume,
                opts.override.muted
            );
        }

        s.previewItems.push({ id, type });

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
                this.previewOwnedSounds.add(item.id);
            }

            if (item.type === "flavour-group") {
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

    private buildSoundscapeContext(id: string, items: SoundscapeItem[]): SoundscapeContext {
        return {
            id,
            title: this.plugin.inlineButtons.getPlaybackButton(id)?.title ?? "Soundscape",
            loopIds: new Set(
                items
                    .filter((i): i is Extract<SoundscapeItem, { type: "loop" }> => i.type === "loop")
                    .map(i => i.id)
            ),
            randomIds: new Set(),
            timerIds: new Set(),
            ownedSounds: new Set(),
        };
    }


}