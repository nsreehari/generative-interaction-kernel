// Left panel — set the presentation context. Turning these knobs re-plans the Presentation DSL
// (surface/space/attention pick a template; device/expertise adapt density + disclosure).

import type { PresentationContext } from "../../../../interaction/src/index";

type Axis = keyof PresentationContext;

const OPTIONS: Record<string, { axis: Axis; values: string[] }> = {
  Surface: { axis: "surface", values: ["desktop", "web", "mobile", "copilot", "teams"] },
  Device: { axis: "device", values: ["pointer", "touch", "voice"] },
  Space: { axis: "space", values: ["compact", "regular", "expanded"] },
  Attention: { axis: "attention", values: ["focused", "glanceable"] },
  Expertise: { axis: "expertise", values: ["novice", "intermediate", "expert"] },
};

const NONE = "(unset)";

export function ContextPanel({
  ctx,
  onChange,
}: {
  ctx: PresentationContext;
  onChange: (next: PresentationContext) => void;
}) {
  const set = (axis: Axis, value: string) => {
    const next = { ...ctx };
    if (value === NONE) delete next[axis];
    else (next as Record<string, unknown>)[axis] = value;
    onChange(next);
  };

  return (
    <section className="panel-section">
      <h2>Context</h2>
      {Object.entries(OPTIONS).map(([label, { axis, values }]) => (
        <label key={label}>
          {label}
          <select value={(ctx[axis] as string) ?? NONE} onChange={(e) => set(axis, e.target.value)}>
            <option value={NONE}>{NONE}</option>
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
}
