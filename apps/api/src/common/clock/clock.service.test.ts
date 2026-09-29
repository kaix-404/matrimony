import { describe, it, expect, beforeEach } from '@jest/globals';
import { ClockService, ClockDriftGuard, FrozenClock } from './clock.service';

describe('ClockService', () => {
  it('returns a real current time', () => {
    const before = Date.now();
    const now = new ClockService().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('FrozenClock', () => {
  let clock: FrozenClock;

  beforeEach(() => {
    clock = new FrozenClock(new Date('2026-03-01T10:00:00.000Z'));
  });

  it('returns the instant it was constructed with', () => {
    expect(clock.now().toISOString()).toBe('2026-03-01T10:00:00.000Z');
  });

  it('does not advance on its own', () => {
    const first = clock.now().getTime();
    expect(clock.now().getTime()).toBe(first);
  });

  it('hands out copies so callers cannot mutate internal state', () => {
    const handed = clock.now();
    handed.setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-03-01T10:00:00.000Z');
  });

  it('advances deterministically', () => {
    clock.advance(24 * 3_600_000);
    expect(clock.now().toISOString()).toBe('2026-03-02T10:00:00.000Z');
  });

  it('accepts an ISO string', () => {
    clock.set('2026-06-15T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});

/**
 * Section 36: "Unlock expiry must be calculated from server time." A clock that
 * jumps backwards would silently extend every live unlock, so the guard fails
 * loudly rather than serving traffic.
 */
describe('ClockDriftGuard', () => {
  let clock: FrozenClock;
  let guard: ClockDriftGuard;

  beforeEach(() => {
    clock = new FrozenClock(new Date('2026-03-01T10:00:00.000Z'));
    guard = new ClockDriftGuard(clock);
  });

  it('accepts normal forward progress', () => {
    expect(() => {
      guard.check();
      clock.advance(1000);
      guard.check();
      clock.advance(60_000);
      guard.check();
    }).not.toThrow();
  });

  it('accepts a small backward correction (NTP jitter)', () => {
    guard.check();
    clock.advance(-2000);
    expect(() => guard.check()).not.toThrow();
  });

  it('throws when the clock jumps backwards far enough to extend unlocks', () => {
    guard.check();
    clock.advance(-10 * 60_000);
    expect(() => guard.check()).toThrow(/clock moved backwards/i);
  });

  it('names the drift so an operator can act on it', () => {
    guard.check();
    clock.advance(-600_000);
    try {
      guard.check();
      throw new Error('expected the guard to throw');
    } catch (error) {
      expect((error as Error).message).toMatch(/600000ms/);
      expect((error as Error).message).toMatch(/NTP/);
    }
  });
});
