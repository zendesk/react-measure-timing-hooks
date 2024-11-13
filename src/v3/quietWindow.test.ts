/* eslint-disable jest/no-conditional-in-test */
import { createCPUIdleProcessor } from './quietWindow'
import { parseTaskString } from './test/helper'

const ONE_SECOND_IDLE = '-'.repeat(20)
const TWO_SECOND_IDLE = '-'.repeat(40)

describe('createCPUIdleProcessor', () => {
  it('No long tasks after FMP, FirstCPUIdle immediately after FMP + quiet window', () => {
    const taskString =
      '----|--------------------------------------------------------------------------------[400]'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    expect(firstCPUIdle).toBe(fmpTime)
  })

  it('One light cluster after FMP, FirstCPUIdle at FMP', () => {
    const taskString =
      '----|--[50]-[50][50]--------------------------------------------------*'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    expect(firstCPUIdle).toBe(fmpTime)
  })

  it('One heavy cluster after FMP, FirstCPUIdle after the cluster', () => {
    const taskString =
      '----|--[50]-[200]-[50]--------------------------------------------------*'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    expect(firstCPUIdle).toBe(700) // Expected FirstCPUIdle at 700ms
  })

  it('Multiple heavy clusters, FirstCPUIdle updated to end of last cluster', () => {
    const taskString =
      '----|--[200]--------[200]--------[200]------------------------------------------*'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    const lastLongTask = entries.at(-2)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toBe(expectedResult)
  })

  it('Checking before the quiet window has passed - no long tasks processed, FirstCPUIdle not found', () => {
    const taskString = '----|----*'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    expect(firstCPUIdle).toBeUndefined()
  })

  it('One heavy cluster, followed by two light, value is after 1st heavy cluster', () => {
    const taskString =
      '----|--[200]--[100]--------------------[200]--------------------[200]-------------------------------*'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    const lastLongTask = entries.at(1)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toBe(expectedResult) // Expected FirstCPUIdle at 1300ms
  })

  it('Continuous heavy clusters', () => {
    const taskString =
      '----|[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-[300]-*'
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      processor(entry)
      // FirstCPUIdle should not be found due to continuous heavy clusters
    }

    expect(firstCPUIdle).toBeUndefined()
  })

  it('Light cluster followed by a heavy cluster a second later, FirstCPUIdle updated', () => {
    const taskString = `----|[50]-[50][50]${ONE_SECOND_IDLE}-[50]-[50]-[200]-[200]-${TWO_SECOND_IDLE}*`
    const { entries, fmpTime } = parseTaskString(taskString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    const lastLongTask = entries.at(-2)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toBe(expectedResult)
  })

  it('A long task overlaps FMP, we consider FirstCPUIdle after the long task', () => {
    const fmpString = `----|`
    const tasksString = `---[110]-----${TWO_SECOND_IDLE}*`
    const { fmpTime } = parseTaskString(fmpString)
    const { entries } = parseTaskString(tasksString)
    const processor = createCPUIdleProcessor(fmpTime!)
    let firstCPUIdle

    for (const entry of entries) {
      const result = processor(entry)
      if (result !== undefined) {
        firstCPUIdle = result
      }
    }

    const lastLongTask = entries.at(-2)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toBe(expectedResult)
  })
})
