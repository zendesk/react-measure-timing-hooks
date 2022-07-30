/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import type { DependencyList } from 'react'
import { useEffect, useRef } from 'react'
import { ACTION_TYPE, DEFAULT_STAGES } from './constants'
import { useOnErrorBoundaryDidCatch } from './ErrorBoundary'
import { performanceMark, performanceMeasure } from './performanceMark'
import type { UseTimingMeasurementHookConfiguration } from './types'

/**
 * @description Internal hook that handles measuring React's lifecycle.
 *
 * What happens inside of the hook can seem a bit odd and non-standard React coding.
 * This is explained by what we're trying to do - measure the timing of a React lifecycle.
 * For instance, the state is kept in refs, which normally would not be a thing you want to do.
 * However in this case, we want to preserve a single instance of state in the component that renders this hook,
 * and refs are a great way to do this.
 * This is designed so that this hook itself doesn't change any of it's state,
 * and should never itself cause any additional re-renders.
 * We also do not want to persist certain state across renders.
 * ActionLog handles the long-lifecycle of the timed interaction.
 */
export const useTimingMeasurement = <
  CustomMetadata extends Record<string, unknown>,
>(
  {
    id,
    reportFn,
    isActive = true,
    shouldResetOnDependencyChangeFn,
    stage,
    actionLogRef,
    placement,
    onInternalError,
    error,
  }: UseTimingMeasurementHookConfiguration<CustomMetadata>,
  restartWhenChanged: DependencyList,
): void => {
  const timestamp = performanceMark(`${id}/${placement}/render-start`)

  const lastStartTimeRef = useRef<PerformanceMark>(timestamp)

  lastStartTimeRef.current = timestamp

  actionLogRef.current.updateOptions(
    {
      id,
      reportFn,
      shouldResetOnDependencyChangeFn,
      onInternalError,
    },
    placement,
  )

  // this will fire when external deps have changed:
  // Note: we cannot use useEffect has we need this code to run during the render
  // and especially before we call actionLogRef.current.setActive.
  const lastExternalDeps = useRef(restartWhenChanged)
  const externalDepsHaveChanged = restartWhenChanged.some(
    (value, i) => value !== lastExternalDeps.current[i],
  )

  if (externalDepsHaveChanged) {
    lastExternalDeps.current = restartWhenChanged
    actionLogRef.current.onExternalDependenciesChange(
      restartWhenChanged,
      lastStartTimeRef.current,
      placement,
    )
  }

  actionLogRef.current.setActive(
    isActive && stage !== DEFAULT_STAGES.INACTIVE,
    placement,
  )

  if (error) {
    if (actionLogRef.current.reportedErrors.has(error)) {
      // same error was previously reported, no need to re-report
      actionLogRef.current.disableReporting()
    } else if (typeof error === 'object') {
      actionLogRef.current.reportedErrors.add(error)
    }
    actionLogRef.current.markStage({
      stage: DEFAULT_STAGES.ERROR,
      source: placement,
      metadata: {
        error,
        handled: true,
      },
    })
  } else if (stage) {
    actionLogRef.current.markStage({
      stage,
      source: placement,
    })
  }

  // this will fire after every render:
  useEffect(() => {
    if (!placement) {
      actionLogRef.current.onInternalError(
        new Error(
          `useTiming: '${id}' has a usage that does not define the 'placement' name. Please ensure every usage names its placement.`,
        ),
      )
    }
    actionLogRef.current.addSpan({
      type: ACTION_TYPE.RENDER,
      entry: Object.assign(
        performanceMeasure(
          `${id}/${placement}/render`,
          lastStartTimeRef.current,
        ),
        { startMark: lastStartTimeRef.current },
      ),
      source: placement,
    })
  })

  useEffect(() => {
    const actionLog = actionLogRef.current

    return () => {
      // last unmount, time to clean-up:
      actionLog.onBeaconRemoved(placement)
    }
  }, [placement, actionLogRef])

  useOnErrorBoundaryDidCatch((errorMetadata) => {
    if (actionLogRef.current.reportedErrors.has(errorMetadata.error)) {
      // same error was previously reported, no need to re-report
      actionLogRef.current.disableReporting()
    } else {
      try {
        actionLogRef.current.reportedErrors.add(errorMetadata.error)
      } catch {
        // we do our best to mark the error, but it's okay to ignore if it's frozen
      }
    }
    actionLogRef.current.markStage({
      stage: DEFAULT_STAGES.ERROR_BOUNDARY,
      source: placement,
      metadata: {
        ...errorMetadata,
        handled: true,
      },
    })
  })
}
