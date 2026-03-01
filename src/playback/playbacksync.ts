import ObsidianFMPlugin from "src/main";
import {
  getPlaylistPlaybackStatus,
  getSoundboardPlaybackStatus,
} from "src/api/kenku";
import { PlaybackState } from "./playbackstate";
import { InlineButtonRegistry } from "src/inline/inlinebuttonregistry";

export class PlaybackSync {
  private intervalStarted = false;

  constructor(
    private plugin: ObsidianFMPlugin,
    private state: PlaybackState,
    private registry: InlineButtonRegistry
  ) { }

  // ------------------------------------------------------------
  // START SYNC LOOP
  // ------------------------------------------------------------
  start() {
    if (this.intervalStarted) return;
    this.intervalStarted = true;

    this.plugin.registerInterval(
      window.setInterval(() => this.syncOnce(), 1000)
    );
  }

  // ------------------------------------------------------------
  // ONE SYNC TICK
  // ------------------------------------------------------------
  private async syncOnce() {
    const baseUrl = this.plugin.settings.baseUrl;

    try {
      const [playback, soundboardPlayback] = await Promise.all([
        getPlaylistPlaybackStatus(baseUrl),
        getSoundboardPlaybackStatus(baseUrl),
      ]);

      if (!playback) throw new Error("No response from KenkuFM");

      const now = performance.now();
      let changed = false;

      // --------------------------------------------------------
      // TRACK + PLAYLIST ID CHANGES
      // --------------------------------------------------------
      const newTrackId = playback.track?.id ?? null;
      const newPlaylistId = playback.playlist?.id ?? null;

      if (this.state.currentTrackId !== newTrackId) {
        this.state.currentTrackId = newTrackId;
        this.state.resetTrackBaseline(now);
        changed = true;
      }

      if (this.state.currentPlaylistId !== newPlaylistId) {
        this.state.currentPlaylistId = newPlaylistId;
        this.state.resetTrackBaseline(now);
        changed = true;
      }

      // --------------------------------------------------------
      // PAUSED STATE
      // --------------------------------------------------------
      const newPaused =
        (playback.track || playback.playlist) && !playback.playing;

      if (this.state.paused !== newPaused) {
        this.state.paused = newPaused;
        this.state.resetTrackBaseline(now);
        changed = true;
      }

      // --------------------------------------------------------
      // TRACK PROGRESS + DURATION
      // --------------------------------------------------------
      if (playback.track) {
        this.state.trackProgress = playback.track.progress;
        this.state.trackDuration = playback.track.duration;
        this.state.resetTrackBaseline(now);
      } else {
        this.state.trackProgress = null;
        this.state.trackDuration = null;
      }

      // --------------------------------------------------------
      // SOUNDBOARD / SOUND SYNC
      // --------------------------------------------------------
      const newSoundMap = new Map<
        string,
        { progress: number; duration: number; frozen?: boolean }
      >();

      soundboardPlayback?.sounds.forEach((s) => {
        const existing = this.state.currentSounds.get(s.id);

        newSoundMap.set(s.id, {
          progress: s.progress,
          duration: s.duration,
          frozen: existing?.frozen ?? false,
        });
      });

      if (!this.mapsEqual(newSoundMap, this.state.currentSounds)) {
        this.state.currentSounds = newSoundMap;
        this.state.resetSoundBaseline(now);
        changed = true;
      }

      // --------------------------------------------------------
      // OTHER PLAYBACK STATE
      // --------------------------------------------------------
      this.state.shuffle = playback.shuffle ?? false;
      this.state.repeat = playback.repeat ?? "off";
      this.state.volume =
        playback.volume != null
          ? Math.min(100, Math.max(0, Math.round(playback.volume * 100)))
          : 100;
      this.state.muted = playback.muted ?? false;

      // --------------------------------------------------------
      // PREVIEW END DETECTION
      // --------------------------------------------------------
      if (this.state.previewing) {
        if (this.state.previewSoundscapeActive) {
          return;
        }

        const activePreviewSfx = this.state.previewItems
          .filter(p => p.type === "sound")
          .filter(p => this.state.currentSounds.has(p.id));

        const activePreviewTracks = this.state.previewItems
          .filter(p => p.type !== "sound")
          .filter(p =>
            playback.track &&
            playback.track.id === p.id &&
            playback.track.progress < playback.track.duration
          );

        // Keep only active preview items
        this.state.previewItems = [
          ...activePreviewSfx,
          ...activePreviewTracks,
        ];

        if (this.state.previewItems.length === 0) {
          this.state.previewing = false;
        }
      }

      // --------------------------------------------------------
      // NOTIFY UI (MAIN PLAYBACK ONLY WHEN NOT PREVIEWING)
      // --------------------------------------------------------
      if (!this.state.previewing) {
        this.plugin.views.forEach((v) => {
          v.resetInterpolationBaselines();
          v.updateNonSfxUI();
          v.updateSfxUI();
        });

        if (changed) {
          this.registry.updateAll(performance.now());
        }
      }

      // Mark online (PlaybackSync does NOT handle reconnection)
      this.plugin.kenkuOnline = true;

    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }

  // ------------------------------------------------------------
  // MAP COMPARISON
  // ------------------------------------------------------------
  private mapsEqual(
    a: Map<string, { progress: number; duration: number; frozen?: boolean }>,
    b: Map<string, { progress: number; duration: number; frozen?: boolean }>
  ) {
    if (a.size !== b.size) return false;

    for (const [key, value] of a.entries()) {
      const other = b.get(key);
      if (!other) return false;

      if (
        other.progress !== value.progress ||
        other.duration !== value.duration ||
        other.frozen !== value.frozen
      ) {
        return false;
      }
    }

    return true;
  }
}