import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import ObsidianFMPlugin from "../main";
import {
    setNextTrack,
    setPreviousTrack,
    setPlaylistPlayback,
    setShuffle,
    setRepeat,
    setVolume,
    setMute,
} from "src/api/kenku";

export const VIEW_TYPE_OBSIDIANFM = "obsidianfm-playback";

export class ObsidianFMView extends ItemView {
    plugin: ObsidianFMPlugin;
    repeatIconMap: Record<string, string> = {
        off: "repeat",
        playlist: "repeat",
        track: "repeat-1",
    };

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianFMPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.icon = "audio-lines";
    }

    getViewType() {
        return VIEW_TYPE_OBSIDIANFM;
    }

    getDisplayText() {
        return "ObsidianFM Playback";
    }

    async onOpen() {
        if (!this.plugin.views.includes(this)) this.plugin.views.push(this);
        this.render();
    }

    async onClose() {
        this.plugin.views.remove(this);
    }

    render() {
        const container = this.contentEl;

        // First-time setup
        if (!container.querySelector(".obsidianfm-player-inner")) {
            container.empty();

            const inner = container.createDiv({ cls: "obsidianfm-player-inner obsidianfm-player-container" });
            const headerRow = inner.createDiv({ cls: "obsidianfm-header-row" });

            const titleContainer = headerRow.createDiv({
                cls: "obsidianfm-now-playing-info",
            });
            titleContainer.createDiv({ cls: "obsidianfm-track-title" });
            titleContainer.createDiv({ cls: "obsidianfm-playlist-name" });

            const volumeContainer = headerRow.createDiv({
                cls: "obsidianfm-volume-container",
            });

            const muteBtn = volumeContainer.createEl("button", { cls: "obsidianfm-mute-btn" });
            muteBtn.createDiv({ cls: "obsidianfm-mute-icon" });
            setIcon(
                muteBtn.querySelector(".obsidianfm-mute-icon") as HTMLElement,
                this.plugin.currentMuted ? "volume-x" : "volume-2"
            );
            muteBtn.addEventListener("click", async () => {
                const newMuted = !this.plugin.currentMuted;

                await setMute(this.plugin.settings.baseUrl, newMuted);
                this.plugin.currentMuted = newMuted;

                this.updateDynamicElements();
            });

            const volumeSlider = volumeContainer.createEl("input", {
                attr: {
                    type: "range",
                    min: "0",
                    max: "100",
                    value: this.plugin.currentVolume ?? 100,
                },
                cls: "obsidianfm-volume-slider"
            });

            // Volume slider
            volumeSlider.addEventListener("input", async (e) => {
                const val = (e.target as HTMLInputElement).valueAsNumber;

                // Save volume locally
                this.plugin.currentVolume = val;

                // ---- Boundary mute logic ----

                // Slider hits 0 → force mute ON
                if (val === 0 && !this.plugin.currentMuted) {
                    await setMute(this.plugin.settings.baseUrl, true);
                    this.plugin.currentMuted = true;
                }

                // Slider moves above 0 → force mute OFF
                if (val > 0 && this.plugin.currentMuted) {
                    await setMute(this.plugin.settings.baseUrl, false);
                    this.plugin.currentMuted = false;
                }

                volumeSlider.style.setProperty("--volume-fill", `${val}%`);
                // Always send volume update
                await setVolume(this.plugin.settings.baseUrl, val / 100);
                this.updateDynamicElements();
            });

            // Controls container (centered)
            const controlsContainer = inner.createDiv({ cls: "obsidianfm-controls-container" });

            // Shuffle
            const shuffleBtn = controlsContainer.createEl("button", { cls: "obsidianfm-shuffle-btn" });
            setIcon(shuffleBtn, "shuffle");
            shuffleBtn.addEventListener("click", async () => {
                const newState = !this.plugin.currentShuffle;
                await setShuffle(this.plugin.settings.baseUrl, newState);
                this.plugin.currentShuffle = newState;
                this.updateDynamicElements();
            });

            // Previous
            const prevBtn = controlsContainer.createEl("button", { cls: "obsidianfm-prev-btn" });
            setIcon(prevBtn, "skip-back");
            prevBtn.addEventListener("click", async () => {
                await setPreviousTrack(this.plugin.settings.baseUrl);
            });

            // Play/Pause
            const playBtn = controlsContainer.createEl("button", { cls: "obsidianfm-play-pause-btn" });
            playBtn.createDiv({ cls: "obsidianfm-play-pause-icon" });
            playBtn.addEventListener("click", async () => {
                if (this.plugin.currentPlaybackPaused) {
                    await setPlaylistPlayback(this.plugin.settings.baseUrl, true);
                } else {
                    await setPlaylistPlayback(this.plugin.settings.baseUrl, false);
                }
                this.plugin.updateAllInlineButtons();
                this.updateDynamicElements();
            });

            // Next
            const nextBtn = controlsContainer.createEl("button", { cls: "obsidianfm-next-btn" });
            setIcon(nextBtn, "skip-forward");
            nextBtn.addEventListener("click", async () => {
                await setNextTrack(this.plugin.settings.baseUrl);
            });

            // Repeat
            const repeatBtn = controlsContainer.createEl("button", { cls: "obsidianfm-repeat-btn" });
            repeatBtn.createDiv({ cls: "obsidianfm-repeat-icon" });
            setIcon(repeatBtn.querySelector(".obsidianfm-repeat-icon") as HTMLElement, this.repeatIconMap[this.plugin.currentRepeat ?? "off"]);
            repeatBtn.addEventListener("click", async () => {
                const order: ("off" | "playlist" | "track")[] = ["off", "playlist", "track"];
                const currentIndex = order.indexOf(this.plugin.currentRepeat ?? "off");
                const nextRepeat = order[(currentIndex + 1) % order.length];
                await setRepeat(this.plugin.settings.baseUrl, nextRepeat);
                this.plugin.currentRepeat = nextRepeat;
                this.updateDynamicElements();
            });


            // Progress
            const progressContainer = inner.createDiv({ cls: "obsidianfm-progress-container" });
            progressContainer.createDiv({ cls: "obsidianfm-progress-bar" });
            progressContainer.createDiv({ cls: "obsidianfm-progress-time" });

            this.updateDynamicElements();
            return;
        }

        this.updateDynamicElements();
    }

    updateDynamicElements() {
        const trackId = this.plugin.currentInlineTrackId;
        const playlistId = this.plugin.currentInlinePlaylistId;
        const paused = this.plugin.currentPlaybackPaused;
        const progress = this.plugin.currentTrackProgress ?? 0;
        const duration = this.plugin.currentTrackDuration ?? 0;

        // Titles
        const titleEl = this.contentEl.querySelector(".obsidianfm-track-title");
        const playlistEl = this.contentEl.querySelector(".obsidianfm-playlist-name");

        let currentTitle = "Nothing playing";
        let playlistName = "";

        if (trackId) {
            const track = this.plugin.music.find((t) => t.id === trackId);
            if (track) {
                currentTitle = track.title;
                playlistName = track.playlistName ?? "";
            }
        } else if (playlistId) {
            const playlist = this.plugin.playlists.find((p) => p.id === playlistId);
            if (playlist) currentTitle = playlist.title;
        }

        if (titleEl) titleEl.textContent = currentTitle;
        if (playlistEl) playlistEl.textContent = playlistName;

        const muteBtn = this.contentEl.querySelector(".obsidianfm-mute-btn");
        if (muteBtn) {
            const iconContainer = muteBtn.querySelector(".obsidianfm-mute-icon") as HTMLElement;
            if (iconContainer) {
                setIcon(iconContainer, this.plugin.currentMuted ? "volume-x" : "volume-2");
                muteBtn.classList.toggle("is-muted", this.plugin.currentMuted);
            }
        }

        const volumeSlider = this.contentEl.querySelector(".obsidianfm-volume-slider") as HTMLInputElement;
        if (volumeSlider) {
            const volumeValue = this.plugin.currentVolume ?? 100;
            volumeSlider.value = volumeValue.toString();
            volumeSlider.style.setProperty("--volume-fill", `${volumeValue}%`);
        }
        // Play/Pause icon
        const playIcon = this.contentEl.querySelector(".obsidianfm-play-pause-icon") as HTMLElement;
        if (playIcon) setIcon(playIcon, paused ? "play" : "pause");

        // Shuffle
        const shuffleBtn = this.contentEl.querySelector(".obsidianfm-shuffle-btn");
        if (shuffleBtn) shuffleBtn.classList.toggle("is-active", !!this.plugin.currentShuffle);

        // Repeat
        const repeatBtn = this.contentEl.querySelector(".obsidianfm-repeat-btn") as HTMLElement;
        if (repeatBtn) {
            const active = this.plugin.currentRepeat && this.plugin.currentRepeat !== "off";
            repeatBtn.classList.toggle("is-active", active);
            const iconContainer = repeatBtn.querySelector(".obsidianfm-repeat-icon") as HTMLElement;
            if (iconContainer) setIcon(iconContainer, this.repeatIconMap[this.plugin.currentRepeat ?? "off"]);
        }

        // Progress bar
        const progressBar = this.contentEl.querySelector(".obsidianfm-progress-bar") as HTMLElement;
        if (progressBar) {
            const percent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
            progressBar.style.width = `${percent}%`;
        }

        // Time display
        const timeEl = this.contentEl.querySelector(".obsidianfm-progress-time");
        if (timeEl) {
            const formatTime = (s: number) => {
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60).toString().padStart(2, "0");
                return `${m}:${sec}`;
            };
            timeEl.textContent = `${formatTime(progress)} / ${formatTime(duration)}`;
        }
    }
}
