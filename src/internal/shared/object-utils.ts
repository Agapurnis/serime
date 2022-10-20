export type DeepReadonly<T> = {  readonly [P in keyof T]: DeepReadonly<T[P]>; }
export type DeepWritable<T> = { -readonly [P in keyof T]: DeepWritable<T[P]>; }
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }
export type MaybeReadonly<T> = T | Readonly<T>

/**
 * 'locks' an object
 * @returns the input object, sealed recursively
 * @remarks
 *   - Doesn't return a *clone* of the object, this makes the actual object provided as a parameter locked.
 */
export function lock<T>(input: T): DeepReadonly<T> {
  return (typeof input === "object") ? (Object.values(input as unknown as object).forEach(v => Object.isSealed(v) ? v : lock(v)), Object.seal(input) as DeepReadonly<T>) : input;
}

/**
 * @returns a clone of the object
 * @remarks
 *   - very rough, supports primitives and simple objects
 *   - doesnt support most classes, cyclic structures
 */
export function clone<T>(input: T): T {
  if (input instanceof Array) return input.map((v) => clone(v)) as unknown as T;
  if (input instanceof Object && typeof input === "object") {
    const fill = {} as T;
    const entries = clone(Object.entries(input as unknown as object));

    for (const [k, v] of entries) {
      fill[k as keyof object] = v as never;
    }
    return fill;
  }

  return input
}

/**
 * @returns an object made by merging the two provided objects, the right side taking priority over left.
 * @remarks
 *   - no mutation to either object or it's descendants are done. an entirely new object is returned
 *   - an undefined value on the right side will be not override a defined value on the left, though null will.
 *   - meant for primitive objects, not classes, though the right hand prototype will be used
 *   - doesnt yet support cyclics
 */
export function merge(left: any, right: any): any {
  if (typeof left !== "undefined" && typeof right === "undefined") return left;
  if (typeof left !== "object" && (typeof right !== "object" || right === null)) return right;
  if (typeof left === "object" && typeof right !== "object") return right;

  const keys = Object.keys(left).concat(Object.keys(right));
  const fill = {} as Record<string | number | symbol, any>;

  Object.setPrototypeOf(fill, Object.getPrototypeOf(right));

  for (const key of keys) {
    fill[key] = merge(left[key], right[key]);
  }

  return fill
}
