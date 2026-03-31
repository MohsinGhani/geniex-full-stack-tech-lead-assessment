import { useSettlement } from "./use-settlement";

interface SettlementReviewProps {
  userId: string;
  onComplete: () => void;
}

export function SettlementReview({ userId, onComplete }: SettlementReviewProps) {
  const {
    worklogs,
    isLoading,
    isSettling,
    error,
    settlementResult,
    previewTotal,
    confirmSettlement,
  } = useSettlement(userId);

  if (isLoading) {
    return <div className="loading">Loading worklogs for review...</div>;
  }

  if (settlementResult) {
    return (
      <div className="settlement-success">
        <h2>Settlement Complete</h2>
        <p>
          Remittance <strong>{settlementResult.remittanceId}</strong> created
          for <strong>${settlementResult.totalAmount.toFixed(2)}</strong>
        </p>
        <button onClick={onComplete}>Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="settlement-review">
      <h2>Settlement Review for {userId}</h2>

      {error && <div className="error-banner">{error}</div>}

      {worklogs.length === 0 ? (
        <p>No open worklogs to settle.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>WorkLog ID</th>
                <th>Task</th>
                <th>Created</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {worklogs.map((wl) => (
                <tr key={wl.id}>
                  <td>{wl.id}</td>
                  <td>{wl.taskName}</td>
                  <td>{new Date(wl.createdAt).toLocaleDateString()}</td>
                  <td
                    className={wl.amount < 0 ? "amount-negative" : "amount"}
                  >
                    ${wl.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="settlement-footer">
            <div className="preview-total">
              Total: <strong>${previewTotal.toFixed(2)}</strong>
            </div>

            <button
              className="confirm-button"
              onClick={confirmSettlement}
              disabled={isSettling}
            >
              {isSettling
                ? "Processing..."
                : `Confirm Settlement — $${previewTotal.toFixed(2)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
