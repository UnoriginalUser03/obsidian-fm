// ui/player/PlayerSFXPanel.ts
import ObsidianFMPlugin from "src/main";
import { stopSound } from "src/api/kenku";
import { setIcon } from "obsidian";
import { PlaybackState } from "src/playback/playbackstate";
import { PendingTimer } from "src/api/types";

export class PlayerSFXPanel {
    private container: HTMLElement;

    // Cached DOM references
    private groupEls: Record<string, HTMLElement> = {};
    private itemEls: Record<string, HTMLElement> = {};

    // Timer UI
    private timerGroupEl: HTMLElement | null = null;
    private timerItemEls: Record<string, HTMLElement> = {};

    // Interpolation baseline
    private lastSyncTime: number | null = null;

    constructor(
        private plugin: ObsidianFMPlugin,
        parent: HTMLElement
    ) {
        this.container = parent.createDiv({ cls: "obsidianfm-sfx-container" });
    }

    // ------------------------------------------------------------
    // SYNCED UPDATE (called by PlaybackSync)
    // ------------------------------------------------------------
    update(state: PlaybackState) {
        const sfxByBoard: Record<string, string[]> = {};

        // Group active SFX by soundboard name
        state.currentSounds.forEach((entry, soundId) => {
            const sound = this.plugin.sounds.find(s => s.id === soundId);
            if (!sound) return;

            const board = sound.soundboardName ?? "Ungrouped";
            if (!sfxByBoard[board]) sfxByBoard[board] = [];
            sfxByBoard[board].push(soundId);
        });

        // Create/update groups
        Object.entries(sfxByBoard).forEach(([boardName, soundIds]) => {
            this.ensureGroup(boardName);
            this.updateGroup(boardName, soundIds);
        });

        // Remove groups that no longer have sounds
        Object.keys(this.groupEls).forEach(boardName => {
            if (!sfxByBoard[boardName]) {
                // Remove all items belonging to this board
                Object.keys(this.itemEls).forEach(soundId => {
                    const sound = this.plugin.sounds.find(s => s.id === soundId);
                    const itemBoard = sound?.soundboardName ?? "Ungrouped";

                    if (itemBoard === boardName) {
                        delete this.itemEls[soundId];
                    }
                });

                // Remove the group
                this.groupEls[boardName].remove();
                delete this.groupEls[boardName];
            }
        });

        // ------------------------------------------------------------
        // TIMERS GROUP
        // ------------------------------------------------------------
        if (state.pendingTimers.length > 0) {
            this.ensureTimerGroup();
            this.updateTimerGroup(state.pendingTimers);
        } else {
            this.removeTimerGroup();
        }

        // Reset interpolation baseline
        this.lastSyncTime = performance.now();
    }

    // ------------------------------------------------------------
    // INTERPOLATED UPDATE (called by PlaybackInterpolator)
    // ------------------------------------------------------------
    updateInterpolated(state: PlaybackState) {
        const now = performance.now();
        if (!this.lastSyncTime) this.lastSyncTime = now;

        const elapsed = (now - this.lastSyncTime) / 1000;

        state.currentSounds.forEach((entry, soundId) => {
            const item = this.itemEls[soundId];
            if (!item) return;

            const bar = item.querySelector(".obsidianfm-sfx-progress") as HTMLElement;
            if (!bar || entry.duration <= 0) return;

            // Freeze short SFX near the end
            if (entry.duration < 2 && entry.progress / entry.duration > 0.9) {
                bar.style.width = "100%";
                return;
            }

            const interpolated = entry.progress + elapsed;
            const percent = Math.min(100, (interpolated / entry.duration) * 100);
            bar.style.width = `${percent}%`;
        });

        // ------------------------------------------------------------
        // TIMER INTERPOLATION
        // ------------------------------------------------------------
        state.pendingTimers.forEach(timer => {
            const item = this.timerItemEls[timer.id];
            if (!item) return;

            const bar = item.querySelector(".obsidianfm-timer-progress") as HTMLElement;
            if (!bar) return;

            const now = performance.now();
            const elapsed = (now - timer.startedAt) / 1000;
            const remaining = Math.max(0, timer.duration - elapsed);
            const percent = (remaining / timer.duration) * 100;

            bar.style.width = `${percent}%`;
        });
    }

    // ------------------------------------------------------------
    // TIMER GROUP CREATION
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

    // ------------------------------------------------------------
    // UPDATE TIMER GROUP CONTENTS
    // ------------------------------------------------------------
    private updateTimerGroup(timers: PendingTimer[]) {
        if (!this.timerGroupEl) return;

        const list = this.timerGroupEl.querySelector(".timers-list") as HTMLElement;

        // Create/update items
        timers.forEach(timer => {
            if (!this.timerItemEls[timer.id]) {
                this.timerItemEls[timer.id] = this.createTimerItem(list, timer);
            }
        });

        // Remove stale items
        Object.keys(this.timerItemEls).forEach(id => {
            if (!timers.some(t => t.id === id)) {
                this.timerItemEls[id].remove();
                delete this.timerItemEls[id];
            }
        });
    }

    // ------------------------------------------------------------
    // CREATE INDIVIDUAL TIMER ITEM
    // ------------------------------------------------------------
    private createTimerItem(parent: HTMLElement, timer: PendingTimer): HTMLElement {
        const item = parent.createDiv({ cls: "obsidianfm-timer-item" });

        const row = item.createDiv({ cls: "obsidianfm-timer-row" });

        // Clock icon
        const iconEl = row.createDiv({ cls: "obsidianfm-timer-icon" });
        setIcon(iconEl, "clock");

        // Label
        row.createDiv({
            text: timer.label,
            cls: "obsidianfm-timer-title",
        });

        // Countdown bar (100 → 0)
        item.createDiv({ cls: "obsidianfm-timer-progress" });

        return item;
    }

    // ------------------------------------------------------------
    // RESET BASELINE
    // ------------------------------------------------------------
    resetBaseline() {
        this.lastSyncTime = performance.now();
    }

    // ------------------------------------------------------------
    // GROUP CREATION
    // ------------------------------------------------------------
    private ensureGroup(boardName: string) {
        if (this.groupEls[boardName]) return;

        const group = this.container.createDiv({ cls: "obsidianfm-sfx-group" });
        this.groupEls[boardName] = group;

        // Header
        const header = group.createDiv({ cls: "obsidianfm-sfx-group-header" });
        header.createDiv({
            text: boardName,
            cls: "obsidianfm-sfx-group-title",
        });

        // Stop All button
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

        // List container
        group.createDiv({ cls: "obsidianfm-sfx-list" });
    }

    // ------------------------------------------------------------
    // UPDATE GROUP CONTENTS
    // ------------------------------------------------------------
    private updateGroup(boardName: string, soundIds: string[]) {
        const group = this.groupEls[boardName];
        const list = group.querySelector(".obsidianfm-sfx-list") as HTMLElement;

        // Create/update items for this group only
        soundIds.forEach(soundId => {
            if (!this.itemEls[soundId]) {
                this.itemEls[soundId] = this.createItem(list, soundId);
            }
        });

        // Remove stale items ONLY from this group
        Object.keys(this.itemEls).forEach(soundId => {
            const sound = this.plugin.sounds.find(s => s.id === soundId);
            const itemBoard = sound?.soundboardName ?? "Ungrouped";

            // Only remove items that belong to THIS group and are no longer active
            if (itemBoard === boardName && !soundIds.includes(soundId)) {
                this.itemEls[soundId].remove();
                delete this.itemEls[soundId];
            }
        });
    }

    // ------------------------------------------------------------
    // CREATE INDIVIDUAL SFX ITEM
    // ------------------------------------------------------------
    private createItem(parent: HTMLElement, soundId: string): HTMLElement {
        const sound = this.plugin.sounds.find(s => s.id === soundId);
        const item = parent.createDiv({ cls: "obsidianfm-sfx-item" });

        const row = item.createDiv({ cls: "obsidianfm-sfx-row" });
        row.createDiv({
            text: sound?.title ?? soundId,
            cls: "obsidianfm-sfx-title",
        });

        // Stop button
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

        // Progress bar
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
}