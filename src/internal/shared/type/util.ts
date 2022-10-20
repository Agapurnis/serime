import { Type } from "./abstraction";
import { ShorthandType } from "./shorthand";

export type CustomTypeReference <T extends number = number> = `${SerializationFormatToken.TYPE_CUSTOM_CLASS_SPECIFIER}${T}`
export type EnscribedType = ShorthandType | CustomTypeReference;

export type EntriedType   = typeof Type.ENTRIED    extends Set<infer T> ? T : never
export type SingletonType = typeof Type.SINGLETONS extends Set<infer T> ? T : never