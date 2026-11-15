import React, { useEffect, useRef, useState } from "react";
import type { Json } from "gik-kernel";
import type { ServiceSetupDescription } from "../../../face/src/services/setup";
import type { ServiceConfigurations, ServiceSettings } from "../../../face/src/services/settings";
import type { ServiceDependencyDescription, ServiceSetupAction } from "../../../face/src/services/service-kinds";

export interface ServiceSetupClient {
  load(signal: AbortSignal): Promise<ServiceSettings>;
  inspect(configurations: ServiceConfigurations, signal: AbortSignal): Promise<ServiceSetupDescription[]>;
  save(serviceId: string, config: Record<string, Json>, generation: number, signal: AbortSignal): Promise<ServiceSettings>;
  apply(generation: number, signal: AbortSignal): Promise<ServiceSettings>;
  action(serviceId: string, dependencyId: string, action: ServiceSetupAction, signal: AbortSignal): Promise<void>;
  onApplied(configurations: ServiceConfigurations): void;
}

export function useServiceSetup(client: ServiceSetupClient, target: string) {
  const [reports, setReports] = useState<ServiceSetupDescription[]>([]);
  const [configurations, setConfigurations] = useState<ServiceConfigurations>({});
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const lifetime = useRef<AbortController | undefined>(undefined);
  const acting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller; acting.current = false;
    setReady(false); setBusy(false); setError(""); setStatus(""); setReports([]); setConfigurations({});
    void (async () => {
      const saved = await client.load(controller.signal);
      controller.signal.throwIfAborted();
      const reports = await client.inspect(saved.configurations, controller.signal);
      controller.signal.throwIfAborted();
      setGeneration(saved.generation); setReports(reports);
      setConfigurations(Object.fromEntries(reports.map(report => [report.id, report.config])));
      setReady(true);
    })().catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Service setup could not be loaded."); });
    return () => controller.abort();
  }, [client, target, reload]);
  async function run(operation: (signal: AbortSignal, beginMutation: () => void) => Promise<void>) {
    const signal = lifetime.current?.signal;
    if (!ready || acting.current || !signal || signal.aborted) throw new Error("Service setup is not ready.");
    let mutationStarted = false;
    acting.current = true; setBusy(true); setError(""); setStatus("");
    try { await operation(signal, () => { mutationStarted = true; }); }
    catch (error) {
      if (!signal.aborted) {
        if (mutationStarted) setReady(false);
        setError(error instanceof Error ? error.message : "Service setup failed. Reload to inspect before retrying.");
      }
    } finally { if (!signal.aborted) { acting.current = false; setBusy(false); } }
  }
  return {
    reports, configurations, ready, busy, error, status,
    reload: () => setReload(value => value + 1),
    edit(serviceId: string, key: string, value: Json) {
      if (!ready || acting.current) throw new Error("Service setup is not ready for editing.");
      setConfigurations(previous => ({ ...previous, [serviceId]: { ...previous[serviceId], [key]: value } }));
    },
    save: (id: string) => run(async (signal, beginMutation) => {
      const report = (await client.inspect(configurations, signal)).find(report => report.id === id);
      if (!report?.setup.validation.ok) throw new Error(report?.setup.validation.errors?.join("; ") || "Service configuration is invalid.");
      signal.throwIfAborted();
      beginMutation();
      const saved = await client.save(id, structuredClone(configurations[id]), generation, signal);
      const reports = await client.inspect(saved.configurations, signal);
      signal.throwIfAborted();
      setGeneration(saved.generation); setReports(reports); setStatus("Service configuration saved. Apply explicitly to activate it.");
    }),
    apply: () => run(async (signal, beginMutation) => {
      beginMutation();
      const saved = await client.apply(generation, signal);
      signal.throwIfAborted();
      client.onApplied(saved.activeConfigurations);
      setGeneration(saved.generation); setStatus("Service configuration applied.");
    }),
    action: (id: string, dependencyId: string, actionId: string) => run(async (signal, beginMutation) => {
      const report = (await client.inspect(configurations, signal)).find(report => report.id === id);
      const action = report?.setup.dependencies.find(item => item.requirement.id === dependencyId)?.status.actions?.find(action => action.id === actionId);
      if (!report?.setup.validation.ok || !action) throw new Error("This setup action is no longer available.");
      signal.throwIfAborted();
      beginMutation();
      await client.action(id, dependencyId, action, signal);
      signal.throwIfAborted();
      setReload(value => value + 1);
    }),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Renders supplied reports; trusted setup and action handlers are always supplied by the host. */
export function ServiceSetupPanel({ model, title = "Service Configuration", serviceTitle, editable, renderAction }: {
  model: ReturnType<typeof useServiceSetup>;
  title?: string;
  serviceTitle?: (report: ServiceSetupDescription) => string;
  editable: (report: ServiceSetupDescription, field: string) => boolean;
  renderAction?: (report: ServiceSetupDescription, dependency: ServiceDependencyDescription, action: ServiceSetupAction) => React.ReactNode;
}) {
  return <section aria-label={title}>
    <h2>{title}</h2>
    <button disabled={!model.ready || model.busy} onClick={() => void model.apply()}>Apply Configuration</button>
    <button disabled={model.busy} onClick={model.reload}>Reload Configuration</button>
    {model.error && <p role="alert">{model.error}</p>}
    {model.status && <p role="status">{model.status}</p>}
    {model.reports.map(report => <section key={report.id}>
      <h3>{serviceTitle?.(report) ?? report.provider.title ?? report.id}</h3>
      <p role="status">{report.setup.ready ? "Ready" : "Setup required"}</p>
      {report.setup.validation.errors?.map((error, index) => <p role="alert" key={index}>{error}</p>)}
      {Object.entries(record(report.provider.configSchema.properties) ? report.provider.configSchema.properties : {}).map(([key, schema]) => {
        if (!record(schema)) return null;
        const type = schema.type;
        const value = model.configurations[report.id]?.[key] ?? report.config[key];
        const readonly = "const" in schema || !editable(report, key);
        const scalar = ["string", "number", "integer", "boolean"].includes(String(type));
        return <label key={key}>{typeof schema.title === "string" ? schema.title : key}
          <input disabled={model.busy || !model.ready || !scalar} readOnly={readonly}
            type={type === "boolean" ? "checkbox" : type === "number" || type === "integer" ? "number" : "text"}
            checked={type === "boolean" ? value === true : undefined}
            value={type === "boolean" ? undefined : typeof value === "string" || typeof value === "number" ? value : JSON.stringify(value ?? null)}
            onChange={event => {
              if (readonly) return;
              model.edit(report.id, key, type === "boolean" ? event.target.checked
                : type === "number" || type === "integer" ? event.target.value === "" ? "" : Number(event.target.value) : event.target.value);
            }} />
        </label>;
      })}
      <button disabled={!model.ready || model.busy} onClick={() => void model.save(report.id)}>Save Configuration</button>
      {report.setup.dependencies.map(dependency => <div key={dependency.requirement.id}>
        <strong>{dependency.requirement.title}</strong>
        {dependency.status.state !== "ready" && <p>{dependency.status.message}</p>}
        {dependency.requirement.permissions?.map(permission => <div key={permission}><code>{permission}</code></div>)}
        {dependency.status.actions?.map(action => <React.Fragment key={action.id}>
          {renderAction ? renderAction(report, dependency, action)
            : <button disabled={!model.ready || model.busy}
              onClick={() => void model.action(report.id, dependency.requirement.id, action.id)}>{action.title}</button>}
        </React.Fragment>)}
      </div>)}
    </section>)}
  </section>;
}
