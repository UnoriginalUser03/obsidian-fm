import { InsertResult, SoundscapeItem } from "src/api/types";
import ObsidianFMPlugin from "src/main";

export class Helpers {
    static parseBool(value: string | undefined): boolean | undefined {
        if (!value) return undefined;

        const v = value.toLowerCase().trim();

        if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
        if (v === "false" || v === "0" || v === "no" || v === "off") return false;

        return undefined;
    }

    static parseSoundscapeInline(plugin: ObsidianFMPlugin, raw: string): SoundscapeItem[] {
        const parts = raw.split(",").map(s => s.trim());
        const items: SoundscapeItem[] = [];
        const regex = /^random\(([^)]+)\)\[(\d+)-(\d+)\]$/;

        for (const p of parts) {
            const match = p.match(regex);

            if (match) {
                const inside = match[1]; // "label:id1|id2" OR "id1|id2"
                const min = Number(match[2]);
                const max = Number(match[3]);

                let label = "Random Group";
                let idPart = inside;

                // Detect label prefix
                const colonIndex = inside.indexOf(":");
                if (colonIndex !== -1) {
                    label = inside.slice(0, colonIndex).trim();
                    idPart = inside.slice(colonIndex + 1).trim();
                }

                const ids = idPart.split("|").map(s => s.trim());

                items.push({
                    type: "flavour-group",
                    label,
                    ids,
                    min,
                    max
                });

                continue;
            }

            // Fallback: loop item
            const sound = plugin.sounds.find(s => s.id === p);
            items.push({
                type: "loop",
                id: p,
                label: sound?.title ?? p
            });
        }

        return items;
    }

    static serializeSoundscapeItem(item: SoundscapeItem): string {
        if (item.type === "loop") {
            return item.id;
        }

        if (item.type === "flavour-group") {
            const namePart =
                item.label && item.label !== "Flavour Group"
                    ? `${item.label}:`
                    : "";

            return `random(${namePart}${item.ids.join("|")})[${item.min}-${item.max}]`;
        }

        return "";
    }

    static parseInlineKenku(raw: string): Record<string, string> {
        const text = raw.replace("obsidianfm:", "").trim();
        const result: Record<string, string> = {};

        const regex = /(\w+)=("[^"]*"|\S+)/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            const key = match[1];
            let value = match[2];

            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }

            result[key] = value;
        }

        return result;
    }

    static buildInlineCode(result: InsertResult): string {
        const params: string[] = [];

        if (result.title) params.push(`title="${result.title}"`);
        if (result.kenkuTitle) params.push(`kenkuTitle="${result.kenkuTitle}"`)
        if (result.id) params.push(`id="${result.id}"`);
        if (result.kenkuId) params.push(`kenkuId="${result.kenkuId}"`)
        if (result.type) params.push(`type="${result.type}"`);

        if (result.overrideSettings && (result.type === "track" || result.type === "playlist")) {
            params.push(`overrideSettings="${result.overrideSettings ? "true" : "false"}"`)
            if (result.repeat) {
                params.push(`repeat="${result.repeat}"`);
            }

            if (result.volume !== undefined) {
                params.push(`volume="${result.volume}"`);
            }

            if (result.shuffle !== undefined) {
                params.push(`shuffle="${result.shuffle ? "true" : "false"}"`);
            }
        }

        if (result.type === "soundboard") {
            params.push(`random="${result.random ? "true" : "false"}"`);
            params.push(`overlapping="${result.overlapping ? "true" : "false"}"`);
        }

        if (result.type === "soundscape" && result.soundscape?.length) {
            const serialized = result.soundscape.map(item => Helpers.serializeSoundscapeItem(item)).join(",");
            params.push(`soundscape="${serialized}"`);
        }

        return `\u200B\`obsidianfm: ${params.join(" ")}\`\u200B`;
    }


    static formatTimeSeconds(seconds: number, detailed: boolean = false): string {
        seconds = Math.floor(seconds);

        if (!detailed) {
            // SIMPLE MODE (your current behaviour)
            if (seconds < 60) {
                return `${seconds}s`;
            }

            if (seconds < 3600) {
                const m = Math.floor(seconds / 60);
                return `${m}m`;
            }

            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);

            if (m === 0) return `${h}h`;
            return `${h}h ${m}m`;
        }

        // DETAILED MODE (mixed units)
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        const parts: string[] = [];

        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);

        return parts.join(" ");
    }
}

