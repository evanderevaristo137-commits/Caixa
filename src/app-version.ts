declare const __APP_VERSION__: string;
declare const __APP_BUILT__: string;
declare const __APP_COMMIT__: string;

/** The app's version number (package.json), e.g. "1.0.0". */
export const APP_VERSION = __APP_VERSION__;
/** The day this version was built ("2026-11-13") and, when built by the CI, its commit ("e2b0f37"). */
export const APP_BUILT = __APP_BUILT__;
export const APP_COMMIT = __APP_COMMIT__;
