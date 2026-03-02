// ui/player/PlayerSFXPanel.ts
import ObsidianFMPlugin from "src/main";
import { stopSound } from "src/api/kenku";
import { setIcon } from "obsidian";
import { PlaybackState } from "src/playback/playbackstate";
import { PendingTimer, SoundscapeContext, SoundscapeItem } from "src/api/types";
import { SoundscapeButton } from "src/inline/button types/soundscapebutton";

export class PlayerSFXPanel {
    private container: HTMLElement;

    private groupEls: Record<string, HTMLElement> = {};
    private itemEls: Record<string, HTMLElement> = {};

    private timerGroupEl: HTMLElement | null = null;
    private timerItemEls: Record<string, HTMLElement> = {};

    private soundscapeGroupEl: HTMLElement | null = null;
    private soundscapeItemEls: Record<string, HTMLElement> = {};
    private soundscapeTimerEls: Record<string, HTMLElement> = {};

    private lastSyncTime: number | null = null;

    constructor(
        private plugin: ObsidianFMPlugin,
        parent: HTMLElement
    ) {
        this.container = parent.createDiv({ cls: "obsidianfm-sfx-container" });
    }

    // ------------------------------------------------------------
    // SYNCED UPDATE
    // ------------------------------------------------------------
    update(state: PlaybackState) {
        const controller = this.plugin.playbackController;
        const ctx = controller["currentSoundscapeContext"] as SoundscapeContext | null;

        // ------------------------------------------------------------
        // 1. Build soundboard groups (excluding soundscape-owned)
        // ------------------------------------------------------------
        const sfxByBoard: Record<string, string[]> = {};

        state.currentSounds.forEach((entry, soundId) => {
            if (ctx && ctx.ownedSounds.has(soundId)) return;

            const sound = this.plugin.sounds.find(s => s.id === soundId);
            if (!sound) return;

            const board = sound.soundboardName ?? "Ungrouped";
            if (!sfxByBoard[board]) sfxByBoard[board] = [];
            sfxByBoard[board].push(soundId);
        });

        Object.entries(sfxByBoard).forEach(([boardName, soundIds]) => {
            this.ensureGroup(boardName);
            this.updateGroup(boardName, soundIds);
        });

        // Remove stale soundboard groups + their items
        Object.keys(this.groupEls).forEach(boardName => {
            if (boardName === "__soundscape__") return;
            if (!sfxByBoard[boardName]) {
                const groupEl = this.groupEls[boardName];

                // Remove any items belonging to this board
                Object.keys(this.itemEls).forEach(id => {
                    const sound = this.plugin.sounds.find(s => s.id === id);
                    const itemBoard = sound?.soundboardName ?? "Ungrouped";
                    if (itemBoard === boardName) {
                        this.itemEls[id].remove();
                        delete this.itemEls[id];
                    }
                });

                groupEl.remove();
                delete this.groupEls[boardName];
            }
        });

        // ------------------------------------------------------------
        // 2. Soundscape group
        // ------------------------------------------------------------
        if (ctx && state.currentSoundscapeId === ctx.id) {
            this.ensureSoundscapeGroup(ctx);
            this.updateSoundscapeGroup(ctx, state);
        } else {
            this.removeSoundscapeGroup();
        }

        // ------------------------------------------------------------
        // 3. Global timers (non-soundscape)
        // ------------------------------------------------------------
        const nonSoundscapeTimers = ctx
            ? state.pendingTimers.filter(t => t.soundscapeId !== ctx.id)
            : state.pendingTimers;

        if (nonSoundscapeTimers.length > 0) {
            this.ensureTimerGroup();
            this.updateTimerGroup(nonSoundscapeTimers);
        } else {
            this.removeTimerGroup();
        }

        this.lastSyncTime = performance.now();
    }

    // ------------------------------------------------------------
    // INTERPOLATED UPDATE
    // ------------------------------------------------------------
    updateInterpolated(state: PlaybackState) {
        const now = performance.now();
        if (!this.lastSyncTime) this.lastSyncTime = now;

        const elapsed = (now - this.lastSyncTime) / 1000;

        // SFX progress
        state.currentSounds.forEach((entry, soundId) => {
            const item =
                this.itemEls[soundId] ||
                this.soundscapeItemEls[soundId];

            if (!item) return;

            const bar = item.querySelector(".obsidianfm-sfx-progress") as HTMLElement;
            if (!bar || entry.duration <= 0) return;

            const interpolated = entry.progress + elapsed;
            const percent = Math.min(100, (interpolated / entry.duration) * 100);
            bar.style.width = `${percent}%`;
        });

        // Timer interpolation (GLOBAL TIMERS ONLY — not timer-sound rows)
        state.pendingTimers.forEach(timer => {
            const item = this.timerItemEls[timer.id];
            if (!item) return;

            const bar = item.querySelector(".obsidianfm-sfx-progress") as HTMLElement;
            if (!bar) return;

            const elapsed = (performance.now() - timer.startedAt) / 1000;
            const remaining = Math.max(0, timer.duration - elapsed);
            const percent = (remaining / timer.duration) * 100;

            bar.style.width = `${percent}%`;
        });
    }

    // ------------------------------------------------------------
    // SOUNDSCAPE GROUP
    // ------------------------------------------------------------
    private ensureSoundscapeGroup(ctx: SoundscapeContext) {
        if (this.soundscapeGroupEl) return;

        const group = this.container.createDiv({
            cls: "obsidianfm-sfx-group soundscape-group",
        });
        this.soundscapeGroupEl = group;
        this.groupEls["__soundscape__"] = group;

        // Use the same header styling as normal SFX groups
        const header = group.createDiv({
            cls: "obsidianfm-sfx-group-header soundscape-header",
        });

        const left = header.createDiv({ cls: "obsidianfm-sfx-row" });

        const icon = left.createDiv({ cls: "obsidianfm-sfx-icon" });
        setIcon(icon, "mountain");

        left.createDiv({
            text: ctx.title,
            cls: "obsidianfm-sfx-title soundscape-title",
        });

        const stopBtn = header.createEl("button", {
            cls: "obsidianfm-sfx-stop-all-btn",
        });
        setIcon(stopBtn.createDiv(), "square");

        stopBtn.addEventListener("click", () => {
            this.plugin.playbackController.stopSoundscape(ctx.id);
        });

        group.createDiv({ cls: "soundscape-timers" });
        group.createDiv({ cls: "soundscape-loops" });
    }

    private removeSoundscapeGroup() {
        if (!this.soundscapeGroupEl) return;

        this.soundscapeGroupEl.remove();
        this.soundscapeGroupEl = null;

        this.soundscapeItemEls = {};
        this.soundscapeTimerEls = {};

        delete this.groupEls["__soundscape__"];
    }

    private updateSoundscapeGroup(ctx: SoundscapeContext, state: PlaybackState) {
        if (!this.soundscapeGroupEl) return;

        const timersEl = this.soundscapeGroupEl.querySelector(".soundscape-timers")!;
        const loopsEl = this.soundscapeGroupEl.querySelector(".soundscape-loops")!;

        timersEl.empty();
        loopsEl.empty();

        this.soundscapeItemEls = {};
        this.soundscapeTimerEls = {};

        const timers = state.pendingTimers.filter(t => t.soundscapeId === ctx.id);

        timers.forEach(timer => {
            const block = this.renderTimerBlock(timer, state, ctx);
            timersEl.appendChild(block);
        });

        ctx.loopIds.forEach(soundId => {
            const row = this.renderLoopRow(soundId);
            loopsEl.appendChild(row);
            this.soundscapeItemEls[soundId] = row;
        });
    }

    // ------------------------------------------------------------
    // RENDERING
    // ------------------------------------------------------------
    private renderTimerBlock(
        timer: PendingTimer,
        state: PlaybackState,
        ctx: SoundscapeContext
    ): HTMLElement {
        const block = createDiv({ cls: "soundscape-timer-block" });

        // Main timer row (label + next sound)
        const row = block.createDiv({ cls: "obsidianfm-sfx-row is-timer" });

        const icon = row.createDiv({ cls: "obsidianfm-sfx-icon" });
        setIcon(icon, "clock");

        row.createDiv({
            text: timer.label,
            cls: "obsidianfm-sfx-title",
        });

        const elapsed = (performance.now() - timer.startedAt) / 1000;
        const remaining = Math.max(0, timer.duration - elapsed);
        const nextSound = this.getNextSoundForTimer(timer, ctx, state);

        row.createDiv({
            text: `Next in ${remaining.toFixed(0)}s (${nextSound})`,
            cls: "soundscape-timer-next",
        });

        // --- ACTIVE SOUND ROW (behaves like normal SFX item) ---
        const activeSoundId = this.getActiveSoundForTimer(timer, state);

        if (activeSoundId) {
            // Full-width item inside the card
            const item = block.createDiv({
                cls: "obsidianfm-sfx-item soundscape-timer-sound",
            });

            const inner = item.createDiv({ cls: "obsidianfm-sfx-row" });

            inner.createDiv({
                text: this.getSoundTitle(activeSoundId),
                cls: "obsidianfm-sfx-title",
            });

            // Normal SFX progress bar, constrained by the card
            item.createDiv({ cls: "obsidianfm-sfx-progress" });

            this.soundscapeItemEls[activeSoundId] = item;
        }

        return block;
    }

    private renderLoopRow(soundId: string): HTMLElement {
        const item = createDiv({ cls: "obsidianfm-sfx-item is-loop-item" });

        const row = item.createDiv({ cls: "obsidianfm-sfx-row is-loop" });

        const icon = row.createDiv({ cls: "obsidianfm-sfx-icon" });
        setIcon(icon, "refresh-ccw");

        row.createDiv({
            text: this.getSoundTitle(soundId),
            cls: "obsidianfm-sfx-title",
        });

        item.createDiv({ cls: "obsidianfm-sfx-progress" });

        return item;
    }

    private getSoundTitle(id: string): string {
        return this.plugin.sounds.find(s => s.id === id)?.title ?? id;
    }

    private getNextSoundForTimer(
        timer: PendingTimer,
        ctx: SoundscapeContext,
        state: PlaybackState
    ): string {
        const button = this.plugin.inlineButtons.getPlaybackButton(ctx.id) as SoundscapeButton;
        if (!button) return "Unknown";

        const group = button.items.find(
            (i): i is Extract<SoundscapeItem, { type: "flavour-group" }> =>
                i.type === "flavour-group" && i.label === timer.label
        );
        if (!group) return "Unknown";

        const available = group.ids.filter(id => !state.currentSounds.has(id));
        const nextId = available[0] ?? group.ids[0];

        return this.getSoundTitle(nextId);
    }

    private getActiveSoundForTimer(
        timer: PendingTimer,
        state: PlaybackState
    ): string | null {
        const button = this.plugin.inlineButtons.getPlaybackButton(timer.soundscapeId) as SoundscapeButton;
        if (!button) return null;

        const group = button.items.find(
            (i): i is Extract<SoundscapeItem, { type: "flavour-group" }> =>
                i.type === "flavour-group" && i.label === timer.label
        );
        if (!group) return null;

        return group.ids.find(id => state.currentSounds.has(id)) ?? null;
    }

    // ------------------------------------------------------------
    // SOUNDBOARD GROUPS
    // ------------------------------------------------------------
    private ensureGroup(boardName: string) {
        if (this.groupEls[boardName]) return;

        const group = this.container.createDiv({ cls: "obsidianfm-sfx-group" });
        this.groupEls[boardName] = group;

        const header = group.createDiv({ cls: "obsidianfm-sfx-group-header" });
        header.createDiv({
            text: boardName,
            cls: "obsidianfm-sfx-group-title",
        });

        const stopAllBtn = header.createEl("button", {
            cls: "obsidianfm-sfx-stop-all-btn",
        });
        stopAllBtn.title = `Stop all sounds in ${boardName}`;

        const stopAllIcon = stopAllBtn.createDiv({
            cls: "obsidianfm-sfx-stop-all-icon",
        });
        setIcon(stopAllIcon, "x");

        stopAllBtn.addEventListener("click", () => {
            this.stopAllInGroup(boardName);
        });

        group.createDiv({ cls: "obsidianfm-sfx-list" });
    }

    private updateGroup(boardName: string, soundIds: string[]) {
        const group = this.groupEls[boardName];
        const list = group.querySelector(".obsidianfm-sfx-list") as HTMLElement;

        // Remove stale items for this group (DOM + map)
        Object.keys(this.itemEls).forEach(id => {
            const sound = this.plugin.sounds.find(s => s.id === id);
            const itemBoard = sound?.soundboardName ?? "Ungrouped";
            if (itemBoard === boardName && !soundIds.includes(id)) {
                this.itemEls[id].remove();
                delete this.itemEls[id];
            }
        });

        // Ensure items exist
        soundIds.forEach(soundId => {
            if (!this.itemEls[soundId]) {
                this.itemEls[soundId] = this.createItem(list, soundId);
            }
        });
    }

    private createItem(parent: HTMLElement, soundId: string): HTMLElement {
        const sound = this.plugin.sounds.find(s => s.id === soundId);
        const item = parent.createDiv({ cls: "obsidianfm-sfx-item" });

        const row = item.createDiv({ cls: "obsidianfm-sfx-row" });
        row.createDiv({
            text: sound?.title ?? soundId,
            cls: "obsidianfm-sfx-title",
        });

        const stopBtn = row.createEl("button", { cls: "obsidianfm-sfx-stop-btn" });
        stopBtn.title = `Stop ${sound?.title ?? soundId}`;

        const stopIcon = stopBtn.createDiv({ cls: "obsidianfm-sfx-stop-icon" });
        setIcon(stopIcon, "square");

        stopBtn.addEventListener("click", () => {
            stopSound(this.plugin.settings.baseUrl, "sound", soundId);
            this.plugin.playback.currentSounds.delete(soundId);
            this.plugin.inlineButtons.updateAll(performance.now());
            this.update(this.plugin.playback);
        });

        item.createDiv({ cls: "obsidianfm-sfx-progress" });

        return item;
    }

    // ------------------------------------------------------------
    // GLOBAL TIMERS
    // ------------------------------------------------------------
    private ensureTimerGroup() {
        if (this.timerGroupEl) return;

        const group = this.container.createDiv({ cls: "obsidianfm-sfx-group timers-group" });
        this.timerGroupEl = group;

        const header = group.createDiv({ cls: "obsidianfm-sfx-group-header" });
        header.createDiv({
            text: "Timers",
            cls: "obsidianfm-sfx-group-title",
        });

        group.createDiv({ cls: "obsidianfm-sfx-list timers-list" });
    }

    private removeTimerGroup() {
        if (!this.timerGroupEl) return;

        this.timerGroupEl.remove();
        this.timerGroupEl = null;
        this.timerItemEls = {};
    }

    private updateTimerGroup(timers: PendingTimer[]) {
        if (!this.timerGroupEl) return;

        const list = this.timerGroupEl.querySelector(".timers-list") as HTMLElement;

        Object.keys(this.timerItemEls).forEach(id => {
            if (!timers.some(t => t.id === id)) {
                this.timerItemEls[id].remove();
                delete this.timerItemEls[id];
            }
        });

        timers.forEach(timer => {
            if (!this.timerItemEls[timer.id]) {
                this.timerItemEls[timer.id] = this.createTimerItem(list, timer);
            }
        });
    }

    private createTimerItem(parent: HTMLElement, timer: PendingTimer): HTMLElement {
        const item = parent.createDiv({ cls: "obsidianfm-sfx-item" });

        const row = item.createDiv({ cls: "obsidianfm-sfx-row" });

        const iconEl = row.createDiv({ cls: "obsidianfm-sfx-icon" });
        setIcon(iconEl, "clock");

        row.createDiv({
            text: timer.label,
            cls: "obsidianfm-sfx-title",
        });

        item.createDiv({ cls: "obsidianfm-sfx-progress" });

        return item;
    }

    // ------------------------------------------------------------
    // STOP ALL IN GROUP
    // ------------------------------------------------------------
    private stopAllInGroup(boardName: string) {
        const state = this.plugin.playback;

        state.currentSounds.forEach((entry, soundId) => {
            const sound = this.plugin.sounds.find(s => s.id === soundId);
            if (!sound) return;

            if ((sound.soundboardName ?? "Ungrouped") === boardName) {
                stopSound(this.plugin.settings.baseUrl, "sound", soundId);
                state.currentSounds.delete(soundId);
            }
        });

        this.plugin.inlineButtons.updateAll(performance.now());
        this.update(state);
    }

    resetBaseline() {
        this.lastSyncTime = performance.now();
    }
}