//#region src/bin.d.ts
/** Standalone credential CLI. Never reads or writes official CLI auth files. */
declare function run(argv: readonly string[]): Promise<number>;
//#endregion
export { run };