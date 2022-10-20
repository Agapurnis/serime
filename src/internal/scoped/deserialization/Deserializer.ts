import { Bitflag } from "../../shared/bitflag";
import { SerializationFormatToken } from "../../shared/grammar/tokens";
import { PropertyDescriptorFlag } from "../../shared/flags/propertyDescriptor.flag";
import { ObjectAccessibilityFlag } from "../../shared/flags/objectAccessibility.flag";
import { DEFAULT_SHARED_CONFIGURATION } from "../../shared/config";
import { EMPTY, INDEX_NOT_FOUND } from "../../shared/constants";
import { clone, DeepPartial, DeepReadonly, lock, merge } from "../../shared/object-utils";
import { SerializedBoolean } from "../../shared/serialized-boolean";
import { Type } from "../../shared/type/abstraction";
import { ShorthandToInstance, ShorthandType } from "../../shared/type/shorthand";
import { CustomTypeReference, EntriedType } from "../../shared/type/util";
import { DeserializerConfiguration } from "./DeserializerConfiguration";
import { DeserializerError } from "./DeserializerError";
import { SerializedBlockInfo } from "./SerializedBlockInfo";

/**
 * Deserializer
 * 
 * @copyright MIT
 * @author Katini <agapurnis@outlook.com>
 */
export class Deserializer {
  private static readonly DEFAULT_CONFIG: DeepReadonly<DeserializerConfiguration> = DEFAULT_SHARED_CONFIGURATION;

  #dependencies = new Map<number, any>()
  #references = new Map<number, any>();
  #ticks = 0;
  #config: DeepReadonly<DeserializerConfiguration>
  
  public constructor (config: DeepPartial<DeserializerConfiguration> = Deserializer.DEFAULT_CONFIG) {
    this.#config = (config === Deserializer.DEFAULT_CONFIG) ? clone(config as DeserializerConfiguration) : lock(merge(Deserializer.DEFAULT_CONFIG, config) as DeserializerConfiguration)
  }

  /**
   * Internal deserialization method that doesnt strip dependencies like the publicly exposed one.
   * @internal
   */
  #deserialize (serialized: string, name?: string) {
    this.#ticks += 1;

    if (typeof serialized !== "string") {
      throw new DeserializerError(`Cannot extract from a non-string! (got type "${typeof serialized}")`)
    }

    const info = new SerializedBlockInfo(serialized);

    if (info.type.isSingleton()) {
      switch (info.type.inner) {
        case ShorthandType.UNDEFINED: return undefined;
        case ShorthandType.NULL:      return null;

        default:
          throw new DeserializerError(`No default value present for singleton type "${info.type.inner}"!`)
      }
    }

    let value: any

    if (info.reference?.[0] !== "get" && (info.type.isEntried() || info.type.isCustom())) {
      if (info.type.isCustom()) {
        const identifier = info.type.getCustomTypeReference();
        const inheritied = this.#dependencies.get(identifier);
        if (!inheritied) throw new DeserializerError(`Dependency does not exist!`);
        // Create object using prototype of class
        value = Object.create(inheritied.prototype);
      } else {
        value = this.emptyEntriesHolder(info.type)
      }
    }

    if (info.reference !== null) {
      const [action, identifier] = info.reference;

      switch (action) {
        case "get": { return this.getReference(identifier); }
        case "set": {        this.setReference(identifier, value); break };

        default:
          throw new DeserializerError(`Unknown reference action "${action}"!`);
      }
    }

    const inner = info.serializedValue;

    if (inner === null) {
      throw new DeserializerError("Expected value to be present! Singleton types should have already been handled.")
    }

    if (info.type.isCustom() || info.type.isEntried()) {
      this.deserializeEntried(inner, info.type as never, value);
    }

    else if (info.type.inner === ShorthandType.FUNCTION) value = this.deserializeFunction(inner, name);
    else if (info.type.inner === ShorthandType.BOOLEAN) value = this.deserializeBoolean(inner);
    else if (info.type.inner === ShorthandType.NUMBER) value = this.deserializeNumber(inner);
    else if (info.type.inner === ShorthandType.STRING) value = this.deserializeString(inner);
    else if (info.type.inner === ShorthandType.BIGINT) value = this.deserializeBigInt(inner);
    else if (info.type.inner === ShorthandType.DATE) value = this.deserializeDate(inner);

    else throw new DeserializerError(`Unable to deserialize unknown type "${info.type.inner}"!`)
  
    if (info.reference !== null) {
      // We're setting a reference because otherwise we would have returned already had it been a get.
      const identifier = info.reference[1];
      this.setReference(identifier, value);
    }

    return value;
  }
  
  /**
   * @returns the value located at the given reference
   * @param reference - reference to use to retrieve the value
   * @remarks
   *  - accepts string or number references
   *  - string references will have prefix removed
   * @throws if the value with the reference hasnt been set yet
   * @throws if the reference could not be converted safely to a number
   * @internal
   */
  private getReference (reference: string | number) {
    let numeric: number;

    if (
      typeof reference !== "string" &&
      typeof reference !== "number"
    ) {
      throw new DeserializerError(`Invalid reference! Reference parameter must be typeof "string" or "number" (got "${typeof reference}")`)
    }

    if (typeof reference === "string") {
      // Remove the leading '#' if necessary, since that's only a signifier that this is a reference.
      if (reference.startsWith(SerializationFormatToken.REFERENCE_POINTER)) {
        reference = reference.slice(SerializationFormatToken.REFERENCE_POINTER.length);
      }

      if (reference.length <= 0) {
        throw new DeserializerError(`Invalid reference! Reference parameter must be one or more digits, excluding the leading '#'.`)
      }

      numeric = Number(reference);
    } else {
      numeric = reference;
    }

    if (Number.isNaN(numeric)) {
      throw new DeserializerError(`Invalid reference! Reference parameter was unable to be converted to a number. (reference = "${reference}"`);
    } else if (!this.#references.has(numeric)) {
      throw new DeserializerError(`Invalid reference! The value behind the reference was has not been initialized. (reference = ${numeric})`);
    }

    return this.#references.get(numeric);
  }
  
  /**
   * Sets the value for the reference to the given value.
   * @param reference - reference to use to set the value
   * @param value - value to set
   * @remarks
   *  - accepts string or number references
   *  - string references will have the prefixes and suffixes stripped
   * @throws if the reference could not be converted safely to a number
   * @internal
   */
  private setReference (reference: string | number, value: any) {
    let numeric: number;

    if (
      typeof reference !== "string" &&
      typeof reference !== "number"
    ) {
      throw new DeserializerError(`Invalid reference! Reference parameter must be typeof "string" or "number" (got "${typeof reference}")`)
    }

    if (typeof reference === "string") {
      // Remove the leading '@' and trailing '=' if necessary, since that's only a signifier that this is a reference declaration.
      if (reference.startsWith(     SerializationFormatToken.REFERENCE_DECLARARION_S)) {
        reference = reference.slice(SerializationFormatToken.REFERENCE_DECLARARION_S.length);
      }
      if (reference.startsWith(SerializationFormatToken.REFERENCE_DECLARATION_E)) {
        reference = reference.slice(0, -1 * SerializationFormatToken.REFERENCE_DECLARATION_E.length);
      }

      if (reference.length <= 0) {
        throw new DeserializerError(`Invalid reference! Reference parameter must be one or more digits, excluding the leading '#'.`)
      }

      numeric = Number(reference);
    } else {
      numeric = reference;
    }

    if (Number.isNaN(numeric)) {
      throw new DeserializerError("Invalid reference! Reference parameter was unable to be converted to a number.");
    }

    this.#references.set(numeric, value);
  }

  /**
   * Deserializes a number.
   * @param serializedNumber - The number as a string to deserialize
   * @returns the deserialized number
   * @internal
   */
  private deserializeNumber (serializedNumber: string): number {
    if (serializedNumber === "NaN") return NaN;
    const sign = serializedNumber.slice(0, 1) === '-' ? -1 : 1;
    const digits = (sign === 1) ? Number(serializedNumber) : Number(serializedNumber.slice(1));
    return sign * digits
  }

  /**
   * Deserializes a function.
   * @param serializedFunction - The function as a string to deserialize
   * @param name - Name override
   * @returns the deserialized function
   * @internal
   */
  private deserializeFunction (serializedFunction: string, name?: string): (...args: any[]) => any {
    if (!this.#config.Functions) {
      throw new DeserializerError("Function deserialization is disabled in the config!")
    }

    if (serializedFunction.includes(SerializationFormatToken.FUNCTION_NAME_SEPERATOR)) {
      const split = serializedFunction.split(SerializationFormatToken.FUNCTION_NAME_SEPERATOR);
      serializedFunction = split[1];
      name = split[0];
    }


    var made: (...args: any[]) => any;
    const source = this.unescape(serializedFunction);
    const func = (eval(`made = ${source};`), made!);

    Object.defineProperty(func, "name", {
      value: name
    })

    return func
  }

  /**
   * Deserializes a string.
   * @param string - The string to deserialize
   * @returns the deserialized string
   * @remarks
   *   - This merely unescapes the special characters used in the serialization format..
   * @see Serializer.serializeString
   * @see Serializer.escape
   * @see Deserializer.unescape
   * @internal
   */
  private deserializeString (string: string): string {
    return this.unescape(string);
  }

  /**
   * Unescapes a string.
   * @param string - The string to unescaped
   * @returns the unescaped string
   * @remarks
   *   - Characters are escaped by encoding them into their char-code preceded by a ampersand and terminated by a semicolon, though this will likely be replaced with escape characters in the future.
   *   - A list of reserved characters can be found under `Serializer.RESERVED_CHARACTERS`.
   * @see Serializer.RESERVED_CHARACTERS
   * @see Serializer.RESERVED_REGEX
   * @see Serializer.escape
   * @internal
   */
  private unescape (string: string): string {
    return string.replace(new RegExp(
      SerializationFormatToken.ESCAPE_S + "(\\d+)" +
      SerializationFormatToken.ESCAPE_E, "gm"
    ), (_, code) => String.fromCharCode(+code));
  }
  
  /**
   * Deserializes the given serialized value, returning it.
   * @param serialized - the serialized value which will be deserialized
   * @param dependencies - dependencies to use for prototype injection
   * @returns the deserialized value
   */
  public deserialize (serialized: string, dependencies: any[] = []): any {
    serialized = this.setupDependencies(serialized, dependencies);

    return this.#deserialize(serialized);
  }

  /**
   * @returns input without dependencies
   * @remarks
   *  - Sets the internal dependency map based on the provided ones.
   * @internal
   */
  private setupDependencies (serialized: string, providedDependencies: any[]): string {
    const s = serialized.indexOf(SerializationFormatToken.DEPENDENCIES_S);
    const e = serialized.indexOf(SerializationFormatToken.DEPENDENDIES_E);

    if (s === INDEX_NOT_FOUND && e === INDEX_NOT_FOUND) return serialized; // No dependencies.
    if (s === INDEX_NOT_FOUND) throw new DeserializerError("Dependency list was not closed!");
    if (e === INDEX_NOT_FOUND) throw new DeserializerError("Dependency list was closed but never opened!");

    const requirements = serialized.slice(s + SerializationFormatToken.DEPENDENCIES_S.length, e).split(',').map((c) => this.unescape(c));
    
    requirements.forEach((dependency, index) => {
      if (requirements.lastIndexOf(dependency) !== index) {
        throw new DeserializerError(`Injected constructor dependency "${dependency}" is listed multiple times!`);
      }

      const ctor = providedDependencies.find((ctor) => ctor.name === dependency);

      if (typeof ctor === "undefined") {
        throw new DeserializerError(`Constructor dependency class "${dependency}" not provided!`);
      }

      this.#dependencies.set(index, ctor)
    });

    return serialized.slice(e + SerializationFormatToken.DEPENDENDIES_E.length);
  }

  /**
   * @param type - entried type to return a empty holder instance for
   * @returns an empty holder instance for the given entried type
   * @internal
   */
  private emptyEntriesHolder (type: Type<EntriedType>) {
    if (!type.isEntried()) {
      throw new DeserializerError("Cannot return holder for non-entried type!");
    }
    
    switch (type.inner) {
      case (ShorthandType.OBJECT) : return {}
      case (ShorthandType.ARRAY)  : return []
      case (ShorthandType.SET): return new Set<any>()
      case (ShorthandType.MAP): return new Map<any, any>()
      default:
        throw new DeserializerError(`Entried type "${type.inner}" does not have a default holder defined!`);
    }
  } 

  /**
   * Extracts the entries (key-value pairs) of the given serialized input.
   * @returns the entries of the provided serialized object.
   * @remarks
   *  - The values contained within the entries are not deserialized
   * @internal
   */
  private extractEntries (serialized: string): Array<[key: string, value: string]>  {
    const str = serialized.indexOf(    SerializationFormatToken.ENTRIED_VALUE_S) + 1;
    const end = serialized.lastIndexOf(SerializationFormatToken.ENTRIED_VALUE_E);

    if (
      str === INDEX_NOT_FOUND ||
      end === INDEX_NOT_FOUND
    ) throw new DeserializerError("Serialized entries lacks surrounding curly brackets!")

    const interior = serialized.slice(str, end);
    const output = [] as Array<[key: string, value: string]>;

    let buffer_1 = [] as string[];
    let buffer_2 = [] as string[];
    let depth = 0;

    /**
     * flushes buffer one, emptying it into buffer two
     */
    function flush1 (): void {
      if (buffer_1.length > 0) {
        buffer_2.push(buffer_1.join(EMPTY))
        buffer_1 = [];
      }
    }

    /**
     * flushes buffer two, emptying it into the output buffer
     */
    function flush2 (): void {
      if (buffer_2.length === 0) {
        return; // Safely exit, this is an empty record.
      }

      if (buffer_2.length !== 2) {
        console.log(buffer_2)
        throw new DeserializerError(`Attempted to add a non-key-value pair entry! (Expected length of 2, got ${buffer_2.length})`);
      }

      if (
        typeof buffer_2[0] !== "string" ||
        typeof buffer_2[1] !== "string"
      ) throw new DeserializerError("One of more entry elements was not a string!")

      output.push(buffer_2.slice() as [key: string, value: string]);
      buffer_2 = [];
    }

    for (const character of interior) {
      if (
        character === SerializationFormatToken.ENTRIED_VALUE_S ||
        character === SerializationFormatToken.ENTRIED_VALUE_E
      ) {
        depth += (character === SerializationFormatToken.ENTRIED_VALUE_S) ? 1 : -1;
        buffer_1.push(character);
      } else if (character === SerializationFormatToken.KEY_VALUE_SEPERATOR) {
        if (depth === 0) {
          flush1();
        } else {
          buffer_1.push(character);
        }
      } else if (character === SerializationFormatToken.ENTRY_SEPERATOR) {
        if (depth === 0) {
          flush1();
          flush2();
        } else {
          buffer_1.push(character);
        }
      } else {
        buffer_1.push(character);
      }
    }

    // Flush lingering characters
    flush1();
    flush2();

    if (output.some((entry) => entry.length !== 2)) {
      throw new DeserializerError("Entries are not in a valid key-value pair format!");
    }

    return output;
  }

  private deserializeBoolean (serialized: string): boolean {
    if (
      serialized !== SerializedBoolean.TRUE  &&
      serialized !== SerializedBoolean.FALSE
    ) throw new DeserializerError("Invalid serialized boolean value!");

    return serialized === SerializedBoolean.TRUE;
  }

  private applyPropertyDescriptorFlags <T extends object> (object: T, property: keyof T, flags: Bitflag<typeof PropertyDescriptorFlag>) {
    // TODO: Accessors.
    // TODO: Metadata.

    Object.defineProperty(object, property, {
      configurable: flags.has(PropertyDescriptorFlag.IS_CONFIGURABLE),
      enumerable: flags.has(PropertyDescriptorFlag.IS_ENUMERABLE),
      writable: flags.has(PropertyDescriptorFlag.IS_WRITABLE),
    });
  }

  private applyObjectAccessabilityFlags <T extends object> (object: T, flags: Bitflag<typeof ObjectAccessibilityFlag>) {
    // TODO: Metadata.

    if (flags.has(ObjectAccessibilityFlag.IS_SEALED)) Object.seal(object);
    if (flags.has(ObjectAccessibilityFlag.IS_FROZEN)) Object.freeze(object);
    if (flags.has(ObjectAccessibilityFlag.NON_EXTENSIBLE)) Object.preventExtensions(object);
  }

  private deserializeEntried (
    serialized: string,
    type: Type<EntriedType | CustomTypeReference>, 
    into: typeof type extends Type<infer T> ?
      T extends CustomTypeReference
        ? ShorthandToInstance<ShorthandType.OBJECT>
        : ShorthandToInstance<T extends EntriedType ? T : never> 
      : never
  ) {
    // TODO: Apply accessability after making extraction.

    function _ <U extends EntriedType> (against: U, action: (output: ShorthandToInstance<U>) => any) {
      if (type.inner === against as never) action(into as never)
    }

    this.extractEntries(serialized).forEach(([key, val]) => {
      const { descriptor } = new SerializedBlockInfo(key);

      if (descriptor === null) {
        // TODO: Implement ability to infer property descriptor details.

        throw new DeserializerError("Property descriptor details cannot be inferred!");
      }

      const k = this.#deserialize(key);
      const v = this.#deserialize(val, k);

      if (type.isCustom()) {
        (into as object)[k as keyof object] = v as never;
      }

      _(ShorthandType.MAP, (output) => { output.set(k, v); });
      _(ShorthandType.SET, (output) => { output.add(v);    });

      if (
        type.inner === ShorthandType.ARRAY ||
        type.inner === ShorthandType.OBJECT
      ) {
        // TODO: Accesssors

        (into as object)[k as keyof object] = v as never

        if (descriptor !== null) {
          this.applyPropertyDescriptorFlags(into, k, descriptor)
        }
      }
    })

    // (Apply accessability here!)

    return into;
  }

  /**
   * Deserializes the provided date.
   * @param serialized - the serialized date
   * @returns the deserialized date
   * @internal
   */
  private deserializeDate (serialized: string): Date {
    if (typeof serialized !== "string") {
      throw new DeserializerError("Cannot deserialize from a non-string!");
    }

    const representation = this.unescape(serialized);

    return new Date(representation);
  }

  /**
   * Deserializes the provided bigint.
   * @param serialized - the serialized bigint
   * @returns the deserialized bigint
   * @internal
   */
  private deserializeBigInt (serialized: string): bigint {
    if (typeof serialized !== "string") {
      throw new DeserializerError("Cannot deserialize from a non-string!");
    }

    return BigInt(serialized)
  }
}