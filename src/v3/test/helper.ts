export function parseTaskString(taskString: string): {
  entries: PerformanceEntry[]
  fmpTime: number | null
} {
  const entries: PerformanceEntry[] = []
  let currentTime = 0
  let fmpTime = null
  const regex = /\[( *\d+ *)]|[*|-]/g
  let match

  while ((match = regex.exec(taskString)) !== null) {
    const token = match[0]
    if (token === '-') {
      // Idle time of 50ms
      currentTime += 50
    } else if (token.startsWith('[') && token.endsWith(']')) {
      // Long task
      const duration = Number.parseInt(token.replace(/[ [\]]/g, ''), 10)
      entries.push({
        entryType: 'longtask',
        name: 'self',
        startTime: currentTime,
        duration,
      } as PerformanceEntry)
      currentTime += duration
    } else if (token === '|') {
      // FMP marker
      fmpTime = currentTime
    } else if (token === '*') {
      // Mark to check for FirstCPUIdle
      entries.push({
        entryType: 'mark',
        name: 'check',
        startTime: currentTime,
        duration: 0,
      } as PerformanceEntry)
    }
  }

  return { entries, fmpTime }
}
