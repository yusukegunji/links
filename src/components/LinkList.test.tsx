import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Link, TagCount } from "../../shared/types";
import { buildSearch } from "../router";
import { LinkList, parseFilter } from "./LinkList";

const LINKS: Link[] = [
  { id: 2, url: "https://zenn.dev/x", title: "Zenn記事", note: "メモ", tags: ["react", "zenn"], createdAt: "2026-11-02T00:00:00Z", updatedAt: "" },
  { id: 1, url: "https://github.com/a/b", title: "", note: "", tags: ["github"], createdAt: "2026-11-01T00:00:00Z", updatedAt: "" },
];
const TAGS: TagCount[] = [
  { name: "react", count: 1 },
  { name: "zenn", count: 1 },
  { name: "github", count: 1 },
];

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://x");
    if (u.pathname === "/api/links" && !init?.method) {
      const tags = (u.searchParams.get("tags") ?? "").split(",").filter(Boolean);
      const q = u.searchParams.get("q") ?? "";
      const links = LINKS.filter((l) => tags.every((t) => l.tags.includes(t))).filter(
        (l) => !q || `${l.title} ${l.url} ${l.note}`.toLowerCase().includes(q.toLowerCase()),
      );
      return Response.json({ links });
    }
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body as string);
      return Response.json({ link: { ...LINKS[0], ...body } });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({}, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.restoreAllMocks();
});

function Harness({ initial = "" }: { initial?: string }) {
  const [search, setSearch] = useState(initial);
  return (
    <>
      <LinkList search={search} onSearchChange={(f) => setSearch(buildSearch(f))} tags={TAGS} onTagsChanged={() => {}} />
      <output data-testid="search">{search}</output>
    </>
  );
}

const items = () => screen.queryAllByRole("listitem");

describe("parseFilter / buildSearch", () => {
  it("round-trips", () => {
    const f = { tags: ["a", "b"], q: "hello " };
    expect(parseFilter(buildSearch(f))).toEqual(f);
    expect(buildSearch({ tags: [], q: "" })).toBe("");
  });
});

describe("LinkList", () => {
  it("lists links with title fallback, host and tags", async () => {
    render(<Harness />);
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(screen.getByRole("link", { name: "Zenn記事" })).toHaveAttribute("href", "https://zenn.dev/x");
    expect(screen.getByRole("link", { name: "https://github.com/a/b" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("github.com")).toBeInTheDocument();
  });

  it("filters by toggling tags in the tag cloud", async () => {
    render(<Harness />);
    await waitFor(() => expect(items()).toHaveLength(2));
    const cloud = screen.getByRole("region", { name: "タグで絞り込み" });
    await userEvent.click(within(cloud).getByRole("button", { name: /^github/ }));
    expect(screen.getByTestId("search")).toHaveTextContent("?tags=github");
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(within(cloud).getByRole("button", { name: /^github/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "条件をクリア" }));
    await waitFor(() => expect(items()).toHaveLength(2));
  });

  it("adds a filter when clicking a tag on a card", async () => {
    render(<Harness />);
    await waitFor(() => expect(items()).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "#zenn" }));
    expect(screen.getByTestId("search")).toHaveTextContent("?tags=zenn");
  });

  it("debounces free-word search into the URL", async () => {
    render(<Harness />);
    await waitFor(() => expect(items()).toHaveLength(2));
    await userEvent.type(screen.getByLabelText("フリーワード検索"), "zenn ");
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?q=zenn+"));
    expect(screen.getByLabelText("フリーワード検索")).toHaveValue("zenn ");
    await waitFor(() => expect(items()).toHaveLength(1));
  });

  it("restores filters from the URL", async () => {
    render(<Harness initial="?tags=react&q=zenn" />);
    expect(screen.getByLabelText("フリーワード検索")).toHaveValue("zenn");
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.getByText(/1 件/)).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    render(<Harness initial="?q=nothing" />);
    expect(await screen.findByText("条件に一致するリンクはありません")).toBeInTheDocument();
  });

  it("edits a link inline", async () => {
    render(<Harness />);
    await waitFor(() => expect(items()).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "Zenn記事 を編集" }));
    const title = screen.getByLabelText("タイトル");
    await userEvent.clear(title);
    await userEvent.type(title, "新タイトル");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("link", { name: "新タイトル" })).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH")!;
    expect(JSON.parse(patch[1].body)).toMatchObject({ title: "新タイトル", tags: ["react", "zenn"] });
  });

  it("deletes after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<Harness />);
    await waitFor(() => expect(items()).toHaveLength(2));
    const del = screen.getByRole("button", { name: "Zenn記事 を削除" });
    await userEvent.click(del);
    expect(items()).toHaveLength(2);
    await userEvent.click(del);
    await waitFor(() => expect(items()).toHaveLength(1));
  });

  it("shows an error with retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "x" }, { status: 500 }));
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("読み込みに失敗しました");
    await userEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(items()).toHaveLength(2));
  });
});
