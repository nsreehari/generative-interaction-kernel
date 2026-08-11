// The foundry-agent Blueprint's named effect handlers are registered by the sample native registry.
//
// These are the ONLY place effectful work lives. The document declares `invoke("<name>")`; the shared
// dispatcher routes it here. Each handler reads the live store (the kernel applies reducer ops before
// effects run) and returns store deltas.
//
import { setOp, type EffectHandlerMap } from "@gik/react";
import { SAMPLE_CREDENTIAL_REFERENCES } from "../../../../apps/service-kinds/host/credential-references";
import { clearFunctionAccessKey } from "../../../../apps/service-kinds/host/function-access";

const FOUNDRY_CREDENTIAL_REFERENCE = SAMPLE_CREDENTIAL_REFERENCES.foundry;

export const effects: EffectHandlerMap = {
  clearFoundryAccess() {
    return {
      ops: [
        setOp("agent.accessStatus", "required"),
        setOp("agent.accessError", ""),
        setOp("agent.agentName", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.agentsStatus", "idle"),
        setOp("agent.agentsError", ""),
        setOp("agent.conversationId", ""),
      ],
    };
  },

  signOut() {
    clearFunctionAccessKey(FOUNDRY_CREDENTIAL_REFERENCE);
    return {
      ops: [
        setOp("agent.accessStatus", "required"),
        setOp("agent.accessError", ""),
        setOp("agent.agentName", ""),
        setOp("agent.reply", ""),
        setOp("agent.lastAsked", ""),
        setOp("agent.conversationId", ""),
        setOp("agent.agentOptions", []),
        setOp("agent.agentsStatus", "idle"),
        setOp("agent.agentsError", ""),
        setOp("agent.error", ""),
      ],
    };
  },
};

export default effects;
