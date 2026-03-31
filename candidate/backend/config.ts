export const config = {
  database: {
    connectionString:
      process.env.DATABASE_URL || "postgresql://localhost:5432/worklogs",
  },
  settlement: {
    maxWorkLogsPerBatch: 100,
    minRemittanceAmount: 0,
  },
};
