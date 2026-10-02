import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
export { PiAiAdapter } from './adapter.ts';
export type { PiAiAdapterOptions } from './adapter.ts';
export { Config } from './config.ts';
export type { Options, PiAiCompatProfile, PiAiModality, PiAiModelOverride, PiAiModelProfile, PiAiProviderProfile, PiAiReasoningEfforts, PiAiThinkingFormat, ResolvedPiAiProviderProfile, } from './config.ts';
export { recordKeyFor } from './auth.ts';
export { supportedProtocols } from './provider.ts';
export declare const name = "llm-pi-ai";
export declare const inject: string[];
/** Register one generic pi-ai adapter for all configured provider routes. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map