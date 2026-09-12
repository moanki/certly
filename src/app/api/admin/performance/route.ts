import { Query } from "node-appwrite";
import { buildAdminPerformance, type PerformanceRecordRow } from "@/lib/admin-performance";
import { requireAdmin } from "@/lib/admin-auth";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { noStoreJson } from "@/lib/security";

const pageSize = 100;
const maximumRowsPerKind = 5_000;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return noStoreJson({ error: "Admin sign-in is required." }, { status: 401 });
  }

  try {
    const [examRows, practiceRows, examActivityRows] = await Promise.all([
      listPerformanceRows("attempt"),
      listPerformanceRows("practice_progress"),
      listPerformanceRows("exam_activity"),
    ]);
    return noStoreJson({ performance: buildAdminPerformance(examRows, practiceRows, examActivityRows) });
  } catch {
    return noStoreJson({ error: "Performance data could not be loaded." }, { status: 500 });
  }
}

async function listPerformanceRows(kind: string) {
  const { tables } = createAdminClient();
  const rows: PerformanceRecordRow[] = [];
  for (let offset = 0; offset < maximumRowsPerKind; offset += pageSize) {
    const result = await tables.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      queries: [Query.equal("kind", [kind]), Query.limit(pageSize), Query.offset(offset)],
    });
    rows.push(...result.rows.map((row) => ({
      $id: row.$id,
      lookup: String(row.lookup),
      occurredAt: String(row.occurredAt),
      payloadJson: row.payloadJson,
    })));
    if (result.rows.length < pageSize) break;
  }
  return rows;
}
