import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from "../api";

export function TokenGate({ children }: { children: (logout: () => void) => ReactNode }) {
  const [token, setTokenState] = useState(getToken());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      await api.checkToken(draft.trim());
      setToken(draft.trim());
      setTokenState(draft.trim());
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "トークンが違います" : "接続に失敗しました");
    } finally {
      setChecking(false);
    }
  }

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setDraft("");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  if (token) return <>{children(logout)}</>;

  return (
    <main className="container narrow">
      <h1 className="brand">🔖 links</h1>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>アクセストークン</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="btn-primary" disabled={checking}>
            {checking ? "確認中…" : "はじめる"}
          </button>
        </div>
      </form>
    </main>
  );
}
