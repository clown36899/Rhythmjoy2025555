import { describe, expect, it } from "vitest";
import {
    clampNebMaxItems,
    DEFAULT_NEB_FILTER_SETTINGS,
    NEB_MAX_ITEMS,
} from "./useNebFilterSettings";

describe("NEB maximum item settings", () => {
    it("defaults to and caps the main ad at 15 items", () => {
        expect(NEB_MAX_ITEMS).toBe(15);
        expect(DEFAULT_NEB_FILTER_SETTINGS.max_items).toBe(15);
        expect(clampNebMaxItems(99)).toBe(15);
    });
});
