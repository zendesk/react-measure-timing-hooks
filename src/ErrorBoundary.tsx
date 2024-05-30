/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import { Component, useEffect, useRef, type DependencyList } from 'react'

interface ErrorMetadata {
  error: Error
  info: React.ErrorInfo
}

let errorMetadataCurrentlyBeingThrown: undefined | ErrorMetadata = undefined

export const useOnErrorBoundaryDidCatch = (
  onCaughtError: (metadata: ErrorMetadata) => void,
): void => {
  useEffect(() => () => {
    if (!errorMetadataCurrentlyBeingThrown) return
    // this will only run if React decides to unmount the tree that threw the error
    onCaughtError(errorMetadataCurrentlyBeingThrown)
  }, [onCaughtError])
}

export const useOnComponentUnmount = (
  onComponentUnmountCallback: (metadata?: ErrorMetadata) => void,
  dependencies: DependencyList = [],
): void => {
  const onComponentUnmountRef = useRef(onComponentUnmountCallback)
  onComponentUnmountRef.current = onComponentUnmountCallback
  useEffect(() => () => {
    onComponentUnmountRef.current(errorMetadataCurrentlyBeingThrown)
  }, dependencies)
}

export class ReactMeasureErrorBoundary<
  P = {},
  S = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SS = any,
> extends Component<P, S, SS> {
  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // since 'componentDidCatch' runs synchronously right before useEffect clean-up functions
    // belonging to the component that has thrown,
    // that means this metadata is available within that synchronous frame to the component
    // this should work even in concurrent mode;
    // at least for the purpose of reporting metadata, or metrics such as counts, this is good enough
    errorMetadataCurrentlyBeingThrown = { error, info }
    setTimeout(() => {
      // we want this data to be available synchronously - only in the same JS frame
      // so we clean-up immediately after:
      errorMetadataCurrentlyBeingThrown = undefined
    })
  }
}
