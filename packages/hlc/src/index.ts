/**
 * Hybrid Logical Clock (HLC) implementation for offline-first sync.
 *
 * An HLC combines physical time with a logical counter to provide
 * causally-ordered timestamps across distributed devices without
 * requiring perfectly synchronised clocks.
 *
 * Structure (64-bit):
 *   [48 bits: physical time (ms since epoch)] [16 bits: counter]
 *
 * Physical time gives us rough wall-clock ordering.
 * The counter breaks ties when physical time hasn't advanced.
 * Together they guarantee: if event A caused event B, HLC(A) < HLC(B).
 */

const COUNTER_BITS = 16n;
const COUNTER_MASK = (1n << COUNTER_BITS) - 1n; // 0xFFFF
const MAX_COUNTER = Number(COUNTER_MASK);

/** Maximum allowed drift between local and remote physical time (24 hours) */
const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

export type HLCTimestamp = bigint;

export class HybridLogicalClock {
  private physicalTime: number;
  private counter: number;
  private readonly nodeId: string;

  constructor(nodeId: string, initialTime?: number) {
    this.nodeId = nodeId;
    this.physicalTime = initialTime ?? Date.now();
    this.counter = 0;
  }

  /** Generate a new HLC timestamp for a local event. */
  now(): HLCTimestamp {
    const wallTime = Date.now();

    if (wallTime > this.physicalTime) {
      this.physicalTime = wallTime;
      this.counter = 0;
    } else {
      this.counter++;
      if (this.counter > MAX_COUNTER) {
        throw new Error(
          `HLC counter overflow: more than ${MAX_COUNTER} events in the same millisecond. ` +
            "This should not happen in normal operation."
        );
      }
    }

    return encode(this.physicalTime, this.counter);
  }

  /**
   * Update the HLC on receiving a remote timestamp.
   * Returns a new HLC timestamp that is guaranteed to be greater than
   * both the current local HLC and the remote HLC.
   */
  receive(remoteHLC: HLCTimestamp): HLCTimestamp {
    const remotePT = decodePhysicalTime(remoteHLC);
    const remoteCounter = decodeCounter(remoteHLC);
    const wallTime = Date.now();

    // Drift check: reject timestamps too far in the future
    if (remotePT - wallTime > MAX_DRIFT_MS) {
      throw new Error(
        `HLC drift too large: remote physical time is ${remotePT - wallTime}ms ahead of local wall clock. ` +
          `Maximum allowed drift is ${MAX_DRIFT_MS}ms. Check device clock settings.`
      );
    }

    if (wallTime > this.physicalTime && wallTime > remotePT) {
      // Wall clock is ahead of both — use it and reset counter
      this.physicalTime = wallTime;
      this.counter = 0;
    } else if (remotePT > this.physicalTime) {
      // Remote is ahead — adopt remote time, increment its counter
      this.physicalTime = remotePT;
      this.counter = remoteCounter + 1;
    } else if (this.physicalTime === remotePT) {
      // Same physical time — take max counter and increment
      this.counter = Math.max(this.counter, remoteCounter) + 1;
    } else {
      // Local is ahead — just increment local counter
      this.counter++;
    }

    if (this.counter > MAX_COUNTER) {
      throw new Error("HLC counter overflow during receive.");
    }

    return encode(this.physicalTime, this.counter);
  }

  /** Get the current HLC value without advancing it. */
  current(): HLCTimestamp {
    return encode(this.physicalTime, this.counter);
  }

  /** Get this clock's node ID. */
  getNodeId(): string {
    return this.nodeId;
  }

  /** Serialise the clock state for persistence. */
  serialise(): { physicalTime: number; counter: number; nodeId: string } {
    return {
      physicalTime: this.physicalTime,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /** Restore clock state from persistence. */
  static deserialise(state: {
    physicalTime: number;
    counter: number;
    nodeId: string;
  }): HybridLogicalClock {
    const clock = new HybridLogicalClock(state.nodeId, state.physicalTime);
    clock.counter = state.counter;
    return clock;
  }
}

/** Encode physical time and counter into a 64-bit HLC timestamp. */
export function encode(physicalTime: number, counter: number): HLCTimestamp {
  return (BigInt(physicalTime) << COUNTER_BITS) | BigInt(counter & 0xffff);
}

/** Decode the physical time component from an HLC timestamp. */
export function decodePhysicalTime(hlc: HLCTimestamp): number {
  return Number(hlc >> COUNTER_BITS);
}

/** Decode the counter component from an HLC timestamp. */
export function decodeCounter(hlc: HLCTimestamp): number {
  return Number(hlc & COUNTER_MASK);
}

/** Compare two HLC timestamps. Returns negative, zero, or positive. */
export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Convert an HLC timestamp to a human-readable string for debugging. */
export function hlcToString(hlc: HLCTimestamp): string {
  const pt = decodePhysicalTime(hlc);
  const counter = decodeCounter(hlc);
  const date = new Date(pt).toISOString();
  return `${date}:${counter}`;
}
