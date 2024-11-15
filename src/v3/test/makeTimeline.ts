export interface LongTaskStub {
  entryType: 'longtask'
  duration: number
  startTime?: number
  name?: string
}

export interface MarkStub {
  entryType: 'mark'
  name: string
  startTime?: number
}

export interface FmpStub {
  entryType: 'fmp'
  startTime?: number
}

export interface IdleStub {
  entryType: 'idle'
  duration: number
}

export type Stub = LongTaskStub | MarkStub | FmpStub | IdleStub

export const LongTask = (
  duration: number,
  options: { start?: number } = {},
): LongTaskStub => ({
  entryType: 'longtask',
  duration,
  startTime: options.start,
  name: 'task',
})

export const Idle = (duration: number): IdleStub => ({
  entryType: 'idle',
  duration,
})

export const Check: MarkStub = {
  entryType: 'mark',
  name: 'check',
}

export const FMP: FmpStub = {
  entryType: 'fmp',
}

export function makeTimeline(events: Stub[]): {
  entries: PerformanceEntry[]
  fmpTime: number | null
} {
  const entries: PerformanceEntry[] = []
  let currentTime = 0
  let fmpTime = null

  for (const event of events) {
    const thisEventStartTime =
      'startTime' in event && event.startTime !== undefined && event.startTime
    const eventStartTime =
      thisEventStartTime !== false ? thisEventStartTime : currentTime
    const eventDuration = 'duration' in event ? event.duration : 0

    switch (event.entryType) {
      case 'idle':
        break
      case 'fmp':
        fmpTime = eventStartTime
        if (event.startTime === undefined) fmpTime = currentTime
      // fallthrough on purpose
      // eslint-disable-next-line no-fallthrough
      default:
        entries.push({
          entryType: event.entryType,
          name: 'name' in event ? event.name : event.entryType,
          startTime: eventStartTime,
          duration: eventDuration,
        } as PerformanceEntry)
        break
    }

    // Update `currentTime` only if `startTime` is not predefined
    if (thisEventStartTime === false) {
      currentTime = eventStartTime + eventDuration
    }
  }

  return { entries, fmpTime }
}

export function getEventsFromTimeline(
  _: TemplateStringsArray,
  ...exprs: (Stub | number)[]
): { entries: PerformanceEntry[]; fmpTime: number | null } {
  const entries: PerformanceEntry[] = []
  let fmpTime: number | null = null

  const stubs = exprs.filter((expr) => typeof expr !== 'number')
  const [startTime, ...time] = exprs.filter((expr) => typeof expr === 'number')

  if (startTime === undefined) {
    throw new Error('No time provided for the beginning of the timeline')
  }

  for (let i = 0; i < time.length; i++) {
    const currentTime = time[i]
    const stub = stubs[i]
    if (!stub || typeof currentTime !== 'number') {
      throw new Error('Invalid timeline, mismatch of events and timestamps')
    }
    if (stub.entryType === 'fmp') {
      fmpTime = currentTime
    }
    entries.push({
      duration: 0,
      name: `${stub.entryType}`,
      ...stub,
      startTime: currentTime,
    } as PerformanceEntry)
  }

  return { entries, fmpTime }
}

// example usage
// const timeline = getEventsFromTimeline`
// Events: ----------${FMP}-----${Task(50)}-------${Task(100)}-------${Task(200)}-------${Check}
// Time:   ${0}      ${200}     ${300}            ${350}             ${550}             ${700}
// `
// console.log(timeline)
