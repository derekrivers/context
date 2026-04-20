import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CompletenessBar, clamp01 } from '../src/components/CompletenessBar.js'

describe('clamp01', () => {
  it('clamps values to [0, 1]', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(0)).toBe(0)
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(1)).toBe(1)
    expect(clamp01(1.5)).toBe(1)
  })

  it('handles non-finite values by treating them as 0', () => {
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('CompletenessBar', () => {
  afterEach(cleanup)

  it('renders with aria-valuenow clamped to 0-100', () => {
    render(<CompletenessBar value={0.42} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  })

  it('clamps below 0 to 0', () => {
    render(<CompletenessBar value={-1} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('clamps above 1 to 100', () => {
    render(<CompletenessBar value={5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
