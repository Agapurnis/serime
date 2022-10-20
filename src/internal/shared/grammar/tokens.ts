/**
 * Various constant serialization format characters.
 *
 * @remarks
 *   - "_S" = "_START"
 *   - "_E" = "_END"
 */
export const enum SerializationFormatToken {
  TYPE_SEPERATOR = '|',
  TYPE_CUSTOM_CLASS_SPECIFIER = '$',
  REFERENCE_POINTER = '#',
  REFERENCE_DECLARARION_S = '@',
  REFERENCE_DECLARATION_E = '=',
  PROPERTY_ACCESSABILITY = '%',
  KEY_VALUE_SEPERATOR = ':',
  KEY_INDEX_S = '[',
  KEY_INDEX_E = ']',
  ENTRIED_VALUE_S = '{',
  ENTRIED_VALUE_E = '}',
  ENTRY_SEPERATOR = ',',
  ESCAPE_S = '&',
  ESCAPE_E = ';',
  DEPENDENCIES_S = '![',
  DEPENDENDIES_E = ']!',
  FUNCTION_NAME_SEPERATOR = '~',
}
