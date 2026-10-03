import { get } from 'node:http';
import { setTimeout } from 'node:timers/promises';
/** Hold the first iframe request until the freshly spawned editor is listening. */
export async function waitForEditor(origin, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    do {
        const ready = await new Promise(resolve => {
            const request = get(`${origin}/api/health`, response => {
                response.resume();
                resolve(response.statusCode === 200);
            });
            request.setTimeout(Math.max(1, Math.min(500, deadline - Date.now())), () => request.destroy());
            request.on('error', () => resolve(false));
        });
        if (ready)
            return true;
        if (Date.now() < deadline)
            await setTimeout(Math.min(100, deadline - Date.now()));
    } while (Date.now() < deadline);
    return false;
}
//# sourceMappingURL=sidecar-ready.js.map