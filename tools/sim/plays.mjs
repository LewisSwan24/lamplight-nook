// The scripted commissions the stand-in Claude plays. One play per kind of commission, picked from the prompt
// the app sends, in the language the prompt asks for. Every play writes real files, so the result card,
// the works shelf and "change it again" all have something to work with.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ledgerBook } from './ledger.mjs';

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
    chart: ['弄清要画哪些数字', '挑合适的图', '画好，存成图片', '请老石检查'],
    poster: ['弄清用在哪儿、多大', '排好版式', '画好，存成图片', '请老石检查'],
    chartDone: '图表画好了：一张图片，数字都照抄你给的，柱子从零画起，底下写了数据从哪来。画它用的网页也在旁边。',
    posterDone: '海报做好了：按用处定的尺寸存成图片，A4 的另外存了一份 PDF 方便打印。没给的时间地点留在方括号里。',
    chartWords: { sample: [['一月', 12], ['二月', 18], ['三月', 9]], source: '数据：你在要求里给的数字', unit: '数量' },
    posterWords: { when: '[日期和时间]', where: '[地点]', more: '欢迎带朋友来' },
    // The bakery's two kinds (plan-1.6.md F1).
    menu: ['把菜名和价钱理一遍', '按类分好，价钱对齐', '画好，存成图片和 PDF', '请老石核对价钱'],
    menuDone: '菜单做好了：一张 A4 的图片，另存了一份 PDF 方便打印。菜名和价钱都照你给的抄，没给价钱的留在方括号里。',
    menuWords: { place: '小店菜单', sample: [['葱油饼', 8], ['豆浆', 3], ['肉包', 4]], missing: '[价格]', groups: ['吃的', '喝的'], drinks: /浆|奶|咖啡|汁|茶$/ },
    recipe: ['问清是哪道菜、几人份', '列用料和分量', '一步一步写做法', '请老石照着读一遍'],
    recipeDone: '食谱写好了：一份 Word 文档，用料、步骤和要注意的地方都在里面。分量是家常的量，可以照口味调。',
    card: ['问清是什么日子、给谁', '挑颜色，写祝福', '画好，存成图片和 PDF', '请老石核对名字'],
    cardDone: '贺卡做好了：一张明信片大小的图片，另存了一份 PDF 方便打印。名字照你给的写，没给的留在方括号里。',
    cardWords: { greeting: '生日快乐', line: '愿你每天都有好咖啡喝。', from: '——[你的名字]' },
    newsletter: ['把这期要讲的事理一遍', '分条写，要紧的放前头', '排成文档，另存一份 PDF', '请老石核对日子'],
    newsletterDone: '简报做好了：一份 Word 文档，另存了一份 PDF 可以贴出去。日子和地点单列在最后，没给的留在方括号里。',
    newsletterDoc: (w) => ({ title: w || '楼里简报', blocks: [{ p: '第 [期数] 期' }, { h: 1, text: '周六义诊' }, { p: '社区医院的医生周六上午来，量血压、看看小毛病。' }, { h: 1, text: '楼道自行车' }, { p: '请把自行车停到楼后车棚，楼道留给人走。' }, { h: 1, text: '近期安排' }, { list: ['周六 9:00 义诊，一楼活动室', '[日期] 大扫除'] }] }),
    // Revision cards (plan-1.8.md H1): every card comes from a "term: what it is" line of the material.
    flashcards: ['读一遍你给的材料', '挑出要记的，一条一张卡', '排成能裁开的卡片，存成 PDF', '出一页十道题的小测', '请老石对照材料核一遍'],
    flashcardsDone: '复习卡片做好了：问答卡排成了能打印裁开的 PDF，正反面对得上；另有一页十道题的小测，答案在背面。题目都出自你给的材料。',
    // A family ledger (plan-1.8.md H5): the empty book of ledger.mjs, made with make_xlsx.
    ledgerbook: ['定好每月一页记哪几栏', '列出收入支出的分类', '月底小结和饼图用公式', '做成 Excel 账本', '请老石核对公式'],
    ledgerbookDone: '家庭账本做好了：1 月到 12 月每月一页，分类在单独一页，改了每月的小结跟着变。月底小结和饼图都是公式，填上数就自己算。',
    cards: {
      title: '复习卡片', quiz: '小测', answers: '答案', from: '出自材料：', name: '姓名：________',
      ask: (term) => `${term}是什么？`, blank: (term) => `${term}：________`,
      sample: [['光合作用', '植物用光把二氧化碳和水变成糖和氧气。'], ['叶绿体', '植物细胞里做光合作用的地方。'], ['气孔', '叶子背面进出气体的小孔。']],
    },
    newsletterPage: (w) => `<!doctype html>\n<html><head><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font-family:system-ui,sans-serif;color:#2a2233}h1{color:#34765a}</style></head><body><h1>${esc(w || '楼里简报')}</h1><p>第 [期数] 期</p><h2>周六义诊</h2><p>社区医院的医生周六上午来，量血压、看看小毛病。</p><h2>楼道自行车</h2><p>请把自行车停到楼后车棚，楼道留给人走。</p><h2>近期安排</h2><ul><li>周六 9:00 义诊，一楼活动室</li><li>[日期] 大扫除</li></ul></body></html>\n`,
    recipeDoc: (w) => ({ title: w || '食谱', blocks: [{ p: '两人份，准备 15 分钟，做 20 分钟。分量是家常的量，可以照口味调。' }, { h: 1, text: '用料' }, { list: ['面粉 200 克', '温水 120 毫升', '葱 3 根', '盐 3 克'] }, { h: 1, text: '做法' }, { list: ['1. 面粉加温水揉成团，盖上布醒 15 分钟。', '2. 擀成薄片，抹油撒葱和盐，卷起再擀开。', '3. 中火烙到两面金黄，约 6 分钟。'] }, { h: 1, text: '要注意' }, { list: ['含小麦（面筋）。', '油温太高容易外焦里生。'] }] }),
    notes: ['弄清是哪本书', '请小橘查作者和年份', '写要点和摘录', '请老石检查'],
    travel: ['弄清去哪、几天', '请小橘查开放时间和票价', '按天排行程和预算', '请老石检查'],
    tool: ['弄清要做什么', '做成一个网页工具', '用样例试一试', '请老石检查'],
    document: ['弄清这份文档给谁看', '列好标题和段落', '交给工具做成 Word 文件', '请老石检查'],
    slides: ['定好讲哪几点', '一页只讲一件事', '交给工具做成 PPT', '请老石检查'],
    materials: '看你递来的材料',
    revise: ['看看上一版', '照你说的改', '请老石再看一眼'],
    lent: ['看看你原有的页面', '照你说的改原有的文件', '加一页联系方式', '请老石检查'],
    lentMark: '小灯屋照你说的改过这里',
    lentPage: '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>联系我们</title></head>\n<body><h1>联系我们</h1><p>电话和地址写在这里。</p></body></html>\n',
    lentDone: '在你原有的页面上改好了，还加了一页联系方式。别的文件都没动。',
    designBrief: '给页面定配色和布局，十五行以内。', designDesc: '定配色和布局', reviewDesc: '检查成品',
    designSummary: '配色：奶油白底、深棕字、一处橘色强调；上面标题，中间主体，底下一行说明。',
    researchBrief: '查一查这件事，只读，三到五句话总结。',
    errands: ['开门时间', '附近的店', '别人怎么做'],
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
    sheetDone: 'Excel 表格做好了：表头和几行示例都在，第一行冻结，合计用的是公式，填数字会自动算。',
    documentDone: 'Word 文档做好了：标题、要点、一张分工表都在，不知道的时间和人名空在方括号里。',
    slidesDone: 'PPT 做好了：一页封面，一页要点，讲的话写在备注里。',
    planDone: '计划排好了：按周排，每一步都能在一次坐下来时做完，每周留了一天补课。',
    resumeDone: '简历做好了：一页 A4，另外存了一份 PDF，可以直接发出去。不知道的地方留在方括号里，按办公室文职的方向写的。',
    notesDone: '读书笔记做好了：先是这本书讲什么，再是要点和摘录，最后留了几个问题。摘录都出自你递来的材料。',
    journal: ['弄清去哪、几天', '请小橘查开放时间和票价', '排成一页手账，画路线图', '存成 PDF，再看一遍', '请老石检查'],
    journalDone: '手账做好了：一页 A4，三天的路线和清单，还有一张手画的路线图，存成了 PDF。开放时间注了出处，出发前再核对一下。',
    travelDone: '攻略做好了：按天排的行程、预算表和要带的东西。开放时间和票价都注了出处和查的日期，出发前再核对一下。',
    toolDone: '小工具做好了：1. 打开小工具.html；2. 选一个文件；3. 点「下载结果」。它只读你选的文件，不动电脑上别的东西。',
    toolScriptDone: '脚本写好了：1. 双击启动文件；2. 把文件夹拖进窗口；3. 看过要做的事再确认。',
    albumDone: (n) => `相册做好了：${n} 张照片排成一本，点一张能看大图。照片用的是复制件。`,
    reviseDone: (a) => `改好了：${a}。其他地方没动，上一版也留着。`,
    netRetry: '网络断了一下。',
    stuckTry: '命令没跑通，换个写法再试。',
    letterBody: (w) => `主题：${w}\n\n[称呼]，你好：\n\n写这封信，是想和你说一件事。${w}。\n\n具体的时间定在 [日期]，地点在 [地点]。如果你那天不方便，告诉我一声，我们再约。\n\n谢谢你一直以来的帮忙。\n\n[你的名字]\n[日期]\n`,
    planBody: (w) => `# ${w}\n\n假设：每周能抽出 3 个晚上，每次一小时左右。\n\n| 周 | 要做的事 | 完成标准 |\n|---|---|---|\n| 第 1 周 | 定好目标，准备材料 | 清单齐了 |\n| 第 2 周 | 每次练一小段 | 能顺下来 |\n| 第 3 周 | 把难的部分拆开练 | 卡住的地方少了 |\n| 第 4 周 | 合起来走一遍，留一天补课 | 从头到尾不停 |\n\n## 准备清单\n- [ ] 一个固定的时间段\n- [ ] 需要的材料\n- [ ] 一个记进度的小本子\n`,
    summaryBody: (w, flawed) => `# ${w}\n\n三句话：大多数资料说法一致 [1]。有一处日期各说各的 [2]，下面写清楚了。如果只记一件事，记第一条。\n\n## 要点\n- 第一条：最常见的做法和理由 [1]\n- 第二条：需要注意的例外 [2]\n- 第三条：各家说法不一致的地方 [1][2]\n${flawed ? '- 第四条：一个没标编号的说法\n- 第五条：一个少有人提的说法 [3]\n- 阳台上能种一整年（未找到出处）\n' : ''}\n## 出处\n1. 示例资料一 https://example.org/a\n2. 示例资料二 https://example.org/b\n${flawed ? '3. 示例资料三 https://example.org/never\n' : ''}`,
    sourceTitles: ['示例资料一', '示例资料二', '示例资料三'],
    unsourced: '阳台上能种一整年',
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
    consult: ['好呀！这是给谁看的？', '明白了。手上有什么材料吗，照片、菜单都行？', '差不多清楚了。想要什么样子：一页网页，还是打印出来的单子？', '都清楚了，可以点“就这样，写成单子”。'],
    consultAudience: '店里的熟客',
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
    chart: ['Work out which numbers', 'Pick the kind of chart', 'Draw it and save the picture', 'Ask Flint to check it'],
    poster: ['Work out where it goes and how big', 'Lay it out', 'Draw it and save the picture', 'Ask Flint to check it'],
    chartDone: 'The chart is drawn: a picture with every number copied from yours, bars from zero, and where the data came from at the bottom. The page it was drawn from is next to it.',
    posterDone: 'The poster is ready: a picture at the size its use calls for, and for A4 a PDF too, to print. What you did not give, the time and the place, is left in square brackets.',
    chartWords: { sample: [['January', 12], ['February', 18], ['March', 9]], source: 'Data: the numbers in your request', unit: 'Count' },
    posterWords: { when: '[date and time]', where: '[place]', more: 'Bring a friend' },
    menu: ['Go through the dishes and prices', 'Group them and line the prices up', 'Draw it, save the picture and a PDF', 'Ask Flint to check the prices'],
    menuDone: 'The menu is ready: an A4 picture, and a PDF of it to print. Every dish and price is copied from yours; a missing price is left in square brackets.',
    menuWords: { place: 'Our menu', sample: [['Scallion pancake', 8], ['Soy milk', 3], ['Pork bun', 4]], missing: '[price]', groups: ['To eat', 'To drink'], drinks: /milk|coffee|juice|tea$/i },
    recipe: ['Ask which dish and for how many', 'List what goes in, with amounts', 'Write the steps one by one', 'Ask Flint to read it through'],
    recipeDone: 'The recipe is written: a Word document with what goes in, the steps and what to watch out for. The amounts are everyday ones; adjust to taste.',
    card: ['Ask what the day is and who it is for', 'Pick the colours, write the wish', 'Draw it, save the picture and a PDF', 'Ask Flint to check the names'],
    cardDone: 'The card is ready: a postcard-sized picture, and a PDF of it to print. Names are as you gave them; a missing one is left in square brackets.',
    cardWords: { greeting: 'Happy birthday', line: 'Good coffee, every day of the year.', from: '— [your name]' },
    newsletter: ['Go through what this issue covers', 'Write it up, the big news first', 'Lay it out as a document, save a PDF', 'Ask Flint to check the dates'],
    newsletterDone: 'The newsletter is ready: a Word document, and a PDF to pin up. Dates and places are listed at the end; a missing one is left in square brackets.',
    newsletterDoc: (w) => ({ title: w || 'Block newsletter', blocks: [{ p: 'Issue [number]' }, { h: 1, text: 'Saturday clinic' }, { p: 'Doctors from the community hospital come on Saturday morning to check blood pressure and small complaints.' }, { h: 1, text: 'Bikes in the hallway' }, { p: 'Please leave bikes in the shed behind the block, so the hallway stays clear.' }, { h: 1, text: 'Coming up' }, { list: ['Saturday 9:00, clinic, ground-floor room', '[date], spring cleaning'] }] }),
    flashcards: ['Read the material you handed over', 'Pick what to remember, one card each', 'Lay out cards to cut apart, save a PDF', 'Write a ten-question quiz', 'Ask Flint to check them against the material'],
    flashcardsDone: 'The revision cards are ready: a PDF of cards to print and cut apart, each answer on the back of its question, and a ten-question quiz with the answers on the back. Every question comes from your material.',
    ledgerbook: ['Choose the columns for a month', 'List the categories for money in and out', 'Use formulas for the summary and pie', 'Make the Excel ledger', 'Ask Flint to check the formulas'],
    ledgerbookDone: 'The family ledger is ready: a sheet for each month from January to December, and the categories on a sheet of their own, which every month\'s summary follows. The summaries and pie charts are formulas, so they work themselves out as you fill it in.',
    cards: {
      title: 'Revision cards', quiz: 'Quiz', answers: 'Answers', from: 'From the material: ', name: 'Name: ________',
      ask: (term) => `What is ${term}?`, blank: (term) => `${term}: ________`,
      sample: [['Photosynthesis', 'Plants use light to turn carbon dioxide and water into sugar and oxygen.'], ['Chloroplast', 'The part of a plant cell where photosynthesis happens.'], ['Stoma', 'A tiny opening under a leaf that lets gases in and out.']],
    },
    newsletterPage: (w) => `<!doctype html>\n<html><head><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font-family:system-ui,sans-serif;color:#2a2233}h1{color:#34765a}</style></head><body><h1>${esc(w || 'Block newsletter')}</h1><p>Issue [number]</p><h2>Saturday clinic</h2><p>Doctors from the community hospital come on Saturday morning to check blood pressure and small complaints.</p><h2>Bikes in the hallway</h2><p>Please leave bikes in the shed behind the block, so the hallway stays clear.</p><h2>Coming up</h2><ul><li>Saturday 9:00, clinic, ground-floor room</li><li>[date], spring cleaning</li></ul></body></html>\n`,
    recipeDoc: (w) => ({ title: w || 'Recipe', blocks: [{ p: 'Serves two. 15 minutes of work, 20 of cooking. The amounts are everyday ones; adjust to taste.' }, { h: 1, text: 'What goes in' }, { list: ['200 g flour', '120 ml warm water', '3 scallions', '3 g salt'] }, { h: 1, text: 'Steps' }, { list: ['1. Knead the flour and water into a dough; cover and rest for 15 minutes.', '2. Roll it thin, brush with oil, scatter scallions and salt, roll up and flatten again.', '3. Fry on a medium heat until golden on both sides, about 6 minutes.'] }, { h: 1, text: 'Watch out for' }, { list: ['Contains wheat (gluten).', 'Too hot a pan burns the outside before the middle is done.'] }] }),
    notes: ['Work out which book', 'Send Clem for the author and year', 'Write the ideas and quotations', 'Ask Flint to check it'],
    travel: ['Where to, and for how long', 'Send Clem for opening hours and prices', 'Lay out the days and the budget', 'Ask Flint to check it'],
    tool: ['Work out what it should do', 'Make it a page in the browser', 'Try it on samples', 'Ask Flint to check it'],
    document: ['Work out who will read it', 'Lay out headings and paragraphs', 'Have the tool make the Word file', 'Ask Flint to check it'],
    slides: ['Choose the points to make', 'One idea per slide', 'Have the tool make the slides', 'Ask Flint to check it'],
    materials: 'Look at the files you handed over',
    revise: ['Look at the last version', 'Make the change you asked for', 'Ask Flint for another look'],
    lent: ['Look at your pages as they are', 'Change your files as you asked', 'Add a contact page', 'Ask Flint to check'],
    lentMark: 'changed here by the shop, as you asked',
    lentPage: '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Contact us</title></head>\n<body><h1>Contact us</h1><p>Phone and address go here.</p></body></html>\n',
    lentDone: 'Your own pages are changed as you asked, and there is a new contact page. Nothing else was touched.',
    designBrief: 'Propose colours and layout for the page, under fifteen lines.', designDesc: 'Colours and layout', reviewDesc: 'Check the result',
    designSummary: 'Palette: cream background, dark brown text, one orange accent; title on top, the main part in the middle, a note at the bottom.',
    researchBrief: 'Look into this. Read only; sum it up in three to five sentences.',
    errands: ['opening hours', 'shops nearby', 'how others do it'],
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
    sheetDone: 'The Excel table is ready: a header that stays in view, a few example rows, and a formula for the total so it adds up as you fill it in.',
    documentDone: 'The Word document is ready: a title, the main points and a table of who does what. Dates and names I did not know are left in square brackets.',
    slidesDone: 'The slides are ready: a cover and a slide of main points, with what to say in the notes.',
    planDone: 'The plan is ready: week by week, each step small enough for one sitting, with a spare day each week.',
    resumeDone: 'The résumé is ready: one A4 page, and a PDF of it to send straight away. What I did not know is left in square brackets. I shaped it for an office job.',
    notesDone: 'The reading notes are ready: what the book is about, the main ideas, quotations, then a few questions. Every quotation comes from what you handed over.',
    journal: ['Where to, and for how long', 'Send Clem for opening hours and prices', 'Lay out one page, draw the route', 'Save the PDF and look it over', 'Ask Flint to check it'],
    journalDone: 'The travel journal is ready: one A4 page with the three days, a list for each and a hand-drawn map of the route, saved as a PDF. Opening hours carry their source; check them again before you set off.',
    travelDone: 'The travel guide is ready: day by day, a budget table and a packing list. Opening hours and prices carry their source and the date checked; check them again before you set off.',
    toolDone: 'The tool is ready: 1. Open tool.html. 2. Pick a file. 3. Click "Download the result". It only reads the file you pick.',
    toolScriptDone: 'The script is ready: 1. Double-click the launcher. 2. Drop a folder on the window. 3. Look over what it will do, then confirm.',
    albumDone: (n) => `The album is ready: ${n} photos in one page, and clicking one shows it large. It uses copies of the photos.`,
    reviseDone: (a) => `Done: ${a}. Nothing else changed, and the last version is kept.`,
    netRetry: 'The connection dropped for a moment.',
    stuckTry: 'That command did not work. Trying it another way.',
    letterBody: (w) => `Subject: ${w}\n\nDear [name],\n\nI am writing about one thing: ${w}.\n\nIt is set for [date] at [place]. If that day does not suit you, just let me know and we will find another.\n\nThank you for all your help.\n\n[your name]\n[date]\n`,
    planBody: (w) => `# ${w}\n\nAssumed: three evenings a week, about an hour each.\n\n| Week | What to do | Done when |\n|---|---|---|\n| Week 1 | Set the goal, gather what you need | The list is complete |\n| Week 2 | Practise one short part each time | It runs through |\n| Week 3 | Take the hard parts apart | Fewer places you get stuck |\n| Week 4 | Put it together, one spare day | Start to finish without stopping |\n\n## To prepare\n- [ ] A fixed time slot\n- [ ] The materials you need\n- [ ] A notebook for progress\n`,
    summaryBody: (w, flawed) => `# ${w}\n\nIn three sentences: most sources agree [1]. One date differs between them [2], noted below. If you remember one thing, remember the first point.\n\n## Key points\n- First: the usual approach and why [1]\n- Second: the exceptions to watch for [2]\n- Third: where the sources disagree [1][2]\n${flawed ? '- Fourth: a claim with no number\n- Fifth: a claim few make [3]\n- Tomatoes grow all year on a balcony (no source found)\n' : ''}\n## Sources\n1. Example source one https://example.org/a\n2. Example source two https://example.org/b\n${flawed ? '3. Example source three https://example.org/never\n' : ''}`,
    sourceTitles: ['Example source one', 'Example source two', 'Example source three'],
    unsourced: 'Tomatoes grow all year on a balcony',
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
    consult: ['Lovely! Who is it for?', 'I see. Do you have anything to go on, photos or a menu?', 'Nearly there. What should it be: a web page, or a sheet to print?', 'All clear now. You can have it written up as a slip.'],
    consultAudience: 'Regulars at the cafe',
  },
};

const quoted = (prompt, before) => (prompt.match(new RegExp(`${before}\\s*"([^"]+)"`)) ?? [])[1];
/** The request as a short object for the summary: "帮我做一个签到的小网页。" -> "签到的小网页". */
const want = (prompt) => ((prompt.match(/The user's request: (.*)/) ?? [])[1] ?? '').trim()
  .replace(/^(请|麻烦)?(帮我|给我|替我)?(做|写|查一查|查|排|整理|改)?(一下)?(一个|一份|一封|一本|个|份|封|本)?/, '')
  .replace(/^(please\s+)?((make|write|plan out|plan|look into|build)\s+)?(me\s+)?(a\s+|an\s+)?/i, '')
  .replace(/[。.！!…]+$/, '');
/** What the office tools are handed (road-to-1.3.md C1): plain structures, a SUM and nothing that reaches outside. */
const OFFICE = {
  zh: {
    doc: (w) => ({ title: w || '通知', blocks: [{ h: 1, text: '要点' }, { p: '这是一份**示例**文档，按你的要求写成。' }, { list: ['时间：[日期]', '地点：[地点]'] }, { table: { head: ['事项', '负责人'], rows: [['准备', '[姓名]'], ['收尾', '[姓名]']] } }] }),
    sheet: { sheets: [{ name: '记账', freezeHeader: true, columns: [{ header: '日期', width: 12 }, { header: '项目', width: 16 }, { header: '分类' }, { header: '金额', format: 'money' }, { header: '备注', width: 20 }], rows: [['[日期]', '早餐', '吃饭', 12, ''], ['[日期]', '公交卡充值', '出行', 50, ''], ['合计', '', '', { f: '=SUM(D2:D3)' }, '']] }] },
    deck: (w) => ({ title: w || '春季菜单', slides: [{ layout: 'title', title: w || '春季菜单', bullets: ['小灯屋'] }, { layout: 'bullets', title: '要点', bullets: ['第一点', '第二点', '第三点'], notes: '先讲第一点。' }] }),
    files: { docx: '通知.docx', xlsx: '账目.xlsx', pptx: '介绍.pptx', pdf: '传单.pdf' },
    page: '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>传单</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:40px;background:#fbf6ec}h1{color:#8a4b2a}</style></head><body><h1>小灯屋春季菜单</h1><p>柠檬挞、热可可，周末下午三点。</p></body></html>\n',
    officeDone: 'Word、Excel、PPT 各做了一份，又把传单网页存成了 PDF。',
    readDone: '两份文件都读了，内容抄进了一个文本文件。',
    readFile: '读到的内容.txt',
  },
  en: {
    doc: (w) => ({ title: w || 'Notice', blocks: [{ h: 1, text: 'Main points' }, { p: 'This is a **sample** document, written to your request.' }, { list: ['When: [date]', 'Where: [place]'] }, { table: { head: ['Task', 'Who'], rows: [['Set up', '[name]'], ['Clear up', '[name]']] } }] }),
    sheet: { sheets: [{ name: 'Spending', freezeHeader: true, columns: [{ header: 'Date', width: 12 }, { header: 'Item', width: 16 }, { header: 'Category' }, { header: 'Amount', format: 'money' }, { header: 'Note', width: 20 }], rows: [['[date]', 'Breakfast', 'Food', 12, ''], ['[date]', 'Bus pass top-up', 'Travel', 50, ''], ['Total', '', '', { f: '=SUM(D2:D3)' }, '']] }] },
    deck: (w) => ({ title: w || 'Spring menu', slides: [{ layout: 'title', title: w || 'Spring menu', bullets: ['Lamplight Nook'] }, { layout: 'bullets', title: 'Main points', bullets: ['First point', 'Second point', 'Third point'], notes: 'Start with the first point.' }] }),
    files: { docx: 'notice.docx', xlsx: 'costs.xlsx', pptx: 'talk.pptx', pdf: 'flyer.pdf' },
    page: '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Flyer</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:40px;background:#fbf6ec}h1{color:#8a4b2a}</style></head><body><h1>Lamplight Nook spring menu</h1><p>Lemon tart and hot chocolate, weekend afternoons at three.</p></body></html>\n',
    officeDone: 'I made a Word document, an Excel workbook and a deck, and saved the flyer page as a PDF.',
    readDone: 'I read both files and copied what was in them into a text file.',
    readFile: 'what-was-read.txt',
  },
};
/** The files the office play makes, for the scenario to look for. */
export const OFFICE_FILES = { zh: OFFICE.zh.files, en: OFFICE.en.files };
export const OFFICE_READ_FILE = { zh: OFFICE.zh.readFile, en: OFFICE.en.readFile };
/** Call one of the shop's office tools. */
const office = (s, tool, args) => s.mcp('nook-office', tool, args);

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The chart template's default size, and the poster's three (templates.ts). */
const CHART = { width: 1200, height: 800 };
const A4 = { width: 794, height: 1123 };
const posterSize = (w) => (/方|朋友圈|square|social/i.test(w) ? { width: 1080, height: 1080 } : /宽|投屏|wide|screen/i.test(w) ? { width: 1920, height: 1080 } : A4);

/** "一月 120，二月 180" or "Monday: 120, Tuesday: 180" as [label, number] pairs, the numbers as written. */
const pairsIn = (w) => [...w.matchAll(/(\p{L}[\p{L} ]*?)\s*[:：]?\s*(\d+(?:\.\d+)?)/gu)].map((m) => [m[1].trim(), Number(m[2])]);

/** A bar chart as one inline SVG filling CHART: bars from zero, each value written on it, units and source shown. */
function chartPage(t, w) {
  const W = t.chartWords;
  const data = pairsIn(w).length >= 2 ? pairsIn(w) : W.sample;
  const { width, height } = CHART;
  const left = 110, right = 40, top = 120, bottom = 140;
  const max = Math.max(...data.map(([, v]) => v));
  const step = (width - left - right) / data.length;
  const y = (v) => top + (height - top - bottom) * (1 - v / max);
  const bars = data.map(([label, v], i) => {
    const x = left + i * step + step * 0.2;
    return `<rect x="${x}" y="${y(v)}" width="${step * 0.6}" height="${y(0) - y(v)}" fill="#c8743c"/>`
      + `<text x="${x + step * 0.3}" y="${y(v) - 12}" text-anchor="middle" font-size="26">${v}</text>`
      + `<text x="${x + step * 0.3}" y="${y(0) + 40}" text-anchor="middle" font-size="24">${esc(label)}</text>`;
  }).join('');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fffaf0}svg{display:block;font-family:system-ui,sans-serif;fill:#333}</style></head>\n<body><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<text x="${width / 2}" y="70" text-anchor="middle" font-size="40" font-weight="bold">${esc(w || t.chart[0])}</text>`
    + `<line x1="${left}" y1="${top}" x2="${left}" y2="${y(0)}" stroke="#555" stroke-width="2"/><line x1="${left}" y1="${y(0)}" x2="${width - right}" y2="${y(0)}" stroke="#555" stroke-width="2"/>`
    + `<text x="${left - 14}" y="${y(0) + 8}" text-anchor="end" font-size="22">0</text><text x="${left - 14}" y="${y(max) + 8}" text-anchor="end" font-size="22">${max}</text>`
    + `<text x="40" y="${(top + y(0)) / 2}" font-size="22" transform="rotate(-90 40 ${(top + y(0)) / 2})" text-anchor="middle">${esc(W.unit)}</text>`
    + bars
    + `<text x="${left}" y="${height - 30}" font-size="20" fill="#777">${esc(W.source)}</text></svg></body></html>\n`;
}

/** A poster page exactly the size its use calls for: the message biggest, then when and where, blanks for what is missing. */
function posterPage(t, w) {
  const W = t.posterWords;
  const { width, height } = posterSize(w);
  const big = Math.round(Math.min(width, height) / 9);
  return `<!doctype html>\n<html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{margin:0}body{width:${width}px;height:${height}px;box-sizing:border-box;padding:${big}px;background:#2f4858;color:#fff8e7;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}h1{font-size:${big}px;line-height:1.15;margin:0}p{font-size:${Math.round(big / 2.4)}px;margin:.4em 0}.sun{width:${big * 2}px;height:${big * 2}px;border-radius:50%;background:#f6ae2d;align-self:flex-end}</style></head>\n`
    + `<body><div class="sun"></div><h1>${esc(w || t.poster[0])}</h1><div><p>${esc(W.when)}</p><p>${esc(W.where)}</p><p>${esc(W.more)}</p></div></body></html>\n`;
}

/**
 * A menu on an A4 page (plan-1.6.md F1): the place at the top, the dishes the request names grouped into food and drink,
 * each price as written and lined up on the right, a blank in square brackets where none was given.
 */
function menuPage(t, w) {
  const M = t.menuWords;
  const list = w.slice(Math.max(w.lastIndexOf(':'), w.lastIndexOf('：')) + 1);
  const named = [...list.matchAll(/([\p{L}][\p{L} ]*?)\s*[:：]?\s*(\d+(?:\.\d+)?)?(?=[，,、；;。.]|$)/gu)].map((m) => [m[1].trim(), m[2] ? Number(m[2]) : null]).filter(([n]) => n && n.length <= 24);
  const dishes = named.length >= 2 ? named : M.sample;
  const row = ([name, price]) => `<li><span>${esc(name)}</span><b>${price === null ? esc(M.missing) : price}</b></li>`;
  const group = (title, list) => (list.length ? `<h2>${esc(title)}</h2><ul>${list.map(row).join('')}</ul>` : '');
  const drink = dishes.filter(([n]) => M.drinks.test(n));
  const food = dishes.filter(([n]) => !M.drinks.test(n));
  return `<!doctype html>\n<html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{margin:0}body{width:${A4.width}px;height:${A4.height}px;box-sizing:border-box;padding:80px;background:#fff8ec;color:#3b2a1e;font-family:system-ui,sans-serif;overflow:hidden}h1{font-size:64px;margin:0 0 40px;text-align:center}h2{font-size:30px;border-bottom:3px solid #c8743c;margin:40px 0 16px}ul{list-style:none;margin:0;padding:0}li{display:flex;justify-content:space-between;font-size:28px;padding:10px 0}</style></head>\n`
    + `<body><h1>${esc(M.place)}</h1>${group(M.groups[0], food)}${group(M.groups[1], drink)}</body></html>\n`;
}

/** A greeting card (plan-1.6.md F2): a postcard lying down, or a square for the phone when the request says so. */
const cardSize = (w) => (/方|手机|square|phone/i.test(w) ? { width: 1080, height: 1080 } : { width: 1748, height: 1240 });

/** The card itself: the greeting big in the middle, a line under it, who it is from at the bottom, a sun and a border. */
function cardPage(t, w) {
  const C = t.cardWords;
  const { width, height } = cardSize(w);
  const big = Math.round(height / 7);
  return `<!doctype html>\n<html><head><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0}body{width:${width}px;height:${height}px;box-sizing:border-box;border:${Math.round(big / 3)}px solid #e8b84a;padding:${big}px;background:#fdf3e3;color:#7a2e2a;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;overflow:hidden}h1{font-size:${big}px;margin:0}p{font-size:${Math.round(big / 2.6)}px;margin:.6em 0}.sun{width:${big}px;height:${big}px;border-radius:50%;background:#f6ae2d;margin-bottom:${Math.round(big / 3)}px}</style></head>\n`
    + `<body><div class="sun"></div><h1>${esc(C.greeting)}</h1><p>${esc(C.line)}</p><p>${esc(C.from)}</p></body></html>\n`;
}

/**
 * The cards a revision-cards commission makes (plan-1.8.md H1): one for every "term: what it is" line of the text files
 * handed over, or of the request itself; three sample cards only when there is nothing of the kind.
 */
function cardsFrom(s) {
  const C = T[s.state.lang].cards;
  const dir = s.state.vars.materialsDir;
  const texts = dir && existsSync(join(s.cwd, dir)) ? readdirSync(join(s.cwd, dir)).filter((f) => /\.(txt|md)$/i.test(f)).map((f) => readFileSync(join(s.cwd, dir, f), 'utf8')) : [];
  const pairs = [...texts, s.state.vars.want || ''].join('\n').split(/\r?\n/)
    .map((l) => /^\s*(?:[-*•]\s*)?([^:：]{1,30}?)\s*[:：]\s*(\S.+)$/.exec(l)).filter(Boolean).map((m) => [m[1].trim(), m[2].trim()]);
  return (pairs.length ? pairs : C.sample).map(([term, a]) => ({ term, q: C.ask(term), a }));
}

/**
 * A travel journal (plan-1.8.md H6): one A4 page, the route across the top, a list for each day, and the route drawn as
 * a sketch in SVG, places as numbered dots joined in the order of the trip. Nothing on it comes from the web.
 */
const JOURNAL = {
  zh: {
    title: '杭州三日手账', route: '路线', map: '路线图', checked: '开放时间查自景区官网，2026-11-27 查的，出发前再核对一下。',
    days: [['第一天', '西湖', ['断桥看日出', '苏堤骑车', '带：水和防晒']], ['第二天', '灵隐寺', ['早上八点前到', '飞来峰石刻', '带：现金买香']], ['第三天', '龙井村', ['喝一杯明前茶', '晚上去河坊街', '带：能走路的鞋']]],
    places: [['西湖', 150, 120], ['灵隐寺', 50, 70], ['龙井村', 70, 175], ['河坊街', 205, 165]],
  },
  en: {
    title: 'Three days in Edinburgh', route: 'Route', map: 'Map of the route', checked: 'Opening hours from the official sites, checked 2026-11-27. Check again before you set off.',
    days: [['Day 1', 'The Castle', ['Go at opening time', 'One o\'clock gun', 'Bring: a rain jacket']], ['Day 2', 'Royal Mile', ['St Giles\' Cathedral', 'A close or two', 'Bring: cash for tea']], ['Day 3', 'Holyrood', ['The palace first', 'Up Arthur\'s Seat', 'Bring: walking shoes']]],
    places: [['Castle', 40, 110], ['Royal Mile', 120, 95], ['Holyrood', 200, 80], ["Arthur's Seat", 215, 165]],
  },
};
function journalPage(lang) {
  const J = JOURNAL[lang];
  const dots = J.places.map(([name, x, y], i) => `<circle cx="${x}" cy="${y}" r="6"/><text x="${x + 9}" y="${y + 4}">${i + 1} ${name}</text>`).join('');
  const line = J.places.map(([, x, y]) => `${x},${y}`).join(' ');
  const days = J.days.map(([day, where, items]) => `<section class="day"><h2>${day} · ${where}</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`).join('');
  return `<!doctype html>\n<html lang="${lang === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><title>${J.title}</title><style>@page{size:A4 portrait;margin:12mm}html,body{margin:0}body{font-family:system-ui,sans-serif;color:#2f2a26;height:270mm;display:grid;grid-template-rows:auto auto auto 1fr auto;gap:6mm}h1{margin:0;font-size:22pt}.route{font-size:12pt;border-bottom:1.5px dashed #b99c7a;padding-bottom:3mm}.days{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}.day{border:1.5px solid #d8c6ae;border-radius:3mm;padding:3mm 4mm;background:#fdf8ef}.day h2{font-size:13pt;margin:0 0 2mm}.day ul{margin:0;padding-left:5mm;font-size:11pt;line-height:1.6}figure{margin:0}figure svg{width:100%;height:110mm;border:1.5px solid #d8c6ae;border-radius:3mm;background:#fffdf8}figure circle{fill:#c0603a}figure polyline{fill:none;stroke:#c0603a;stroke-width:2;stroke-dasharray:6 4}figure text{font-size:9px;fill:#2f2a26}figcaption{font-size:11pt;margin-bottom:2mm}small{font-size:9pt;color:#7a6e64}</style></head>\n<body><h1>${J.title}</h1><div class="route"><b>${J.route}：</b>${J.places.map(([n]) => n).join(' → ')}</div><div class="days">${days}</div><figure><figcaption>${J.map}</figcaption><svg viewBox="0 0 260 220" role="img" aria-label="${J.map}"><polyline points="${line}"/>${dots}</svg></figure><small>${J.checked}</small></body></html>\n`;
}

const SHEET_STYLE = '@page{size:A4;margin:10mm}html,body{margin:0}body{font-family:system-ui,sans-serif;color:#2a2233}section{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);height:276mm;break-after:page}.c{border:1px dashed #9a9a9a;padding:8mm;position:relative;display:flex;align-items:center;justify-content:center;text-align:center;font-size:15pt;break-inside:avoid}.c b{position:absolute;top:3mm;left:4mm;font-size:9pt;color:#8a8a8a}.a{background:#fdf6e3;font-size:12pt}';

/** Eight cards to a sheet; behind each sheet of questions, their answers with each row's two cards swapped. */
function cardsPage(t, cards) {
  const cell = (n, text, kind) => `<div class="c ${kind}"><b>${n}</b><p>${esc(text)}</p></div>`;
  const blank = '<div class="c"></div>';
  let body = '';
  for (let k = 0; k < cards.length; k += 8) {
    const sheet = cards.slice(k, k + 8);
    const front = sheet.map((c, j) => cell(k + j + 1, c.q, 'q')).join('') + blank.repeat(8 - sheet.length);
    const back = [0, 1, 2, 3].flatMap((r) => [r * 2 + 1, r * 2]).map((j) => (sheet[j] ? cell(k + j + 1, sheet[j].a, 'a') : blank)).join('');
    body += `<section>${front}</section><section>${back}</section>`;
  }
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(t.cards.title)}</title><style>${SHEET_STYLE}</style></head><body>${body}</body></html>\n`;
}

/** Ten questions on the first page, short answers and blanks to fill in turn; the answers, with where they come from, on the second. */
function quizPage(t, cards) {
  const C = t.cards;
  const ten = Array.from({ length: 10 }, (_, i) => ({ ...cards[i % cards.length], blank: i % 2 === 1 }));
  const qs = ten.map((c) => `<li>${esc(c.blank ? C.blank(c.term) : c.q)}<div class="room"></div></li>`).join('');
  const as = ten.map((c) => `<li>${esc(c.a)}<small>${esc(C.from + c.term)}</small></li>`).join('');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(C.quiz)}</title><style>@page{size:A4;margin:18mm}body{font-family:system-ui,sans-serif;color:#2a2233;font-size:12pt}section{break-after:page}li{margin:0 0 4mm}.room{height:10mm;border-bottom:1px solid #ccc}small{display:block;color:#777}</style></head>`
    + `<body><section><h1>${esc(C.quiz)}</h1><p>${esc(C.name)}</p><ol>${qs}</ol></section><section><h1>${esc(C.answers)}</h1><ol>${as}</ol></section></body></html>\n`;
}

/** Pick the play for a prompt. A resumed session keeps its play; a request for changes starts a round of changes. */
export function pickPlay(prompt, state, system = '') {
  state.vars ??= {};
  // A talk with Adeng before a commission (B4): known by its own system prompt; each line is a --resume of the session.
  if (/Before a commission is written, you chat/.test(system)) {
    state.lang = /Simplified Chinese/.test(system) ? 'zh' : 'en';
    return plays.consult;
  }
  state.lang = /Simplified Chinese/.test(prompt) ? 'zh' : 'en';
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
  // A scenario may ask for one play by name (office, officeread); a resumed session has kept its play above.
  if (plays[process.env.SIM_PLAY]) return plays[process.env.SIM_PLAY];
  // A commission that may use a connection (road-to-1.3.md C4) reads it once and writes down what it got.
  // SIM_CONNECTION_PLAY picks another play for such a commission: outside or outsideweb (C6).
  if (/The user let this commission use these connections/.test(prompt)) return plays[process.env.SIM_CONNECTION_PLAY] ?? plays.connect;
  if (/This folder is the user's own/.test(prompt)) return plays.lent;
  if (/single self-contained page named "index\.html", using the photos/.test(prompt)) return plays.album;
  if (/write the findings in .* as two files/.test(prompt)) {
    state.vars.out = (prompt.match(/^"([^"]+)": a three-sentence summary/m) ?? [])[1];
    state.vars.sources = (prompt.match(/^"([^"]+)": JSON/m) ?? [])[1];
    return plays.research;
  }
  // Changing a Word, Excel or PowerPoint file by number, and a PDF written again as Word (road-to-1.3.md C3).
  const changing = /make the changes with mcp__nook-office__edit_(docx|xlsx|pptx), from "([^"]+)" to "([^"]+)"/.exec(prompt);
  if (changing) {
    [, state.vars.kind, state.vars.source, state.vars.out] = changing;
    return plays.officeedit;
  }
  if (/A PDF cannot be changed as it is/.test(prompt)) {
    state.vars.source = quoted(prompt, 'The document to work on is');
    state.vars.out = quoted(prompt, 'as a Word document');
    return plays.pdfedit;
  }
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
  if (/This is a chart, drawn as a picture/.test(prompt)) {
    state.vars.out = quoted(prompt, 'Draw it as a single self-contained page');
    state.vars.png = quoted(prompt, 'Then save it as');
    return plays.chart;
  }
  if (/This is a poster, drawn as a picture/.test(prompt)) {
    state.vars.out = quoted(prompt, 'Lay it out as a single self-contained page');
    state.vars.png = quoted(prompt, 'Then save it as');
    state.vars.pdf = quoted(prompt, 'also save it as');
    return plays.poster;
  }
  if (/This is a menu or a price list, drawn as a picture/.test(prompt)) {
    state.vars.out = quoted(prompt, 'Lay it out as a single self-contained page');
    state.vars.png = quoted(prompt, 'Then save it as');
    state.vars.pdf = quoted(prompt, 'and as');
    return plays.menu;
  }
  if (/This is a recipe someone will cook from/.test(prompt)) { state.vars.out = quoted(prompt, 'make_docx tool as'); return plays.recipe; }
  if (/This is a greeting card for one person or one occasion/.test(prompt)) {
    state.vars.out = quoted(prompt, 'Lay it out as a single self-contained page');
    state.vars.png = quoted(prompt, 'Then save it as');
    state.vars.pdf = quoted(prompt, 'and as');
    return plays.card;
  }
  if (/This is a short newsletter for a building/.test(prompt)) {
    state.vars.out = quoted(prompt, 'make_docx tool as');
    state.vars.page = quoted(prompt, 'single self-contained page');
    state.vars.pdf = quoted(prompt, 'and save it as');
    return plays.newsletter;
  }
  if (/These are revision cards and a short quiz/.test(prompt)) {
    state.vars.out = quoted(prompt, 'Lay the cards out as a single self-contained page');
    state.vars.quiz = quoted(prompt, 'as a page');
    [state.vars.pdf, state.vars.quizPdf] = [...prompt.matchAll(/Save it as "([^"]+)"/g)].map((m) => m[1]);
    return plays.flashcards;
  }
  if (/This is a family ledger/.test(prompt)) { state.vars.out = quoted(prompt, 'make_xlsx tool as'); return plays.ledgerbook; }
  if (/This is a letter or an email/.test(prompt)) { state.vars.out = quoted(prompt, 'Write it as'); return plays.letter; }
  if (/This is a table/.test(prompt)) { state.vars.out = quoted(prompt, 'make_xlsx tool as'); return plays.sheet; }
  if (/This is a Word document/.test(prompt)) { state.vars.out = quoted(prompt, 'make_docx tool as'); return plays.document; }
  if (/This is a slide deck/.test(prompt)) { state.vars.out = quoted(prompt, 'make_pptx tool as'); return plays.slides; }
  if (/This is a plan/.test(prompt)) { state.vars.out = quoted(prompt, 'Write it as'); return plays.plan; }
  if (/This is a résumé/.test(prompt)) {
    state.vars.out = quoted(prompt, 'single self-contained page named');
    state.vars.pdf = quoted(prompt, 'also save it as');
    return plays.resume;
  }
  if (/These are reading notes/.test(prompt)) { state.vars.out = quoted(prompt, 'Write them as'); return plays.notes; }
  if (/This is a travel journal/.test(prompt)) {
    state.vars.out = quoted(prompt, 'single self-contained page');
    state.vars.pdf = quoted(prompt, 'Save it as');
    return plays.journal;
  }
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
  await s.tool('WebSearch', { query: topic.slice(0, 30) }, { ...a, effect: () => ({ text: 'Web search results (simulated): https://example.org/a and https://www.example.org/b/.' }) });
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
  // The computer goes to sleep mid-commission (road-to-1.2.md B7): the scenario says so with a file, and the connection the
  // run was using dies with it. Carried on (--resume) after waking, it gets through.
  if (scenario === 'sleepwake' && !s.state.vars.netDone) {
    await s.step(async () => {
      while (!existsSync(process.env.SIM_NET_DOWN)) await s.pause(0.2);
      s.state.vars.netDone = true;
      await s.say(t.netRetry);
      s.fail('API Error: Connection error. fetch failed (ECONNRESET)');
    });
  }
  // Held halfway while a file is there, so a scenario can shut the computer down with the round surely under way (B7).
  if (scenario === 'hold') await s.step(async () => { while (existsSync(process.env.SIM_HOLD)) await s.pause(0.2); });
  // Three errands at once, each out a little longer than the one before (road-to-1.1.md A5): Xiaoju takes the first,
  // the apprentice the second, and the third waits for whoever is back first.
  if (scenario === 'errands') {
    await s.step(() => Promise.all([3, 6, 10].map(async (slow, i) => {
      await s.pause(i * 1.5);
      return s.agent('researcher', t.errands[i], t.researchBrief, async (a) => {
        await s.tool('WebSearch', { query: t.errands[i] }, { ...a, slow, effect: () => ({ text: 'Web search results (simulated).' }) });
      }, t.researchSummary);
    })));
  }
  // A question answered in a project's first round becomes one of its preferences (road-to-1.2.md B3).
  if (scenario === 'projectmemo') {
    await s.step(async () => {
      const colors = s.state.lang === 'zh' ? ['奶油白', '浅薄荷'] : ['Cream', 'Mint'];
      const picked = await s.ask(t.colorQ, t.colorH, colors.map((c, i) => ({ label: c, description: t.colorHints[i] })));
      await s.say(picked ? t.pickColor(picked) : t.leftToMe(colors[0]));
    });
  }
  // A picture for a print order (road-to-1.4.md D3): drawn as a page and saved with render_png, which the studio's
  // painter does and brings back. Slow enough to watch the errand.
  if (scenario === 'dispatch') {
    await s.step(() => s.write('figure.html', '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f6efe3"><svg width="600" height="400"><rect x="60" y="120" width="120" height="240" fill="#c0703a"/><rect x="240" y="60" width="120" height="300" fill="#7a9a5a"/><rect x="420" y="200" width="120" height="160" fill="#5a7aa0"/></svg></body>\n'));
    await s.step(() => s.mcp('nook-office', 'render_png', { page: 'figure.html', file: 'figure.png', width: 600, height: 400 }, { slow: 16 }));
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
  /**
   * A commission with a connection ticked (C4): call the first tool of each connection's server (nook-k<digits>) once, and
   * keep what came back in a text file. With SIM_ECHO_SECRET it also repeats that string, out loud and in the call, as
   * a model that has somehow seen a secret would; the shop must mask it in its log and recordings.
   */
  connect: {
    name: 'connect',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const echo = process.env.SIM_ECHO_SECRET;
      await s.step(() => s.think(1));
      const got = [];
      for (const server of s.servers.filter((n) => /^nook-k\d+$/.test(n))) {
        const [name] = await s.mcpTools(server);
        const r = await s.step(() => s.mcp(server, name, echo ? { about: echo } : {}));
        if (r?.text) got.push(r.text);
      }
      if (echo) await s.step(() => s.say(`(sim) ${echo}`));
      await s.step(() => s.write(zh ? '连接里读到的.txt' : 'from-connection.txt', `${got.join('\n')}\n`));
      await s.finish(zh ? '我读了测试连接里的便条，把它抄进了一个文本文件。' : 'I read the note in the test connection and copied it into a text file.');
    },
  },

  /**
   * An outside action through the test connection (C6): save a note, which the user is asked about every time. Told no,
   * it says so and asks once more, as a model might.
   */
  outside: {
    name: 'outside',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const server = s.servers.find((n) => /^nook-k\d+$/.test(n));
      await s.step(() => s.think(1));
      const first = await s.step(() => s.mcp(server, 'save_note', {}));
      if (first?.denied) await s.step(() => s.say(zh ? '你没同意，我再问一次。' : 'You said no, so I will ask once more.'));
      await s.step(() => s.mcp(server, 'save_note', {}));
      await s.finish(zh ? '便条存进测试文件夹了，在笔记本的“外部动作”页可以撤回。' : "The note is in the test folder. It can be undone from the notebook's outside actions page.");
    },
  },

  /**
   * A synced folder (C5): list it, read the Word file in it, write a summary, then save a copy of the summary into the
   * folder. The first save is declined, so it asks once more, as a model might.
   */
  folderlink: {
    name: 'folderlink',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const server = s.servers.find((n) => /^nook-k\d+$/.test(n));
      await s.step(() => s.think(1));
      const listed = await s.step(() => s.mcp(server, 'list', {}));
      const docx = (listed?.text ?? '').split('\n').map((l) => l.split('\t')[0]).find((p) => p.endsWith('.docx'));
      const read = await s.step(() => s.mcp(server, 'read', { file: docx }));
      const out = zh ? '摘要.md' : 'summary.md';
      const first = (read?.text ?? '').split('\n').find((l) => l.trim()) ?? '';
      await s.step(() => s.write(out, zh ? `# ${docx} 的摘要\n\n开头一句：${first}\n` : `# Summary of ${docx}\n\nIt opens: ${first}\n`));
      const once = await s.step(() => s.mcp(server, 'save_copy', { file: out }));
      if (once?.denied) await s.step(() => s.say(zh ? '你没同意，我再问一次。' : 'You said no, so I will ask once more.'));
      await s.step(() => s.mcp(server, 'save_copy', { file: out }));
      await s.finish(zh ? `我读了网盘文件夹里的「${docx}」，写了摘要，也存了一份到“小灯屋”里。` : `I read "${docx}" in the synced folder, wrote a summary, and saved a copy into its Lamplight Nook folder.`);
    },
  },

  /** A read-only calendar (C5): the coming week's events, laid out as a plan. */
  calendar: {
    name: 'calendar',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const server = s.servers.find((n) => /^nook-k\d+$/.test(n));
      const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      await s.step(() => s.think(1));
      const got = await s.step(() => s.mcp(server, 'events', { from: day(0), to: day(6) }));
      const out = zh ? '一周计划.md' : 'week-plan.md';
      await s.step(() => s.write(out, `${zh ? '# 这一周' : '# This week'}\n\n${(got?.text ?? '').split('\n').map((l) => `- ${l}`).join('\n')}\n`));
      await s.finish(zh ? '我读了你的日历，把这一周排成了计划，日历本身没动。' : 'I read your calendar and laid out the week as a plan. The calendar itself is untouched.');
    },
  },

  /** Email drafts (C5): the letter as text, and the same as a draft for the mail program. */
  maildraft: {
    name: 'maildraft',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const server = s.servers.find((n) => /^nook-k\d+$/.test(n));
      const subject = zh ? '周六读书会' : 'Book club on Saturday';
      const body = zh ? '大家好：\n\n这周六下午三点，河边公园见。\n\n[你的名字]\n' : 'Dear all,\n\nSee you on Saturday at 3pm in the park by the river.\n\n[your name]\n';
      await s.step(() => s.think(1));
      await s.step(() => s.write(zh ? '信.txt' : 'letter.txt', `${subject}\n\n${body}`));
      await s.step(() => s.mcp(server, 'draft', { to: ['club@example.org'], subject, body, file: zh ? '信.eml' : 'letter.eml' }));
      await s.finish(zh ? '信写好了，另外做了一份邮件草稿，在邮件程序里打开，看过再自己发。' : 'The letter is written, with an email draft of it: open it in your mail program, read it and send it yourself.');
    },
  },

  /**
   * The back room and the post (road-to-1.3.md C8), with a calendar, a synced folder and email drafts connected: the week
   * read from the calendar (Axin brings it), a Word file made at the table and put away in the filing cabinet, a copy saved
   * into the folder (Axin takes it), the folder looked through once more (Axin has come twice, so Adeng goes to the letter
   * holder alone), and a draft left in the outbox. Pauses give the walks time to be seen.
   */
  backroom: {
    name: 'backroom',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const o = OFFICE[s.state.lang];
      const linked = s.servers.filter((n) => /^nook-k\d+$/.test(n));
      const tools = await Promise.all(linked.map(async (n) => [n, await s.mcpTools(n)]));
      const serverWith = (tool) => tools.find(([, names]) => names.includes(tool))[0];
      const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      await s.step(() => s.think(1));
      await s.step(() => s.mcp(serverWith('events'), 'events', { from: day(0), to: day(6) }));
      await s.pause(8);
      await s.step(() => office(s, 'make_docx', { file: o.files.docx, ...o.doc(zh ? '这周安排' : 'This week') }));
      // Across the room from the letter holder to the table, then to the cabinet: a long walk.
      await s.pause(30);
      await s.step(() => s.mcp(serverWith('save_copy'), 'save_copy', { file: o.files.docx }));
      await s.pause(10);
      await s.step(() => s.mcp(serverWith('list'), 'list', {}));
      await s.pause(6);
      const subject = zh ? '这周安排' : 'This week';
      await s.step(() => s.mcp(serverWith('draft'), 'draft', { to: ['club@example.org'], subject, body: zh ? '大家好：\n\n这周的安排见附件里的文档。\n' : 'Dear all,\n\nThe plan for this week is in the document.\n', file: zh ? '安排.eml' : 'plan.eml' }));
      // Back across the room to the counter, where the draft goes in the outbox.
      await s.pause(20);
      await s.finish(zh ? '读了日历，做了这周的安排，存了一份到网盘，邮件草稿在待寄筐里。' : 'I read the calendar, made the week\'s plan, saved a copy to the synced folder, and left a draft in the outbox.');
    },
  },

  /**
   * Reads the test connection, then looks something up on the web and runs a harmless command (C6): after a read through
   * a connection, both are asked about first. Nothing reaches the network; the fetch is answered here.
   */
  outsideweb: {
    name: 'outsideweb',
    async run(s) {
      const zh = s.state.lang === 'zh';
      const server = s.servers.find((n) => /^nook-k\d+$/.test(n));
      await s.step(() => s.think(1));
      await s.step(() => s.mcp(server, 'read_note', {}));
      await s.step(() => s.tool('WebFetch', { url: 'https://example.com/', prompt: 'What is on the page?' }, { effect: () => ({ text: 'Example Domain' }) }));
      await s.step(() => s.tool('Bash', { command: 'node -v', description: 'Check the Node version' }, { effect: () => ({ text: process.version }) }));
      await s.step(() => s.write(zh ? '查到的.txt' : 'looked-up.txt', 'Example Domain\n'));
      await s.finish(zh ? '读了测试连接里的便条，又查了一个网页。' : 'I read the note in the test connection and looked up a web page.');
    },
  },

  /**
   * Every office tool once (road-to-1.3.md C1), picked with SIM_PLAY=office: a Word document, a workbook with a SUM, a
   * two-slide deck, and a small page saved as a PDF.
   */
  /**
   * The packaged run (road-to-1.3.md C9): a Word file from the shop's own Office tools and a draft through a connection,
   * so both kinds of nook-* server are seen to start once the app is packaged.
   */
  packaged: {
    name: 'packaged',
    async run(s) {
      const o = OFFICE[s.state.lang];
      const server = s.servers.find((n) => /^nook-k\d+$/.test(n));
      await s.step(() => s.think(1));
      await s.step(() => office(s, 'make_docx', { file: o.files.docx, ...o.doc(s.state.vars.want) }));
      await s.step(() => s.mcp(server, 'draft', { to: ['club@example.org'], subject: 'C9', body: 'Hello.\n', file: 'letter.eml' }));
      await s.finish(o.officeDone);
    },
  },

  office: {
    name: 'office',
    async run(s) {
      const o = OFFICE[s.state.lang];
      const w = s.state.vars.want;
      await s.step(() => s.think(1));
      await s.step(() => office(s, 'make_docx', { file: o.files.docx, ...o.doc(w) }));
      await s.step(() => office(s, 'make_xlsx', { file: o.files.xlsx, ...o.sheet }));
      await s.step(() => office(s, 'make_pptx', { file: o.files.pptx, ...o.deck(w) }));
      await s.step(() => s.write('index.html', o.page));
      await s.step(() => office(s, 'make_pdf', { page: 'index.html', file: o.files.pdf }));
      await s.finish(o.officeDone);
    },
  },

  /** Reads every file handed over with read_document (SIM_PLAY=officeread) and writes what came back into a text file. */
  officeread: {
    name: 'officeread',
    async run(s) {
      const o = OFFICE[s.state.lang];
      const dir = s.state.vars.materialsDir;
      const got = [];
      await s.step(() => s.think(1));
      for (const f of dir && existsSync(join(s.cwd, dir)) ? readdirSync(join(s.cwd, dir)).sort() : []) {
        const r = await s.step(() => office(s, 'read_document', { file: `${dir}/${f}` }));
        got.push(`## ${f}\n${r?.text ?? ''}`);
      }
      await s.step(() => s.write(o.readFile, `${got.join('\n\n')}\n`));
      await s.finish(o.readDone);
    },
  },

  /**
   * Changes the samples in tests/fixtures/office by number (road-to-1.3.md C3), as the edit template asks: reads the
   * original numbered, then one change with the edit tool: "bold" to "plain" in Word, a new line in PowerPoint, 30 to
   * 40 in Excel.
   */
  officeedit: {
    name: 'officeedit',
    async run(s) {
      const { kind, source, out } = s.state.vars;
      await s.step(() => s.think(1));
      const read = await s.step(() => office(s, 'read_document', { file: source, numbered: true }));
      const lines = (read?.text ?? '').split('\n');
      // The number in front of the text, the last one before it on its line (a table row holds several).
      const number = (text) => /\[([\d.]+)\][^[]*$/.exec((lines.find((l) => l.includes(text)) ?? '').split(text)[0])?.[1] ?? '0';
      const [slide, box] = number('Lemon tart').split('.').map(Number);
      const edits = kind === 'docx' ? [{ n: Number(number('bold words')), text: 'This paragraph has plain words in it.' }]
        : kind === 'pptx' ? [{ slide, box, text: 'Lemon tart\nIced tea' }]
        : [{ sheet: 'Sales', cell: 'B3', value: 40 }];
      await s.step(() => office(s, `edit_${kind}`, { from: source, file: out, edits }));
      await s.finish(s.state.lang === 'zh' ? '改了一处，原稿没动，改好的另存了一份。' : 'I changed one thing; the original is untouched and the changed copy is saved beside it.');
    },
  },

  /** A PDF handed over to change (C3): written again as a Word document with make_docx. */
  pdfedit: {
    name: 'pdfedit',
    async run(s) {
      const zh = s.state.lang === 'zh';
      await s.step(() => s.think(1));
      await s.step(() => office(s, 'make_docx', { file: s.state.vars.out, title: zh ? '春季菜单' : 'Spring menu', blocks: [{ h: 1, text: zh ? '菜单' : 'Menu' }, { p: zh ? '柠檬挞，热可可。' : 'Lemon tart, hot chocolate.' }] }));
      await s.finish(zh ? 'PDF 没法照原样改，改好的写成了一份 Word。' : 'A PDF cannot be changed as it is, so the changed version is a Word document.');
    },
  },

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
      // SIM_CITE=flawed (scenario cite, C7): one point without a number, one source this round never opened, one conclusion without a source.
      const flawed = process.env.SIM_CITE === 'flawed';
      await s.step(() => s.write(s.state.vars.out, t.summaryBody(w, flawed) + notes));
      const urls = ['https://example.org/a', 'https://example.org/b', 'https://example.org/never'];
      const list = urls.slice(0, flawed ? 3 : 2).map((url, i) => ({ n: i + 1, title: t.sourceTitles[i], url, checked: '2026-11-19' }));
      await s.step(() => s.write(s.state.vars.sources ?? 'sources.json', `${JSON.stringify({ sources: list, unsourced: flawed ? [t.unsourced] : [] }, null, 2)}\n`));
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
  sheet: simpleText('sheet', null, (t) => t.sheetDone, { make: (s, o) => office(s, 'make_xlsx', { file: s.state.vars.out, ...o.sheet }) }),
  document: simpleText('document', null, (t) => t.documentDone, { make: (s, o, w) => office(s, 'make_docx', { file: s.state.vars.out, ...o.doc(w) }) }),
  slides: simpleText('slides', null, (t) => t.slidesDone, { make: (s, o, w) => office(s, 'make_pptx', { file: s.state.vars.out, ...o.deck(w) }) }),
  plan: simpleText('plan', (t, w) => t.planBody(w), (t) => t.planDone),
  resume: simpleText('resume', (t, w) => t.resumeBody(w), (t) => t.resumeDone, { after: (s) => office(s, 'make_pdf', { page: s.state.vars.out, file: s.state.vars.pdf }) }),
  chart: simpleText('chart', (t, w) => chartPage(t, w), (t) => t.chartDone, {
    after: async (s) => {
      await office(s, 'render_png', { page: s.state.vars.out, file: s.state.vars.png, width: CHART.width, height: CHART.height });
      await s.read(s.state.vars.png);
    },
  }),
  poster: simpleText('poster', (t, w) => posterPage(t, w), (t) => t.posterDone, {
    after: async (s) => {
      const size = posterSize(s.state.vars.want || '');
      await office(s, 'render_png', { page: s.state.vars.out, file: s.state.vars.png, ...size });
      if (size.height === A4.height) await office(s, 'make_pdf', { page: s.state.vars.out, file: s.state.vars.pdf });
      await s.read(s.state.vars.png);
    },
  }),
  menu: simpleText('menu', (t, w) => menuPage(t, w), (t) => t.menuDone, {
    after: async (s) => {
      await office(s, 'render_png', { page: s.state.vars.out, file: s.state.vars.png, ...A4 });
      await office(s, 'make_pdf', { page: s.state.vars.out, file: s.state.vars.pdf });
      await s.read(s.state.vars.png);
    },
  }),
  recipe: simpleText('recipe', null, (t) => t.recipeDone, { make: (s, o, w) => office(s, 'make_docx', { file: s.state.vars.out, ...T[s.state.lang].recipeDoc(w) }) }),
  card: simpleText('card', (t, w) => cardPage(t, w), (t) => t.cardDone, {
    after: async (s) => {
      await office(s, 'render_png', { page: s.state.vars.out, file: s.state.vars.png, ...cardSize(s.state.vars.want || '') });
      await office(s, 'make_pdf', { page: s.state.vars.out, file: s.state.vars.pdf });
      await s.read(s.state.vars.png);
    },
  }),
  newsletter: simpleText('newsletter', null, (t) => t.newsletterDone, {
    make: (s, o, w) => office(s, 'make_docx', { file: s.state.vars.out, ...T[s.state.lang].newsletterDoc(w) }),
    after: async (s) => {
      await s.write(s.state.vars.page, T[s.state.lang].newsletterPage(s.state.vars.want || ''));
      await office(s, 'make_pdf', { page: s.state.vars.page, file: s.state.vars.pdf });
    },
  }),
  flashcards: simpleText('flashcards', null, (t) => t.flashcardsDone, {
    make: (s) => s.write(s.state.vars.out, cardsPage(T[s.state.lang], cardsFrom(s))),
    after: async (s) => {
      await office(s, 'make_pdf', { page: s.state.vars.out, file: s.state.vars.pdf });
      await s.write(s.state.vars.quiz, quizPage(T[s.state.lang], cardsFrom(s)));
      await office(s, 'make_pdf', { page: s.state.vars.quiz, file: s.state.vars.quizPdf });
      await s.read(s.state.vars.pdf);
    },
  }),
  ledgerbook: simpleText('ledgerbook', null, (t) => t.ledgerbookDone, {
    make: (s) => office(s, 'make_xlsx', { file: s.state.vars.out, ...ledgerBook(s.state.lang) }),
    after: (s) => office(s, 'read_document', { file: s.state.vars.out }),
  }),
  notes: simpleText('notes',(t, w) => t.notesBody(w), (t) => t.notesDone, { research: true }),
  travel: simpleText('travel', (t, w) => t.travelBody(w), (t) => t.travelDone, { research: true }),
  journal: simpleText('journal', null, (t) => t.journalDone, {
    research: true,
    make: (s) => s.write(s.state.vars.out, journalPage(s.state.lang)),
    after: async (s) => {
      await office(s, 'make_pdf', { page: s.state.vars.out, file: s.state.vars.pdf });
      await s.read(s.state.vars.pdf);
    },
  }),
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

  /**
   * A talk with Adeng (B4): one fixed line for each thing the user says, one call's cost each. Asked for the slip as JSON
   * (--json-schema), it writes one from what it heard: the first line is the want, the rest the details.
   */
  consult: {
    name: 'consult',
    async run(s, { prompt, schema }) {
      const t = T[s.state.lang];
      const heard = (s.state.vars.heard ??= []);
      await s.think(1);
      s.charge();
      if (!schema) {
        heard.push(prompt.split('\n')[0]);
        await s.finish(t.consult[Math.min(heard.length, t.consult.length) - 1]);
        return;
      }
      const slip = { want: heard[0] ?? '', details: heard.slice(1).join(s.state.lang === 'zh' ? '；' : '; '), audience: t.consultAudience, template: 'page' };
      await s.finish(JSON.stringify(slip), { structured_output: slip });
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
function simpleText(name, body, done, { research = false, make, after } = {}) {
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
      await s.step(() => (make ? make(s, OFFICE[s.state.lang], s.state.vars.want || '') : s.write(s.state.vars.out, body(t, s.state.vars.want || '') + notes)));
      if (after) await s.step(() => after(s));
      await p.next();
      await reviewer(s, t, s.state.vars.out);
      await p.end();
      await s.finish(done(t));
    },
  };
}
