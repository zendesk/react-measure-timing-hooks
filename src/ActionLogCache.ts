import { ActionLog } from './ActionLog'
import { debounce, DebouncedFn } from './debounce'
import type { StaticActionLogOptions, UseActionLogCacheOptions } from './types'

export interface ActionLogRef<
  CustomMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  activeId: string
  ids: Set<string>
  actionLog: ActionLog<CustomMetadata>
  getCurrent: (id: string) => ActionLog<CustomMetadata>
}

export class ActionLogCache<
  CustomMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  private readonly options: StaticActionLogOptions<string, CustomMetadata>
  private readonly cache = new Map<string, ActionLogRef<CustomMetadata>>()
  private garbageCollectUnusedIdLater: DebouncedFn<
    [ActionLogRef<CustomMetadata>]
  >

  makeWrapperRef(actionLog: ActionLog<CustomMetadata>, initialId: string) {
    let ref: ActionLogRef<CustomMetadata> = {
      activeId: initialId,
      ids: new Set<string>([initialId]),
      actionLog,
      getCurrent: (id: string) => {
        const cachedRef = this.cache.get(id)
        const cachedActionLog = cachedRef?.actionLog
        const activeRef = cachedRef ?? ref
        if (cachedActionLog !== ref.actionLog) {
          // when ID changes, we transfer the state from the old actionLog to the new one
          // because of the edge case when the child with the new ID
          // is re-rendered *before* the parent beacon gets the new ID
          if (cachedActionLog && !ref.actionLog.wasImported) {
            cachedActionLog.importState(ref.actionLog)
          } else {
            activeRef.actionLog = ref.actionLog
            ref.ids.forEach((refId) => {
              activeRef.ids.add(refId)
            })
          }
        }
        this.cache.set(id, activeRef)
        activeRef.activeId = id
        activeRef.ids.add(id)
        this.garbageCollectUnusedIdLater(activeRef)
        ref = activeRef
        return activeRef.actionLog
      },
    }
    return ref
  }

  get(id: string) {
    const existingRef = this.cache.get(id)
    if (existingRef) return existingRef.getCurrent(id)
    return undefined
  }

  makeGetOrCreateFn(id: string) {
    const existingRef = this.cache.get(id)
    if (existingRef) return existingRef.getCurrent
    const actionLog = new ActionLog(this.options)
    const ref = this.makeWrapperRef(actionLog, id)
    actionLog.onDispose('gc', () => {
      ref.ids.forEach((refId) => {
        if (this.cache.get(refId)?.actionLog === actionLog) {
          this.cache.delete(refId)
        }
      })
    })
    this.cache.set(id, ref)
    return ref.getCurrent
  }

  constructor({
    garbageCollectMs,
    ...actionLogOptions
  }: UseActionLogCacheOptions<CustomMetadata>) {
    this.options = actionLogOptions
    this.garbageCollectUnusedIdLater = debounce({
      fn: (ref: ActionLogRef<CustomMetadata>) => {
        ref.ids.forEach((id) => {
          if (id !== ref.activeId && this.cache.get(id) === ref) {
            this.cache.delete(id)
            ref.ids.delete(id)
          }
        })
      },
      debounceMs: garbageCollectMs,
    })
  }
}
