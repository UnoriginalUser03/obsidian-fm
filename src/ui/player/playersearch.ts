// ui/player/PlayerSearch.ts
import ObsidianFMPlugin from "src/main";
import { Autocomplete } from "../autocomplete";
import { SuggestItem } from "src/api/types";
import { playSound } from "src/api/kenku";

export class PlayerSearch {
    private container: HTMLElement;
    private inputEl: HTMLInputElement;

    constructor(
        private plugin: ObsidianFMPlugin,
        parent: HTMLElement
    ) {
        this.container = parent.createDiv({ cls: "obsidianfm-search-container" });

        this.inputEl = this.container.createEl("input", {
            type: "text",
            cls: "obsidianfm-autocomplete",
            placeholder: "Search music, playlists, and sounds...",
        }) as HTMLInputElement;

        this.setupAutocomplete();
    }

    // ------------------------------------------------------------
    // AUTOCOMPLETE SETUP
    // ------------------------------------------------------------
    private setupAutocomplete() {
        const items: SuggestItem[] = [
            ...this.plugin.music.map(t => ({
                id: t.id,
                label: t.title,
                icon: "music",
                subtitle: t.playlistName,
                type: "track" as const,
            })),
            ...this.plugin.sounds.map(s => ({
                id: s.id,
                label: s.title,
                icon: "audio-lines",
                subtitle: s.soundboardName,
                type: "sound" as const,
            })),
            ...this.plugin.playlists.map(p => ({
                id: p.id,
                label: p.title,
                icon: "list-music",
                subtitle: "Playlist",
                type: "playlist" as const,
            })),
            ...this.plugin.soundboards.map(sb => ({
                id: sb.id,
                label: sb.title,
                icon: "square-play",
                subtitle: "Soundboard",
                type: "soundboard" as const,
            })),
        ];

        const autocomplete = new Autocomplete(
            this.plugin.app,
            this.plugin,
            this.inputEl,
            items,

            // On select
            (item) => {
                // Let the controller handle playback
                this.plugin.playbackController.playByType(item.id, item.type);

                // Clear input
                this.inputEl.value = "";

                // Close popup
                autocomplete.close();
            }
        );
    }
}