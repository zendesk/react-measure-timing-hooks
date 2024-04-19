// TODO: maybe even a HOC/wrapper instead?
export const useCaptureRenderBeaconTask = (opts: {
  componentName: string
  // a map of object type to their ID, e.g. { 'ticket': '123' }
  objects: Record<string, string | number | boolean>
  metadata: Record<string, unknown>
  error?: Error
}) => {
  // simple: capture renders and emit:
  // render start 'mark'
  // render end 'measure'
  // TODO: consider whether we want to emit actual Performance API events or just internally to central manager
}

// records until all required render beacons are settled
// (and until the page is interactive? or maybe that's the central manager's job)
export const useCaptureOperationTiming = (opts: {
  operationName: string
  track: {
    match:
      | {
          // match by the name of the measure/mark/resource
          name?: string | RegExp | ((name: string) => boolean)
          // match by metadata value
          metadata?: Record<string, string | number | boolean>
          // match by type
          type:
            | 'measure'
            | 'mark'
            | 'resource'
            | 'render-start'
            | 'render'
            | 'render-error'
        }
      | ((entry: PerformanceEntry) => boolean)

    // wait for these measures/marks to be seen before starting the operation:
    requiredToStart?: boolean

    // these measures/marks need to be seen at least once before the operation can end:
    // defaults to true
    requiredToEnd?: boolean

    // appearance of any of these tasks will prevent the operation from ending
    // useful when expecting to see an event multiple times and it's not clear how many
    // defaults to true
    debounceEndWhenSeen?:
      | boolean
      | { debouceBy: number; debounceCountLimit?: number }

    interruptWhenSeen?: boolean
  }[]
  // listening to events will start once 'active' is true, and stop once 'active' is false
  active: boolean
  error?: Error
  metadata: Record<string, unknown>
  timeout?: number
  // emit a 'measure' event when the operation ends:
  captureDone?: boolean
  // emit a 'measure' event when the operation ends and the page is interactive:
  captureInteractive?:
    | boolean
    | {
        // how long to wait for the page to be interactive
        timeout: number
        debounceLongTasksBy?: number
      }
  // interrupt capture when another operation of the same name starts
  interruptSelf?: boolean
}) => {
  // starts an operation when:
  // - 'active' is true,
  // - all requiredToStart timings have been seen
  // all metadata from required tasks is merged into the operation metadata
  // the resulting task will have metadata that explains why it ended:
  // - 'interrupted' if an interruptWhenSeen task was seen
  // - 'timeout' if the timeout was reached
  // - 'interactive' if the captureInteractive timeout was reached
}
