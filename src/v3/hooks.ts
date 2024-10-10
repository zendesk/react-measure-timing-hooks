import { useEffect } from 'react'
import type { BeaconConfig, ScopeBase, TraceManager, UseBeacon } from './types'

export const generateUseBeacon = <T extends ScopeBase>(
  traceManager: TraceManager<T>,
): UseBeacon<T> => {
  return (config: BeaconConfig<T>) => {}
}
