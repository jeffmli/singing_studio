// test_db.mjs
import "fake-indexeddb/auto";
const db = await import("./web/js/core/db.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

await db.writeTake({ id: "t1", createdAt: 1, title: "a" });
await db.writeTake({ id: "t2", createdAt: 2, title: "b" });
const takes = await db.readTakes();
ok("readTakes returns 2 sorted desc", takes.length === 2 && takes[0].id === "t2");
await db.deleteTake("t1");
ok("deleteTake removes one", (await db.readTakes()).length === 1);

await db.writeSession({ id: "s1", startedAt: 10 });
ok("readSessions returns it", (await db.readSessions())[0].id === "s1");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
