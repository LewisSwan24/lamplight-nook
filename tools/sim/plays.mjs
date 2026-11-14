// The scripted commissions the stand-in Claude plays. One play per kind of commission, picked from the prompt
// the app sends, in the language the prompt asks for. Every play writes real files, so the result card,
// the works shelf and "change it again" all have something to work with.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const BOM = '';

/** Text the plays say and write, per language. Player-facing words only appear in commission output. */
const T = {
  zh: {
    planDemo: '计划：\n1. 让小橘查一查记账页面通常有什么\n2. 写页面\n3. 用 node check.js 检查',
    page: ['看清楚要做什么样的页面', '请青黛定配色和布局', '搭好页面的骨架', '写上内容和按钮', '让填的东西能存住', '请老石检查一遍', '收尾，写几句说明'],
    research: ['弄清楚要查什么', '请小橘去查资料', '挑出靠得住的几条', '写成一份总结', '请老石核对来源'],
    edit: ['读一遍原稿', '理顺句子和顺序', '写出修改版', '请老石对照原稿看看'],
    tidy: ['看文件清单', '按用途分几类', '找出重复和旧版本', '写成整理方案', '请老石核对'],
    letter: ['想清楚写给谁、说什么', '写开头和正文', '空出不知道的日期和名字', '请老石读一遍'],
    sheet: ['定好要哪几列', '写表头和示例行', '合计用公式', '请老石检查'],
    plan: ['弄清目标和时间', '按周排好每一步', '留出补课的余地', '列准备清单', '请老石检查'],
    album: ['看你递来的照片', '请青黛定版式', '排顺序、写图说', '做成相册网页', '请老石检查'],
    resume: ['弄清投什么样的工作', '排好一页的版式', '写经历，缺的留空', '请老石检查'],
    notes: ['弄清是哪本书', '请小橘查作者和年份', '写要点和摘录', '请老石检查'],
    travel: ['弄清去哪、几天', '请小橘查开放时间和票价', '按天排行程和预算', '请老石检查'],
    tool: ['弄清要做什么', '做成一个网页工具', '用样例试一试', '请老石检查'],
    materials: '看你递来的材料',
    revise: ['看看上一版', '照你说的改', '请老石再看一眼'],
    lent: ['看看你原有的页面', '照你说的改原有的文件', '加一页联系方式', '请老石检查'],
    lentMark: '小灯屋照你说的改过这里',
    lentPage: '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>联系我们</title></head>\n<body><h1>联系我们</h1><p>电话和地址写在这里。</p></body></html>\n',
    lentDone: '在你原有的页面上改好了，还加了一页联系方式。别的文件都没动。',
    designBrief: '给页面定配色和布局，十五行以内。', designDesc: '定配色和布局', reviewDesc: '检查成品',
    designSummary: '配色：奶油白底、深棕字、一处橘色强调；上面标题，中间主体，底下一行说明。',
    researchBrief: '查一查这件事，只读，三到五句话总结。',
    researchSummary: '找到三处说法：大体一致，只有一处日期不同，已注明。',
    reviewBrief: '检查做好的东西有没有问题，只读。',
    reviewSummary: '结论：基本通过。没有硬伤。',
    reviewDemo: '检查 index.html 有没有问题，只读。',
    colorQ: '页面主色调用哪个？', colorH: '主色', colorHints: ['暖一点，像纸', '清爽一点'],
    noted: (n) => `收到：${n}。我加上。`,
    noteLine: (n) => `按你开会时说的：${n}`,
    checkFail: '检查没过：body 要加 data-ledger-version="1"。我改一下。',
    pickColor: (c) => `用${c}。`,
    leftToMe: (c) => `那我选${c}，看着更暖一点。`,
    keepDrafts: '好，草稿先留着。',
    demoDone: (c) => `做好了：一个记账小页面，主色${c}，能记一笔、分类、看今天的合计，关掉再开也还在。`,
    pageDone: (w) => `做好了：${w}。打开就能用，填的东西会记在这台电脑的浏览器里。`,
    researchDone: (w) => `查好了：${w}。先是三句话的总结，后面是要点和出处，说法不一致的地方标出来了。`,
    editDone: '改好了：理顺了几处长句，调整了段落顺序，原稿一个字没动。',
    tidyDone: '方案写好了：按用途分成四类，标出了几处像是重复的文件。什么都没有移动，照着方案自己动手就行。',
    letterDone: '信写好了：开头先说事，结尾留了感谢。不知道的日期和名字空在方括号里，填上就能寄。',
    sheetDone: '表格做好了：表头和几行示例都在，合计用的是公式，填数字会自动算。',
    planDone: '计划排好了：按周排，每一步都能在一次坐下来时做完，每周留了一天补课。',
    resumeDone: '简历做好了：一页 A4，用浏览器打印成 PDF 就是干净的一页。不知道的地方留在方括号里，按办公室文职的方向写的。',
    notesDone: '读书笔记做好了：先是这本书讲什么，再是要点和摘录，最后留了几个问题。摘录都出自你递来的材料。',
    travelDone: '攻略做好了：按天排的行程、预算表和要带的东西。开放时间和票价都注了出处和查的日期，出发前再核对一下。',
    toolDone: '小工具做好了：1. 打开小工具.html；2. 选一个文件；3. 点「下载结果」。它只读你选的文件，不动电脑上别的东西。',
    toolScriptDone: '脚本写好了：1. 双击启动文件；2. 把文件夹拖进窗口；3. 看过要做的事再确认。',
    albumDone: (n) => `相册做好了：${n} 张照片排成一本，点一张能看大图。照片用的是复制件。`,
    reviseDone: (a) => `改好了：${a}。其他地方没动，上一版也留着。`,
    netRetry: '网络断了一下。',
    stuckTry: '命令没跑通，换个写法再试。',
    letterBody: (w) => `主题：${w}\n\n[称呼]，你好：\n\n写这封信，是想和你说一件事。${w}。\n\n具体的时间定在 [日期]，地点在 [地点]。如果你那天不方便，告诉我一声，我们再约。\n\n谢谢你一直以来的帮忙。\n\n[你的名字]\n[日期]\n`,
    sheetRows: ['日期,项目,分类,金额,备注', '[日期],早餐,吃饭,12,', '[日期],公交卡充值,出行,50,', '[日期],,,,', '[日期],,,,', '合计,,,=SUM(D2:D20),'],
    planBody: (w) => `# ${w}\n\n假设：每周能抽出 3 个晚上，每次一小时左右。\n\n| 周 | 要做的事 | 完成标准 |\n|---|---|---|\n| 第 1 周 | 定好目标，准备材料 | 清单齐了 |\n| 第 2 周 | 每次练一小段 | 能顺下来 |\n| 第 3 周 | 把难的部分拆开练 | 卡住的地方少了 |\n| 第 4 周 | 合起来走一遍，留一天补课 | 从头到尾不停 |\n\n## 准备清单\n- [ ] 一个固定的时间段\n- [ ] 需要的材料\n- [ ] 一个记进度的小本子\n`,
    summaryBody: (w) => `# ${w}\n\n三句话：大多数资料说法一致。有一处日期各说各的，下面写清楚了。如果只记一件事，记第一条。\n\n## 要点\n- 第一条：最常见的做法和理由\n- 第二条：需要注意的例外\n- 第三条：各家说法不一致的地方\n\n## 出处\n- 示例资料一 https://example.org/a\n- 示例资料二 https://example.org/b\n`,
    tidyBody: '# 整理方案\n\n## 建议的分类\n- 工作/：合同、报表\n- 照片/：按年份分\n- 安装包/：用完可以删\n- 待看/：暂时不知道放哪的\n\n## 值得看一眼的\n- 名字里带“副本”“(1)”的文件，像是重复的\n- 一年多没动过的安装包\n\n什么都没有移动，照着做就行。\n',
    reviseLine: (a) => `（照你说的改了：${a}）`,
    pageTitle: '小页面',
    pageLead: '一个能记、能存的小页面。',
    entry: '记一笔', save: '存下', total: '合计',
    albumTitle: '我们的小相册', albumLead: '点一张照片看大图。',
    resumeBody: (w) => `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>简历</title><style>@page{size:A4;margin:16mm}body{font:14px/1.6 system-ui,sans-serif;color:#222;max-width:180mm;margin:20px auto}h1{margin:0}h2{border-bottom:1px solid #999;font-size:15px}@media print{body{margin:0}}</style></head>\n<body><h1>[你的名字]</h1><p>[电话] · [邮箱] · 求职方向：${esc(w)}</p>\n<h2>经历</h2><p>[公司] · [职位] · [起止年月]</p><ul><li>[做过的事]</li></ul>\n<h2>教育</h2><p>[学校] · [专业] · [毕业年份]</p>\n<h2>技能</h2><ul><li>[技能]</li></ul></body></html>\n`,
    notesBody: (w) => `# ${w}\n\n这本书讲的是：[一段话]。作者和年份没查到，先空着。\n\n## 要点\n- 第一个要点\n- 第二个要点\n\n## 摘录\n没有递来摘抄，摘录先空着。\n\n## 想一想\n- 哪一点和你的经历对得上？\n`,
    travelBody: (w) => `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>旅行攻略</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:30px auto;padding:0 16px;color:#333}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head>\n<body><h1>${esc(w)}</h1>\n<h2>第 1 天</h2><p>上午：[景点]（<a href="https://www.openstreetmap.org/search?query=sight">在地图上看</a>）。开放时间 9:00 到 17:00（出处：示例网站，2026-11-14 查）。</p>\n<h2>预算</h2><table><tr><th>项目</th><th>金额</th></tr><tr><td>门票</td><td>[金额]</td></tr></table>\n<h2>要带的东西</h2><ul><li>身份证件</li><li>充电宝</li></ul>\n<p>开放时间和票价会变，出发前再核对一遍。</p></body></html>\n`,
    toolBody: (w) => `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>小工具</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:560px;margin:30px auto;padding:0 16px}</style></head>\n<body><h1>${esc(w)}</h1><input type="file" id="pick"><button id="go">下载结果</button>\n<script>go.onclick=async()=>{const f=pick.files[0];if(!f)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([(await f.text()).toUpperCase()]));a.download='result-'+f.name;a.click()}</script></body></html>\n`,
    revisedHead: '（修改版）',
  },
  en: {
    planDemo: 'Plan:\n1. Have Clem look up what expense pages usually have\n2. Write the page\n3. Check it with node check.js',
    page: ['Work out what the page is for', 'Ask Iris for colours and layout', 'Lay out the page', 'Add the text and buttons', 'Make what you type stay saved', 'Ask Flint to check it', 'Wrap up with a short note'],
    research: ['Pin down the question', 'Send Clem to look it up', 'Keep the sources that hold up', 'Write the summary', 'Ask Flint to check the sources'],
    edit: ['Read the original', 'Smooth the sentences and order', 'Write the revised copy', 'Ask Flint to compare them'],
    tidy: ['Read the file list', 'Sort it into a few groups', 'Spot duplicates and old versions', 'Write the tidy-up plan', 'Ask Flint to check it'],
    letter: ['Who it is for and what to say', 'Write the opening and the body', 'Leave blanks for dates and names', 'Ask Flint to read it'],
    sheet: ['Choose the columns', 'Write the header and examples', 'Use formulas for the totals', 'Ask Flint to check it'],
    plan: ['Pin down the goal and the time', 'Lay out each week', 'Leave room for missed days', 'List what to prepare', 'Ask Flint to check it'],
    album: ['Look at the photos you gave', 'Ask Iris for the layout', 'Order them and write captions', 'Make the album page', 'Ask Flint to check it'],
    resume: ['Work out the kind of job', 'Lay out one page', 'Write it up, blanks for gaps', 'Ask Flint to check it'],
    notes: ['Work out which book', 'Send Clem for the author and year', 'Write the ideas and quotations', 'Ask Flint to check it'],
    travel: ['Where to, and for how long', 'Send Clem for opening hours and prices', 'Lay out the days and the budget', 'Ask Flint to check it'],
    tool: ['Work out what it should do', 'Make it a page in the browser', 'Try it on samples', 'Ask Flint to check it'],
    materials: 'Look at the files you handed over',
    revise: ['Look at the last version', 'Make the change you asked for', 'Ask Flint for another look'],
    lent: ['Look at your pages as they are', 'Change your files as you asked', 'Add a contact page', 'Ask Flint to check'],
    lentMark: 'changed here by the shop, as you asked',
    lentPage: '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Contact us</title></head>\n<body><h1>Contact us</h1><p>Phone and address go here.</p></body></html>\n',
    lentDone: 'Your own pages are changed as you asked, and there is a new contact page. Nothing else was touched.',
    designBrief: 'Propose colours and layout for the page, under fifteen lines.', designDesc: 'Colours and layout', reviewDesc: 'Check the result',
    designSummary: 'Palette: cream background, dark brown text, one orange accent; title on top, the main part in the middle, a note at the bottom.',
    researchBrief: 'Look into this. Read only; sum it up in three to five sentences.',
    researchSummary: 'Found three sources: they mostly agree, one gives a different date, noted.',
    reviewBrief: 'Check the finished work for problems. Read only.',
    reviewSummary: 'Verdict: fine overall. Nothing broken.',
    reviewDemo: 'Check index.html for problems. Read only.',
    colorQ: 'Which main color for the page?', colorH: 'Color', colorHints: ['Warmer, like paper', 'Fresher'],
    noted: (n) => `Got it: ${n}. Adding that.`,
    noteLine: (n) => `As you said in the meeting: ${n}`,
    checkFail: 'The check failed: body needs data-ledger-version="1". Fixing it.',
    pickColor: (c) => `${c} it is.`,
    leftToMe: (c) => `Then ${c}: it feels a little warmer.`,
    keepDrafts: 'All right, the drafts stay.',
    demoDone: (c) => `Done: a small expense tracker in ${c}. You can add an entry with a category and see today's total, and it is still there after closing.`,
    pageDone: (w) => `Done: ${w}. It opens straight away, and what you type is kept in this computer's browser.`,
    researchDone: (w) => `Done: ${w}. A three-sentence summary comes first, then the key points and the sources, with the disagreements marked.`,
    editDone: 'Done: a few long sentences are smoother and the paragraphs are in a clearer order. The original is untouched.',
    tidyDone: 'The plan is ready: four groups by purpose, and a few files that look like duplicates. Nothing was moved; you can follow the plan yourself.',
    letterDone: 'The letter is ready: it gets to the point first and ends with thanks. Dates and names I did not know are left in square brackets.',
    sheetDone: 'The table is ready: a header and a few example rows, with formulas for the total so it adds up as you fill it in.',
    planDone: 'The plan is ready: week by week, each step small enough for one sitting, with a spare day each week.',
    resumeDone: 'The résumé is ready: one A4 page, and "Print to PDF" in the browser gives one clean page. What I did not know is left in square brackets. I shaped it for an office job.',
    notesDone: 'The reading notes are ready: what the book is about, the main ideas, quotations, then a few questions. Every quotation comes from what you handed over.',
    travelDone: 'The travel guide is ready: day by day, a budget table and a packing list. Opening hours and prices carry their source and the date checked; check them again before you set off.',
    toolDone: 'The tool is ready: 1. Open tool.html. 2. Pick a file. 3. Click "Download the result". It only reads the file you pick.',
    toolScriptDone: 'The script is ready: 1. Double-click the launcher. 2. Drop a folder on the window. 3. Look over what it will do, then confirm.',
    albumDone: (n) => `The album is ready: ${n} photos in one page, and clicking one shows it large. It uses copies of the photos.`,
    reviseDone: (a) => `Done: ${a}. Nothing else changed, and the last version is kept.`,
    netRetry: 'The connection dropped for a moment.',
    stuckTry: 'That command did not work. Trying it another way.',
    letterBody: (w) => `Subject: ${w}\n\nDear [name],\n\nI am writing about one thing: ${w}.\n\nIt is set for [date] at [place]. If that day does not suit you, just let me know and we will find another.\n\nThank you for all your help.\n\n[your name]\n[date]\n`,
    sheetRows: ['Date,Item,Category,Amount,Note', '[date],Breakfast,Food,12,', '[date],Bus pass top-up,Travel,50,', '[date],,,,', '[date],,,,', 'Total,,,=SUM(D2:D20),'],
    planBody: (w) => `# ${w}\n\nAssumed: three evenings a week, about an hour each.\n\n| Week | What to do | Done when |\n|---|---|---|\n| Week 1 | Set the goal, gather what you need | The list is complete |\n| Week 2 | Practise one short part each time | It runs through |\n| Week 3 | Take the hard parts apart | Fewer places you get stuck |\n| Week 4 | Put it together, one spare day | Start to finish without stopping |\n\n## To prepare\n- [ ] A fixed time slot\n- [ ] The materials you need\n- [ ] A notebook for progress\n`,
    summaryBody: (w) => `# ${w}\n\nIn three sentences: most sources agree. One date differs between them, noted below. If you remember one thing, remember the first point.\n\n## Key points\n- First: the usual approach and why\n- Second: the exceptions to watch for\n- Third: where the sources disagree\n\n## Sources\n- Example source one https://example.org/a\n- Example source two https://example.org/b\n`,
    tidyBody: '# Tidy-up plan\n\n## Suggested groups\n- Work/: contracts, reports\n- Photos/: by year\n- Installers/: can go once used\n- To sort/: anything unsure\n\n## Worth a look\n- Files with "copy" or "(1)" in the name look like duplicates\n- Installers untouched for over a year\n\nNothing was moved; follow the plan yourself.\n',
    reviseLine: (a) => `(Changed as you asked: ${a})`,
    pageTitle: 'Small page',
    pageLead: 'A small page that remembers what you write.',
    entry: 'Add an entry', save: 'Save', total: 'Total',
    albumTitle: 'Our little album', albumLead: 'Click a photo to see it large.',
    resumeBody: (w) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Résumé</title><style>@page{size:A4;margin:16mm}body{font:14px/1.6 system-ui,sans-serif;color:#222;max-width:180mm;margin:20px auto}h1{margin:0}h2{border-bottom:1px solid #999;font-size:15px}@media print{body{margin:0}}</style></head>\n<body><h1>[your name]</h1><p>[phone] · [email] · Aiming for: ${esc(w)}</p>\n<h2>Experience</h2><p>[company] · [job title] · [from and to]</p><ul><li>[what you did]</li></ul>\n<h2>Education</h2><p>[school] · [subject] · [year]</p>\n<h2>Skills</h2><ul><li>[skill]</li></ul></body></html>\n`,
    notesBody: (w) => `# ${w}\n\nWhat the book is about: [one paragraph]. The author and year could not be found, so they are left out.\n\n## Main ideas\n- The first idea\n- The second idea\n\n## Quotations\nNothing was handed over to quote from, so there are none yet.\n\n## To think about\n- Which idea fits your own experience?\n`,
    travelBody: (w) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Travel guide</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:30px auto;padding:0 16px;color:#333}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head>\n<body><h1>${esc(w)}</h1>\n<h2>Day 1</h2><p>Morning: [a sight] (<a href="https://www.openstreetmap.org/search?query=sight">see it on a map</a>). Open 9:00 to 17:00 (source: an example site, checked 2026-11-14).</p>\n<h2>Budget</h2><table><tr><th>Item</th><th>Amount</th></tr><tr><td>Tickets</td><td>[amount]</td></tr></table>\n<h2>Packing list</h2><ul><li>ID</li><li>A power bank</li></ul>\n<p>Opening hours and prices change: check them again before you set off.</p></body></html>\n`,
    toolBody: (w) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Small tool</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:560px;margin:30px auto;padding:0 16px}</style></head>\n<body><h1>${esc(w)}</h1><input type="file" id="pick"><button id="go">Download the result</button>\n<script>go.onclick=async()=>{const f=pick.files[0];if(!f)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([(await f.text()).toUpperCase()]));a.download='result-'+f.name;a.click()}</script></body></html>\n`,
    revisedHead: '(revised)',
  },
};

const quoted = (prompt, before) => (prompt.match(new RegExp(`${before}\\s*"([^"]+)"`)) ?? [])[1];
/** The request as a short object for the summary: "帮我做一个签到的小网页。" -> "签到的小网页". */
const want = (prompt) => ((prompt.match(/The user's request: (.*)/) ?? [])[1] ?? '').trim()
  .replace(/^(请|麻烦)?(帮我|给我|替我)?(做|写|查一查|查|排|整理|改)?(一下)?(一个|一份|一封|一本|个|份|封|本)?/, '')
  .replace(/^(please\s+)?((make|write|plan out|plan|look into|build)\s+)?(me\s+)?(a\s+|an\s+)?/i, '')
  .replace(/[。.！!…]+$/, '');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Pick the play for a prompt. A resumed session keeps its play; a request for changes starts a round of changes. */
export function pickPlay(prompt, state) {
  state.lang = /Simplified Chinese/.test(prompt) ? 'zh' : 'en';
  state.vars ??= {};
  if (/called the staff together/.test(prompt)) return plays.carryOn; // a note arrived as the first message: rare
  if (/asks for a change/.test(prompt)) {
    state.done = 0;
    state.vars.ask = (prompt.match(/asks for a change: "([^"]+)"/) ?? [])[1] ?? '';
    return plays.revise;
  }
  if (/stopped part-way/.test(prompt) && state.play && plays[state.play]) return plays[state.play];
  if (/interrupted\. Files it made/.test(prompt)) state.done = 0;
  if (/node check\.js/.test(prompt)) return plays.demo;
  state.vars.want = want(prompt);
  state.vars.materialsDir = quoted(prompt, 'Copies are in the folder') ?? quoted(prompt, 'using the photos in the folder');
  if (/This folder is the user's own/.test(prompt)) return plays.lent;
  if (/single self-contained page named "index\.html", using the photos/.test(prompt)) return plays.album;
  if (/write the findings as/.test(prompt)) { state.vars.out = quoted(prompt, 'write the findings as'); return plays.research; }
  if (/Write the edited version as/.test(prompt)) {
    state.vars.source = quoted(prompt, 'The document to work on is');
    state.vars.out = quoted(prompt, 'Write the edited version as');
    return plays.edit;
  }
  if (/plan for tidying it up as/.test(prompt)) {
    state.vars.listing = (prompt.match(/^"([^"]+)" lists what is in/m) ?? [])[1];
    state.vars.out = quoted(prompt, 'plan for tidying it up as');
    return plays.tidy;
  }
  if (/This is a letter or an email/.test(prompt)) { state.vars.out = quoted(prompt, 'Write it as'); return plays.letter; }
  if (/This is a table/.test(prompt)) { state.vars.out = quoted(prompt, 'Write it as'); return plays.sheet; }
  if (/This is a plan/.test(prompt)) { state.vars.out = quoted(prompt, 'Write it as'); return plays.plan; }
  if (/This is a résumé/.test(prompt)) { state.vars.out = quoted(prompt, 'single self-contained page named'); return plays.resume; }
  if (/These are reading notes/.test(prompt)) { state.vars.out = quoted(prompt, 'Write them as'); return plays.notes; }
  if (/This is a travel guide/.test(prompt)) { state.vars.out = 'index.html'; return plays.travel; }
  // A small tool: a page in the browser, unless the request is to rename or delete files. Then it writes a script and
  // its launcher, careful (a preview, -Apply to act) for renaming and careless (deletes at once) for deleting, so the
  // result card's warning can be seen. The stand-in never runs either.
  if (/This is a small tool/.test(prompt)) {
    if (/改名|删|rename|delete/i.test(state.vars.want)) {
      state.vars.out = quoted(prompt, 'PowerShell script named');
      state.vars.launcher = quoted(prompt, 'and next to it');
      state.vars.careless = /删|delete/i.test(state.vars.want);
      return plays.toolScript;
    }
    state.vars.out = quoted(prompt, 'single self-contained page named');
    return plays.tool;
  }
  return plays.page;
}

/** Look at what the user handed over, one Read per file. */
async function lookAtMaterials(s) {
  const dir = s.state.vars.materialsDir;
  if (!dir || !existsSync(join(s.cwd, dir))) return [];
  const files = readdirSync(join(s.cwd, dir));
  for (const f of files) await s.step(() => s.read(join(dir, f)));
  return files;
}

/** Meeting notes picked up so far, said out loud once each. */
async function takeNotes(s, t) {
  const before = s.state.notes.length;
  if (!s.notes()) return;
  for (const n of s.state.notes.slice(before)) await s.say(t.noted(n));
}

const designer = (s, t) => s.step(() => s.agent('designer', t.designDesc, t.designBrief, async (a) => {
  await s.pause(1.5);
  if (existsSync(join(s.cwd, 'index.html'))) await s.read('index.html', a);
}, t.designSummary));

const reviewer = (s, t, file) => s.step(() => s.agent('reviewer', t.reviewDesc, t.reviewBrief, async (a) => {
  await s.read(file, a);
}, t.reviewSummary));

const researcher = (s, t, topic) => s.step(() => s.agent('researcher', [...topic].slice(0, 12).join(''), t.researchBrief, async (a) => {
  await s.tool('WebSearch', { query: topic.slice(0, 30) }, { ...a, effect: () => ({ text: 'Web search results (simulated).' }) });
  await s.tool('WebFetch', { url: 'https://example.org/notes', prompt: 'Summarize' }, { ...a, effect: () => ({ text: 'Fetched (simulated).' }) });
}, t.researchSummary));

/** A twist on any play, from SIM_SCENARIO: a dropped connection, a long command, a stubborn failure. */
async function twist(s, t, scenario) {
  if (scenario === 'neterror' && !s.state.vars.netDone) {
    await s.step(async () => {
      s.state.vars.netDone = true;
      await s.say(t.netRetry);
      s.fail('API Error: Connection error. fetch failed (ECONNRESET)');
    });
  }
  if (scenario === 'longwait') await s.step(() => s.tool('Bash', { command: 'node --version', description: 'wait' }, { slow: 50, effect: () => ({ text: 'v22' }) }));
  if (scenario === 'stuck') {
    for (let i = 0; i < 3; i++) await s.step(() => s.tool('Bash', { command: 'node build.js', description: 'build' }, { effect: () => ({ text: 'Error: Cannot find module build.js', error: true }) }));
    await s.step(() => s.say(t.stuckTry));
  }
}

/** A plan of to-dos, ticked off one by one as each part of the work runs. */
function planner(s, items) {
  let at = 0;
  return {
    start: () => s.step(() => s.todo(items, 0)),
    next: () => { at++; return s.step(() => s.todo(items, at)); },
    end: () => s.step(() => s.todo(items, items.length)),
  };
}

function pageHtml(t, title, lang, notes, color = '#fbf6ec') {
  const extra = notes.map((n) => `<p class="note">${esc(t.noteLine(n))}</p>`).join('\n');
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
:root{--bg:${color};--ink:#3b2a20;--accent:#c0673a}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,sans-serif}
main{max-width:560px;margin:40px auto;padding:0 20px}h1{font-size:28px}
form{display:flex;gap:8px}input{flex:1;padding:8px}button{background:var(--accent);color:#fff;border:0;padding:8px 14px;border-radius:6px}
.note{color:#7a6555;font-size:14px}
</style></head>
<body data-ledger-version="1"><main>
<h1>${esc(title)}</h1><p>${esc(t.pageLead)}</p>
<form id="f"><input id="item" placeholder="${esc(t.entry)}"><input id="amount" type="number" step="0.01"><button>${esc(t.save)}</button></form>
<ul id="list"></ul><p><b>${esc(t.total)}</b> <span id="total">0</span></p>
${extra}
</main>
<script>
const KEY='lamplight-page';const items=JSON.parse(localStorage.getItem(KEY)||'[]');
const draw=()=>{list.innerHTML=items.map(i=>'<li>'+i.item+' '+i.amount+'</li>').join('');total.textContent=items.reduce((a,i)=>a+Number(i.amount||0),0)};
f.onsubmit=(e)=>{e.preventDefault();items.push({item:item.value,amount:amount.value});localStorage.setItem(KEY,JSON.stringify(items));draw();f.reset()};draw();
</script></body></html>
`;
}

export const plays = {
  /** The fixed demo commission, step for step as the storyboard has it. */
  demo: {
    name: 'demo',
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const lang = s.state.lang;
      const colors = lang === 'zh' ? ['奶油白', '浅薄荷'] : ['Cream', 'Mint'];
      await s.step(() => s.say(t.planDemo));
      await s.step(() => s.think(1));
      await researcher(s, t, lang === 'zh' ? '记账页面通常有哪些部分' : 'What expense pages usually have');
      await twist(s, t, scenario);
      await s.step(() => s.write('draft-1.html', '<!-- draft 1: stacked -->\n'));
      // Real Claude Code often writes a file from the shell with a here-document and lists the folder after it.
      await s.step(() => s.tool('Bash', { command: "cat > draft-2.html <<'EOF'\n<!-- draft 2: cards -->\nEOF\nls", description: 'Write the second draft' }, { effect: () => {
        writeFileSync(join(s.cwd, 'draft-2.html'), '<!-- draft 2: cards -->\n');
        return { text: readdirSync(s.cwd).join('\n') };
      } }));
      await takeNotes(s, t);
      await s.step(() => s.write('index.html', pageHtml(t, lang === 'zh' ? '记账小页面' : 'Expense tracker', lang, s.state.notes).replace(' data-ledger-version="1"', '')));
      // As real runs do: the check on its own, then again with its output trimmed (a pipe, so the exit code is tail's).
      let checks = 0;
      const check = () => s.tool('Bash', { command: checks++ ? 'node check.js 2>&1 | tail -30' : 'node check.js', description: 'Run the acceptance check' }, { effect: () => {
        try {
          return { text: execFileSync(process.execPath, ['check.js'], { cwd: s.cwd, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }) };
        } catch (err) {
          return { text: `Exit code 1\n${err.stdout ?? ''}${err.stderr ?? ''}`, error: true };
        }
      } });
      await s.step(check);
      await s.step(() => s.say(t.checkFail));
      await s.step(() => s.edit('index.html', '<body>', '<body data-ledger-version="1">'));
      await s.step(check);
      await s.step(async () => {
        const picked = await s.ask(t.colorQ, t.colorH, colors.map((c, i) => ({ label: c, description: t.colorHints[i] })));
        s.state.vars.color = picked ?? colors[0];
        await s.say(picked ? t.pickColor(picked) : t.leftToMe(colors[0]));
      });
      await s.step(() => s.edit('index.html', '--bg:#fbf6ec', `--bg:${s.state.vars.color === colors[1] ? '#e6f4ee' : '#fbf6ec'}`));
      await s.step(async () => {
        const r = await s.tool('Bash', { command: 'rm draft-1.html draft-2.html', description: 'delete drafts' }, { effect: () => {
          for (const f of ['draft-1.html', 'draft-2.html']) rmSync(join(s.cwd, f), { force: true });
          return { text: '' };
        } });
        if (r.denied) await s.say(t.keepDrafts);
      });
      await s.step(() => s.agent('reviewer', t.reviewDesc, t.reviewDemo, async (a) => { await s.read('index.html', a); }, t.reviewSummary));
      await takeNotes(s, t);
      await s.finish(t.demoDone(s.state.vars.color));
    },
  },

  /** A small web page: the long to-do list that fills the blackboard and spills over ("N more"). */
  page: {
    name: 'page',
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const w = s.state.vars.want || t.pageTitle;
      const items = [...t.page];
      if (s.state.vars.materialsDir) items.splice(1, 0, t.materials);
      const p = planner(s, items);
      await p.start();
      await s.step(() => s.think(2));
      if (s.state.vars.materialsDir) { await p.next(); await lookAtMaterials(s); }
      await p.next();
      await designer(s, t);
      await twist(s, t, scenario);
      await p.next();
      await s.step(() => s.write('index.html', pageHtml(t, w.slice(0, 30), s.state.lang, [])));
      await p.next();
      await takeNotes(s, t);
      await s.step(() => s.write('index.html', pageHtml(t, w.slice(0, 30), s.state.lang, s.state.notes)));
      await p.next();
      await s.step(() => s.think(1));
      await p.next();
      await reviewer(s, t, 'index.html');
      await p.next();
      await takeNotes(s, t);
      if (s.state.notes.length) await s.step(() => s.write('index.html', pageHtml(t, w.slice(0, 30), s.state.lang, s.state.notes)));
      await p.end();
      await s.finish(t.pageDone(w));
    },
  },

  research: {
    name: 'research',
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const w = s.state.vars.want;
      const p = planner(s, t.research);
      await p.start();
      await s.step(() => s.think(1));
      await p.next();
      await researcher(s, t, w || 'topic');
      await twist(s, t, scenario);
      await p.next();
      await s.step(() => s.think(2));
      await p.next();
      await takeNotes(s, t);
      const notes = s.state.notes.map((n) => `\n> ${t.noteLine(n)}\n`).join('');
      await s.step(() => s.write(s.state.vars.out, t.summaryBody(w) + notes));
      await p.next();
      await reviewer(s, t, s.state.vars.out);
      await p.end();
      await s.finish(t.researchDone(w));
    },
  },

  edit: {
    name: 'edit',
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const p = planner(s, t.edit);
      await p.start();
      await s.step(() => s.read(s.state.vars.source));
      await p.next();
      await s.step(() => s.think(2));
      await twist(s, t, scenario);
      await p.next();
      const original = existsSync(join(s.cwd, s.state.vars.source)) ? readFileSync(join(s.cwd, s.state.vars.source), 'utf8') : '';
      const revised = original.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').replace(/^(.*)$/m, (first) => `${first} ${t.revisedHead}`);
      await s.step(() => s.write(s.state.vars.out, revised));
      await p.next();
      await reviewer(s, t, s.state.vars.out);
      await p.end();
      await s.finish(t.editDone);
    },
  },

  tidy: {
    name: 'tidy',
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const p = planner(s, t.tidy);
      await p.start();
      if (s.state.vars.listing) await s.step(() => s.read(s.state.vars.listing));
      await p.next();
      await s.step(() => s.think(2));
      await p.next();
      await twist(s, t, scenario);
      await p.next();
      await s.step(() => s.write(s.state.vars.out, t.tidyBody));
      await p.next();
      await reviewer(s, t, s.state.vars.out);
      await p.end();
      await s.finish(t.tidyDone);
    },
  },

  letter: simpleText('letter', (t, w) => t.letterBody(w), (t) => t.letterDone),
  sheet: simpleText('sheet', (t) => BOM + t.sheetRows.join('\r\n') + '\r\n', (t) => t.sheetDone),
  plan: simpleText('plan', (t, w) => t.planBody(w), (t) => t.planDone),
  resume: simpleText('resume', (t, w) => t.resumeBody(w), (t) => t.resumeDone),
  notes: simpleText('notes', (t, w) => t.notesBody(w), (t) => t.notesDone, { research: true }),
  travel: simpleText('travel', (t, w) => t.travelBody(w), (t) => t.travelDone, { research: true }),
  tool: simpleText('tool', (t, w) => t.toolBody(w), (t) => t.toolDone),

  toolScript: {
    name: 'toolScript',
    async run(s) {
      const t = T[s.state.lang];
      const { out, launcher, careless } = s.state.vars;
      const p = planner(s, t.tool);
      await p.start();
      await s.step(() => s.think(1));
      await p.next();
      await s.step(() => s.write(out, careless ? CARELESS_SCRIPT : CAREFUL_SCRIPT));
      await s.step(() => s.write(launcher, `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${out}"\r\n`));
      await p.next();
      await reviewer(s, t, out);
      await p.end();
      await s.finish(t.toolScriptDone);
    },
  },

  album: {
    name: 'album',
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const p = planner(s, t.album);
      await p.start();
      const files = await lookAtMaterials(s);
      const photos = files.filter((f) => /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(f));
      await p.next();
      await designer(s, t);
      await twist(s, t, scenario);
      await p.next();
      await s.step(() => s.think(2));
      await p.next();
      const dir = s.state.vars.materialsDir;
      const title = s.state.vars.want ? s.state.vars.want.slice(0, 24) : t.albumTitle;
      const figs = photos.map((f, i) => `<figure><img src="${encodeURI(`${dir}/${f}`)}" alt=""><figcaption>${i + 1}</figcaption></figure>`).join('\n');
      const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:0;background:#f6efe3;font:16px system-ui;color:#3b2a20}main{max-width:900px;margin:30px auto;padding:0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}figure{margin:0;background:#fff;padding:8px;border-radius:6px}img{width:100%;cursor:zoom-in}#big{position:fixed;inset:0;background:#000c;display:none;place-items:center}#big img{max-width:92vw;max-height:92vh}</style></head>\n<body><main><h1>${esc(title)}</h1><p>${esc(t.albumLead)}</p><div class="grid">\n${figs}\n</div></main><div id="big" onclick="this.style.display='none'"><img></div>\n<script>document.querySelectorAll('figure img').forEach(i=>i.onclick=()=>{big.querySelector('img').src=i.src;big.style.display='grid'})</script></body></html>\n`;
      await s.step(() => s.write('index.html', html));
      await p.next();
      await reviewer(s, t, 'index.html');
      await p.end();
      await s.finish(t.albumDone(photos.length));
    },
  },

  /** A round of changes on finished work, in the same folder. */
  revise: {
    name: 'revise',
    async run(s) {
      const t = T[s.state.lang];
      const ask = s.state.vars.ask || '';
      const main = ['index.html', s.state.vars.out].find((f) => f && existsSync(join(s.cwd, f)))
        ?? readdirSync(s.cwd).find((f) => /\.(html|md|txt|csv)$/.test(f) && !/^(check\.js)$/.test(f));
      const p = planner(s, t.revise);
      await p.start();
      if (main) await s.step(() => s.read(main));
      await p.next();
      if (/颜色|色|浅|深|colou?r|lighter|darker/i.test(ask)) await designer(s, t);
      if (main) {
        await s.step(() => {
          const text = readFileSync(join(s.cwd, main), 'utf8');
          const line = t.reviseLine(ask);
          return /\.html?$/.test(main)
            ? s.edit(main, '</main>', `<p class="note">${esc(line)}</p>\n</main>`)
            : s.write(main, `${text.trimEnd()}\n\n${line}\n`);
        });
      }
      await p.next();
      if (main) await reviewer(s, t, main);
      await p.end();
      await s.finish(t.reviseDone(ask));
    },
  },

  /**
   * Work in a folder the user lent: change two of their own pages or styles where they are (the first two .html or
   * .css files by name), add a contact page in a new folder, and leave everything else alone.
   */
  lent: {
    name: 'lent',
    async run(s) {
      const t = T[s.state.lang];
      const p = planner(s, t.lent);
      await p.start();
      const theirs = readdirSync(s.cwd).filter((f) => /\.(html|css)$/.test(f)).sort().slice(0, 2);
      for (const f of theirs) await s.step(() => s.read(f));
      await p.next();
      for (const f of theirs) {
        await s.step(() => {
          const mark = /\.css$/.test(f) ? `/* ${t.lentMark} */` : `<!-- ${t.lentMark} -->`;
          return s.write(f, `${readFileSync(join(s.cwd, f), 'utf8').trimEnd()}\n${mark}\n`);
        });
      }
      await p.next();
      await s.step(() => s.write('pages/contact.html', t.lentPage));
      await p.next();
      await reviewer(s, t, theirs[0] ?? 'pages/contact.html');
      await p.end();
      await s.finish(t.lentDone);
    },
  },

  /** Only reached when a meeting note somehow comes first; just finish politely. */
  carryOn: {
    name: 'carryOn',
    async run(s) {
      await s.finish(T[s.state.lang].reviseDone(''));
    },
  },
};

/** What the tool template asks for: a preview by default, -Apply to act, nothing deleted. */
const CAREFUL_SCRIPT = [
  'param([string]$Path, [switch]$Apply)',
  '# Only renames; nothing is deleted.',
  'foreach ($f in Get-ChildItem -LiteralPath $Path -File) {',
  '  $new = $f.LastWriteTime.ToString("yyyy-MM-dd_HHmmss") + $f.Extension',
  '  if ($Apply) { Rename-Item -LiteralPath $f.FullName -NewName $new } else { Write-Host "$($f.Name) -> $new" }',
  '}',
  '',
].join('\r\n');
/** What it forbids: deleting, straight away, with no preview. */
const CARELESS_SCRIPT = [
  'param([string]$Path)',
  'Get-ChildItem -LiteralPath $Path -Filter *.tmp | Remove-Item',
  '',
].join('\r\n');

/**
 * The letter, the table, the plan, the résumé, the reading notes, the travel guide and the small tool: a short to-do
 * list, one file, a review. `research`: the researcher looks something up first (the book's facts, opening hours).
 */
function simpleText(name, body, done, { research = false } = {}) {
  return {
    name,
    async run(s, { scenario }) {
      const t = T[s.state.lang];
      const items = [...t[name]];
      if (s.state.vars.materialsDir) items.splice(1, 0, t.materials);
      const p = planner(s, items);
      await p.start();
      await s.step(() => s.think(1));
      if (s.state.vars.materialsDir) { await p.next(); await lookAtMaterials(s); }
      await p.next();
      if (research) await researcher(s, t, s.state.vars.want || name);
      await twist(s, t, scenario);
      await s.step(() => s.think(1));
      await p.next();
      await takeNotes(s, t);
      const notes = s.state.notes.map((n) => `\n${t.noteLine(n)}\n`).join('');
      await s.step(() => s.write(s.state.vars.out, body(t, s.state.vars.want || '') + notes));
      await p.next();
      await reviewer(s, t, s.state.vars.out);
      await p.end();
      await s.finish(done(t));
    },
  };
}
