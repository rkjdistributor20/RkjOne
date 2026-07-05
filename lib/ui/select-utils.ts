/** UUID v4 pattern - raw IDs should never appear as Select labels */
const UUID_RE =
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string | undefined | null): boolean {
 return Boolean(value && UUID_RE.test(value));
}

/**
 * Only pass a Select `value` when it exists in the option list.
 * Prevents Radix/Base UI from showing raw UUIDs when state is ahead of options.
 */
export function boundSelectValue(
 value: string | undefined | null,
 optionValues: readonly string[]): string | undefined {
 if (!value) return undefined;
 return optionValues.includes(value) ? value : undefined;
}

export function pickOptionById<T extends { id: string }>(
 options: readonly T[],
 id: string | undefined | null): T | undefined {
 if (!id) return undefined;
 return options.find((o) => o.id === id);
}

/** Prefer human label; never surface a bare UUID to users */
export function displayLabel(
 label: string | undefined | null,
 fallback = ' - '): string {
 if (!label || looksLikeUuid(label)) return fallback;
 return label;
}
