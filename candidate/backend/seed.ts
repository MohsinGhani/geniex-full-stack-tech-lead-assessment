import { Pool } from "pg";
import { config } from "./config";

const pool = new Pool({ connectionString: config.database.connectionString });

async function seed() {
  await pool.query(`
    INSERT INTO users (id, name, email) VALUES
      ('USR-001', 'Alice Chen',    'alice@example.com'),
      ('USR-002', 'Bob Martinez',  'bob@example.com'),
      ('USR-003', 'Carol Davis',   'carol@example.com')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO work_logs (id, user_id, task_name, status, last_settled_at, created_at) VALUES
      ('WL-001', 'USR-001', 'API Integration',    'OPEN',    NULL,                          '2025-01-10T09:00:00Z'),
      ('WL-002', 'USR-001', 'Bug Fix Sprint',     'SETTLED', '2025-01-31T18:00:00Z',        '2025-01-12T10:00:00Z'),
      ('WL-003', 'USR-002', 'Dashboard Redesign', 'OPEN',    NULL,                          '2025-01-15T08:00:00Z'),
      ('WL-004', 'USR-002', 'Performance Audit',  'OPEN',    NULL,                          '2025-01-20T11:00:00Z'),
      ('WL-005', 'USR-003', 'Data Migration',     'OPEN',    NULL,                          '2025-01-22T14:00:00Z')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO time_segments (id, work_log_id, hours, rate_per_hour, created_at) VALUES
      ('TS-001', 'WL-001', 4,   75,  '2025-01-10T13:00:00Z'),
      ('TS-002', 'WL-001', 3.5, 75,  '2025-01-11T17:00:00Z'),
      ('TS-003', 'WL-002', 6,   75,  '2025-01-12T18:00:00Z'),
      ('TS-004', 'WL-002', 2,   75,  '2025-01-13T12:00:00Z'),
      ('TS-005', 'WL-003', 2,   50,  '2025-01-16T09:00:00Z'),
      ('TS-006', 'WL-003', 3,   50,  '2025-01-17T15:00:00Z'),
      ('TS-007', 'WL-004', 5,   60,  '2025-01-21T08:00:00Z'),
      ('TS-008', 'WL-005', 8,   80,  '2025-01-23T10:00:00Z'),
      ('TS-009', 'WL-005', 4,   80,  '2025-01-24T14:00:00Z')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO adjustments (id, work_log_id, amount, reason, created_at) VALUES
      ('ADJ-001', 'WL-002', -150,  'Late delivery penalty',     '2025-01-30T10:00:00Z'),
      ('ADJ-002', 'WL-003', -500,  'Quality revision required', '2025-01-18T11:00:00Z'),
      ('ADJ-003', 'WL-005',  200,  'Complexity bonus',          '2025-01-25T16:00:00Z')
    ON CONFLICT (id) DO NOTHING
  `);

  // January settlement — Alice's WL-002 was settled
  await pool.query(`
    INSERT INTO remittances (id, user_id, total_amount, status, created_at) VALUES
      ('REM-001', 'USR-001', 450, 'COMPLETED', '2025-01-31T18:00:00Z')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO remittance_line_items (id, remittance_id, work_log_id, amount) VALUES
      ('RLI-001', 'REM-001', 'WL-002', 450)
    ON CONFLICT (id) DO NOTHING
  `);

  console.log("Seed data inserted.");
  await pool.end();
}

seed();

/*
  Seed data summary:

  USERS
  ─────────────────────────────────────
  USR-001  Alice Chen      alice@example.com
  USR-002  Bob Martinez    bob@example.com
  USR-003  Carol Davis     carol@example.com

  WORK LOGS
  ─────────────────────────────────────────────────────────────
  WL-001   USR-001  API Integration     OPEN      never settled
  WL-002   USR-001  Bug Fix Sprint      SETTLED   2025-01-31
  WL-003   USR-002  Dashboard Redesign  OPEN      never settled
  WL-004   USR-002  Performance Audit   OPEN      never settled
  WL-005   USR-003  Data Migration      OPEN      never settled

  TIME SEGMENTS
  ─────────────────────────────────────────────────────────────
  TS-001   WL-001   4 hrs   × $75/hr   = $300.00
  TS-002   WL-001   3.5 hrs × $75/hr   = $262.50
  TS-003   WL-002   6 hrs   × $75/hr   = $450.00
  TS-004   WL-002   2 hrs   × $75/hr   = $150.00
  TS-005   WL-003   2 hrs   × $50/hr   = $100.00
  TS-006   WL-003   3 hrs   × $50/hr   = $150.00
  TS-007   WL-004   5 hrs   × $60/hr   = $300.00
  TS-008   WL-005   8 hrs   × $80/hr   = $640.00
  TS-009   WL-005   4 hrs   × $80/hr   = $320.00

  ADJUSTMENTS
  ─────────────────────────────────────────────────────────────
  ADJ-001  WL-002   −$150.00   Late delivery penalty
  ADJ-002  WL-003   −$500.00   Quality revision required
  ADJ-003  WL-005   +$200.00   Complexity bonus

  PREVIOUS REMITTANCES (January settlement)
  ─────────────────────────────────────────────────────────────
  REM-001  USR-001  $450.00  COMPLETED  2025-01-31
    └─ RLI-001  WL-002  $450.00
       Calculation: (6×$75 + 2×$75) − $150 = $600 − $150 = $450

*/
