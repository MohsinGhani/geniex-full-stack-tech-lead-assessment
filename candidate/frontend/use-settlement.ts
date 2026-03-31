import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchWorklogs,
  runSettlement,
  type WorklogWithAmount,
} from "../api-client";

const POLL_INTERVAL_MS = 30_000;

export function useSettlement(userId: string) {
  const [worklogs, setWorklogs] = useState<WorklogWithAmount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettling, setIsSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settlementResult, setSettlementResult] = useState<{
    remittanceId: string;
    totalAmount: number;
  } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadWorklogs = useCallback(async () => {
    try {
      const data = await fetchWorklogs(userId, "OPEN");
      setWorklogs(data);
      setError(null);
    } catch {
      setError("Failed to load worklogs");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadWorklogs();

    pollRef.current = setInterval(loadWorklogs, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadWorklogs]);

  const confirmSettlement = useCallback(async () => {
    setIsSettling(true);
    setError(null);

    try {
      const result = await runSettlement(userId);

      setSettlementResult({
        remittanceId: result.remittance.id,
        totalAmount: result.remittance.totalAmount,
      });

      // Clear worklogs from local state so the UI reflects the settlement
      setWorklogs([]);
    } catch {
      setError("Settlement failed. Please try again.");
    } finally {
      setIsSettling(false);
    }
  }, [userId]);

  const previewTotal = worklogs.reduce((sum, wl) => sum + wl.amount, 0);

  return {
    worklogs,
    isLoading,
    isSettling,
    error,
    settlementResult,
    previewTotal,
    loadWorklogs,
    confirmSettlement,
  };
}
