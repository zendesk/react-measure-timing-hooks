import { OperationManager } from '../../v2/operation';
import { defaultEventProcessor } from '../../v2/defaultEventProcessor';

export const operationManager = new OperationManager({
  // performance: {
  //   now: performance.now.bind(performance),
  //   measure(name, options) {
  //     console.log('measure', name, options)
  //     return performance.measure(name, options)
  //   },
  // },
  preprocessEvent(event) {
    const processedEvent = defaultEventProcessor(event);
    console.log('event', processedEvent);
    return processedEvent;
  },
});
