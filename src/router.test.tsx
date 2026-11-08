import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { buildSearch, navigate, useLocation } from "./router";

function Probe() {
  const { path, search } = useLocation();
  return <output data-testid="loc">{path + search}</output>;
}

beforeEach(() => window.history.replaceState(null, "", "/"));

describe("router", () => {
  it("push and replace update history and subscribers", () => {
    render(<Probe />);
    const before = window.history.length;
    act(() => navigate("/?tags=a"));
    expect(screen.getByTestId("loc")).toHaveTextContent("/?tags=a");
    expect(window.history.length).toBe(before + 1);
    act(() => navigate("/?tags=a&q=x", { replace: true }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/?tags=a&q=x");
    expect(window.history.length).toBe(before + 1);
  });

  it("follows popstate (back/forward)", () => {
    render(<Probe />);
    act(() => {
      window.history.pushState(null, "", "/new/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("loc")).toHaveTextContent("/new");
  });

  it("buildSearch keeps typed spaces", () => {
    expect(buildSearch({ tags: ["a", "b"], q: "x " })).toBe("?tags=a%2Cb&q=x+");
  });
});
