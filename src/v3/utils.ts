export function findLast<T, S extends T>(
  array: readonly T[],
  predicate: (value: T, index: number, array: readonly T[]) => value is S,
): S | undefined
export function findLast<T>(
  array: readonly T[],
  predicate: (value: T, index: number, array: readonly T[]) => unknown,
): T | undefined
export function findLast<T>(
  array: readonly T[],
  predicate: (value: T, index: number, array: readonly T[]) => unknown,
): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    const value = array[i]!
    if (predicate(value, i, array)) {
      return value
    }
  }
  return undefined
}
