#!/usr/bin/env node
// A stand-in for the Claude Code executable, for simulated acceptance runs and screenshots.
// It speaks the SDK's stream-json control protocol over stdio (initialize, hook callbacks, permission requests),
// plays a scripted commission chosen from the prompt, and really writes the files into the commission folder.
// It never touches the network and never spends money.
//
// Point the app at it with LAMPLIGHT_CLAUDE_PATH=<repo>/tools/sim/claude.mjs (see tools/README.md).
//
// Environment:
//   SIM_SPEED      milliseconds per step (default 700); 0 runs as fast as possible
//   SIM_SCENARIO   a twist on the play: budget | neterror | longwait | stuck | crash (default none)
//   SIM_COST       dollars charged per tool call (default 0.018)
//   SIM_STATE_DIR  where sessions are kept so --resume can continue them (default <tmp>/lamplight-sim)
//   SIM_LOG        append every message in and out to this file
//   SIM_CLAUDE_VERSION  the version to claim (default 2.1.306, the one the SDK was built for)
//   SIM_TODOS           todowrite: keep the to-do list with TodoWrite, as Claude Code did before the Task* tools

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pickPlay } from './plays.mjs';

const env = process.env;
const SPEED = Number(env.SIM_SPEED ?? 700);
const COST = Number(env.SIM_COST ?? 0.018);
const SCENARIO = env.SIM_SCENARIO ?? '';
const STATE_DIR = env.SIM_STATE_DIR ?? join(tmpdir(), 'lamplight-sim');
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
};
/** The version it claims to be (`--version`, and the init message); SIM_CLAUDE_VERSION plays an old or new copy. */
const VERSION = env.SIM_CLAUDE_VERSION ?? '2.1.306';
/** The tools for Claude's own to-do list: TaskCreate / TaskUpdate since 2.1.2xx (seen in real runs of 2.1.306 and 2.1.317). */
const TODOS = env.SIM_TODOS === 'todowrite' ? 'todowrite' : 'tasks';
const PLAN_TOOLS = ['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'];
if (argv.includes('--version')) {
  process.stdout.write(`${VERSION} (Claude Code)\n`);
  process.exit(0);
}
const budget = argOf('--max-budget-usd') ? Number(argOf('--max-budget-usd')) : undefined;
const resumeId = argOf('--resume');

const log = (dir, o) => { if (env.SIM_LOG) appendFileSync(env.SIM_LOG, `${dir} ${JSON.stringify(o)}\n`); };
const out = (o) => { log('>', o); process.stdout.write(`${JSON.stringify(o)}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = (steps = 1) => sleep(SPEED * steps);

let seq = 0;
const nextId = (p) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

// ---- control protocol -------------------------------------------------------------------------

const pending = new Map();
let hooks = {};
const request = (req) => new Promise((resolve) => {
  const id = nextId('sim_req_');
  pending.set(id, resolve);
  out({ type: 'control_request', request_id: id, request: req });
});

let started = false;
const inbox = [];
let wake = null;
function onLine(line) {
  if (!line.trim()) return;
  const m = JSON.parse(line);
  log('<', m);
  if (m.type === 'control_request') {
    if (m.request.subtype === 'initialize') hooks = m.request.hooks ?? {};
    out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } });
  } else if (m.type === 'control_response') {
    pending.get(m.response.request_id)?.(m.response);
    pending.delete(m.response.request_id);
  } else if (m.type === 'user') {
    const content = m.message?.content;
    const text = typeof content === 'string' ? content : (content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (!started) { started = true; void run(text); } else { inbox.push(text); wake?.(); }
  }
}
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buffer += d;
  for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
    onLine(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
  }
});
process.stdin.on('end', () => process.exit(0));

// ---- session state (for --resume) ------------------------------------------------------------

const statePath = (id) => join(STATE_DIR, `${id}.json`);
function loadState(id) {
  try { return JSON.parse(readFileSync(statePath(id), 'utf8')); } catch { return null; }
}
function saveState(s) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(s.session), JSON.stringify(s));
}

// ---- the stage: what a play can do ------------------------------------------------------------

class Stopped extends Error {}

function makeStage(state) {
  const cwd = process.cwd();
  const session = state.session;
  let spent = 0;
  let stepNo = 0;
  const base = { session_id: session, cwd, permission_mode: 'default' };

  const hook = async (event, input) => {
    const ids = (hooks[event] ?? []).flatMap((m) => m.hookCallbackIds ?? []);
    for (const id of ids) await request({ subtype: 'hook_callback', callback_id: id, input: { ...base, hook_event_name: event, ...input }, tool_use_id: input.tool_use_id });
  };
  const assistant = (content, parent = null) => out({
    type: 'assistant', parent_tool_use_id: parent, session_id: session, uuid: nextId('u'),
    message: { id: nextId('msg_sim_'), type: 'message', role: 'assistant', model: 'sim', content, stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } },
  });
  const userResult = (toolUseId, content, isError, parent = null) => out({
    type: 'user', parent_tool_use_id: parent, session_id: session, uuid: nextId('u'),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError || undefined }] },
  });
  const result = (subtype, extra) => out({
    type: 'result', subtype, session_id: session, uuid: nextId('u'), duration_ms: 1000, duration_api_ms: 800, num_turns: stepNo,
    total_cost_usd: Math.round(((state.paid ?? 0) + spent) * 10000) / 10000, usage: { input_tokens: 0, output_tokens: 0 }, permission_denials: [], ...extra,
  });

  /** Charge for a call; stop with the budget result once the cap is passed (the SDK's own --max-budget-usd). */
  const charge = (times = 1) => {
    spent += COST * times * (SCENARIO === 'budget' ? 12 : 1);
    if (budget !== undefined && spent >= budget) {
      // The cap counts this process only, while the reported total carries over a --resume.
      result('error_max_budget_usd', { is_error: true, errors: [`Reached maximum budget ($${budget})`] });
      state.paid = (state.paid ?? 0) + spent;
      saveState(state);
      throw new Stopped();
    }
  };

  /**
   * One step of the play. Steps finished in an earlier process of this session are skipped on --resume,
   * so "carry on" after a budget stop or a crash really continues where it left off.
   */
  const step = async (fn) => {
    stepNo++;
    if (stepNo <= state.done) return undefined;
    const r = await fn();
    state.done = stepNo;
    saveState(state);
    return r;
  };

  /** Notes added in a meeting while the commission runs. */
  const notes = () => {
    const got = inbox.splice(0);
    for (const n of got) state.notes.push((n.match(/"([^"]+)"/) ?? [])[1] ?? n);
    return got.length;
  };

  /** A tool call from the main agent or a subagent: hook, permission, effect, hook, result. */
  const tool = async (name, input, opts = {}) => {
    const id = nextId('toolu_sim_');
    const parent = opts.parent ?? null;
    const who = opts.agent ? { agent_id: opts.agent.id, agent_type: opts.agent.type } : {};
    assistant([{ type: 'tool_use', id, name, input }], parent);
    await hook('PreToolUse', { tool_name: name, tool_input: input, tool_use_id: id, ...who });
    let finalInput = input;
    if (!['Read', 'Glob', 'Grep', 'Agent', 'Task', ...PLAN_TOOLS].includes(name)) {
      await hook('PermissionRequest', { tool_name: name, tool_input: input, permission_suggestions: [], ...who });
      const r = await request({ subtype: 'can_use_tool', tool_name: name, input, tool_use_id: id, ...(opts.agent ? { agent_id: opts.agent.id } : {}) });
      const verdict = r.response ?? {};
      if (verdict.behavior !== 'allow') {
        await pause(0.3);
        userResult(id, verdict.message ?? 'Permission denied.', true, parent);
        return { denied: true };
      }
      finalInput = verdict.updatedInput ?? input;
    }
    await pause(opts.slow ?? 1);
    let res;
    try {
      res = (await opts.effect?.(finalInput)) ?? { text: 'OK' };
    } catch (err) {
      res = { text: String(err?.message ?? err), error: true };
    }
    charge(PLAN_TOOLS.includes(name) ? 0.2 : 1); // ticking a to-do off is a short call
    if (res.error) {
      await hook('PostToolUseFailure', { tool_name: name, tool_input: finalInput, tool_use_id: id, error: res.text, ...who });
      userResult(id, res.text, true, parent);
    } else {
      await hook('PostToolUse', { tool_name: name, tool_input: finalInput, tool_response: res.response ?? res.text, tool_use_id: id, ...who });
      userResult(id, res.text, false, parent);
    }
    return { ...res, input: finalInput };
  };

  // Like the real Write tool, a file in a folder that is not there yet gets its folder.
  const write = (path, content, opts) => tool('Write', { file_path: join(cwd, path), content }, { ...opts, effect: () => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
    return { text: `File created successfully at: ${join(cwd, path)}` };
  } });
  const edit = (path, oldString, newString, opts) => tool('Edit', { file_path: join(cwd, path), old_string: oldString, new_string: newString }, { ...opts, effect: () => {
    const file = join(cwd, path);
    const text = readFileSync(file, 'utf8');
    if (!text.includes(oldString)) return { text: 'String to replace not found in file.', error: true };
    writeFileSync(file, text.replace(oldString, newString));
    return { text: 'The file has been updated successfully.' };
  } });
  const read = (path, opts) => tool('Read', { file_path: join(cwd, path) }, { ...opts, effect: () => {
    const file = join(cwd, path);
    if (!existsSync(file)) return { text: 'File does not exist.', error: true };
    const buf = readFileSync(file);
    return { text: /\.(png|jpe?g|gif|webp|bmp)$/i.test(path) ? `[image ${buf.length} bytes]` : buf.toString('utf8').slice(0, 2000) };
  } });

  /** Send a subagent out: its own calls carry its agent id, and it comes back with a summary. */
  const agent = async (type, description, prompt, work, summary) => {
    const id = nextId('toolu_sim_');
    const agentRef = { id: `sim_${type}_${id.slice(-6)}`, type };
    const input = { description, prompt, subagent_type: type };
    assistant([{ type: 'tool_use', id, name: 'Agent', input }]);
    await hook('PreToolUse', { tool_name: 'Agent', tool_input: input, tool_use_id: id });
    out({ type: 'system', subtype: 'task_started', task_id: agentRef.id, tool_use_id: id, description, subagent_type: type, is_backgrounded: false, task_type: 'local_agent', session_id: session, uuid: nextId('u') });
    await hook('SubagentStart', { agent_id: agentRef.id, agent_type: type });
    out({ type: 'user', parent_tool_use_id: id, session_id: session, uuid: nextId('u'), message: { role: 'user', content: [{ type: 'text', text: prompt }] } });
    await pause(1);
    await work({ parent: id, agent: agentRef });
    out({ type: 'system', subtype: 'task_progress', task_id: agentRef.id, tool_use_id: id, description, subagent_type: type,
      usage: { tool_uses: 1, duration_ms: 1000 }, last_tool_name: 'Read', session_id: session, uuid: nextId('u') });
    await pause(1);
    await hook('SubagentStop', { agent_id: agentRef.id, agent_type: type, stop_hook_active: false, last_assistant_message: summary });
    out({ type: 'system', subtype: 'task_updated', task_id: agentRef.id, patch: { status: 'completed', end_time: Date.now() }, session_id: session, uuid: nextId('u') });
    out({ type: 'system', subtype: 'task_notification', task_id: agentRef.id, tool_use_id: id, status: 'completed', summary, session_id: session, uuid: nextId('u') });
    await hook('PostToolUse', { tool_name: 'Agent', tool_input: input, tool_response: summary, tool_use_id: id });
    userResult(id, [{ type: 'text', text: summary }], false);
    charge(2);
    return summary;
  };

  /** Ask the user; returns the label they picked, or null when they left it to the agent. */
  const ask = async (question, header, options) => {
    const r = await tool('AskUserQuestion', { questions: [{ question, header, multiSelect: false, options }] }, { effect: (input) => {
      const answer = input.answers?.[question];
      return { text: `User answered: ${JSON.stringify({ [question]: answer })}`, answer };
    } });
    const answer = r.answer;
    return options.some((o) => o.label === answer) ? answer : null;
  };

  /**
   * Keep the to-do list at "items before current are done, current is under way". Real Claude Code makes each
   * item with TaskCreate (numbered 1, 2, 3...) and moves them along with TaskUpdate; SIM_TODOS=todowrite plays
   * the older TodoWrite, which rewrites the whole list each time.
   */
  let tasks = null;
  const todo = async (items, current) => {
    const want = (i) => (i < current ? 'completed' : i === current ? 'in_progress' : 'pending');
    if (TODOS === 'todowrite') {
      return tool('TodoWrite', { todos: items.map((content, i) => ({ content, activeForm: content, status: want(i) })) },
        { effect: () => ({ text: 'Todos have been modified successfully.' }) });
    }
    if (!tasks) {
      tasks = [];
      for (const [i, subject] of items.entries()) {
        const id = String(i + 1);
        await tool('TaskCreate', { subject, description: subject, activeForm: subject }, { slow: 0.3, effect: () => (
          { text: `Task #${id} created successfully: ${subject}`, response: { task: { id, subject } } }) });
        tasks.push({ id, status: 'pending' });
      }
    }
    for (const [i, t] of tasks.entries()) {
      if (t.status === want(i)) continue;
      const from = t.status;
      t.status = want(i);
      await tool('TaskUpdate', { taskId: t.id, status: t.status }, { slow: 0.3, effect: () => (
        { text: `Updated task #${t.id} status`, response: { success: true, taskId: t.id, updatedFields: ['status'], statusChange: { from, to: t.status } } }) });
    }
    return undefined;
  };

  const say = async (text) => { assistant([{ type: 'text', text }]); await pause(0.5); };
  const think = async (steps = 1) => {
    out({ type: 'system', subtype: 'thinking_tokens', session_id: session, uuid: nextId('u') });
    await pause(steps);
  };

  return {
    cwd, state, step, tool, write, edit, read, agent, ask, todo, say, think, notes, pause, charge,
    get spent() { return spent; },
    finish: async (text) => {
      assistant([{ type: 'text', text }]);
      await hook('Stop', { stop_hook_active: false, last_assistant_message: text, background_tasks: [] });
      result('success', { is_error: false, result: text });
    },
    fail: (text) => { saveState(state); result('error_during_execution', { is_error: true, errors: [text] }); throw new Stopped(); },
  };
}

// ---- the run ----------------------------------------------------------------------------------

async function run(prompt) {
  const old = resumeId ? loadState(resumeId) : null;
  const state = old ?? { session: `sim-${Date.now().toString(36)}`, play: null, done: 0, notes: [], lang: null };
  if (old) state.done = old.done; // carry on after the last finished step
  const play = pickPlay(prompt, state);
  state.play = play.name;
  saveState(state);
  out({
    type: 'system', subtype: 'init', session_id: state.session, cwd: process.cwd(), model: 'sim', permissionMode: 'default', claude_code_version: VERSION,
    // As a real init lists them: the Agent tool under its old name Task, and the to-do tools of this version.
    tools: ['Task', 'AskUserQuestion', 'Bash', 'Edit', 'Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch', 'Write',
      ...(TODOS === 'todowrite' ? ['TodoWrite'] : ['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate'])], uuid: nextId('u'),
  });
  const stage = makeStage(state);
  try {
    // Falls over once: carrying on (--resume) gets through.
    if (SCENARIO === 'crash' && !resumeId) setTimeout(() => process.exit(1), 6 * SPEED);
    await play.run(stage, { scenario: SCENARIO, prompt });
  } catch (err) {
    if (!(err instanceof Stopped)) {
      process.stderr.write(`sim: ${err?.stack ?? err}\n`);
      out({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: [String(err)], session_id: state.session, total_cost_usd: stage.spent, uuid: nextId('u') });
    }
  }
  // Stay open while the SDK may still send a meeting note; it closes stdin when it is done.
  wake = null;
}
