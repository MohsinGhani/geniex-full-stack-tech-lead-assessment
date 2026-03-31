export interface User {
  id: string;
  name: string;
  email: string;
}

export interface WorkLog {
  id: string;
  userId: string;
  taskName: string;
  status: "OPEN" | "SETTLED";
  lastSettledAt: string | null;
  createdAt: string;
}

export interface TimeSegment {
  id: string;
  workLogId: string;
  hours: number;
  ratePerHour: number;
  createdAt: string;
}

export interface Adjustment {
  id: string;
  workLogId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface Remittance {
  id: string;
  userId: string;
  totalAmount: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
}

export interface RemittanceLineItem {
  id: string;
  remittanceId: string;
  workLogId: string;
  amount: number;
}
