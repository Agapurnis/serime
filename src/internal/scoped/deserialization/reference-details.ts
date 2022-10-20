/**
 * Reference details.
 * - If the action (first element) is "get", it is a pointer to the value located at the reference identifier (second element).
 * - If the action (first element) is "set", the value contained within the reference hilder will be used to set a reference to the value using the reference identifier (second parameter).
 */
export type ReferenceDetails =
 | readonly [action: "get", identifier: number]
 | readonly [action: "set", identifier: number]
