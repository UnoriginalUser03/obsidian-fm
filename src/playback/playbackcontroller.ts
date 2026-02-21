// core/playback/PlaybackController.ts
import { playSound, setNextTrack, setPlayback, setPlaylistPlayback, setPreviousTrack, setRepeat, setShuffle, stopSound } from "src/api/kenku";
import { MediaType, PlaybackSnapshot, RepeatMode, Sound } from "src/api/types";
import { SoundscapeButton } from "src/inline/button types/soundscapebutton";
import ObsidianFMPlugin from "src/main";

export class PlaybackController {
    public suppressRestore = false;
    public previewSnapshot: PlaybackSnapshot | null = null;
    private additivePreviewStarted = false;


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
    async playTrack(id: string, opts?: { shuffle?: boolean; repeat?: RepeatMode; volume?: number }) {
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

    async playPlaylist(id: string, opts?: { shuffle?: boolean; repeat?: RepeatMode; volume?: number }) {
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
        this.state.currentSounds.set(id, { progress: 0, duration: 0, frozen: false });
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

    // ------------------------------------------------------------
    // SOUNDSCAPE
    // ------------------------------------------------------------
    async playSoundscape(id: string, stackIds: string[]) {
        const s = this.state;

        // Stop previous soundscape
        if (s.currentSoundscapeId && s.currentSoundscapeId !== id) {
            await this.stopSoundscape(s.currentSoundscapeId);
        }

        // Start new one
        for (const sid of stackIds) {
            await playSound(this.baseUrl, sid, "sound");
            s.currentSounds.set(sid, { progress: 0, duration: 0, frozen: false });
        }

        s.currentSoundscapeId = id;
        s.resetSoundBaseline(performance.now());
        this.updateUI();
    }

    async stopSoundscape(id: string) {
        const s = this.state;
        const btn = this.plugin.inlineButtons.getSoundscapeById(id) as SoundscapeButton;
        const stack = btn?.stackIds || [];

        for (const sid of stack) {
            await stopSound(this.baseUrl, "sound", sid);
            s.currentSounds.delete(sid);
        }

        if (s.currentSoundscapeId === id) {
            s.currentSoundscapeId = null;
        }

        this.updateUI();
    }

    async Pause() {
        const s = this.state;
        if (!s.currentTrackId) return;

        await setPlaylistPlayback(this.baseUrl, false);
        s.paused = true;
        this.updateUI();
    }

    async Resume() {
        const s = this.state;
        if (!s.currentTrackId) return;

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

        if (snapshot.paused && restoredSomething) {
            await new Promise(res => setTimeout(res, 50));
            await this.Pause();
        }

        s.resetSoundBaseline(performance.now());
        s.resetTrackBaseline(performance.now());
        this.updateUI();
    }
    async enterPreviewMode(
        id: string,
        type: MediaType,
        opts?: { additive?: boolean }
    ) {
        const additive = opts?.additive ?? false;

        if (!this.previewSnapshot) {
            this.previewSnapshot = this.captureState();
            this.additivePreviewStarted = false; // reset for new preview session
        }

        // If additive but first call → stop everything once
        if (additive && !this.additivePreviewStarted) {
            await this.stopAll();
            this.additivePreviewStarted = true;
        }

        // If not additive → always stop all
        if (!additive) {
            await this.stopAll();
        }

        await playSound(this.baseUrl, id, type);

        if (type === "sound") {
            this.state.currentSounds.set(id, { progress: 0, duration: 0 });
        }
        if (type === "track") this.state.currentTrackId = id;
        if (type === "playlist") this.state.currentPlaylistId = id;

        this.updateUI();
    }

    async exitPreviewMode() {
        await this.stopAll();

        if (!this.suppressRestore && this.previewSnapshot) {
            const snap = this.previewSnapshot;
            this.previewSnapshot = null;
            this.additivePreviewStarted = false;
            await this.restoreState(snap);
        } else {
            this.previewSnapshot = null;
            this.additivePreviewStarted = false;
        }
    }
}