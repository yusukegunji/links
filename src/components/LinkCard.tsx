import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Link } from "../../shared/types";
import { api, ApiError } from "../api";
import { TagInput } from "./TagInput";

interface Props {
  link: Link;
  activeTags: string[];
  tagSuggestions: string[];
  onTagClick: (tag: string) => void;
  onUpdated: (link: Link) => void;
  onDeleted: (id: number) => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const dateFormat = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" });

export function LinkCard({ link, activeTags, tagSuggestions, onTagClick, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(link.title);
  const [note, setNote] = useState(link.note);
  const [tags, setTags] = useState(link.tags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Move focus into the form when editing starts and back to the edit button when it ends.
  useEffect(() => {
    if (editing) titleInputRef.current?.focus();
    else if (wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function cancelEdit() {
    setError(null);
    setEditing(false);
  }

  function startEdit() {
    setTitle(link.title);
    setNote(link.note);
    setTags(link.tags);
    setError(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.updateLink(link.id, { title, note, tags }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`「${link.title || link.url}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await api.deleteLink(link.id);
      onDeleted(link.id);
    } catch {
      setError("削除に失敗しました");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="card link-card">
        <form className="edit-form" onSubmit={save}>
          <div className="muted small">{link.url}</div>
          <label className="field">
            <span>タイトル</span>
            <input ref={titleInputRef} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="field">
            <span>タグ</span>
            <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
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
            <button type="button" className="btn-ghost" onClick={cancelEdit}>
              キャンセル
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              保存
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="card link-card">
      <div className="link-main">
        <a className="link-title" href={link.url} target="_blank" rel="noopener noreferrer">
          {link.title || link.url}
        </a>
        <div className="link-meta muted small">
          <span>{hostOf(link.url)}</span>
          <span>·</span>
          <time dateTime={link.createdAt}>{dateFormat.format(new Date(link.createdAt))}</time>
        </div>
        {link.note && <p className="link-note">{link.note}</p>}
        {link.tags.length > 0 && (
          <div className="link-tags">
            {link.tags.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip chip-button ${activeTags.includes(t) ? "active" : ""}`}
                aria-pressed={activeTags.includes(t)}
                onClick={() => onTagClick(t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <div className="link-actions">
        <button ref={editButtonRef} type="button" className="btn-ghost" onClick={startEdit} aria-label={`${link.title || link.url} を編集`}>
          編集
        </button>
        <button type="button" className="btn-ghost danger" onClick={remove} disabled={busy} aria-label={`${link.title || link.url} を削除`}>
          削除
        </button>
      </div>
    </li>
  );
}
