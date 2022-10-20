/**
 * @returns ms value as ns, preserving the most precision possibile
 */
export function mstons(ms: number): bigint {
  const adjustment = 10 ** 6;
  const precision = 10 ** (ms.toString().split('.')[1] ?? String()).length;
  return BigInt(ms * adjustment * precision) / BigInt(precision);
}

/**
 * @returns ns value as ms
 */
export function nstoms(ns: bigint): number {
  const str = ns.toString();
  const decimal = Number(str.slice(-6)) / 10 ** 6;
  const integer = Number(str.slice(0, -6));
  return integer + decimal;
}

/**
 * @returns time in milliseconds if no parameter is provided.
 * @returns returns millisecond difference between time at calling and provided time if one is provided as a bigint
 */
export function time(previous?: number | bigint): number {
  previous = previous
    ? typeof previous === 'number'
      ? mstons(previous)
      : previous
    : 0n;

  return nstoms(nanoseconds() - previous);
}

/**
 * @internal
 * @returns time in nanoseconds as a bigint
 */
export function nanoseconds(): bigint {
  const global = globalThis ?? window;

  if ('performance' in global) {
    const ms = window.performance.now();

    return mstons(ms);
  }

  if (!('process' in global)) {
    const ms = Date.now();

    return mstons(ms);
  }

  const process = (global as any).process;
  const hrtime = (process as any).hrtime as (() => [number, number]) &
    ({ bigint: () => bigint } | {});

  if ('bigint' in hrtime) {
    return hrtime.bigint();
  }

  const [a, b] = hrtime();

  return BigInt(a) * 1000000000n + BigInt(b);
}

export function benchmark (callback: () => void, times: number) {
  let sum = 0;

  for (let i = 0; i < times; i++) {
    const t = time(); callback()
    const f = time(t);

    sum += f;
  }

  return sum / times;
}
