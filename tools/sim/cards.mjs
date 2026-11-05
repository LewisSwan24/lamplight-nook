// The main cards, and how to open each through the debug handles. A tab means a settings tab. Used by contrast.mjs and the
// `screens` scenario.

const ui = 'window.lamplightDebug.ui';
const text = JSON.stringify;

export function mainCards(lang) {
  const long = lang === 'en' ? 'Make me a small page for the family reunion' : '帮我做一个家庭聚会签到的小网页';
  const env = { hasApiKey: false, hasClaude: false, debug: false, keySource: 'none', installCommand: 'irm https://claude.ai/install.ps1 | iex', platform: 'win32' };
  return [
    ['slip', 'form.commission', `${ui}.showCommissionForm()`],
    ['actor', '.actor-card', `${ui}.showActorCard('adeng', { state: 'working', lastLine: ${text(long)}, doing: ${text(long)}, stats: { writes: 3, runs: 2, fails: 1 }, raw: ['event'] }, true)`],
    ['plan', '.plan-card', `${ui}.showPlan([0, 1, 2, 3].map((i) => ({ label: ${text(long)}, status: i < 2 ? 'done' : i === 2 ? 'doing' : 'todo' })))`],
    ['result', '.result-card', `${ui}.showResult({ ok: true, workDir: 'C:/w', files: ['C:/w/page.html'], main: 'C:/w/page.html', costUsd: 0.42, summary: ${text(long)}, id: 'c1', round: 2, canRestore: true })`],
    ['failure', '#ui > .card', `${ui}.showFailure('net')`],
    ['failure-money', '.card.serious', `${ui}.showFailure('budget')`],
    ['notice', '.notice-card', `${ui}.showNotReady(${text(env)})`],
    ['trial-end', '.trial-end', `${ui}.showTrialEnd()`],
    ['meeting', 'form.meeting', `${ui}.showMeeting()`],
    ['shelf', '.shelf-card', `${ui}.showShelf()`],
    ['notebook', '.notebook', `${ui}.showNotebook()`],
    ['notebook-trouble', '.notebook-trouble', `${ui}.showDataTrouble({ notebook: 'restored', settings: true, ledger: true }, 3)`],
    ['captions', '.caption-card', `${ui}.showCaptionLog()`],
    ['legal', '.card.legal', `${ui}.showLegal('terms')`],
    ['pending', '.pending-card', `${ui}.showPending({ want: ${text(long)} })`],
    ['decision', '.dialog', `${ui}.showDecision({ id: 'q', kind: 'question', agent: 'main', tool: 'AskUserQuestion', title: ${text(long)}, defaultId: '0', options: [0, 1].map((i) => ({ id: String(i), label: ${text(long)}, hint: ${text(long)} })) })`],
    ['serious', '.serious', `${ui}.showDecision({ id: 's', kind: 'serious', agent: 'main', tool: 'Bash', title: ${text(long)}, reason: ${text(long)}, detail: ${text(long)}, defaultId: 'deny', options: [{ id: 'deny', label: 'no' }, { id: 'allow', label: 'yes' }] })`],
    ['settings-basics', '.card.settings', null, 'basics'],
    ['settings-furnish', '.card.settings', null, 'furnish'],
    ['settings-sight', '.card.settings', null, 'sight'],
    ['settings-work', '.card.settings', null, 'work'],
    ['settings-about', '.card.settings', null, 'about'],
  ];
}
