import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
export declare const name = "dsh-personal-slides";
export declare const inject: string[];
declare module "@deepseek-ai/cordis" {
    interface Context {
        webServer: {
            register(route: {
                kind: "exact" | "prefix";
                path: string;
                handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
            }): () => void;
        };
    }
}
export declare function apply(ctx: Context): void;
//# sourceMappingURL=dsh-personal-slides.d.ts.map