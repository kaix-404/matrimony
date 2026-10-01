import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';

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
 * restore), which would silently extend live unlocks.
 *
 * `check()` throws, because an explicit caller asking "is the clock sane?"
 * deserves a hard answer and expiry decisions depend on monotonicity.
 *
 * The first check only records a baseline: a process booting with an
 * already-wrong clock cannot detect that on its own, having nothing to compare
 * against. That is why the bootstrap timer below is what makes this useful, and
 * why it catches the throw instead of letting it escape. An exception thrown
 * from a `setInterval` callback is an uncaught exception, which would kill an
 * otherwise healthy process mid-request. Instead the drift is recorded, logged
 * and reported by /health/ready so the instance is pulled from rotation.
 */
@Injectable()
export class ClockDriftGuard implements OnApplicationBootstrap, OnModuleDestroy {
  private static readonly MAX_BACKWARD_DRIFT_MS = 5_000;
  private static readonly CHECK_INTERVAL_MS = 60_000;
  private readonly logger = new Logger(ClockDriftGuard.name);
  private lastSeenMs: number | null = null;
  private driftMs: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly clock: ClockService) {}

  check(): void {
    const now = this.clock.nowMs();
    if (this.lastSeenMs !== null && now < this.lastSeenMs - ClockDriftGuard.MAX_BACKWARD_DRIFT_MS) {
      this.driftMs = this.lastSeenMs - now;
      throw new Error(
        `Server clock moved backwards by ${this.driftMs}ms. ` +
          `Unlock expiry would be extended. Investigate NTP before serving traffic.`,
      );
    }
    this.lastSeenMs = now;
  }

  /** True until a backwards jump is seen. Reported by /health/ready. */
  isHealthy(): boolean {
    return this.driftMs === null;
  }

  /** Milliseconds of observed backwards drift, or null. Diagnostic only. */
  observedDriftMs(): number | null {
    return this.driftMs;
  }

  onApplicationBootstrap(): void {
    // The first call only establishes the baseline and cannot throw.
    this.check();
    this.timer = setInterval(() => this.safeCheck(), ClockDriftGuard.CHECK_INTERVAL_MS);
    // Do not hold the event loop open on shutdown.
    this.timer.unref();
  }

  /**
   * Periodic check. Converts the hard error into a recorded, reported fault so
   * a background timer never terminates the process.
   */
  private safeCheck(): void {
    try {
      this.check();
    } catch (error) {
      this.logger.error((error as Error).message);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastSeenMs = null;
    this.driftMs = null;
  }
}
