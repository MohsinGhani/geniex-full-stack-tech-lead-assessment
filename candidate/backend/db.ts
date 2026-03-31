import { Pool } from "pg";
import { config } from "./config";
import type {
  WorkLog,
  TimeSegment,
  Adjustment,
  Remittance,
  RemittanceLineItem,
} from "./types";

const pool = new Pool({
  connectionString: config.database.connectionString,
});

export async function getOpenWorkLogsByUser(
  userId: string
): Promise<WorkLog[]> {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", task_name AS "taskName", status,
            last_settled_at AS "lastSettledAt", created_at AS "createdAt"
     FROM work_logs
     WHERE user_id = $1 AND status = 'OPEN'
     ORDER BY created_at ASC
     LIMIT $2`,
    [userId, config.settlement.maxWorkLogsPerBatch]
  );
  return result.rows;
}

export async function getAllUserIds(): Promise<string[]> {
  const result = await pool.query("SELECT DISTINCT id FROM users");
  return result.rows.map((r: { id: string }) => r.id);
}

export async function getTimeSegments(
  workLogId: string
): Promise<TimeSegment[]> {
  const result = await pool.query(
    `SELECT id, work_log_id AS "workLogId", hours, rate_per_hour AS "ratePerHour",
            created_at AS "createdAt"
     FROM time_segments
     WHERE work_log_id = $1`,
    [workLogId]
  );
  return result.rows;
}

export async function getAdjustments(
  workLogId: string
): Promise<Adjustment[]> {
  const result = await pool.query(
    `SELECT id, work_log_id AS "workLogId", amount, reason,
            created_at AS "createdAt"
     FROM adjustments
     WHERE work_log_id = $1`,
    [workLogId]
  );
  return result.rows;
}

export async function updateWorkLogStatus(
  workLogId: string,
  status: string,
  settledAt?: string
): Promise<void> {
  await pool.query(
    "UPDATE work_logs SET status = $1, last_settled_at = $2 WHERE id = $3",
    [status, settledAt || null, workLogId]
  );
}

export async function createRemittance(
  userId: string,
  totalAmount: number
): Promise<Remittance> {
  const result = await pool.query(
    `INSERT INTO remittances (user_id, total_amount, status, created_at)
     VALUES ($1, $2, 'PENDING', NOW())
     RETURNING id, user_id AS "userId", total_amount AS "totalAmount",
               status, created_at AS "createdAt"`,
    [userId, totalAmount]
  );
  return result.rows[0];
}

export async function createRemittanceLineItem(
  remittanceId: string,
  workLogId: string,
  amount: number
): Promise<RemittanceLineItem> {
  const result = await pool.query(
    `INSERT INTO remittance_line_items (remittance_id, work_log_id, amount)
     VALUES ($1, $2, $3)
     RETURNING id, remittance_id AS "remittanceId",
               work_log_id AS "workLogId", amount`,
    [remittanceId, workLogId, amount]
  );
  return result.rows[0];
}

export async function reopenWorkLog(workLogId: string): Promise<void> {
  await pool.query(
    "UPDATE work_logs SET status = 'OPEN' WHERE id = $1",
    [workLogId]
  );
}
