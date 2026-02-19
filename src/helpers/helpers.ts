export class Helpers {
    // ------------------------------------------------------------
    // UTILS
    // ------------------------------------------------------------
    static parseBool(value: string | undefined): boolean | undefined {
        if (!value) return undefined;

        const v = value.toLowerCase().trim();

        if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
        if (v === "false" || v === "0" || v === "no" || v === "off") return false;

        return undefined;
    }
}