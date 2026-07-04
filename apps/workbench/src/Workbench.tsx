// The workbench host chrome (plain React by design in slice 1). Left = control panels that
// *write* the shared artifact; center = the live playground (guest runtime); right = the
// inspector. Changing a knob rebuilds the session and the guest re-renders.

import { useEffect, useMemo, useState } from "react";
import { GenUIRoot, liveCardsRegistry } from "../../../adapters/react/src/index";
import {
  liveCardsBinding,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
} from "../../../interaction/src/index";
import type { Patch, ResolvedNode } from "../../../kernel/src/index";
import { buildSession } from "./session";
import { InteractionPanel } from "./panels/InteractionPanel";
import { ContextPanel } from "./panels/ContextPanel";
import { EventBar } from "./panels/EventBar";
import { ArtifactTabs } from "./panels/ArtifactTabs";

export function Workbench() {
  const [interaction, setInteraction] = useState<InteractionKind>("investigate");
  const [subject, setSubject] = useState("incident");
  const [ctx, setCtx] = useState<PresentationContext>({ surface: "desktop" });

  const spec: InteractionSpec = useMemo(() => ({ interaction, subject }), [interaction, subject]);
  const session = useMemo(() => buildSession(spec, ctx, liveCardsBinding), [spec, ctx]);

  const [tree, setTree] = useState<ResolvedNode | null>(null);
  const [patch, setPatch] = useState<Patch | null>(null);

  // subscribe to the guest for the inspector (the playground renders via GenUIRoot separately).
  useEffect(() => {
    const c = session.controller;
    const sync = () => {
      setTree(c.getTree());
      setPatch(c.getLastPatch());
    };
    const unsubscribe = c.subscribe(sync);
    void c.start().then(sync);
    return unsubscribe;
  }, [session]);

  return (
    <div className="workbench">
      <aside className="controls">
        <header className="brand">
          <h1>GenUI Workbench</h1>
          <span className="muted">inspect · slice 1</span>
        </header>
        <InteractionPanel
          spec={spec}
          onChange={(next) => {
            setInteraction(next.interaction);
            setSubject(next.subject);
          }}
        />
        <ContextPanel ctx={ctx} onChange={setCtx} />
        <EventBar tree={tree} onEmit={(n, e, p) => void session.controller.emit(n, e, p)} />
      </aside>

      <main className="playground">
        <header className="pg-head">Playground</header>
        <div className="pg-surface">
          <GenUIRoot source={session.controller} registry={liveCardsRegistry} />
        </div>
      </main>

      <ArtifactTabs session={session} tree={tree} patch={patch} />
    </div>
  );
}
