import { SerdeError } from "../error";
import { SerializationFormatToken } from "../grammar/tokens";
import { lock } from "../object-utils";
import { ShorthandToInstance, ShorthandType } from "./shorthand";
import { CustomTypeReference, EnscribedType, EntriedType, SingletonType } from "./util";

/**
 * Serialized type wrapper abstraction.
 * @internal
 */
export class Type <T extends EnscribedType> {
  public static readonly ENTRIED = new Set(lock([
    ShorthandType.OBJECT,
    ShorthandType.ARRAY,
    ShorthandType.MAP,
    ShorthandType.SET,
  ] as const));

  public static readonly SINGLETONS = new Set(lock([
   ShorthandType.UNDEFINED,
   ShorthandType.NULL,
  ] as const))

  constructor (public readonly inner: T) {}

  /**
   * @returns whether the enscribed type is a singleton type
   */
  private static isSingleton (type: EnscribedType): type is SingletonType {
    return Type.SINGLETONS.has(type as SingletonType);
  }

  /**
   * @returns whether the enscribed type is an entried type
   */
  public static isEntried (type: EnscribedType): type is EntriedType {
    return Type.ENTRIED.has(type as EntriedType);
  }

  /**
   * @returns whether the enscribed type is a custom type
   */
  public static isCustom (type: EnscribedType): type is CustomTypeReference {
    return type.startsWith(SerializationFormatToken.TYPE_CUSTOM_CLASS_SPECIFIER);
  }

  /**
   * @returns whether this type is a singleton type
   */
  public isSingleton (): this is Type<SingletonType> {
    return Type.isSingleton(this.inner);
  }

  /**
   * @returns whether this type is an entried type
   */
  public isEntried (): this is Type<EntriedType> {
    return Type.isEntried(this.inner);
  }

  /**
   * @returns whether this type is a custom type
   */
  public isCustom (): this is Type<CustomTypeReference> {
    return Type.isCustom(this.inner);
  }

  /**
   * @returns the extracted custom reference type identifier
   */
  public getCustomTypeReference (): this["inner"] extends CustomTypeReference<infer U extends number> ? U : never {
    if (!this.isCustom()) throw new Error("Cannot extract custom type reference from a non-custom type!");
    const string = this.inner.slice(1);
    const numeric = Number(string);
    if (Number.isNaN(numeric)) throw new SerdeError(`Unable to covert custom type reference to number! (used ${string})`);
    return numeric as never;
  }

  /**
   * @returns the singleton value for this type if it is a singleton type
   */
  public singletonValue (): this["inner"] extends SingletonType ? ShorthandToInstance<this["inner"]> : never {
    if (!this.isSingleton()) {
      throw new SerdeError(`Type "${this.inner}" is not a singleton type!`)
    }

    switch (this.inner) {
      case ShorthandType.UNDEFINED: return undefined as unknown as (this["inner"] extends SingletonType ? ShorthandToInstance<this["inner"]> : never);
      case ShorthandType.NULL:      return null      as unknown as (this["inner"] extends SingletonType ? ShorthandToInstance<this["inner"]> : never);

      default:
        throw new SerdeError(`No default value present for singleton type "${this.inner}"!`)
    }
  }
}
