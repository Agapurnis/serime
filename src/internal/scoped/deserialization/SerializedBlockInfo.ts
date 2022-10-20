import { Bitflag } from "../../shared/bitflag";
import { PropertyDescriptorFlag } from "../../shared/flags/propertyDescriptor.flag";
import { ObjectAccessibilityFlag } from "../../shared/flags/objectAccessibility.flag";
import { SerializationFormatToken } from "../../shared/grammar/tokens";
import { INDEX_NOT_FOUND, INDEX_START } from "../../shared/constants";
import { Type } from "../../shared/type/abstraction";
import { EnscribedType } from "../../shared/type/util";
import { DeserializerError } from "./DeserializerError";
import { ReferenceDetails } from "./reference-details";

/**
 * Serialized block of data wrapper abstraction for easier extraction of data.
 * @internal
 */
export class SerializedBlockInfo {
  /**
   * @returns the input serialized string without the surrounding key index brackets
   */
  private static removeKeyBrackets (serialized: string): string {
    const s = serialized.indexOf(    SerializationFormatToken.KEY_INDEX_S);
    const e = serialized.lastIndexOf(SerializationFormatToken.KEY_INDEX_E);

    if (s !== INDEX_START) return serialized; // We dont want to slice from a child.

    return serialized.slice(s + SerializationFormatToken.KEY_INDEX_S.length, e);
  }

  /**
   * @returns the input serialized string without reference declarations
   */
  private static removeReferenceDeclaration (serialized: string): string {
    const sat = serialized.indexOf(SerializationFormatToken.REFERENCE_DECLARARION_S);
    const eat = serialized.indexOf(SerializationFormatToken.REFERENCE_DECLARATION_E);

    if (sat !== INDEX_START) return serialized; // We dont want to slice from a child.
    if (eat === INDEX_NOT_FOUND) return serialized; // It's not present.
  
    return serialized.slice(eat + SerializationFormatToken.REFERENCE_DECLARATION_E.length)
  }

  /**
   * @returns whether this is a key/index
   * @remarks
   *  - Only checks for the start of the key index specifier and not the end because it won't necessary be the last character if accessability is present.
   */
  private static isKeyIndex (serialized: string) {
    return serialized.startsWith(SerializationFormatToken.KEY_INDEX_S)
  }

  // #region Extractors
  /**
   * @returns the reference details, or null if it is not applicable
   */
  private static extractReference (serialized: string): ReferenceDetails | null {
    serialized = this.removeKeyBrackets(serialized);

    const refget = serialized.indexOf(SerializationFormatToken.REFERENCE_POINTER);
    const refset = serialized.indexOf(SerializationFormatToken.REFERENCE_DECLARARION_S);

    if ( 
      refget !== INDEX_START && 
      refset !== INDEX_START
    ) return null; // No details.

    const regex = new RegExp(`(^|[${
      SerializationFormatToken.REFERENCE_DECLARARION_S +
      SerializationFormatToken.REFERENCE_POINTER
    }])(?<id>\\d+)`, "m");

    const match = serialized.match(regex)?.[2];

    if (match === null || match === undefined) {
      throw new DeserializerError(`Could not extract digits of reference ID! (input was "${serialized}")`)
    }

    const numeric = Number(match);

    if (Number.isNaN(numeric)) {
      throw new DeserializerError(`Could not parse reference identifier as number! (tried parsing "${match}")`)
    }
    
    const action = (refget === 0) ? 'get' : 'set'

    return [action, numeric];
  };

  /**
   * @returns the accessability, or null if it is not applicable
   */
  private static extractDescriptorInfo (serialized: string): Bitflag<typeof PropertyDescriptorFlag> | null {
    if (!this.isKeyIndex(serialized)) return null;
  
    const regex = new RegExp(SerializationFormatToken.PROPERTY_ACCESSABILITY + "(\\d+)", "m");
    const match = serialized.match(regex)?.[1];

    if (match === null || match === undefined) {
      throw new DeserializerError("Property accessability was omitted and cannot be inferred!")
    }

    const numeric = Number(match);

    if (Number.isNaN(numeric)) {
      throw new DeserializerError(`Unable to parse property accessability as a number! (tried "${match}")`);
    }

    return new Bitflag(PropertyDescriptorFlag, "PropertyAccessability", numeric);
  }

  /**
   * @returns the type for the value contained within the serialized string
   */
  private static extractType (serialized: string): Type<EnscribedType> {
    serialized = this.removeKeyBrackets(serialized);
    serialized = this.removeReferenceDeclaration(serialized);
    const typeMarkerIndex = serialized.indexOf(SerializationFormatToken.TYPE_SEPERATOR);
    const terminator = (typeMarkerIndex === INDEX_NOT_FOUND) ? serialized.length : typeMarkerIndex;
    return new Type(serialized.slice(0, terminator) as EnscribedType);
  }


  /**
   * @returns the underlying serialized value contained within the serialized string
   */
  private static extractSerializedValue (serialized: string): string | null {
    serialized = this.removeKeyBrackets(serialized);
    serialized = this.removeReferenceDeclaration(serialized);
    const typeMarkerIndex = serialized.indexOf(SerializationFormatToken.TYPE_SEPERATOR);
    if (typeMarkerIndex === INDEX_NOT_FOUND) return null; // There is no value, this is a singleton type.
    return serialized.slice(typeMarkerIndex + SerializationFormatToken.TYPE_SEPERATOR.length);
  }

  // #endregion Extractors

  public reference: ReferenceDetails | null;

  public descriptor:    Bitflag<typeof PropertyDescriptorFlag>  | null;
  public accessability: Bitflag<typeof ObjectAccessibilityFlag> | null;

  public type: Type<EnscribedType>

  public isKeyIndex: boolean;

  public serializedValue: string;

  constructor (private readonly serialized: string) {
    this.reference = SerializedBlockInfo.extractReference(serialized);
    
    this.descriptor = SerializedBlockInfo.extractDescriptorInfo(serialized);
    this.accessability = null; // TODO

    this.type = SerializedBlockInfo.extractType(serialized);

    this.isKeyIndex = SerializedBlockInfo.isKeyIndex(serialized);

    this.serializedValue = SerializedBlockInfo.extractSerializedValue(serialized);
  }
}
