// The family ledger the stand-in Claude makes (plan-1.8.md H5), as the structure make_xlsx takes: a sheet for each
// month, the year on one sheet, and the categories on another for the user to change. Kept apart from plays.mjs so
// tests/ledgerbook.test.ts can work its formulas out.
//
// A month: date, item, category (picked from the categories sheet), money in, money out, a note. To the right, the
// month's summary works itself out: money in, money out and what is left, then the spending by category, with a pie
// chart of it. The year sheet takes each month's three totals and draws the spending month by month.

/** Rows a month has room for, from row 2. */
// The entries' last row: as far down as make_xlsx's list to pick from reaches (LIST_ROWS), as the prompt asks.
const LAST = 500;
/** Category slots on the categories sheet (rows 2 to 16), each a line of every month's summary (rows 7 to 21). */
const SLOTS = 15;

const WORDS = {
  zh: {
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    year: '全年', categories: '分类', total: '全年合计',
    head: ['日期', '摘要', '分类', '收入', '支出', '备注', '', '本月小结', '金额'],
    yearHead: ['月份', '收入', '支出', '结余'],
    kindsHead: ['分类', '收支'], kinds: ['收入', '支出'],
    in: '本月收入', out: '本月支出', left: '本月结余', byCategory: '支出按分类',
    pie: '本月支出', bar: '每月支出',
    income: ['工资', '退休金', '其他收入'],
    spending: ['买菜做饭', '水电燃气', '交通出行', '看病买药', '人情往来', '孩子上学', '日用杂货', '其他支出'],
  },
  en: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    year: 'Year', categories: 'Categories', total: 'Whole year',
    head: ['Date', 'Item', 'Category', 'Money in', 'Money out', 'Note', '', 'This month', 'Amount'],
    yearHead: ['Month', 'Money in', 'Money out', 'Left over'],
    kindsHead: ['Category', 'In or out'], kinds: ['In', 'Out'],
    in: 'Money in', out: 'Money out', left: 'Left over', byCategory: 'Spending by category',
    pie: 'Spending this month', bar: 'Spending by month',
    income: ['Wages', 'Pension', 'Other income'],
    spending: ['Groceries', 'Bills', 'Getting about', 'Health', 'Gifts', 'Children', 'Household', 'Other spending'],
  },
};

/** The workbook make_xlsx is handed, in the language of the request: the first month in full, each later one like it. */
export function ledgerBook(lang) {
  const L = WORDS[lang];
  const kinds = `'${L.categories}'`;
  const month = (name) => {
    const rows = Array.from({ length: SLOTS + 5 }, () => []);
    const put = (r, label, amount) => (rows[r - 2] = [null, null, null, null, null, null, null, label, amount]);
    put(2, L.in, { f: `=SUM(D2:D${LAST})` });
    put(3, L.out, { f: `=SUM(E2:E${LAST})` });
    put(4, L.left, { f: '=I2-I3' });
    put(6, L.byCategory, null);
    for (let k = 0; k < SLOTS; k++) {
      const r = 7 + k;
      // An empty slot on the categories sheet stays an empty line here, so a category added there turns up by itself.
      put(r, { f: `=IF(${kinds}!A${k + 2}="","",${kinds}!A${k + 2})` }, { f: `=IF(H${r}="","",SUMIF($C$2:$C$${LAST},H${r},$E$2:$E$${LAST}))` });
    }
    return {
      name,
      freezeHeader: true,
      columns: [
        { header: L.head[0], width: 12, format: 'date' },
        { header: L.head[1], width: 18 },
        { header: L.head[2], width: 12, list: `${kinds}!$A$2:$A$${SLOTS + 1}` },
        { header: L.head[3], width: 11, format: 'money' },
        { header: L.head[4], width: 11, format: 'money' },
        { header: L.head[5], width: 16 },
        { header: L.head[6], width: 3 },
        { header: L.head[7], width: 16 },
        { header: L.head[8], width: 12, format: 'money' },
      ],
      rows,
      charts: [{ type: 'pie', title: L.pie, labels: `H7:H${6 + SLOTS}`, values: `I7:I${6 + SLOTS}`, at: 'K2' }],
    };
  };
  const year = {
    name: L.year,
    freezeHeader: true,
    columns: L.yearHead.map((header, i) => ({ header, width: i ? 12 : 10, ...(i ? { format: 'money' } : {}) })),
    rows: [
      ...L.months.map((m, i) => [m, { f: `='${m}'!I2` }, { f: `='${m}'!I3` }, { f: `=B${i + 2}-C${i + 2}` }]),
      [L.total, { f: '=SUM(B2:B13)' }, { f: '=SUM(C2:C13)' }, { f: '=SUM(D2:D13)' }],
    ],
    charts: [{ type: 'bar', title: L.bar, labels: 'A2:A13', values: 'C2:C13', at: 'F2' }],
  };
  const categories = {
    name: L.categories,
    freezeHeader: true,
    columns: [{ header: L.kindsHead[0], width: 14 }, { header: L.kindsHead[1], width: 10, list: L.kinds }],
    rows: [...L.income.map((c) => [c, L.kinds[0]]), ...L.spending.map((c) => [c, L.kinds[1]])],
  };
  return { sheets: [month(L.months[0]), ...L.months.slice(1).map((name) => ({ name, like: L.months[0] })), year, categories] };
}
