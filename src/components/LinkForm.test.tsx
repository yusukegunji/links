import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkForm } from "./LinkForm";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/suggest")) {
      const target = decodeURIComponent(url.split("url=")[1] ?? "");
      return Response.json({ title: target.includes("zenn") ? "Zenn page" : "Hono repo", tags: [] });
    }
    if (url === "/api/links" && init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      return Response.json({ link: { id: 1, ...body, createdAt: "", updatedAt: "" } }, { status: 201 });
    }
    return Response.json({}, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function chips() {
  return screen.queryAllByRole("button", { name: /を削除$/ }).map((b) => b.getAttribute("aria-label")!.replace(" を削除", ""));
}

describe("LinkForm", () => {
  it("auto-adds tags from the url and fetches the title", async () => {
    render(<LinkForm tagSuggestions={[]} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText("URL"), "https://github.com/honojs/hono");
    expect(chips()).toEqual(["github", "code"]);
    await waitFor(() => expect(screen.getByLabelText(/タイトル/)).toHaveValue("Hono repo"), { timeout: 2000 });
  });

  it("does not re-add a dismissed auto tag", async () => {
    render(<LinkForm tagSuggestions={[]} onCreated={() => {}} />);
    const url = screen.getByLabelText("URL");
    await userEvent.type(url, "https://github.com/a");
    await userEvent.click(screen.getByRole("button", { name: "code を削除" }));
    await userEvent.type(url, "/b");
    expect(chips()).toEqual(["github"]);
  });

  it("submits url, title, note and tags", async () => {
    const onCreated = vi.fn();
    render(<LinkForm tagSuggestions={[]} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText("URL"), "https://zenn.dev/x");
    await userEvent.type(screen.getByLabelText(/タイトル/), "記事");
    await userEvent.type(screen.getByLabelText("タグを追加"), "読みたい{Enter}");
    await userEvent.type(screen.getByLabelText("メモ"), "あとで");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([u, i]) => u === "/api/links" && i?.method === "POST")!;
    expect(JSON.parse(post[1].body)).toEqual({
      url: "https://zenn.dev/x",
      title: "記事",
      note: "あとで",
      tags: ["zenn", "tech", "読みたい"],
    });
  });

  it("shows a friendly message on duplicate url", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/links" ? Response.json({ error: "url already exists" }, { status: 409 }) : Response.json({ title: "", tags: [] }),
    );
    render(<LinkForm tagSuggestions={[]} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("すでに登録");
  });

  it("replaces an auto-filled title when the url changes, but keeps a typed one", async () => {
    render(<LinkForm tagSuggestions={[]} onCreated={() => {}} />);
    const url = screen.getByLabelText("URL");
    const title = screen.getByLabelText(/タイトル/);
    await userEvent.type(url, "https://github.com/a");
    await waitFor(() => expect(title).toHaveValue("Hono repo"), { timeout: 2000 });
    await userEvent.clear(url);
    await userEvent.type(url, "https://zenn.dev/x");
    await waitFor(() => expect(title).toHaveValue("Zenn page"), { timeout: 2000 });
    await userEvent.clear(title);
    await userEvent.type(title, "自分のタイトル");
    await userEvent.clear(url);
    await userEvent.type(url, "https://github.com/b");
    await new Promise((r) => setTimeout(r, 700));
    expect(title).toHaveValue("自分のタイトル");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("forgets dismissed tags when the site changes", async () => {
    render(<LinkForm tagSuggestions={[]} onCreated={() => {}} />);
    const url = screen.getByLabelText("URL");
    await userEvent.type(url, "https://github.com/a");
    await userEvent.click(screen.getByRole("button", { name: "code を削除" }));
    await userEvent.clear(url);
    await userEvent.type(url, "https://github.com/a");
    expect(chips()).toEqual(["github", "code"]);
  });
});
