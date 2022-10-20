import { lock } from "./object-utils";

export interface SharedSerdeConfiguration {
  /**
   * Miscellaneous debug toggle.
   */
  DebugMode: boolean,
  /**
   * Whether to serialize/deserialize functions.
   * 
   * This requires the usage of `eval` during deserialization!
   * 
   * Issues will likely arise if function behavior depends on external scopes.
   * 
   * @experimental
   */
  Functions: boolean,
  /**
   * Whether to serialize/deserialize metadata.
   * 
   * **Currently unimplemented!**
   */
  Metadata: boolean,
}

export const DEFAULT_SHARED_CONFIGURATION = lock<SharedSerdeConfiguration>({
  DebugMode: false,
  Functions: false,
  Metadata: false,
})
