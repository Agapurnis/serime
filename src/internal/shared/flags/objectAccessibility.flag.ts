/**
 * Writability for objects as a whole (frozen, sealed, extensibility), and whether the object has metadata.
 */
export enum ObjectAccessabilityFlag {
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze#description
   */
  IS_FROZEN = 1 << 0,
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/seal#description
   */
  IS_SEALED = 2 << 0,
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/preventExtensions#description
   */
  NON_EXTENSIBLE = 2 << 1,
  /**
   * Whether this object has metadata attached with [`reflect-metadata`](https://www.npmjs.com/package/reflect-metadata).
   */
  HAS_METADATA = 2 << 2,
}
