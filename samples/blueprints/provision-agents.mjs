#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  toCopilotAgentMarkdown,
  toFoundryPromptDefinition,
} from '../../packages/agent-lifecycle-exp/dist/index.js';
import { copilotWorkspaceFiles, sampleAgentTemplates } from './agent-provisioning.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..', '..', '..');

function parseArgs(argv) {
  const options = {
    provider: undefined,
    names: undefined,
    model: process.env.FOUNDRY_MODEL ?? 'gpt-5.4',
    dryRun: false,
    force: false,
    targetDir: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--provider') options.provider = argv[index += 1];
    else if (argument === '--agents') options.names = argv[index += 1].split(',').map((name) => name.trim()).filter(Boolean);
    else if (argument === '--model') options.model = argv[index += 1];
    else if (argument === '--target-dir') options.targetDir = resolve(process.cwd(), argv[index += 1]);
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--force') options.force = true;
    else if (argument === '--help' || argument === '-h') {
      console.log('Usage: provision-agents.mjs --provider foundry|copilot [--agents a,b] [--model name] [--target-dir path] [--dry-run] [--force]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['foundry', 'copilot'].includes(options.provider)) throw new Error('--provider must be foundry or copilot');
  return options;
}

function selectTemplates(options) {
  const templates = sampleAgentTemplates();
  const requested = options.names ?? (options.provider === 'copilot' ? ['simple-chat'] : templates.map(({ id }) => id));
  const selected = templates.filter(({ id }) => requested.includes(id));
  const known = new Set(templates.map(({ id }) => id));
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length > 0) throw new Error(`Unknown sample agent name(s): ${unknown.join(', ')}`);
  return selected;
}

function runPlan(command, args, plan, dryRun) {
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'gik-agent-provision-'));
  const planPath = resolve(temporaryDirectory, 'plan.json');
  try {
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    if (dryRun) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    execFileSync(process.execPath, [command, '--plan', planPath, ...args], { stdio: 'inherit', env: process.env });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const options = parseArgs(process.argv.slice(2));
const templates = selectTemplates(options);

if (options.provider === 'foundry') {
  const command = process.env.GIK_FOUNDRY_PROVISIONER
    ?? resolve(workspaceRoot, 'azure-function-proxy', 'scripts', 'provision-foundry-agents.mjs');
  runPlan(command, [], {
    agents: templates.map((template) => ({
      id: template.id,
      definition: toFoundryPromptDefinition(template, options.model),
    })),
  }, options.dryRun);
} else {
  const command = process.env.GIK_COPILOT_PROVISIONER
    ?? resolve(workspaceRoot, 'demo-boards-ns-code', 'mcp-server', 'scripts', 'provision-copilot-agents.mjs');
  const targetDir = options.targetDir
    ?? resolve(workspaceRoot, 'demo-boards-ns-code', 'mcp-server', '.copilot-workspace');
  const agentFiles = templates.map((template) => ({
    path: `.github/agents/${template.id}.agent.md`,
    content: toCopilotAgentMarkdown(template, { model: options.model }),
  }));
  const plan = { files: copilotWorkspaceFiles(agentFiles) };
  const args = ['--target-dir', targetDir, ...(options.force ? ['--force'] : [])];
  runPlan(command, args, plan, options.dryRun);
}
