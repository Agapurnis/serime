# Serime Serialization Format Specification

The serialization format strives to be mostly human-readable for the purposes of debugging and development while at the same time remaing quite compact.

Please note:
 - The contents of the specification are subject to change and the implementations may not immediately follow the speification exactly. (It is currently ahead of the current implementation.)
 - The specification will likely be migrated to a more formally defined system at a later date.

## Basic Grammar

```ebnf
Digit ::= '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
CharacterReserved ::= '&' | ';' | '!' | '[' | ']' | '{' | '}' | '(' | ')' | ',' | '%' | '$' | '#' | '@' | '=' | '|' | ':'
CharacterEscaped  ::= '&' . (Digit+) . ';'
SafeString ::= ((Character - CharacterReserved) | CharacterEscaped)*

Accessibility ::= Digit+
AccessibilityForObject   ::= ('%' . Accessibility)  . ':'
AccessibilityForProperty ::= ('%' . Accessibility)? . ':'

TypeNative ::=       Digit+
TypeCustom ::= '$' . Digit+

Type ::=
  | TypeNative
  | TypeCustom

NonReferentialValue ::= 
  | Type . ('|' . SerializedContentValue)?
  |         '|' . SerializedContentValue

Value ::= 
  | Reference
  | ReferenceDeclaration
  | NonReferentialValue

Reference ::= Digit+
ReferenceLookup      ::= '#' . Reference
ReferenceDeclaration ::= '@' . Reference . '=' . NonReferentialValue

CustomClassDependency   ::= SafeString
CustomClassDependencies ::= "![" . ((CustomClassDependency . ',')* CustomClassDependency) . "]!"

SerializedOutput ::= CustomClassDependencies? . AccessabilityForObject? . Value
SerializedContentValue ::= ...
```

The definition for `SerializedContentValue` is omitted for the sake of brevity, as it is comprised of the following type-specific serialization formats.

## Types

In the context of this library, a "type" is the prototype/constructor of a value (or the value `null` | `undefined`).

(TODO: Constructors themselves)
(TODO: Shorthand)

## References

References are what the sound like: reference, particularly to another value.

In the case of values where the value is an instance of `Object`, the reference points to an *instance* of the object.
Otherwise, such as in the case of a number or string, the reference points to the what the value is itself to conserve space.

References are stored as numbers, but this may be changed to include a more varying set of characters to conserve additional space.

- References are got with `#<reference_id>`
- References are set with `@<referende_id>=<value>`

## Accessibility & Object Descriptors

(TODO)

## Type-specific Formats & Notes

### Function

Functions are serialized by calling `Function.prototype.toString` on them and then escaping the reserved characters of the output.

If a function is dependant on unscoped variables, it won't work properly post deserialization.

If the output of this follows the [`NativeFunction`](https://262.ecma-international.org/13.0/#prod-NativeFunction) syntax, an error will be thrown if a reference to the origin of the function cannot be found.

```ebnf
SerializedValueContentTypeFunction ::= SafeString
```

### String

```ebnf
SerializedValueContentTypeString ::= SafeString
```

### Number

```ebnf
SerializedValueContentTypeNumber ::=
  | '-'? . Digit+ . ('.' . Digit+)?
  | '-'? . "Infinity"
  | "NaN"
```

### Record / Custom Class

```ebnf
ValueRecordEntry   ::= '[' . Value              . ']' . AccessibilityForProperty . Value
ValueRecordEntried ::= '{' . ValueRecordEntries . '}'
ValueRecordEntries ::= (ValueRecordEntry . ',')* . ValueRecordEntry

SerializedValueContentTypeArray  ::= AccessibilityForObject . ValueRecordEntried
SerializedValueContentTypeObject ::= AccessibilityForObject . ValueRecordEntried
SerializedValueContentTypeCustom ::= ValueRecordEntried
```

### `Map`

```ebnf
ValueMapEntry   ::= '[' . Value              . ']' . ':' . Value
ValueMapEntried ::= '{' . ValueRecordEntries . '}'
ValueMapEntries ::= (ValueRecordEntry . ',')* . ValueRecordEntry

SerializedValueContentTypeMap ::= ValueMapEntried
```

### `Set` 

```ebnf
ValueSetEntries ::= (Value . ',')* . Value
ValueSetEntried ::= '{' . ValueSetEntries . '}.

SerializedValueContentTypeSet ::= ValueSetEntried
```

