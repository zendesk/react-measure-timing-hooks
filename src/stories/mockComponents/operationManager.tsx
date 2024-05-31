import { OperationManager } from '../../2024-impl/operation';

export const operationManager = new OperationManager({
  // performance: {
  //   now: performance.now.bind(performance),
  //   measure(name, options) {
  //     console.log('measure', name, options)
  //     return performance.measure(name, options)
  //   },
  // },
  preprocessTask(task) {
    console.log('task', task);
    return task;
  },
});
