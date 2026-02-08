import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HybridLogicalClock,
  encode,
  decodePhysicalTime,
  decodeCounter,
  compareHLC,
  hlcToString,
} from "./index.js";

describe("HLC encoding/decoding", () => {
  it("should round-trip encode and decode", () => {
    const pt = 1700000000000;
    const counter = 42;
    const hlc = encode(pt, counter);

    expect(decodePhysicalTime(hlc)).toBe(pt);
    expect(decodeCounter(hlc)).toBe(counter);
  });

  it("should handle zero counter", () => {
    const hlc = encode(1700000000000, 0);
    expect(decodeCounter(hlc)).toBe(0);
  });

  it("should handle max counter (65535)", () => {
    const hlc = encode(1700000000000, 65535);
    expect(decodeCounter(hlc)).toBe(65535);
  });
});

describe("HLC comparison", () => {
  it("should order by physical time", () => {
    const a = encode(1000, 0);
    const b = encode(2000, 0);
    expect(compareHLC(a, b)).toBeLessThan(0);
    expect(compareHLC(b, a)).toBeGreaterThan(0);
  });

  it("should order by counter when physical time is equal", () => {
    const a = encode(1000, 1);
    const b = encode(1000, 2);
    expect(compareHLC(a, b)).toBeLessThan(0);
  });

  it("should return 0 for equal timestamps", () => {
    const a = encode(1000, 5);
    const b = encode(1000, 5);
    expect(compareHLC(a, b)).toBe(0);
  });
});

describe("HybridLogicalClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should generate monotonically increasing timestamps", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");

    const t1 = clock.now();
    const t2 = clock.now();
    const t3 = clock.now();

    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);
  });

  it("should reset counter when wall clock advances", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");

    clock.now(); // pt=1000, counter=0
    clock.now(); // pt=1000, counter=1

    vi.setSystemTime(2000);
    const t = clock.now(); // pt=2000, counter=0

    expect(decodePhysicalTime(t)).toBe(2000);
    expect(decodeCounter(t)).toBe(0);
  });

  it("should increment counter when wall clock hasn't advanced", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");

    clock.now();
    clock.now();
    const t = clock.now();

    expect(decodePhysicalTime(t)).toBe(1000);
    expect(decodeCounter(t)).toBe(3);
  });

  it("should adopt remote physical time when remote is ahead", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");

    const remoteHLC = encode(2000, 5);
    const received = clock.receive(remoteHLC);

    expect(decodePhysicalTime(received)).toBe(2000);
    expect(decodeCounter(received)).toBe(6);
  });

  it("should use wall clock when it's ahead of both local and remote", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");
    clock.now();

    vi.setSystemTime(5000);
    const remoteHLC = encode(3000, 10);
    const received = clock.receive(remoteHLC);

    expect(decodePhysicalTime(received)).toBe(5000);
    expect(decodeCounter(received)).toBe(0);
  });

  it("should merge counters when physical times are equal", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");

    // Advance local counter to 3
    clock.now(); // counter=0
    clock.now(); // counter=1
    clock.now(); // counter=2
    clock.now(); // counter=3

    // Receive remote with same physical time but counter=10
    const remoteHLC = encode(1000, 10);
    const received = clock.receive(remoteHLC);

    expect(decodePhysicalTime(received)).toBe(1000);
    expect(decodeCounter(received)).toBe(11); // max(3, 10) + 1
  });

  it("should reject remote timestamps with excessive drift", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");

    // Remote is 25 hours ahead (exceeds 24-hour limit)
    const futureTime = 1000 + 25 * 60 * 60 * 1000;
    const remoteHLC = encode(futureTime, 0);

    expect(() => clock.receive(remoteHLC)).toThrow("drift too large");
  });

  it("should serialise and deserialise correctly", () => {
    vi.setSystemTime(1000);
    const clock = new HybridLogicalClock("device-1");
    clock.now();
    clock.now();

    const state = clock.serialise();
    const restored = HybridLogicalClock.deserialise(state);

    expect(restored.current()).toBe(clock.current());
    expect(restored.getNodeId()).toBe("device-1");
  });
});

describe("hlcToString", () => {
  it("should produce a human-readable string", () => {
    const hlc = encode(1700000000000, 7);
    const str = hlcToString(hlc);
    expect(str).toContain("2023-11-14");
    expect(str).toContain(":7");
  });
});
