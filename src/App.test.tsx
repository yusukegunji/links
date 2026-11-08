import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth !== "Bearer good") return Response.json({ error: "unauthorized" }, { status: 401 });
      if (url === "/api/tags") return Response.json({ tags: [{ name: "a", count: 1 }] });
      if (url.startsWith("/api/links")) return Response.json({ links: [] });
      return Response.json({ ok: true });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("asks for a token and rejects a wrong one", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("アクセストークン"), "bad");
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("トークンが違います");
  });

  it("stores a valid token and shows the app", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("アクセストークン"), "good");
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(await screen.findByRole("link", { name: "🔖 links" })).toBeInTheDocument();
    expect(localStorage.getItem("links.token")).toBe("good");
    await userEvent.click(screen.getByRole("link", { name: "＋ 追加" }));
    expect(screen.getByRole("heading", { name: "リンクを追加" })).toBeInTheDocument();
  });

  it("logs out when an API call returns 401", async () => {
    localStorage.setItem("links.token", "expired");
    render(<App />);
    expect(await screen.findByLabelText("アクセストークン")).toBeInTheDocument();
    expect(localStorage.getItem("links.token")).toBeNull();
  });

  it("syncs filters with real history: tags push, typing replaces, back restores", async () => {
    localStorage.setItem("links.token", "good");
    render(<App />);
    const cloud = await screen.findByRole("region", { name: "タグで絞り込み" });
    const start = window.history.length;
    await userEvent.click(within(cloud).getByRole("button", { name: /^a/ }));
    expect(window.location.search).toBe("?tags=a");
    expect(window.history.length).toBe(start + 1);

    await userEvent.type(screen.getByLabelText("フリーワード検索"), "xy");
    await waitFor(() => expect(window.location.search).toBe("?tags=a&q=xy"));
    expect(window.history.length).toBe(start + 1);

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(window.location.search).toBe(""));
    await waitFor(() => expect(screen.getByLabelText("フリーワード検索")).toHaveValue(""));
  });
});
