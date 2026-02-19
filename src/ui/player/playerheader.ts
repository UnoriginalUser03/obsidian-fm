// ui/player/PlayerHeader.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { setMute, setVolume } from "src/api/kenku";
import { PlaybackState } from "src/playback/playbackstate";

export class PlayerHeader {
  private container: HTMLElement;
  private titleEl: HTMLElement;
  private playlistEl: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private muteIcon: HTMLElement;
  private volumeSlider: HTMLInputElement;

  constructor(
    private plugin: ObsidianFMPlugin,
    parent: HTMLElement
  ) {
    this.container = parent.createDiv({ cls: "obsidianfm-header-row" });

    const titleContainer = this.container.createDiv({
      cls: "obsidianfm-now-playing-info",
    });

    this.titleEl = titleContainer.createDiv({ cls: "obsidianfm-track-title" });
    this.playlistEl = titleContainer.createDiv({ cls: "obsidianfm-playlist-name" });

    const volumeContainer = this.container.createDiv({
      cls: "obsidianfm-volume-container",
    });

    // Mute button
    this.muteBtn = volumeContainer.createEl("button", { cls: "obsidianfm-mute-btn" });
    this.muteIcon = this.muteBtn.createDiv({ cls: "obsidianfm-mute-icon" });

    this.muteBtn.addEventListener("click", async () => {
      const newMuted = !this.plugin.playback.muted;
      await setMute(this.plugin.settings.baseUrl, newMuted);
      this.plugin.playback.muted = newMuted;
      this.update(this.plugin.playback);
    });

    // Volume slider
    this.volumeSlider = volumeContainer.createEl("input", {
      attr: { type: "range", min: "0", max: "100" },
      cls: "obsidianfm-volume-slider",
    }) as HTMLInputElement;

    this.volumeSlider.addEventListener("input", async (e) => {
      const val = (e.target as HTMLInputElement).valueAsNumber;

      this.plugin.playback.volume = val;

      // Boundary mute logic
      if (val === 0 && !this.plugin.playback.muted) {
        await setMute(this.plugin.settings.baseUrl, true);
        this.plugin.playback.muted = true;
      }
      if (val > 0 && this.plugin.playback.muted) {
        await setMute(this.plugin.settings.baseUrl, false);
        this.plugin.playback.muted = false;
      }

      await setVolume(this.plugin.settings.baseUrl, val / 100);

      this.update(this.plugin.playback);
    });
  }

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------
  update(s: PlaybackState) {
    // Titles
    let title = "Nothing playing";
    let playlistName = "";

    if (s.currentTrackId) {
      const track = this.plugin.music.find(t => t.id === s.currentTrackId);
      if (track) {
        title = track.title;
        playlistName = track.playlistName ?? "";
      }
    } else if (s.currentPlaylistId) {
      const playlist = this.plugin.playlists.find(p => p.id === s.currentPlaylistId);
      if (playlist) title = playlist.title;
    }

    this.titleEl.textContent = title;
    this.playlistEl.textContent = playlistName;

    // Mute
    setIcon(this.muteIcon, s.muted ? "volume-x" : "volume-2");
    this.muteBtn.classList.toggle("is-muted", s.muted);

    // Volume
    const vol = s.volume ?? 100;
    this.volumeSlider.value = vol.toString();
    this.volumeSlider.style.setProperty("--volume-fill", `${vol}%`);
  }
}