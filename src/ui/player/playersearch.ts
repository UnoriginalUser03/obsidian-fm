import ObsidianFMPlugin from "src/main";
import { Autocomplete } from "../search/autocomplete";
import { SuggestItem } from "src/api/types";

export class PlayerSearch {
    private autocomplete: Autocomplete | null = null;
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
        // Initial build
        this.setupAutocomplete();

        // Rebuild when Kenku comes back online
        this.plugin.events.on("obsidian-fm:online", () => {
            this.refreshAutocomplete();
        });
    }

    // ------------------------------------------------------------
    // REBUILD AUTOCOMPLETE SAFELY
    // ------------------------------------------------------------
    private refreshAutocomplete() {
        if (this.autocomplete) {
            this.autocomplete.destroy();   // <-- important: full teardown
            this.autocomplete = null;
        }

        this.setupAutocomplete();
    }

    // ------------------------------------------------------------
    // BUILD AUTOCOMPLETE INSTANCE
    // ------------------------------------------------------------
    private setupAutocomplete() {
        const items: SuggestItem[] = [];

        // --- PLAYLISTS (parents) ---
        for (const p of this.plugin.playlists) {
            items.push({
                id: p.id,
                label: p.title,
                icon: "list-music",
                subtitle: "Playlist",
                type: "playlist",
                isParent: true,
                childrenLabels: p.tracks
                    .map(id => this.plugin.music.find(t => t.id === id)?.title)
                    .filter(Boolean) as string[],
            });
        }

        // --- TRACKS (children) ---
        for (const t of this.plugin.music) {
            items.push({
                id: t.id,
                label: t.title,
                icon: "music",
                subtitle: t.playlistName,
                type: "track",
                parentLabel: t.playlistName,
            });
        }

        // --- SOUNDBOARDS (parents) ---
        for (const sb of this.plugin.soundboards) {
            items.push({
                id: sb.id,
                label: sb.title,
                icon: "square-play",
                subtitle: "Soundboard",
                type: "soundboard",
                isParent: true,
                childrenLabels: sb.sounds
                    .map(id => this.plugin.sounds.find(s => s.id === id)?.title)
                    .filter(Boolean) as string[],
            });
        }

        // --- SOUNDS (children) ---
        for (const s of this.plugin.sounds) {
            items.push({
                id: s.id,
                label: s.title,
                icon: "audio-lines",
                subtitle: s.soundboardName,
                type: "sound",
                parentLabel: s.soundboardName,
            });
        }

        this.autocomplete = new Autocomplete(
            this.plugin.app,
            this.plugin,
            this.inputEl,
            items,
            (item) => {
                this.plugin.playbackController.playByType(item.id, item.type);
                this.inputEl.value = "";
                this.autocomplete?.close();
            }
        );
    }
}