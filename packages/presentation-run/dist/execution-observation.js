import fs from "node:fs";
import { withProjectWriteLock } from "@open-slidestudio/pptd-v2";
import { projectExecution } from "./execution.js";
import { readRunLedger, inspectRunLedger } from "./domain/run-ledger.js";
import { resolveProjectPageIdentities } from "./domain/page-identity.js";
/** IO boundary. Delivery is never inferred from an arbitrary existing export report. */
export function inspectProjectExecution(input) {
    const observe = () => {
        const ledger = input.ledger ?? readRunLedger(input.root);
        return projectExecution({
            ...input, ledger, identity: resolveProjectPageIdentities(input.root),
            inspection: inspectRunLedger(input.root, input.contextEpochId, process.env, ledger),
        });
    };
    // Missing roots must not be created as a side effect of observation.
    return fs.existsSync(input.root) && fs.statSync(input.root).isDirectory()
        ? withProjectWriteLock(input.root, observe) : observe();
}
//# sourceMappingURL=execution-observation.js.map