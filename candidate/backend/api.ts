import express from "express";
import * as db from "./db";
import { settlementEngine } from "./settlement";
import type { TimeSegment } from "./types";

const app = express();
app.use(express.json());

app.get("/api/worklogs", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const status = req.query.status as string | undefined;

    const worklogs = await db.getOpenWorkLogsByUser(userId);

    const enriched = await Promise.all(
      worklogs
        .filter((wl) => (status ? wl.status === status : true))
        .map(async (wl) => {
          const segments = await db.getTimeSegments(wl.id);
          const adjustments = await db.getAdjustments(wl.id);

          const amount =
            segments.reduce(
              (sum: number, s: TimeSegment) => sum + s.hours * s.ratePerHour,
              0
            ) + adjustments.reduce((sum: number, a) => sum + a.amount, 0);

          return { ...wl, amount };
        })
    );

    res.json({ worklogs: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch worklogs" });
  }
});

app.post("/api/worklogs/:workLogId/segments", async (req, res) => {
  try {
    const { workLogId } = req.params;
    const { hours, ratePerHour, description } = req.body;

    const pool = (await import("pg")).Pool;
    const client = new pool({
      connectionString:
        process.env.DATABASE_URL || "postgresql://localhost:5432/worklogs",
    });

    const result = await client.query(
      `INSERT INTO time_segments (work_log_id, hours, rate_per_hour, description, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [workLogId, hours, ratePerHour, description]
    );

    // If worklog was previously settled, reopen it so it's
    // included in the next settlement run
    await db.reopenWorkLog(workLogId);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to add time segment" });
  }
});

app.post("/api/settlements/run", async (_req, res) => {
  try {
    const remittances = await settlementEngine.runSettlementForAllUsers();
    res.json({
      remittances,
      processedCount: remittances.length,
      message: `Settlement complete. ${remittances.length} remittances created.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Settlement failed" });
  }
});

app.post("/api/settlements/run/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const remittance = await settlementEngine.runSettlementForUser(userId);

    if (!remittance) {
      res.json({ message: "No open worklogs found for this user." });
      return;
    }

    res.json({ remittance });
  } catch (error) {
    res.status(500).json({ error: "Settlement failed" });
  }
});

export default app;
