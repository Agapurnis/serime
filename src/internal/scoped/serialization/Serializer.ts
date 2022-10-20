import { Bitflag } from "../../shared/bitflag";
import { SerializationFormatToken } from "../../shared/grammar/tokens";
import { PropertyDescriptorFlag } from "../../shared/flags/propertyDescriptor.flag";
import { DEFAULT_SHARED_CONFIGURATION } from "../../shared/config";
import { EMPTY, INDEX_NOT_FOUND, INDEX_START, Key } from "../../shared/constants";
import { clone, DeepPartial, DeepReadonly, lock, merge } from "../../shared/object-utils";
import { SerializedBoolean } from "../../shared/serialized-boolean";
import { ShorthandType } from "../../shared/type/shorthand";
import { CustomTypeReference, EnscribedType } from "../../shared/type/util";
import { SerializerConfiguration } from "./SerializerConfiguration";
import { SerializerError } from "./SerializerError";

/**
 * Serializer
 * 
 * @copyright MIT
 * @author Katini <agapurnis@outlook.com>
 */
export class Serializer {
  /** @internal */ public static WELL_KNOWN_SYMBOLS = lock(Object.getOwnPropertyNames(Symbol).map((key) => Symbol[key as keyof typeof Symbol]).filter((value): value is symbol => typeof value === "symbol"))
  /** @internal */ public static RESERVED_CHARACTERS = lock(['&', ';', '!', '@', '#', '%', '[', ']', '{', '}', '|', ',', '=', '$', ':', '~'] as const)
  /** @internal */ public static RESERVED_REGEX = new RegExp('\\' + Serializer.RESERVED_CHARACTERS.join('|\\'), "gm");

  private static DEFAULT_CONFIGURATION: DeepReadonly<SerializerConfiguration> = DEFAULT_SHARED_CONFIGURATION;

  public constructor (config: DeepPartial<SerializerConfiguration> = Serializer.DEFAULT_CONFIGURATION) {
    this.#config = (config === Serializer.DEFAULT_CONFIGURATION) ? clone(Serializer.DEFAULT_CONFIGURATION) : lock(merge(Serializer.DEFAULT_CONFIGURATION, config) as SerializerConfiguration)
  }

  /**
   * @see ObjectAccessabilityFlag
   */
  private objectAccessabilityFlag (object: object): Bitflag<typeof ObjectAccessabilityFlag> {
    // TODO: Metadata (is optional/configurable, requires dependency).

    const flags = new Bitflag(ObjectAccessabilityFlag, "ObjectAccessabilityFlag");

    if (Object.isSealed(object)) flags.enable(ObjectAccessabilityFlag.IS_SEALED);
    if (Object.isFrozen(object)) flags.enable(ObjectAccessabilityFlag.IS_FROZEN);
    if (!Object.isExtensible(object)) flags.enable(ObjectAccessabilityFlag.NON_EXTENSIBLE);

    return flags;
  }

  /**
   * @see PropertyDescriptorFlag
   */
  private propertyDescriptorFlag<T>(object: T, property: keyof T): Bitflag<typeof PropertyDescriptorFlag> {
    // TODO: Metadata (is optional/configurable, requires dependency).

    if (
      object instanceof Map ||
      object instanceof Set
    ) return new Bitflag(PropertyDescriptorFlag, "PropertyDescriptorFlag");

    if (!(property in object)) throw new SerializerError("Property does not exist on object!");

    const descriptorFlags = new Bitflag(PropertyDescriptorFlag, "PropertyDescriptorFlag");
    const descriptor = Object.getOwnPropertyDescriptor(object, property)!;

    if (descriptor.configurable) descriptorFlags.enable(PropertyDescriptorFlag.IS_CONFIGURABLE);
    if (descriptor.enumerable) descriptorFlags.enable(PropertyDescriptorFlag.IS_ENUMERABLE);
    if (descriptor.writable) descriptorFlags.enable(PropertyDescriptorFlag.IS_WRITABLE);


    return descriptorFlags
  }


  #config: DeepReadonly<SerializerConfiguration>
  #ticks = 0;
  #reference_ids = 0;
  #reference_value_map = new Map<any, number>();
  #reference_usage = 0;
  #custom_constructors: Array<new (...args: any[]) => any> = []

  /**
   * A serialization memoizer to support references to non-independant instances and cyclic values.
   *
   * @internal
   */
  private mark <T> (value: T, serialize: (value: T) => string): string {
    // If we've made a reference for this value, use the reference instead.
    if (this.#reference_value_map.has(value)) {
      this.#reference_usage++;
      return SerializationFormatToken.REFERENCE_POINTER + this.#reference_value_map.get(value);
    }

    // If the value isn't zero, record it in the reference map. Zero is exempt to preserve it's signs.
    if (value !== (0 as unknown as T)) this.#reference_value_map.set(value, this.#reference_ids);

    // Then, return a reference declaration alongisde the actual serialized value.
    return (
      SerializationFormatToken.REFERENCE_DECLARARION_S + (this.#reference_ids++) +
      SerializationFormatToken.REFERENCE_DECLARATION_E + serialize(value)
    )
  }

  /**
   * Serializes a boolean.
   * @param boolean - The boolean to serialize
   * @returns the serialized boolean
   * @see SerializedBoolean
   * @internal
   */
  private serializeBoolean (boolean: boolean): SerializedBoolean {
    if (typeof boolean !== "boolean") {
      throw new SerializerError(`Cannot serialize non-boolean as boolean! (type was "${typeof boolean}")`);
    }
  
    return (boolean)
      ? SerializedBoolean.TRUE
      : SerializedBoolean.FALSE
  }

  /**
   * Serializes a string by escaping it.
   * @param string - The string to serialize
   * @returns the serialized string
   * @internal
   */
  private serializeString (string: string): string {
    if (typeof string !== "string") {
      throw new SerializerError(`Cannot serialize a non-string as a string! (type was "${typeof string}")`);
    }

    return this.escape(string);
  }

  /**
   * Escapes the provided string.
   * @param string - string to escape
   * @returns the escaped string
   * @remarks
   *   - It escapes the characters by encoding them into their char-code preceded by a ampersand and terminated by a semicolon, though this will likely be replaced with escape characters in the future.
   *   - A list of reserved characters can be found under `Serializer.RESERVED_CHARACTERS`.
   * @see Serializer.RESERVED_CHARACTERS
   * @see Serializer.RESERVED_REGEX
   * @internal
   */
  private escape (string: string) {
    if (typeof string !== "string") {
      throw new SerializerError(`Cannot escape a non-string as a string! (type was "${typeof string}")`);
    }

    return string.replace(Serializer.RESERVED_REGEX, (character) => (
      SerializationFormatToken.ESCAPE_S + character.charCodeAt(0) +
      SerializationFormatToken.ESCAPE_E
    ));
  }
  
  /**
   * Serializes a number.
   * @param number - The number to serialize
   * @returns the serialized number
   * @remarks
   *  - This does not serialize `BigInt`s.
   *  - Note that NaN is considered a number.
   *  - Note that zero exists as both a positive and a negative number.
   *  - Note that Infinity (positive and negative) is a number.
   * @internal
   */
  private serializeNumber (number: number): string {
    if (typeof number !== "number") {
      throw new SerializerError(`Cannot serialize a non-number as a number! (type was "${typeof number}")`);
    }

    if (Number.isNaN(number)) return "NaN";
    const sign = (number > 0 || Object.is(number, 0)) ? EMPTY : '-';
    return sign + Math.abs(number).toString();
  }

  /**
   * Serializes a key/index for an object.
   * @param obj - The object who contains the given key
   * @param key - The key for the given object
   * @returns the serialized key/index for usage in serialization of an object.
   * @internal
   */
  private serializeObjectKeyIndex <T> (obj: T, key: keyof T): string {
    const k = SerializationFormatToken.KEY_INDEX_S + this.#serialize(key) + SerializationFormatToken.KEY_INDEX_E;
    const a = SerializationFormatToken.PROPERTY_ACCESSABILITY + this.propertyDescriptorFlag(obj, key).int;
    return k + a;
  }

  /**
   * @returns an iterable list of key-value pairs for the given input.
   * @internal
   */
  private entries (object: Map<any, any> | Set<any> | Array<any> | Record<Key, any>): Array<[key: any, value: any]> {
    if (!(object instanceof Object)) {
      throw new SerializerError("Cannot get the entries of a non-object!")
    }

    if (object instanceof Array) { return Object.entries(object); }
    else if (object instanceof Map) { return [...object.entries()]; }
    else if (object instanceof Set) { return [...Object.entries(object)]; }

    const keys = Object.getOwnPropertyNames(object);
    const entries: Array<[key: any, value: any]> = new Array(keys.length);
    keys.forEach((key, i) => entries[i] = [key, object[key as keyof typeof object]])
    return entries;
  }

  /**
   * Retrives the prototype for the given input, if applicable.
   * @returns the prototype for the given input
   * @remarks
   *  - If `null` or `undefined` is given, `null` is returned
   *  - If a non-object is given, it's constructor's prototype is returned.
   * @internal
   */
  private getPrototype (value: any): any {
    if (typeof value === "undefined" || value === null) return null;
    if (typeof value !== "object") return value.constructor.prototype;
    return Object.getPrototypeOf(value)
  }

  /**
   * Attempts to serialize the given object.
   * @param object - the object to serialize
   * @returns the serialized object
   * @internal
   */
  private serializeObject <T extends object> (object: T): string {
    const serialized = this.entries(object).reduce((output, [key, val], index) => {
      const sk = this.serializeObjectKeyIndex(object, key);
      const sv = this.#serialize(val);
      const seperator = (index !== INDEX_START) ? SerializationFormatToken.ENTRY_SEPERATOR : EMPTY;
      return output + seperator + `${sk}${SerializationFormatToken.KEY_VALUE_SEPERATOR}${sv}`;
    }, EMPTY as string);
    
    return (
      SerializationFormatToken.ENTRIED_VALUE_S + serialized +
      SerializationFormatToken.ENTRIED_VALUE_E
    )
  }
  
  /**
   * Attempts to serialize the given symbol.
   * @param symbol - the symbol to serialize
   * @returns the serialized symbol
   * @throws if the symbol is not well-known, or if the symbol isn't actually a symbol
   * @internal
   */
  private serializeSymbol (symbol: symbol): string {
    if (typeof symbol !== "symbol") {
      throw new SerializerError(`Attempted to serialize a non-symbol as a symbol! (type was "${typeof symbol}")`)
    }
  
    if (Serializer.WELL_KNOWN_SYMBOLS.includes(symbol)) {
      return Serializer.WELL_KNOWN_SYMBOLS.indexOf(symbol).toString();
    } else {
      throw new SerializerError("Cannot serialize a non-well-known symbol!")
    }
  }

  /**
   * Serializes the given bigint
   * @param bigint - the bigint to serialize
   * @returns the serialized bigint
   * @throws if the bigint is not actually a bigint
   * @internal
   */
  private serializeBigint (bigint: bigint) {
    if (typeof bigint !== "bigint") {
      throw new SerializerError(`Attempted to serialize a non-bigint as a bigint! (type was "${typeof bigint}")`)
    }

    return bigint.toString()
  }

  /**
   * Serializes the given date
   * @param date - the date to serialize
   * @returns the serialized date
   * @throws if the date is not actually a date
   * @internal
   */
  private serializeDate (date: Date) {
    if (typeof date !== "object" || date === null || Object.getPrototypeOf(date) !== Date.prototype) {
      throw new SerializerError(`Attempted to serialize a non-date as a date!`)
    }

    const encoded = Date.prototype.toString.apply(date);

    return this.escape(encoded)
  }

  /**
   * Serializes the given function
   * @param func - the function to serialize
   * @returns the serialized function
   * @throws if the function is not actually a function
   * @internal
   */
  private serializeFunction (func: (...args: any[]) => any): string {
    if (!this.#config.Functions) {
      throw new SerializerError("Function serialization is disabled in the config!")
    }

    if (typeof func !== "function" || Object.getPrototypeOf(func) !== Function.prototype) {
      throw new SerializerError(`Attempted to serialize a non-function as a function!`)
    }

    const source = Function.prototype.toString.apply(func);

    return func.name + SerializationFormatToken.FUNCTION_NAME_SEPERATOR + this.escape(source);
  }

  /**
   * The internal serialization function, which can be called recursively without issue unlike the publicly exposed one.
   * @param value - value to serialize 
   * @returns the serialized format of the given value
   * @remarks
   *  - If one of either `null` or `undefined` is given, only the type will be output to conserve space.
   *  - Functions are serialized by stringifying them.
   * @internal
   */
  #serialize (value: any): string {
    return this.mark(value, () => { this.#ticks++;
      if (value === null)      return ShorthandType.NULL;
      if (value === undefined) return ShorthandType.UNDEFINED;

      let output = this.shorthandConstructor(this.getPrototype(value).constructor) + SerializationFormatToken.TYPE_SEPERATOR;

      if (value instanceof Date) return output + this.serializeDate(value);

      if (typeof value === "function") return output + this.serializeFunction(value);
      if (typeof value === "boolean") return output + this.serializeBoolean(value);
      if (typeof value === "bigint") return output + this.serializeBigint(value)
      if (typeof value === "object") return output + this.serializeObject(value);
      if (typeof value === "number") return output + this.serializeNumber(value);
      if (typeof value === "string") return output + this.serializeString(value);
      if (typeof value === "symbol") return output + this.serializeSymbol(value);

      throw new SerializerError(`Unable to serialize type "${output.slice(0, -1)}"`);
    })
  }
  
  /**
   * Resets the data of the `Serializer` class instance, akin to re-constructing another instance.
   */
  public wipe (config: DeepPartial<SerializerConfiguration> = Serializer.DEFAULT_CONFIGURATION): this {
    this.#config = (config === Serializer.DEFAULT_CONFIGURATION) ? clone(Serializer.DEFAULT_CONFIGURATION) : lock(merge(Serializer.DEFAULT_CONFIGURATION, config) as SerializerConfiguration)
    this.#ticks = 0;
    this.#reference_ids = 0;
    this.#reference_value_map = new Map();
    this.#reference_usage = 0;
    this.#custom_constructors = [];

    return this;
  }

  /**
   * Attempts to serialize the provided value
   * @param value - value to serialize
   * @returns the serialized value
   * @remarks
   *  - What data is serialized is dependant on the configuration of the `Serializer` class.
   *  - To deserialize the data, the `Deserializer` class should be used.
   */
  public serialize (value: any): string {
    this.wipe(this.#config);

    if (this.#config.Metadata) {
      throw new SerializerError("Serialization of metadata is currently unsupported!");
    }

    const snapshot = performance.now();
    const serialized = this.#serialize(value);

    const dependencies = (this.#custom_constructors.length === 0) ? EMPTY :  (
      SerializationFormatToken.DEPENDENCIES_S + this.#custom_constructors.map((ctor) => ctor.name).join(',') +
      SerializationFormatToken.DEPENDENDIES_E
    );

    this.logCompletion(snapshot)
    return dependencies + this.clean(serialized);
  }

  /**
   * Logs the completion of a serialization if debug mode is enabled.
   * @internal
   */
  private logCompletion (start: number): void {
    if (this.#config.DebugMode) {
      console.log(
        `Serialization preformed in ${this.#ticks} sub-serialization${this.#ticks === 1 ? EMPTY : 's'}` +
        (this.#reference_usage > 0 ? `, possessing ${this.#reference_usage} duplicate reference${this.#reference_usage === 1 ? EMPTY : 's'}` : EMPTY) +
        `, finishing in ${Math.floor((performance.now() - start) * 1000) / 1000}ms` +
        (this.#custom_constructors.length > 0 ? ` and requiring ${this.#custom_constructors.length} class injection${this.#custom_constructors.length === 1 ? EMPTY : 's'} for re-serialization.` : EMPTY)
      );
    }
  }
  
  /**
   * Removes extraneous data from the given serialized value.
   * @returns the input serialization 'cleaned'
   * @remarks
   *   - recounts references, having unnecessary ones removed
   *   - this should only be done with the final serialized output
   * @internal
   */
  private clean (serialized: string): string {
    // Recount References
    const regex = new RegExp(
      SerializationFormatToken.REFERENCE_DECLARARION_S + "\\d+" +
      SerializationFormatToken.REFERENCE_DECLARATION_E, "gm"
    );
  
    let references = 0;
    (serialized.match(regex) ?? []).forEach((match) => {
      const id = match.slice(match.indexOf(SerializationFormatToken.REFERENCE_DECLARARION_S) +
        SerializationFormatToken.REFERENCE_DECLARARION_S.length,
        SerializationFormatToken.REFERENCE_DECLARATION_E.length * -1
      ); 

      const rr = new RegExp(SerializationFormatToken.REFERENCE_POINTER + id + "(\\D)", "gm")
      const ir = new RegExp(
        SerializationFormatToken.REFERENCE_DECLARARION_S + id +
        SerializationFormatToken.REFERENCE_DECLARATION_E, 'm'
      );

      if (serialized.match(rr) === null) {
        serialized = serialized.replace(ir, EMPTY);
      } else {
        serialized = serialized
          .replace(match,           SerializationFormatToken.REFERENCE_DECLARARION_S + references + SerializationFormatToken.REFERENCE_DECLARATION_E)
          .replace(rr,    (_, v) => SerializationFormatToken.REFERENCE_POINTER       + references + ((typeof v === "number") ? EMPTY : v));
        
        references += 1;
      }
    });

    return serialized;
  }

  private static SHORTHAND_CONSTRUCTOR_LIST = new Map<any, ShorthandType>([
    [Function, ShorthandType.FUNCTION],
    [Boolean, ShorthandType.BOOLEAN],
    [Object, ShorthandType.OBJECT],
    [Symbol, ShorthandType.SYMBOL],
    [String, ShorthandType.STRING],
    [Number, ShorthandType.NUMBER],
    [BigInt, ShorthandType.BIGINT],
    [Array, ShorthandType.ARRAY],
    [Date, ShorthandType.DATE],
    [Set, ShorthandType.SET],
    [Map, ShorthandType.MAP],
  ]);
  
  /**
   * Converts the given class constructor to a shorthand version.
   * @returns a shorthand reference to the class
   * @remarks
   *  - Returns a direct stringified number (ShorthandType) is returned if the class is a native top-level JS class constructor (or Symbol (which is technically not a constructor), `null`, or `undefined`)
   *  - If the class is not one of the above, a number preceded by a '$' is returned, meaning a reference to a named custom class listed at the front of the serialized string which must be injected when deserializing.
   * @internal
   */
  private shorthandConstructor (value: any): EnscribedType {
    if (value === null)      return ShorthandType.NULL;
    if (value === undefined) return ShorthandType.NULL;

    if (Serializer.SHORTHAND_CONSTRUCTOR_LIST.has(value)) {
      return Serializer.SHORTHAND_CONSTRUCTOR_LIST.get(value)!
    } else {
      if (this.#config.DebugMode) console.log("Creating custom class reference", value);
      const custom = this.#custom_constructors.indexOf(value);
      const reference = (custom === INDEX_NOT_FOUND) ? String(this.#custom_constructors.push(value) - 1) : String(custom);
      return (SerializationFormatToken.TYPE_CUSTOM_CLASS_SPECIFIER + reference) as CustomTypeReference
    }
  }
}