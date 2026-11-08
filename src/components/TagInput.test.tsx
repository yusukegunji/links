import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TagInput } from "./TagInput";

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagInput value={tags} onChange={setTags} autoTags={new Set(["auto"])} />
      <output data-testid="out">{tags.join("|")}</output>
    </>
  );
}

describe("TagInput", () => {
  it("adds tags with Enter and comma, normalized and deduped", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("タグを追加");
    await userEvent.type(input, "React{Enter}#TypeScript,react,");
    expect(screen.getByTestId("out")).toHaveTextContent("react|typescript");
  });

  it("removes with the × button and Backspace", async () => {
    render(<Harness initial={["a", "b", "auto"]} />);
    await userEvent.click(screen.getByRole("button", { name: "a を削除" }));
    expect(screen.getByTestId("out")).toHaveTextContent("b|auto");
    await userEvent.type(screen.getByLabelText("タグを追加"), "{Backspace}");
    expect(screen.getByTestId("out")).toHaveTextContent(/^b$/);
  });

  it("commits pending text on blur", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("タグを追加"), "later");
    await userEvent.tab();
    expect(screen.getByTestId("out")).toHaveTextContent("later");
  });
});
