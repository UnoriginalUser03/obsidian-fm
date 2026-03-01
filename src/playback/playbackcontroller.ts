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
    PlaybackSnapshot,
    RepeatMode,
    SoundscapeItem,
} from "src/api/types";
import ObsidianFMPlugin from "src/main";

export class PlaybackController {
    public suppressRestore = false;
    public previewSnapshot: PlaybackSnapshot | null = null;
    public randomGroupTimers: Map<string, NodeJS.Timeout[]> = new Map();
    private additivePreviewStarted = false;

    private watchPreview: NodeJS.Timer | null = null;
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
        const scheduleNext = () => {
            const delay =
                (Math.random() * (item.max - item.min) + item.min) * 1000;

            const t = setTimeout(async () => {
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
            }, delay);

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

    async enterPreviewMode(id: string, type: MediaType, opts?: { additive?: boolean }) {
        const s = this.state;
        const additive = opts?.additive ?? false;

        // Capture snapshot only once per preview session
        if (!this.previewSnapshot) {
            this.previewSnapshot = this.captureState();
            this.additivePreviewStarted = false;
        }

        // Non-additive preview always stops everything
        if (!additive) {
            await this.stopAll();
            s.previewItems = [];
        }

        // Additive preview: stop everything only on the first item
        if (additive && !this.additivePreviewStarted) {
            await this.stopAll();
            s.previewItems = [];
            this.additivePreviewStarted = true;
        }

        // Play the new preview item
        await playSound(this.baseUrl, id, type);

        s.previewing = true;

        // Push all soundboard sounds and playback sync will prune the only playing one
        // Probs a better way to do this but idgaf 
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

        // End preview session
        s.previewing = false;

        // Stop ONLY preview audio, not everything
        await this.stopPreviewAudioOnly();

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
}