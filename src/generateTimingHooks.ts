/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import { ActionLogCache } from './ActionLogCache'
import { DEFAULT_GARBAGE_COLLECT_MS } from './constants'
import { getExternalApi } from './getExternalApi'
import type {
  GeneratedTimingHooks,
  GeneratedUseTimingBeaconHook,
  GeneratedUseTimingBeaconHookConfiguration,
  GenerateUseTimingHooksConfiguration,
  GetPrefixedUseTimingHooksConfiguration,
} from './types'
import { useTiming } from './useTiming'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromEntriesStrict = <KeyValue extends readonly [any, any]>(
  entries: Iterable<KeyValue>,
) => { [K in KeyValue[0]]: KeyValue extends readonly [K, infer V] ? V : never }

export const getPrefixedUseTiming =
  <Placements extends string, Metadata extends Record<string, unknown>>({
    idPrefix,
    ...options
  }: GetPrefixedUseTimingHooksConfiguration<
    Placements,
    Metadata
  >): GeneratedUseTimingBeaconHook =>
  ({ idSuffix, ...beaconOptions } = {}, restartWhenChanged = []) =>
    void useTiming(
      {
        id: idSuffix ? `${idPrefix}/${idSuffix}` : idPrefix,
        ...options,
        ...(beaconOptions as GeneratedUseTimingBeaconHookConfiguration<Metadata>),
      },
      restartWhenChanged,
    )

export const generateTimingHooks = <
  Name extends string,
  PlacementsArray extends readonly string[],
  Metadata extends Record<string, unknown>,
>(
  {
    name,
    idPrefix,
    garbageCollectMs = DEFAULT_GARBAGE_COLLECT_MS,
    actionLogCache,
    ...config
  }: GenerateUseTimingHooksConfiguration<
    Name,
    PlacementsArray[number],
    Metadata
  >,
  ...placements: PlacementsArray
): GeneratedTimingHooks<Name, PlacementsArray, Metadata> =>
  (Object.fromEntries as FromEntriesStrict)(
    placements.flatMap((placement) => {
      const options: GetPrefixedUseTimingHooksConfiguration<
        PlacementsArray[number],
        Metadata
      > = {
        idPrefix,
        actionLogCache:
          actionLogCache ??
          new ActionLogCache({
            garbageCollectMs,
            ...config,
          }),
        expectedSimultaneouslyRenderableBeaconsCount: placements.length,
        placement,
        garbageCollectMs,
        ...config,
      }

      return [
        [
          `use${name}TimingIn${placement}`,
          getPrefixedUseTiming(options),
        ] as const,
        [`imperative${placement}TimingApi`, getExternalApi(options)] as const,
      ] as const
    }),
  ) as GeneratedTimingHooks<Name, PlacementsArray, Metadata>
