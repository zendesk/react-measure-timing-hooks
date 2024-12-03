export const getPerformanceEntryHash = (
  performanceEntry: PerformanceEntry,
): string =>
  `${performanceEntry.entryType}\n${performanceEntry.name}\n${performanceEntry.startTime}\n${performanceEntry.duration}`
