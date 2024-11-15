import type { Timestamp } from './types'

export const ensureTimestamp = (timestamp?: Partial<Timestamp>): Timestamp => ({
  // FEATURE TODO: support drift calculation

  // DOCUMENT TODO: why do we store both? when do we use which?
  epoch:
    timestamp?.epoch ??
    (timestamp?.now ? performance.timeOrigin + timestamp.now : Date.now()),
  now:
    timestamp?.now ??
    (timestamp?.epoch
      ? performance.now() - (performance.timeOrigin - timestamp.epoch)
      : performance.now()),
})
