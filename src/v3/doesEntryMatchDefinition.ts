import { ScopeBase, TraceEntry, TraceEntryMatcher } from "./types"

/**
 * Matches criteria against a performance entry event.
 * @param match - The match criteria or function.
 * @param event - The performance entry event.
 * @returns {boolean} `true` if the event matches the criteria, `false` otherwise.
 */
export function doesEntryMatchDefinition<ScopeT extends ScopeBase>(
    entry: TraceEntry<ScopeT>,
    match: TraceEntryMatcher<ScopeT>,
): boolean {
    if (typeof match === 'function') {
        return match(entry)
    }
    const { name, performanceEntryName, type, status, attributes, scope } = match
    const nameMatches =
        !name ||
        (typeof name === 'string'
            ? entry.name === name
            : typeof name === 'function'
                ? name(entry.name)
                : name.test(entry.name))

    const performanceEntryNameMatches =
        !performanceEntryName || entry.performanceEntry?.name === performanceEntryName

    const typeMatches = !type || entry.type === type

    const statusMatches = !status || entry.status === status

    // const occurrenceMatches = !occurrence || entry. === occurrence;

    const attributeMatches =
        !attributes ||
        Boolean(
            entry.attributes &&
            Object.entries(attributes).every(
                ([key, value]) => entry.attributes?.[key] === value,
            ),
        )

    const matchesScope = !scope || Boolean(
        entry.scope &&
        Object.entries(scope).every(
            ([key, value]) => entry.scope?.[key] === value,
        ),
    );

    const entryIsIdle = 'isIdle' in entry ? entry.isIdle : false
    const isIdleMatches = !match.isIdle || (match.isIdle === entryIsIdle);

    return nameMatches && performanceEntryNameMatches && typeMatches && statusMatches
        && attributeMatches && matchesScope && isIdleMatches
}