// Left panel — pick the interaction (kind + subject). A *writer* of the shared artifact.

import { interactionTaxonomy, type InteractionKind, type InteractionSpec } from "../../../../interaction/src/index";

const KINDS = Object.keys(interactionTaxonomy) as InteractionKind[];

export function InteractionPanel({
  spec,
  onChange,
}: {
  spec: InteractionSpec;
  onChange: (next: InteractionSpec) => void;
}) {
  const facets = interactionTaxonomy[spec.interaction as InteractionKind] ?? [];
  return (
    <section className="panel-section">
      <h2>Interaction</h2>
      <label>
        Kind
        <select
          value={spec.interaction}
          onChange={(e) => onChange({ ...spec, interaction: e.target.value as InteractionKind })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label>
        Subject
        <input
          value={spec.subject}
          onChange={(e) => onChange({ ...spec, subject: e.target.value })}
        />
      </label>
      <div className="facet-list">
        <span className="muted">facets</span>
        <ul>
          {facets.map((f) => (
            <li key={f.name}>
              <code>{f.name}</code>
              <span className="tag">{f.role}</span>
              {f.required ? <span className="tag req">required</span> : <span className="tag opt">optional</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
