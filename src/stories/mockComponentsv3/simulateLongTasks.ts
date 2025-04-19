export function triggerLongTasks({
  minTime,
  maxTime,
  totalClusterDuration,
}: {
  minTime: number
  maxTime: number
  totalClusterDuration: number
}): () => void {
  const controller = new AbortController()
  const startTime = Date.now()

  function randomDuration(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  function executeLongTask() {
    const taskDuration = randomDuration(minTime, maxTime)
    const endTime = Date.now()

    if (controller.signal.aborted) {
      // console.log('Cluster aborted.')
      return
    }

    if (endTime - startTime < totalClusterDuration) {
      // console.log(`Starting long task for ${taskDuration} ms`)
      const taskEnd = Date.now() + taskDuration

      // Simulating a blocking long task
      while (Date.now() < taskEnd) {
        if (controller.signal.aborted) {
          // console.log('Task aborted.')
          return
        }
      }

      executeLongTask() // Trigger the next task
    } else {
      // console.log('Completed all tasks within the cluster duration.')
    }
  }

  executeLongTask()

  // Return a callback that can abort the current cluster
  return () => void controller.abort()
}
