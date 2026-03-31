const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface WorklogWithAmount {
  id: string;
  userId: string;
  taskName: string;
  status: "OPEN" | "SETTLED";
  createdAt: string;
  amount: number;
}

export interface SettlementResponse {
  remittance: {
    id: string;
    userId: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  };
}

export async function fetchWorklogs(
  userId: string,
  status?: string
): Promise<WorklogWithAmount[]> {
  const params = new URLSearchParams({ userId });
  if (status) params.set("status", status);

  const res = await fetch(`${API_BASE}/api/worklogs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch worklogs");

  const data = await res.json();
  return data.worklogs;
}

export async function addTimeSegment(
  workLogId: string,
  segment: { hours: number; ratePerHour: number; description: string }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/worklogs/${workLogId}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(segment),
  });
  if (!res.ok) throw new Error("Failed to add segment");
}

export async function runSettlement(
  userId: string
): Promise<SettlementResponse> {
  const res = await fetch(`${API_BASE}/api/settlements/run/${userId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Settlement failed");
  return res.json();
}
