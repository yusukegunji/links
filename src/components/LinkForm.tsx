import { useEffect, useState, type FormEvent } from "react";
import { inferTagsFromUrl } from "../../shared/autoTags";
import type { Link } from "../../shared/types";
import { api, ApiError } from "../api";
import { mergeAutoTags } from "../autoTagState";
import { TagInput } from "./TagInput";

interface Props {
  tagSuggestions: string[];
  onCreated: (link: Link) => void;
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function LinkForm({ tagSuggestions, onCreated }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [{ tags, auto: autoTags }, setTagState] = useState<{ tags: string[]; auto: Set<string> }>({
    tags: [],
    auto: new Set(),
  });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [titleTouched, setTitleTouched] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instant URL-based tags (no network).
  useEffect(() => {
    const inferred = inferTagsFromUrl(url);
    setTagState((s) => mergeAutoTags(s.tags, s.auto, inferred, dismissed));
  }, [url, dismissed]);

  // Debounced title lookup.
  useEffect(() => {
    if (!looksLikeUrl(url) || titleTouched) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingTitle(true);
      try {
        const s = await api.suggest(url, ctrl.signal);
        if (s.title) setTitle((t) => (t ? t : s.title));
      } catch {
        /* best effort */
      } finally {
        if (!ctrl.signal.aborted) setLoadingTitle(false);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [url, titleTouched]);

  function reset() {
    setUrl("");
    setTitle("");
    setNote("");
    setTagState({ tags: [], auto: new Set() });
    setDismissed(new Set());
    setTitleTouched(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const link = await api.createLink({ url: url.trim(), title, note, tags });
      reset();
      onCreated(link);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "このURLはすでに登録されています"
          : err instanceof ApiError && err.status === 400
            ? `入力内容を確認してください (${err.message})`
            : "保存に失敗しました",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card link-form" onSubmit={onSubmit}>
      <label className="field">
        <span>URL</span>
        <input
          type="url"
          required
          autoFocus
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="field">
        <span>
          タイトル {loadingTitle && <small className="muted">取得中…</small>}
        </span>
        <input
          value={title}
          maxLength={300}
          placeholder="空欄ならページタイトルを自動取得"
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
        />
      </label>
      <div className="field">
        <span>
          タグ <small className="muted">✨ はURLから自動追加 / Enter・カンマで追加</small>
        </span>
        <TagInput
          value={tags}
          onChange={(next) => setTagState((s) => ({ tags: next, auto: s.auto }))}
          onRemove={(t) => autoTags.has(t) && setDismissed((d) => new Set(d).add(t))}
          autoTags={autoTags}
          suggestions={tagSuggestions}
          placeholder="react, 読みたい ..."
        />
      </div>
      <label className="field">
        <span>メモ</span>
        <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
