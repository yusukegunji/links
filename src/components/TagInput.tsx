import { useId, useState, type KeyboardEvent } from "react";
import { normalizeTag } from "../../shared/tags";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  onRemove?: (tag: string) => void;
  autoTags?: ReadonlySet<string>;
  suggestions?: string[];
  placeholder?: string;
}

export function TagInput({ value, onChange, onRemove, autoTags, suggestions = [], placeholder }: Props) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit(raw: string) {
    const added = raw.split(",").map(normalizeTag).filter((t) => t && !value.includes(t));
    if (added.length) onChange([...value, ...new Set(added)]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
    onRemove?.(tag);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      remove(value[value.length - 1]!);
    }
  }

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span key={tag} className={`chip ${autoTags?.has(tag) ? "chip-auto" : ""}`}>
          {autoTags?.has(tag) && <span aria-hidden="true">✨</span>}
          {tag}
          <button type="button" className="chip-remove" aria-label={`${tag} を削除`} onClick={() => remove(tag)}>
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="タグを追加"
        value={draft}
        list={listId}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
