export function findLast<T, S extends T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => value is S,
): S | undefined
export function findLast<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => unknown,
): T | undefined
export function findLast<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => unknown,
): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    const value = array[i]!
    if (predicate(value, i, array)) {
      return value
    }
  }
  return undefined
}
