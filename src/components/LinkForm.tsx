import { useEffect, useRef, useState, type FormEvent } from "react";
import { inferTagsFromUrl } from "../../shared/autoTags";
import type { Link } from "../../shared/types";
import { api, ApiError } from "../api";
import { mergeAutoTags } from "../autoTagState";
import { TagInput } from "./TagInput";

interface Props {
  tagSuggestions: string[];
  onCreated: (link: Link) => void;
}

function hostOf(s: string): string | null {
  try {
    return new URL(s).hostname;
  } catch {
    return null;
  }
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
  /** The last title filled in automatically, so it can be replaced when the URL changes. */
  const autoTitleRef = useRef("");
  const host = hostOf(url);

  // A dismissal only applies to the site it was made on.
  useEffect(() => {
    setDismissed(new Set());
  }, [host]);

  // Instant URL-based tags (no network).
  useEffect(() => {
    const inferred = inferTagsFromUrl(url);
    setTagState((s) => mergeAutoTags(s.tags, s.auto, inferred, dismissed));
  }, [url, dismissed]);

  // Debounced title lookup. Auto-filled titles follow the URL; typed titles are never overwritten.
  useEffect(() => {
    setLoadingTitle(false);
    if (titleTouched) return;
    const staleAuto = autoTitleRef.current; // capture: updaters run lazily
    setTitle((t) => (t === staleAuto ? "" : t));
    autoTitleRef.current = "";
    if (!looksLikeUrl(url)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingTitle(true);
      try {
        const s = await api.suggest(url, ctrl.signal);
        if (ctrl.signal.aborted || !s.title) return;
        autoTitleRef.current = s.title;
        setTitle((t) => (t === "" ? s.title : t));
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
    autoTitleRef.current = "";
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
      if (err instanceof ApiError && err.status === 401) return; // handled globally (logout)
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
          タイトル <small className="muted" role="status">
            {loadingTitle ? "取得中…" : ""}
          </small>
        </span>
        <input
          value={title}
          maxLength={300}
          placeholder="空欄ならページタイトルを自動取得"
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(e.target.value !== "");
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
