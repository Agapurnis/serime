/**
 * 32-bit nunber binary flag utility wrapper class
 * @internal
 */
export class Bitflag<T extends object> {
  protected static MAX_32INT = +1 * (2 ** 31)
  protected static MIN_32INT = -1 * (2 ** 31)

  /**
   * @returns the number as a 32-bit integer
   */
  protected static to32bit(n: number): number {
    if (
      n > Bitflag.MAX_32INT ||
      n < Bitflag.MIN_32INT
    ) {
      throw new Error("Loss of whole number precision will occur when concerting to 32-bit integer!");
    }

    const int32 = ~~(n);

    if (int32 !== n) {
      throw new Error("Loss of precision occured when converting to 32-bit integer!")
    }

    return int32;
  }

  /**
   * @returns whether the enum is valid for usage with bitflags (will always be true, since it throws otherwise)
   * @throws if the enum is invalid
   */
  protected static validateEnum(o: object, warn = false): boolean {
    const keys = Object.keys(o);

    if (keys.length % 2 !== 0) {
      throw new Error("Enum keys length not even, duplicate value present!");
    }

    const flags = keys.map((k) => Number(k)).filter((n) => !Number.isNaN(n)).map((n) => Bitflag.to32bit(n));

    if (warn) {
      if (flags.length === 7) console.warn("7 enums present in Bitflag, this is the limit of a signed 8-bit integer!");
      if (flags.length  >= 8) console.warn("8 or more enums present in a Bitflag, this is at or past the limit of an unsigned 8-bit integer!");
    }

    for (const flag of flags) {
      if (flag < 0) {
        throw new Error("Enum value cannot be negative!")
      }

      if (flag === 0) {
        throw new Error("Cannot use `0` as an enum value!")
      }

      const ones = flag.toString(2).match(/1/g)?.length ?? 0;

      if (ones !== 1) {
        throw new Error(`A non power of two value (\`${flag}\`) was present in an enum!`);
      }
    }

    return true;
  }

  #state: number;

  constructor(
    protected readonly lookup: T,
    protected readonly name?: string,
    initial: keyof T | T[keyof T] | number = 0,
  ) {
    // Ensure enum is valid. This will throw if its not.
    Bitflag.validateEnum(lookup, true);
    // Set the provided state.
    this.#state = (typeof initial === "number") ? Bitflag.to32bit(initial) : this.mask(initial);
  }

  /**
   * the state as a 32-bit integer
   */
  public get int() {
    return this.#state;
  }
  
  /**
   * @returns mask for flag
   */
  private mask (flag: keyof T | T[keyof T]): number {
    return (typeof flag === "number") ? flag : this.lookup[flag as keyof T] as unknown as number;
  }

  /**
   * @returns merged flags using OR
   */
  private merge (flags: Array<keyof T | T[keyof T]>): number {
    return flags.reduce((v, f) => v | this.mask(f), 0);
  }

  /**
   * @returns a descriptive state of the 
   */
  public toString() {
    const len = Object.keys(this.lookup as object).length / 2;
    const bin = this.int.toString(2).padStart(2 << 2 << 3, "0").slice(-len);
    const name = this.name ?? this.lookup["name" as keyof T] ?? "Unknown Enum";
    return `${this.constructor.name}<${name}, ${bin}>`
  }

  /**
   * @returns the 32-bit integger
   */
  public toJson() {
    return this.int;
  }

  /**
   * @returns the state as an object for use in debugging
   */
  public toObject() {
    const object = {} as Record<keyof T, boolean>
    const keys = Object.keys(this.lookup).filter((k) => Number.isNaN(Number(k))) as Array<keyof T>

    for (const key of keys) {
      object[key] = this.has(key);
    }

    return object
  }

  /**
   * @returns whether *all* of the provided flags are set
   */
  public has(...flags: Array<keyof T | T[keyof T]>): boolean {
    return flags.map((flag) => this.mask(flag)).every((mask) => (this.int & mask) === mask);
  }

  public enable(...flags: Array<keyof T | T[keyof T]>) {
    this.#state |= this.merge(flags); return this;
  }

  public disable(...flags: Array<keyof T | T[keyof T]>) {
    this.#state &= ~this.merge(flags); return this;
  }

  public toggle(...flags: Array<keyof T | T[keyof T]>) {
    this.#state ^= this.merge(flags); return this;
  }
}
