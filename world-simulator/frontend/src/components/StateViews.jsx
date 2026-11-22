/** Shared loading, error and empty states so every view handles them the same way. */
export function Loading({ label = 'Loading…' }) {
  return <div className="state state-loading" role="status">{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{error?.code ?? 'error'}</strong>
      <span>{error?.message ?? 'Something went wrong.'}</span>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="state state-empty">{children}</div>;
}

/** Renders loading/error for a useApi result, else the children with its data. */
export function ApiView({ result, children, loadingLabel }) {
  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;
  if (!result.data) return <Loading label={loadingLabel} />;
  return children(result.data, result);
}
