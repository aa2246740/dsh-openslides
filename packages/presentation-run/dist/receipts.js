import fs from "node:fs";
import path from "node:path";
import { quarantineCorruptFile, writeJsonAtomic } from "./domain/atomic-file.js";
const RECEIPTS_REL = path.join("_agent", "presentation-receipts.v1.json");
function filePath(projectRoot) {
    return path.join(projectRoot, RECEIPTS_REL);
}
function load(projectRoot) {
    const file = filePath(projectRoot);
    if (!fs.existsSync(file))
        return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(parsed.receipts) ? [...parsed.receipts] : [];
    }
    catch {
        // A torn receipts cache denies rather than grants — sources must be
        // re-consulted — but the corrupt file should not keep poisoning reads.
        quarantineCorruptFile(file);
        return [];
    }
}
function save(projectRoot, receipts) {
    const body = { version: 1, receipts };
    writeJsonAtomic(filePath(projectRoot), body);
}
const RANK = {
    available: 0,
    consulted: 1,
    adopted: 2,
    executed: 3,
};
export function listSourceReceipts(projectRoot) {
    return load(projectRoot);
}
export function recordSourceReceipt(projectRoot, receipt) {
    const rows = load(projectRoot);
    const idx = rows.findIndex((row) => row.sourceId === receipt.sourceId);
    if (idx < 0) {
        rows.push(receipt);
    }
    else {
        const prev = rows[idx];
        if (RANK[receipt.state] >= RANK[prev.state])
            rows[idx] = { ...prev, ...receipt };
    }
    save(projectRoot, rows);
    return rows;
}
export function consultedAdoptedExecuted(projectRoot) {
    const rows = load(projectRoot);
    return {
        consulted: rows.filter((row) => RANK[row.state] >= RANK.consulted).length,
        adopted: rows.filter((row) => RANK[row.state] >= RANK.adopted).length,
        executed: rows.filter((row) => RANK[row.state] >= RANK.executed).length,
    };
}
export function requireConsultAdoptBeforeWrite(projectRoot) {
    const counts = consultedAdoptedExecuted(projectRoot);
    if (counts.consulted < 1) {
        return "write_page blocked: no consulted reference receipt (read_reference)";
    }
    if (counts.adopted < 1) {
        return "write_page blocked: no adopted design receipt (commit_design)";
    }
    return undefined;
}
//# sourceMappingURL=receipts.js.map