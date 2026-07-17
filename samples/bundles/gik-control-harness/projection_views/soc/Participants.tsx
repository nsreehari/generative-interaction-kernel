import React from "react";
import { Persona, Spinner, Switch, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  CheckmarkCircle20Regular,
  Clock20Regular,
  DismissCircle20Regular,
  Person24Regular,
  QuestionCircle20Regular,
  Sparkle24Regular,
  WeatherMoon20Regular,
} from "@fluentui/react-icons";
import type { ProjectionView } from "@gik/react";
import type { ControlSelection } from "../../../../shared/control-focus";
import { selectionContainsFocus } from "../../../../shared/control-focus";
import type { InspectionParticipant, ParticipantStatus, ParticipantToggleSetting } from "../../../../shared/control-inspection";

const useStyles = makeStyles({
  compact: { minWidth: 0, display: "flex", alignItems: "stretch" },
  compactContent: { minWidth: 0, minHeight: "55px", display: "flex", alignItems: "center", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, color: "var(--text)" },
  summaries: { minWidth: 0, display: "flex", justifyContent: "center", gap: tokens.spacingHorizontalS, overflow: "hidden", "@media (max-width: 620px)": { display: "none" } },
  compactPersona: { width: "128px", minWidth: "128px", borderRadius: tokens.borderRadiusMedium, boxSizing: "border-box", "& > div:last-child": { minWidth: 0 }, "& .fui-Persona__primaryText": { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular }, "& span": { textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" } },
  compactPersonaActive: { backgroundColor: "rgba(49, 95, 114, .14)", boxShadow: "inset 0 0 0 1px rgba(49, 95, 114, .42), inset 0 -2px 0 #315f72" },
  compactStatus: { minWidth: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase100 },
  statusIcon: { width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--muted)" },
  statusWorking: { color: "var(--accent)" },
  statusAttention: { color: "var(--warning, #a15c00)" },
  statusComplete: { color: "var(--good)" },
  statusError: { color: "var(--bad)" },
  participants: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalL },
  group: { minWidth: 0, display: "grid", gap: tokens.spacingVerticalS },
  groupTitle: { margin: 0, color: "var(--muted)", fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  grid: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacingHorizontalS },
  card: { position: "relative", minWidth: 0, padding: tokens.spacingVerticalM, border: `1px solid var(--line)`, borderRadius: tokens.borderRadiusMedium, backgroundColor: "var(--panel)" },
  cardActive: { backgroundColor: "color-mix(in srgb, var(--accent) 9%, var(--panel))", outline: "2px solid var(--accent)", outlineOffset: "-2px" },
  persona: { minWidth: 0, "& > div:last-child": { minWidth: 0 }, "& span": { overflowWrap: "anywhere" } },
  details: { marginTop: tokens.spacingVerticalS, color: "var(--muted)", fontSize: tokens.fontSizeBase100, "& summary": { width: "fit-content", color: "var(--text)", cursor: "pointer" }, "& ul": { margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: tokens.spacingHorizontalL } },
  setting: { marginTop: tokens.spacingVerticalS, paddingTop: tokens.spacingVerticalS, borderTop: `1px solid var(--line)` },
  settingMessage: { color: "var(--muted)", fontSize: tokens.fontSizeBase100, overflowWrap: "anywhere" },
});

function statusLabel(status: ParticipantStatus): string {
  return status.replaceAll("-", " ");
}

function ParticipantStatusIcon({ status }: { status: ParticipantStatus }): React.ReactElement {
  const styles = useStyles();
  const className = mergeClasses(
    styles.statusIcon,
    status === "working" ? styles.statusWorking : undefined,
    status === "input-required" ? styles.statusAttention : undefined,
    status === "completed" ? styles.statusComplete : undefined,
    status === "error" ? styles.statusError : undefined,
  );
  if (status === "working") return <span className={className} title="Working"><Spinner size="tiny" /></span>;
  if (status === "waiting") return <span className={className} title="Waiting"><Clock20Regular /></span>;
  if (status === "input-required") return <span className={className} title="Input required"><QuestionCircle20Regular /></span>;
  if (status === "inactive") return <span className={className} title="Inactive"><WeatherMoon20Regular /></span>;
  if (status === "error") return <span className={className} title="Error"><DismissCircle20Regular /></span>;
  return <span className={className} title={status === "completed" ? "Completed" : "Available"}><CheckmarkCircle20Regular /></span>;
}

export const Participants: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const participants = (node.props.participants ?? []) as unknown as InspectionParticipant[];
  const selection = (node.props.selection ?? undefined) as unknown as ControlSelection | undefined;

  if (node.props.compact === true) {
    return <section className={styles.compact} aria-label="Participant status">
      <div className={styles.compactContent}>
        <div className={styles.summaries}>
          {participants.map((participant) => {
            const active = participant.focusRef ? selectionContainsFocus(selection, [participant.focusRef]) : false;
            return <Persona
              aria-current={active ? "true" : undefined}
              className={mergeClasses(styles.compactPersona, active ? styles.compactPersonaActive : undefined)}
              data-participant-id={participant.id}
              key={participant.id}
              name={participant.name}
              size="extra-small"
              avatar={{ initials: null, icon: <ParticipantStatusIcon status={participant.status} /> }}
              secondaryText={<span className={styles.compactStatus}>{statusLabel(participant.status)}</span>}
            />;
          })}
        </div>
      </div>
    </section>;
  }

  const renderSetting = (participant: InspectionParticipant, setting: ParticipantToggleSetting) => <div className={styles.setting} key={setting.id}>
    <Switch
      checked={setting.value === setting.onValue}
      label={setting.value === setting.onValue ? setting.onLabel : setting.offLabel}
      aria-label={`${participant.name} ${setting.label}`}
      onChange={(_, data) => emit("configureParticipant", {
        participantId: participant.id,
        settingId: setting.id,
        value: data.checked ? setting.onValue : setting.offValue,
      })}
    />
    {setting.message ? <div className={styles.settingMessage}>{setting.message}</div> : null}
  </div>;

  const renderParticipant = (participant: InspectionParticipant) => {
    const active = participant.focusRef ? selectionContainsFocus(selection, [participant.focusRef]) : false;
    return <article data-participant-id={participant.id} key={participant.id} className={mergeClasses(styles.card, active ? styles.cardActive : undefined)}>
      <Persona
        className={styles.persona}
        name={participant.name}
        size="small"
        textAlignment="center"
        avatar={{ initials: null, icon: participant.kind === "human" ? <Person24Regular /> : <Sparkle24Regular /> }}
        secondaryText={[participant.role, statusLabel(participant.status)].filter(Boolean).join(" · ")}
      />
      {participant.capabilities?.length ? <details className={styles.details}>
        <summary>Capabilities</summary>
        <ul>{participant.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
      </details> : null}
      {participant.settings?.map((setting) => renderSetting(participant, setting))}
    </article>;
  };

  return <section className={styles.participants} aria-label="Human and agent participants">
    {(["human", "agent"] as const).map((kind) => {
      const grouped = participants.filter((participant) => participant.kind === kind);
      if (grouped.length === 0) return null;
      const title = kind === "human" ? "Humans" : "Agents";
      const titleId = `inspection-${kind}-participants-title`;
      return <section className={styles.group} aria-labelledby={titleId} key={kind}>
        <h3 id={titleId} className={styles.groupTitle}>{title}</h3>
        <div className={styles.grid}>{grouped.map(renderParticipant)}</div>
      </section>;
    })}
  </section>;
};