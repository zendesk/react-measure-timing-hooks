import { describe, it, expect } from 'vitest'
import { createQuietWindowDurationCalculator } from './getDynamicQuietWindowDuration'

// Constants for testing
const FMP = 0 // Simulate FMP at time 0
const EPSILON = 0.001 // Allowable error for floating-point calculations

describe('createQuietWindowDurationCalculator', () => {
  const calculateQuietWindowDuration = createQuietWindowDurationCalculator({
    D0: 5_000,
    Dx: 3_000,
    x: 15,
    DInfinity: 1_000,
  })

  it('should return 5 seconds (5000 ms) at FMP', () => {
    const duration = calculateQuietWindowDuration(FMP, FMP)
    expect(duration).toBeCloseTo(5_000, EPSILON)
  })

  it('should return approximately 3 seconds (3000 ms) at 15 seconds after FMP', () => {
    const duration = calculateQuietWindowDuration(FMP + 15_000, FMP)
    expect(duration).toBeCloseTo(3_000, EPSILON)
  })

  it('should approach 1 second (1000 ms) as time progresses far beyond FMP', () => {
    const duration = calculateQuietWindowDuration(FMP + 60_000, FMP) // 60 seconds after FMP
    expect(duration).toBeCloseTo(1_250, EPSILON)
  })

  it('should never return a value lower than 1 second (1000 ms)', () => {
    const duration = calculateQuietWindowDuration(FMP + 1_000_000, FMP) // Far future time
    expect(duration).toBeGreaterThanOrEqual(1_000)
    expect(duration).toBeCloseTo(1_000)
  })

  it('should decrease over time from FMP', () => {
    const durationAtFMP = calculateQuietWindowDuration(FMP, FMP)
    const durationAt5Sec = calculateQuietWindowDuration(FMP + 5_000, FMP)
    const durationAt10Sec = calculateQuietWindowDuration(FMP + 10_000, FMP)
    const durationAt15Sec = calculateQuietWindowDuration(FMP + 15_000, FMP)

    expect(durationAtFMP).toBeGreaterThan(durationAt5Sec)
    expect(durationAt5Sec).toBeGreaterThan(durationAt10Sec)
    expect(durationAt10Sec).toBeGreaterThan(durationAt15Sec)
  })

  it('should work correctly with non-zero FMP values', () => {
    const customFMP = 2_000 // FMP at 2 seconds
    const durationAtFMP = calculateQuietWindowDuration(customFMP, customFMP)
    const durationAt5Sec = calculateQuietWindowDuration(
      customFMP + 5_000,
      customFMP,
    )

    expect(durationAtFMP).toBeCloseTo(5_000, EPSILON)
    expect(durationAtFMP).toBeGreaterThan(durationAt5Sec)
  })
})
