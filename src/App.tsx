import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { TagCount } from "../shared/types";
import { api } from "./api";
import { LinkForm } from "./components/LinkForm";
import { TokenGate } from "./components/TokenGate";
import { buildSearch, useLocation } from "./router";
import { LinkList } from "./components/LinkList";

function isModifiedClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function Shell({ logout }: { logout: () => void }) {
  const { path, search, navigate } = useLocation();
  const onSearchChange = useCallback(
    (f: { tags: string[]; q: string }) => {
      // Typing refines the current entry; toggling tags creates history entries.
      const sameTags = f.tags.join(",") === (new URLSearchParams(window.location.search).get("tags") ?? "");
      navigate(`/${buildSearch(f)}`, { replace: sameTags });
    },
    [navigate],
  );
  const [tags, setTags] = useState<TagCount[]>([]);

  const refreshTags = useCallback(async () => {
    try {
      setTags(await api.listTags());
    } catch {
      /* 401 is handled globally; other errors are non-fatal here */
    }
  }, []);

  useEffect(() => {
    void refreshTags();
  }, [refreshTags]);

  function link(to: string, label: string) {
    return (
      <a
        href={to}
        aria-current={path === to ? "page" : undefined}
        onClick={(e) => {
          if (isModifiedClick(e)) return;
          e.preventDefault();
          navigate(to);
        }}
      >
        {label}
      </a>
    );
  }

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              if (isModifiedClick(e)) return;
              e.preventDefault();
              navigate("/");
            }}
          >
            🔖 links
          </a>
          <nav className="nav">
            {link("/", "一覧")}
            {link("/new", "＋ 追加")}
            <button type="button" className="btn-ghost" onClick={logout}>
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="container">
        {path === "/new" ? (
          <>
            <h1 className="page-title">リンクを追加</h1>
            <LinkForm
              tagSuggestions={tags.map((t) => t.name)}
              onCreated={() => {
                void refreshTags();
                navigate("/");
              }}
            />
          </>
        ) : (
          <>
            <h1 className="page-title">一覧</h1>
            <LinkList search={search} onSearchChange={onSearchChange} tags={tags} onTagsChanged={refreshTags} />
          </>
        )}
      </main>
    </>
  );
}

export function App() {
  return <TokenGate>{(logout) => <Shell logout={logout} />}</TokenGate>;
}
