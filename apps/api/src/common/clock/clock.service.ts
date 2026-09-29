import { Injectable, type OnModuleDestroy } from '@nestjs/common';

/**
 * Server time, injected everywhere.
 *
 * Section 36: "Unlock expiry must be calculated from server time."
 * Section 15: "Do not rely only on a client-side timer."
 *
 * Routing every time read through one injectable service is what makes the
 * expiry rules testable at the boundaries that matter — one millisecond
 * before expiry, exactly at expiry, one millisecond after — instead of only in
 * production, where nobody can reproduce them.
 *
 * Production always reads the real clock. Tests substitute FrozenClock.
 */
@Injectable()
export class ClockService {
  /** Current server time. */
  now(): Date {
    return new Date();
  }

  /** Milliseconds since the epoch, for arithmetic that avoids Date churn. */
  nowMs(): number {
    return this.now().getTime();
  }
}

/** Deterministic clock for tests. Never registered in the application graph. */
export class FrozenClock extends ClockService {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current.getTime());
  }

  set(at: Date | string): void {
    this.current = typeof at === 'string' ? new Date(at) : at;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/**
 * Guards against a system clock that jumped backwards (NTP correction, VM
 * restore), which would silently extend live unlocks. Real deployments should
 * call this once at boot and alert if drift is large.
 */
@Injectable()
export class ClockDriftGuard implements OnModuleDestroy {
  private static readonly MAX_BACKWARD_DRIFT_MS = 5_000;
  private lastSeenMs: number | null = null;

  constructor(private readonly clock: ClockService) {}

  check(): void {
    const now = this.clock.nowMs();
    if (this.lastSeenMs !== null && now < this.lastSeenMs - ClockDriftGuard.MAX_BACKWARD_DRIFT_MS) {
      // Surfaced as a hard error: expiry decisions depend on monotonicity.
      throw new Error(
        `Server clock moved backwards by ${this.lastSeenMs - now}ms. ` +
          `Unlock expiry would be extended. Investigate NTP before serving traffic.`,
      );
    }
    this.lastSeenMs = now;
  }

  onModuleDestroy(): void {
    this.lastSeenMs = null;
  }
}
