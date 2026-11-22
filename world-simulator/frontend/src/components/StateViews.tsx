import type { ReactNode } from 'react';
import type { ApiRequestError, ApiResult } from '../api/worldApi';

/** Shared loading, error and empty states so every view handles them the same way. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="state state-loading" role="status">{label}</div>;
}

export function ErrorState({ error, onRetry }: { error: ApiRequestError | Error | null; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{(error as ApiRequestError | null)?.code ?? 'error'}</strong>
      <span>{error?.message ?? 'Something went wrong.'}</span>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state state-empty">{children}</div>;
}

/** Renders loading/error for a useApi result, else the children with its data. */
export function ApiView<T, M>({ result, children, loadingLabel }: {
  result: ApiResult<T, M>; children: (data: T, result: ApiResult<T, M>) => ReactNode; loadingLabel?: string;
}) {
  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;
  if (result.data === null) return <Loading label={loadingLabel} />;
  return <>{children(result.data, result)}</>;
}
