import type { IncomingMessage, ServerResponse } from "node:http";
export declare function editorOrigin(): string;
export declare function editorPort(): number;
export declare function shouldProxyToEditor(pathname: string): boolean;
/** Product home. The Harness shell at `/` is not a page we keep. */
export declare const PRODUCT_HOME = "/app/hub.html";
/**
 * `/` is the Harness shell. Send people to the create hub instead.
 * A launch `?token=` is still exchanged by DSH (it answers 303 back to `/`);
 * the next request, with the cookie and no token, is the one we redirect.
 */
export declare function redirectRootToProductHome(req: IncomingMessage, res: ServerResponse, authorizeIndex?: (req: IncomingMessage, res: ServerResponse) => boolean): void;
export declare function editorPath(pathname: string): string;
export declare function proxyToEditor(req: IncomingMessage, res: ServerResponse, origin?: string): void;
//# sourceMappingURL=product-proxy.d.ts.map