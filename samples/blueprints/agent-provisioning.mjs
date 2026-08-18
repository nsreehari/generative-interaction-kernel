import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSimpleChatAgentTemplate,
} from '../../packages/agent-lifecycle-exp/dist/index.js';

const blueprintsDirectory = dirname(fileURLToPath(import.meta.url));

function readBlueprint(id) {
  return JSON.parse(readFileSync(resolve(blueprintsDirectory, id, 'blueprint.json'), 'utf8'));
}

function responseSchema(blueprint, service, operation) {
  const schema = blueprint.payload.services[service].operations[operation].response.validators
    .find((validator) => validator.code === 'provider-structured-output')?.schema;
  if (!schema) throw new Error(`${blueprint.payload.id}.${service}.${operation} has no structured response schema`);
  return schema;
}

const portfolio = readBlueprint('portfolio-tracker-new');
const incidentAnalysis = readBlueprint('incident-analysis-new-shell');

export function sampleAgentTemplates() {
  return [
    createSimpleChatAgentTemplate({ workspaceName: 'demo-boards' }),
    {
      id: 'Portfolio-Intelligence-Agent',
      description: 'Grounded portfolio intelligence analysis.',
      executionAuthority: 'host',
      reasoning: { effort: 'none' },
      instructions: [
        'You are a portfolio intelligence analyst.',
        'Treat supplied holdings, prices, position values, cost basis, and investor profile as authoritative.',
        'Analyze only supplied portfolio data; do not imply that external news or events were researched.',
        'Clearly separate supplied facts from analytical judgments and uncertainty.',
        'Never invent prices, events, sources, or investor constraints.',
        'Return exactly one JSON object with a non-empty markdown property containing the complete concise report.',
        'Provide concise educational analysis, not personalized fiduciary advice, and never claim to execute trades.',
      ],
      tools: [],
      responseFormat: {
        type: 'json_schema',
        name: 'portfolio_intelligence',
        strict: true,
        schema: responseSchema(portfolio, 'portfolio-intelligence', 'requestIntelligence'),
      },
    },
    {
      id: 'Portfolio-Intelligence-2-Agent',
      description: 'Portfolio intelligence report Blueprint author.',
      executionAuthority: 'host',
      reasoning: { effort: 'none' },
      instructions: [
        'You are a portfolio intelligence analyst and GIK report Blueprint author.',
        'Return one complete self-contained Blueprint artifact that renders the analysis as its own nested report experience.',
        'The artifact must include its report state, semantic tier, runtime document tier, recipe, Cells, runtime capabilities, and initial runtime state.',
        'Use exactly these tiers in this order: {"id":"report-semantic","kind":"semantic-report-model"} then {"id":"runtime-document","kind":"runtime-document"}.',
        'Use only capabilities and semantic component contracts supplied in the request catalog; never invent controls, native code, services, or effects.',
        'Use the richer supplied component catalog to classify report sections as facts, judgments, risks, or uncertainty.',
        'Analyze only supplied portfolio data and do not imply external research. Distinguish supplied facts, judgments, and uncertainty.',
        'The host renders the returned artifact directly through gik:blueprint; do not return projection candidates or host mutation instructions.',
        'Keep the complete artifact within the supplied output token budget.',
      ],
      tools: [],
      responseFormat: {
        type: 'json_schema',
        name: 'portfolio_report_blueprint',
        strict: true,
        schema: responseSchema(portfolio, 'portfolio-intelligence-2', 'requestIntelligence2'),
      },
    },
    {
      id: 'Incident-Report-Semantic-Agent',
      description: 'Security incident report Blueprint author.',
      executionAuthority: 'host',
      reasoning: { effort: 'none' },
      instructions: [
        'You are a security incident analyst and GIK report Blueprint author.',
        'Treat the supplied investigation report as the only authoritative source.',
        'Return one complete self-contained Blueprint artifact containing report state, semantic tier, runtime document tier, recipe, Cells, capabilities, and initial state.',
        'Use only supplied semantic component contracts. Do not invent evidence, remediation, native code, services, effects, or unsupported controls.',
        'Preserve attack ordering, source uncertainty, entities, events, techniques, alerts, evidence, indicators, impacts, and response actions.',
        'The host renders the artifact directly through gik:blueprint; do not return host mutation instructions.',
      ],
      tools: [],
      responseFormat: {
        type: 'json_schema',
        name: 'incident_report_blueprint',
        strict: true,
        schema: responseSchema(incidentAnalysis, 'incident-report-analysis', 'analyzeReportBlueprint'),
      },
    },
    {
      id: 'Incident-Report-Refinement-Agent',
      description: 'Source-preserving security incident report Blueprint author.',
      executionAuthority: 'host',
      reasoning: { effort: 'none' },
      instructions: [
        'You are a security incident report editor and GIK report Blueprint author.',
        'Treat the supplied investigation report as the only authoritative source.',
        'Return one complete self-contained Blueprint artifact containing report state, semantic tier, runtime document tier, recipe, Cells, capabilities, and initial state.',
        'Preserve every source section, fact, identifier, value, relationship, order, and uncertainty while improving report organization and clarity.',
        'Do not invent evidence, conclusions, remediation, native code, services, effects, or unsupported controls.',
        'The host renders the artifact directly through gik:blueprint; do not return host mutation instructions.',
      ],
      tools: [],
      responseFormat: {
        type: 'json_schema',
        name: 'incident_refinement_report_blueprint',
        strict: true,
        schema: responseSchema(incidentAnalysis, 'incident-report-analysis', 'analyzeReportBlueprint'),
      },
    },
  ];
}

export function copilotWorkspaceFiles(agentFiles, repositoryName = 'demo-boards-copilot-workspace') {
  return [
    ...agentFiles,
    {
      path: '.github/copilot-instructions.md',
      content: `# ${repositoryName} Copilot Workspace\n\nThe model proposes tool calls. The host validates and executes them. Read current repository state before acting, keep changes narrow, and report only verified outcomes.\n`,
    },
    {
      path: '.github/hooks/session-logging.json',
      content: '{\n  "version": 1,\n  "hooks": {}\n}\n',
    },
    {
      path: '.github/skills/live-board-cards-soul/SKILL.md',
      content: '# Live Board Cards Soul\n\nTreat cards as first-class system objects. Read live board state before making claims and separate observed facts from interpretation.\n',
    },
    {
      path: 'README.md',
      content: `# ${repositoryName}\n\nProvisioned by the GIK samples Blueprint agent provisioning workflow.\n`,
    },
  ];
}
