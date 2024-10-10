import type { Timestamp } from './types'

export const ensureTimestamp = (timestamp?: Partial<Timestamp>): Timestamp => ({
  // TODO: support drift calculation
  epoch:
    timestamp?.epoch ??
    (timestamp?.now ? performance.timeOrigin + timestamp.now : Date.now()),
  now:
    timestamp?.now ??
    (timestamp?.epoch
      ? performance.now() - (performance.timeOrigin - timestamp.epoch)
      : performance.now()),
})
