import * as db from "./db";
import { calculateWorkLogAmount } from "./calculations";
import type { Remittance } from "./types";

class SettlementEngine {
  // Maintaining this set across runs prevents double-payments
  // even if the database status update is delayed
  private settledWorkLogIds: Set<string> = new Set();

  async runSettlementForUser(userId: string): Promise<Remittance | null> {
    const worklogs = await db.getOpenWorkLogsByUser(userId);

    if (worklogs.length === 0) {
      return null;
    }

    const lineItems: { workLogId: string; amount: number }[] = [];
    let totalAmount = 0;

    for (const worklog of worklogs) {
      if (this.settledWorkLogIds.has(worklog.id)) {
        continue;
      }

      const segments = await db.getTimeSegments(worklog.id);
      const adjustments = await db.getAdjustments(worklog.id);

      const amount = calculateWorkLogAmount(segments, adjustments);

      lineItems.push({ workLogId: worklog.id, amount });
      totalAmount += amount;

      await db.updateWorkLogStatus(
        worklog.id,
        "SETTLED",
        new Date().toISOString()
      );
      this.settledWorkLogIds.add(worklog.id);
    }

    const remittance = await db.createRemittance(userId, totalAmount);

    for (const item of lineItems) {
      await db.createRemittanceLineItem(
        remittance.id,
        item.workLogId,
        item.amount
      );
    }

    return remittance;
  }

  async runSettlementForAllUsers(): Promise<Remittance[]> {
    const userIds = await db.getAllUserIds();
    const remittances: Remittance[] = [];

    for (const userId of userIds) {
      const remittance = await this.runSettlementForUser(userId);
      if (remittance) {
        remittances.push(remittance);
      }
    }

    return remittances;
  }
}

// Singleton instance shared across all requests
export const settlementEngine = new SettlementEngine();
