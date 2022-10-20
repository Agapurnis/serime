import { Key } from "../../shared/constants";

const enum ComparisonLogNavigation {
  ROOT       = "CLN:ROOT",
  KEY_AS_KEY = "CLN:KEY_AS_KEY",
  KEY_TO_VAL = "CLN:KEY_TO_VAL",
  DESCRIPTOR = "CLN:DESCRIPTOR",
}

type ComparisonLogNagivationRelative = Exclude<ComparisonLogNavigation, ComparisonLogNavigation.ROOT>

const enum ComparisonLogComparison {
  COMPARE_KEYS_LENGTHS = "CLC:COMPARE_KEYS_LENGTHS",
  COMPARE_CONSTRUCTOR  = "CLC:COMPARE_CONSTRUCTOR",
  COMPARE_OBJECT_IS    = "CLC:COMPARE_OBJECT_IS",
  COMPARE_PROTOYPE     = "CLC:COMPARE_PROTOYPE",
  COMPARE_TYPEOF       = "CLC:COMPARE_TYPEOF",
}

type ComparisonLogElement <T = any> =
  | [ComparisonLogNavigation.ROOT]
  | [ComparisonLogNagivationRelative, keyof T]
  | [ComparisonLogComparison]

type ComparisonLog = Array<ComparisonLogElement>

export class ComparisonError extends Error {
  constructor (public readonly comparer: Comparison<any>, message: string) {
    super(message);
  }

  get [Symbol.toStringTag]() {
    return 'ComparisonError';
  }

  public toString () {
    return this[Symbol.toStringTag] + `: ` + this.message;
  }
};

export class Comparison <T> {
  private static readonly DID = new Map<any, Set<any>>();

  constructor (
    private readonly a: T,
    private readonly b: T,
    public readonly parent?: Comparison<any>,
    public readonly log: ComparisonLog = [[ComparisonLogNavigation.ROOT]]
  ) {
    if (!Comparison.DID.has(a)) Comparison.DID.set(a, new Set());
    if (!Comparison.DID.has(b)) Comparison.DID.set(b, new Set());
  };


  public assert () {
    this.#compare()
  }

  public check () {
    try {
      this.#compare()
    } catch (err) {
      if (!(err instanceof ComparisonError)) {
        console.warn("An unintended internal comparison error occured while comparing!")
      }
      return false
    } finally {
      return true
    }
  }

  #finalize (message: string, element?: ComparisonLogElement) {
    if (typeof element !== "undefined") {
      this.log.push(element);
    }

    throw new ComparisonError(this, message)
  }

  #compare (): void {
    {
      // Don't repeat comparisons infinitely.
      const as = Comparison.DID.get(this.a)!; if (as.has(this.b)) return; as.add(this.b);
      const bs = Comparison.DID.get(this.b)!; if (bs.has(this.a)) return; bs.add(this.a);
    }

    if (
      typeof this.a !==
      typeof this.b
    ) this.#finalize("Must be equal using `typeof`", [ComparisonLogComparison.COMPARE_TYPEOF]);

    if (
      typeof this.a === "string" || 
      typeof this.a === "bigint" ||
      typeof this.a === "number" || 
      typeof this.a === "symbol" || 
      typeof this.a === "boolean" || 
      this.a === undefined ||
      this.a === null
    ) {
      if (!Object.is(
        this.a,
        this.b
      )) {
        this.#finalize("Primitive types must be equal using `Object.is`!")
      }

      return;
    }

    if (
      Object.getPrototypeOf(this.a) !==
      Object.getPrototypeOf(this.b)
    ) this.#finalize("Must share the same prototype", [ComparisonLogComparison.COMPARE_CONSTRUCTOR]);

    if (
      this.a instanceof Object &&
      this.b instanceof Object
    ) {
      const ac = this.a.constructor;
      const bc = this.b.constructor;

      if ((
        (typeof ac !== "undefined" ? Object.getPrototypeOf(ac) : ac) !==
        (typeof bc !== "undefined" ? Object.getPrototypeOf(bc) : bc)
      ) && (typeof this.a !== "function")) this.#finalize("Must share the same constructor prototype (if not a function)", [ComparisonLogComparison.COMPARE_CONSTRUCTOR]);

      if (Object.is(
        this.a,
        this.b,
      )) return;

      function keys (value: any): Array<Key> {
        if (!(value instanceof Object)) {
          throw new Error("Cannot get the keys of a non-object!");
        }

        const strs = Object.getOwnPropertyNames(value);
        const syms = Object.getOwnPropertySymbols(value);

        return Object.seal(([] as Key[])
          .concat(strs)
          .concat(syms)
        )
      }

      const ak = keys(this.a);
      const bk = keys(this.b);

      if (ak.length !== bk.length) {
        this.#finalize("Must share the same amount of keys", [ComparisonLogComparison.COMPARE_KEYS_LENGTHS])
      }

      for (let i = 0; i < ak.length; i++) {
        new Comparison(ak[i], bk[i], this, this.log.concat([[ComparisonLogNavigation.KEY_AS_KEY, ak[i]]])).#compare();
        new Comparison(
          this.a[ak[i] as keyof T],
          this.b[ak[i] as keyof T],
          this, this.log.concat([[ComparisonLogNavigation.KEY_TO_VAL, ak[i]]])
        ).#compare();

        if (this.log[this.log.length - 1]?.[0] !== ComparisonLogNavigation.DESCRIPTOR) new Comparison(
          Object.getOwnPropertyDescriptor(this.a, ak[i]),
          Object.getOwnPropertyDescriptor(this.b, ak[i]),
          this, this.log.concat([[ComparisonLogNavigation.DESCRIPTOR, ak[i]]])
        ).#compare();
      }

      return;
    }

    throw new Error("Unable to make comparison!")
  }
}
