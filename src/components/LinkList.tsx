import { useEffect, useMemo, useState } from "react";
import type { Link, TagCount } from "../../shared/types";
import { api, ApiError } from "../api";
import { LinkCard } from "./LinkCard";

interface Props {
  search: string;
  onSearchChange: (params: { tags: string[]; q: string }) => void;
  tags: TagCount[];
  onTagsChanged: () => void;
}

export function parseFilter(search: string): { tags: string[]; q: string } {
  const sp = new URLSearchParams(search);
  return {
    tags: (sp.get("tags") ?? "").split(",").filter(Boolean),
    q: sp.get("q") ?? "",
  };
}

export function LinkList({ search, onSearchChange, tags, onTagsChanged }: Props) {
  const filter = useMemo(() => parseFilter(search), [search]);
  const [query, setQuery] = useState(filter.q);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Keep the input in sync when the URL changes (e.g. back button).
  useEffect(() => setQuery(filter.q), [filter.q]);

  // Debounce typing into the URL.
  useEffect(() => {
    if (query === filter.q) return;
    const timer = setTimeout(() => onSearchChange({ tags: filter.tags, q: query }), 300);
    return () => clearTimeout(timer);
  }, [query, filter, onSearchChange]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listLinks(filter)
      .then((l) => {
        if (!cancelled) setLinks(l);
      })
      .catch((err) => {
        if (cancelled || (err instanceof ApiError && err.status === 401)) return;
        setError("読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  function toggleTag(tag: string) {
    const next = filter.tags.includes(tag) ? filter.tags.filter((t) => t !== tag) : [...filter.tags, tag];
    onSearchChange({ tags: next, q: query });
  }

  const visibleTags = showAllTags ? tags : tags.slice(0, 30);
  const filtering = filter.tags.length > 0 || filter.q !== "";

  return (
    <div className="list-page">
      <div className="search">
        <input
          type="search"
          aria-label="フリーワード検索"
          placeholder="🔍 タイトル・URL・メモ・タグを検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tags.length > 0 && (
        <section className="tag-cloud" aria-label="タグで絞り込み">
          {visibleTags.map((t) => {
            const active = filter.tags.includes(t.name);
            return (
              <button
                key={t.name}
                type="button"
                className={`tag-filter ${active ? "active" : ""}`}
                aria-pressed={active}
                onClick={() => toggleTag(t.name)}
              >
                {t.name} <span className="count">{t.count}</span>
              </button>
            );
          })}
          {tags.length > 30 && (
            <button type="button" className="btn-ghost" onClick={() => setShowAllTags((v) => !v)}>
              {showAllTags ? "閉じる" : `+${tags.length - 30}`}
            </button>
          )}
        </section>
      )}

      {filtering && (
        <div className="filter-bar">
          <span className="muted">
            {links ? `${links.length} 件` : "…"}
            {filter.tags.length > 0 && <> / タグ: {filter.tags.map((t) => `#${t}`).join(" ")}</>}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setQuery("");
              onSearchChange({ tags: [], q: "" });
            }}
          >
            条件をクリア
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button type="button" className="btn-ghost" onClick={() => setReloadKey((k) => k + 1)}>
            再試行
          </button>
        </p>
      )}

      {links === null && !error && <p className="muted">読み込み中…</p>}

      {links?.length === 0 && (
        <div className="empty">
          {filtering ? "条件に一致するリンクはありません" : "まだリンクがありません。「＋ 追加」から登録しましょう"}
        </div>
      )}

      <ul className="links">
        {links?.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            activeTags={filter.tags}
            tagSuggestions={tags.map((t) => t.name)}
            onTagClick={toggleTag}
            onUpdated={(updated) => {
              setLinks((ls) => ls?.map((l) => (l.id === updated.id ? updated : l)) ?? null);
              onTagsChanged();
            }}
            onDeleted={(id) => {
              setLinks((ls) => ls?.filter((l) => l.id !== id) ?? null);
              onTagsChanged();
            }}
          />
        ))}
      </ul>
    </div>
  );
}
