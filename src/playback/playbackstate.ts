import { RepeatMode, MediaType, PreviewItem } from "src/api/types";

export class PlaybackState {
  // Track / playlist
  currentTrackId: string | null = null;
  currentPlaylistId: string | null = null;
  currentSoundscapeId: string | null = null;

  // SFX + soundboard sounds
  currentSounds: Map<
    string,
    { progress: number; duration: number; frozen?: boolean }
  > = new Map();

  // Preview
  previewing: boolean = false;
  previewItems: PreviewItem[] = [];

  // Playback flags
  paused = false;
  shuffle = false;
  repeat: RepeatMode = "off";

  // Track progress
  trackProgress: number | null = null;
  trackDuration: number | null = null;

  // Volume
  volume: number | null = null;
  muted = false;

  // Interpolation baselines
  lastTrackSyncTime: number | null = null;
  lastSoundSyncTime: number | null = null;

  resetTrackBaseline(now: number) {
    this.lastTrackSyncTime = now;
  }

  resetSoundBaseline(now: number) {
    this.lastSoundSyncTime = now;
  }
}