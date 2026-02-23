// core/connection/ConnectionHandler.ts
import { Notice } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { getMusic, getPlaylists, getSoundboards, getSounds, pingKenkuFM } from "./kenku";
import { InlineButtonRegistry } from "src/inline/inlinebuttonregistry";

export class ConnectionHandler {
    private reconnecting = false;
    private reconnectAttemptInFlight = false;

    constructor(
        private plugin: ObsidianFMPlugin,
        private registry: InlineButtonRegistry
    ) { }

    // ------------------------------------------------------------
    // INITIAL CONNECTION
    // ------------------------------------------------------------
    async connect() {
        const baseUrl = this.plugin.settings.baseUrl;

        const alive = await pingKenkuFM(baseUrl);
        if (!alive) {
            this.plugin.kenkuOnline = false;

            new Notice("KenkuFM Remote offline. Retrying...");
            this.plugin.events.trigger("obsidian-fm:offline");
            this.startReconnectLoop();
            return;
        }

        try {
            await this.loadAllData();
            this.plugin.kenkuOnline = true;

            new Notice("KenkuFM Remote connected!");
            this.plugin.events.trigger("obsidian-fm:online");
            this.registry.updateAll(performance.now());
        } catch (e) {
            console.error(e);
            this.handleDisconnect();
        }
    }

    // ------------------------------------------------------------
    // LOAD ALL KENKU DATA
    // ------------------------------------------------------------
    private async loadAllData() {
        const baseUrl = this.plugin.settings.baseUrl;

        const [sounds, music, playlists, soundboards] = await Promise.all([
            getSounds(baseUrl),
            getMusic(baseUrl),
            getPlaylists(baseUrl),
            getSoundboards(baseUrl),
        ]);

        this.plugin.sounds = sounds;
        this.plugin.music = music;
        this.plugin.playlists = playlists;
        this.plugin.soundboards = soundboards;

        this.plugin.soundMap = new Map(sounds.map((s) => [s.id, s]));
        this.plugin.soundboardMap = new Map(soundboards.map((sb) => [sb.id, sb]));
    }

    // ------------------------------------------------------------
    // DISCONNECT HANDLING
    // ------------------------------------------------------------
    handleDisconnect() {
        if (!this.plugin.kenkuOnline) return;

        this.plugin.kenkuOnline = false;
        new Notice("KenkuFM Remote disconnected");
        this.plugin.events.trigger("obsidian-fm:offline");

        // Reset playback state
        const s = this.plugin.playback;
        s.currentTrackId = null;
        s.currentPlaylistId = null;
        s.currentSounds.clear();

        this.plugin.inlineButtons.updateAll(performance.now());
        this.startReconnectLoop();
    }

    // ------------------------------------------------------------
    // RECONNECT LOOP
    // ------------------------------------------------------------
    private startReconnectLoop() {
        if (this.reconnecting) return;
        this.reconnecting = true;

        this.plugin.registerInterval(
            window.setInterval(async () => {
                if (this.plugin.kenkuOnline) return;
                if (this.reconnectAttemptInFlight) return; // <-- prevents backlog

                this.reconnectAttemptInFlight = true;

                try {
                    const alive = await pingKenkuFM(this.plugin.settings.baseUrl);

                    if (!alive) {
                        this.reconnectAttemptInFlight = false;
                        return;
                    }

                    await this.loadAllData();

                    this.plugin.kenkuOnline = true;

                    this.reconnecting = false;
                    this.reconnectAttemptInFlight = false;

                    new Notice("KenkuFM Remote reconnected!");
                    this.plugin.events.trigger("obsidian-fm:online");
                    this.plugin.inlineButtons.updateAll(performance.now());
                } catch (e) {
                    console.warn("Reconnect attempt failed:", e);
                    this.reconnectAttemptInFlight = false;
                }
            }, 3000)
        );
    }
}