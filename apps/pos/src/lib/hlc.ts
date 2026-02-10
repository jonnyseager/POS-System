/**
 * Lightweight HLC (Hybrid Logical Clock) for the POS device.
 * Mirrors packages/hlc but self-contained for React Native.
 *
 * 64-bit HLC = 48-bit physical time (ms) + 16-bit counter
 */

const COUNTER_BITS = 16;
const COUNTER_MASK = (1n << BigInt(COUNTER_BITS)) - 1n;
const MAX_COUNTER = Number(COUNTER_MASK);

let lastPhysicalTime = 0;
let lastCounter = 0;

export function encode(physicalTime: number, counter: number): bigint {
  return (BigInt(physicalTime) << BigInt(COUNTER_BITS)) | BigInt(counter);
}

export function decode(hlc: bigint): {
  physicalTime: number;
  counter: number;
} {
  return {
    physicalTime: Number(hlc >> BigInt(COUNTER_BITS)),
    counter: Number(hlc & COUNTER_MASK),
  };
}

/**
 * Generate a new HLC timestamp, monotonically increasing.
 * Guarantees uniqueness even if wall clock hasn't advanced.
 */
export function now(): bigint {
  const wall = Date.now();
  if (wall > lastPhysicalTime) {
    lastPhysicalTime = wall;
    lastCounter = 0;
  } else {
    lastCounter++;
    if (lastCounter > MAX_COUNTER) {
      // Clock hasn't advanced and counter exhausted — wait
      lastPhysicalTime++;
      lastCounter = 0;
    }
  }
  return encode(lastPhysicalTime, lastCounter);
}

/**
 * Merge with a remote HLC (e.g. from server) to keep local clock ahead.
 */
export function merge(remoteHlc: bigint): void {
  const remote = decode(remoteHlc);
  const wall = Date.now();

  if (wall > lastPhysicalTime && wall > remote.physicalTime) {
    lastPhysicalTime = wall;
    lastCounter = 0;
  } else if (remote.physicalTime > lastPhysicalTime) {
    lastPhysicalTime = remote.physicalTime;
    lastCounter = remote.counter + 1;
  } else if (lastPhysicalTime === remote.physicalTime) {
    lastCounter = Math.max(lastCounter, remote.counter) + 1;
  } else {
    lastCounter++;
  }
}

/** Serialize HLC bigint to string for JSON transport */
export function hlcToString(hlc: bigint): string {
  return hlc.toString();
}

/** Parse HLC string back to bigint */
export function hlcFromString(s: string): bigint {
  return BigInt(s);
}
