// Left panel — fire an event at the guest runtime and watch it react live. Node choices are
// derived from the currently resolved tree so you can only target real nodes.

import { useMemo, useState } from "react";
import type { ResolvedNode } from "../../../../kernel/src/index";

function collectIds(node: ResolvedNode | null): string[] {
  if (!node) return [];
  const ids: string[] = [node.id];
  for (const child of node.children) ids.push(...collectIds(child));
  return ids;
}

export function EventBar({
  tree,
  onEmit,
}: {
  tree: ResolvedNode | null;
  onEmit: (node: string, name: string, payload: Record<string, unknown>) => void;
}) {
  const ids = useMemo(() => collectIds(tree), [tree]);
  const [node, setNode] = useState("");
  const [name, setName] = useState("rowSelect");
  const [payload, setPayload] = useState('{ "id": "order-42" }');
  const [error, setError] = useState<string | null>(null);

  const target = node || ids[0] || "";

  const fire = () => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = payload.trim() ? JSON.parse(payload) : {};
      setError(null);
    } catch {
      setError("payload is not valid JSON");
      return;
    }
    if (target) onEmit(target, name, parsed);
  };

  return (
    <section className="panel-section">
      <h2>Fire event</h2>
      <label>
        Node
        <select value={target} onChange={(e) => setNode(e.target.value)}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Event
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Payload (JSON)
        <textarea rows={2} value={payload} onChange={(e) => setPayload(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button onClick={fire} disabled={!target}>
        Emit
      </button>
    </section>
  );
}
