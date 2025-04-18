import { ACTION_TYPE } from './constants'
import { performanceMark, performanceMeasure } from './performanceMark'
import type { ActionLogExternalApi, GetExternalApiConfiguration } from './types'

/** used to generate timing API that can be used outside of React, or together with React */
export const getExternalApi = <CustomMetadata extends Record<string, unknown>>({
  actionLogCache,
  idPrefix,
  placement,
}: GetExternalApiConfiguration<
  string,
  CustomMetadata
>): ActionLogExternalApi<CustomMetadata> => {
  const getFullId = (idSuffix: string) => `${idPrefix}/${idSuffix}`
  const getActionLogForIdIfExists = (idSuffix: string) => {
    const id = getFullId(idSuffix)

    const actionLog = actionLogCache.get(id)
    actionLog?.updateOptions({ id }, placement)
    return actionLog
  }
  const getActionLogForId = (idSuffix: string) => {
    const id = getFullId(idSuffix)
    const getActionLog = actionLogCache.makeGetOrCreateFn(id)
    const actionLog = getActionLog(id)
    actionLog.updateOptions({ id }, placement)
    return actionLog
  }
  let renderStartMark: PerformanceMark | null = null

  return {
    getActionLogForId,
    getActionLogForIdIfExists,
    markRenderStart: (idSuffix: string) => {
      const id = getFullId(idSuffix)
      const actionLog = getActionLogForId(idSuffix)

      actionLog.ensureReporting()
      actionLog.setActive(true, placement)
      renderStartMark =
        renderStartMark ?? performanceMark(`${id}/${placement}/render-start`)
    },
    markRenderEnd: (idSuffix: string) => {
      const id = getFullId(idSuffix)
      const actionLog = getActionLogForId(idSuffix)

      actionLog.setActive(true, placement)
      if (!renderStartMark) {
        actionLog.onInternalError(
          new Error(
            `ComponentTiming: markRenderDone called without a corresponding markRenderStart in '${placement}' for id: '${id}.`,
          ),
        )

        return
      }

      actionLog.addSpan({
        type: ACTION_TYPE.RENDER,
        entry: Object.assign(
          performanceMeasure(`${id}/${placement}/render`, renderStartMark),
          {
            startMark: renderStartMark,
          },
        ),
        source: placement,
      })

      renderStartMark = null
    },
    markStage: (
      idSuffix: string,
      stage: string,
      stageMeta?: Record<string, unknown>,
    ) => {
      const actionLog = getActionLogForId(idSuffix)

      actionLog.ensureReporting()
      actionLog.setActive(true, placement)
      actionLog.markStage({ stage, source: placement, metadata: stageMeta })
    },
    setActive: (idSuffix: string, active: boolean) => {
      const actionLog = getActionLogForId(idSuffix)

      actionLog.setActive(active, placement)
    },
    dispose: (idSuffix: string) => {
      const actionLog = actionLogCache.get(getFullId(idSuffix))

      if (!actionLog) return
      actionLog.onBeaconRemoved(placement)
    },
    clear: (idSuffix: string) => {
      const actionLog = getActionLogForIdIfExists(idSuffix)

      if (actionLog) {
        actionLog.clear()
      }
    },
    setMetadata: (idSuffix: string, metadata: CustomMetadata) => {
      const actionLog = getActionLogForId(idSuffix)

      actionLog.customMetadataBySource.set(placement, metadata)
    },
  }
}
