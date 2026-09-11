# Production Migration QA: `backfill-explanations.mjs`

Review date: 2026-09-11

## Recommendation

**PASS - approved for the one-time production migration, with a controlled write window and retention of the first backup file.**

No blocking defect was found for the current 462-row dataset. The default invocation was executed without `--apply` against the configured Appwrite project and completed as a dry run: `Validated 462 explanations for 462 active questions.` No Appwrite writes were made during this review.

## Verification summary

| Requirement | Result | Evidence |
|---|---:|---|
| Dry-run default | PASS | Writes are enabled only when the exact `--apply` argument is present (`scripts/backfill-explanations.mjs:16,27-30`). The package script supplies no apply flag. The reviewed invocation exited after validation with the dry-run message. |
| Exact 462-row coverage | PASS | Live read-only run found 462 active Appwrite rows and validated 462 explanation entries. Independent counts found 462 unique active row IDs and 462 unique explanation IDs. Validation rejects both explanation IDs not present in the active rows and active rows lacking explanations (`:104-119,142-145`), so the current sets are a bijection. |
| Duplicate detection | PASS | Explanation IDs are rejected on second occurrence (`:102-109`). Correction IDs are independently rejected when invalid or duplicated (`:93-100`). Local counts found zero duplicates among 462 explanations and 14 corrections. Appwrite row IDs are platform-unique; the live result contained 462 unique IDs. |
| Correction manifest application | PASS | Corrections are applied before question/key validation (`:115-119`) and again when constructing write payloads (`:39-43`). Independent reconstruction confirmed all 14 correction targets exist, all 14 produce a non-no-op change, every corrected question/option/key matches its manifest value, and no correction check failed. |
| Preserve unrelated payload fields | PASS | The script starts from the complete parsed payload, clones correction targets, changes only declared `text`, option `text`, option `isCorrect`, and then `explanation` (`:40-43,160-174`). A recursive before/after comparison of all 462 current payloads found no changes outside those allowed paths. JSON formatting and escape representation may be normalized by parse/stringify, but values and fields are preserved. |
| Preserve unrelated row columns | PASS | `updateRow` receives `data: { payloadJson }` only (`:49-54`). The installed Appwrite SDK sends this through the partial row-update `PATCH` endpoint, so status and all other row columns are omitted from the mutation. |
| 15,000-character guard | PASS for current data | Every generated payload is checked before its update (`:47-49`). Independent reconstruction found zero payloads over 15,000 characters; the maximum is 2,098 characters (row `6aa2e586002f5e079a6b`), leaving substantial margin. See the partial-failure caveat below because this is checked per batch rather than globally before the first write. |
| Backup before write | PASS | In apply mode, the directory is created and all 462 original `{ id, payloadJson }` pairs are written before the update loop begins (`:32-36,45`). A failed backup write prevents any Appwrite update. The backup directory is gitignored. Since no other row column is mutated, the saved fields are sufficient to restore this migration's changes. |
| Bounded concurrency | PASS | Rows are processed in batches of ten, with at most ten update promises created at a time (`:45-56`). Batches are sequential. |
| Post-write full-payload verification | PASS | After all batches, the script reloads active rows and requires exact string equality between every stored `payloadJson` and the complete expected serialized payload (`:59-62`). This verifies the whole payload, not only the explanation field. It also fails if an original active ID is absent or any unexpected active row cannot match an expected payload. |

## Partial-failure and rollback risks

### Non-transactional batch failure - non-blocking for this migration

The 462 updates are not atomic. If one request in a ten-row `Promise.all` batch fails, other requests in that batch may already have succeeded or may still complete, and the script exits before its final verification. There is no retry, checkpoint, or automatic rollback. The resulting database can therefore contain an uncertain partial prefix plus a partial failing batch.

This does **not** block the one-time migration because the operation is idempotent: rerunning `--apply` recomputes the same complete payload for every active row and then performs full verification. The operator should treat any failed run as incomplete, retain the first pre-migration backup, rerun the migration to completion after resolving the cause, and require the final all-462 verification message before declaring success.

### Size guard is not a global preflight - non-blocking on the verified snapshot

The 15,000-character test occurs immediately before each individual update, not before any writes. A late oversized payload could therefore be discovered after earlier batches had committed. This is a structural weakness, but it is not a realistic blocker for the reviewed data: the measured maximum is 2,098 characters, approximately 14% of the guard.

### Rollback is manual - non-blocking with backup retention

The script creates a usable payload backup but does not provide a restore command or validate the backup after writing it. A rerun after partial failure creates another timestamped backup of the partial state; it does not overwrite the original, but an operator could choose the wrong file. Record and retain the path printed by the first apply run. If rollback is required, restore `payloadJson` by ID from that first file and verify all 462 restored values. Forward completion by idempotent rerun is the lower-risk recovery for ordinary transient failures.

### Concurrent production edits - operational precondition

Expected payloads are derived from the initial read and written later without a revision precondition or Appwrite transaction. A concurrent edit to `payloadJson` can be overwritten, and a concurrent status change can make the final active-row verification fail. Run this one-time migration while question editing/import jobs are paused. Under that controlled window, this risk does not block migration.

## Go/no-go checks for the apply run

1. Run the default command once more and require `Validated 462 explanations for 462 active questions` followed by `Dry run complete`.
2. Pause question writers/importers, then run once with `--apply`.
3. Capture and retain the first printed backup path before accepting any update progress.
4. Require `Appwrite verification passed for all 462 questions` before declaring the migration complete.
5. If the process fails after updates begin, do not assume rollback occurred; resolve the cause and rerun to full verification, or restore from the first backup and verify all 462 payloads.
