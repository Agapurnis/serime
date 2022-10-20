/**
 * Property descriptor information.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty#description
 */
export enum PropertyDescriptorFlag {
  /**
   * Whether this uses accessors in it's descriptor as opposed to a data value.
   */
  HAS_ACCESSOR = 1 << 0,
  /**
   * Whether this property has metadata attached with [`reflect-metadata`](https://www.npmjs.com/package/reflect-metadata).
   */
  HAS_METADATA = 2 << 0,
  /**
   * Whether this property is marked as `configurable`.
   */
  IS_CONFIGURABLE = 2 << 1,
  /**
   * Whether this property is marked as `enumerable`.
   */
  IS_ENUMERABLE = 2 << 2,
  /**
   * Whether this property is marked as `writable`.
   */
  IS_WRITABLE = 2 << 3,
}
