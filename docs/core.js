// Corgi Pocket — phần tính toán thuần (không đụng giao diện), có test trong tests/core.test.mjs
export const VERSION = 4;
export const MAX = 1_000_000_000_000;
const exactHalf = n => Number.isSafeInteger(n * 2);

export const SPLITS = ['half', 'a', 'b', 'custom', 'company'];
export const FIXED_TYPES = {card: 'Thẻ tín dụng', debt: 'Nợ cố định', bill: 'Chi cố định'};
export const SOURCE_KINDS = {cash: 'Tiền mặt', bank: 'Ngân hàng', wallet: 'Ví điện tử', card: 'Thẻ tín dụng', later: 'Trả sau'};
// Thẻ tín dụng / trả sau: tiêu trước, tiền thật ra khi trả kỳ (tick ở Góc cố định)
export const isCredit = kind => kind === 'card' || kind === 'later';

export const formatMoney = n => new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 1}).format(n) + ' đ';

// "165k", "1,5k", "165.700", "165700" → số nguyên đồng. Sai định dạng → NaN.
export function moneyInput(value) {
  let s = String(value ?? '').trim().toLowerCase().replace(/\s|₫|đ/g, '');
  if (!s) return NaN;
  let n;
  if (s.endsWith('tr')) {
    s = s.slice(0, -2).replace(',', '.');
    if (!/^\d+(\.\d{1,6})?$/.test(s)) return NaN;
    const [whole, fraction = ''] = s.split('.');
    n = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
  } else if (s.endsWith('k')) {
    s = s.slice(0, -1).replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(s)) return NaN;
    const [whole, fraction = ''] = s.split('.');
    n = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  } else {
    if (!/^\d+$/.test(s) && !/^\d{1,3}([.,]\d{3})+$/.test(s)) return NaN;
    n = Number(s.replace(/[.,]/g, ''));
  }
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX ? n : NaN;
}

// a = Chị, b = Nhi, c = Công ty. custom = phần của Nhi.
export function shares(amount, split, custom = 0) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX) throw Error('Số tiền không hợp lệ');
  if (!SPLITS.includes(split)) throw Error('Cách chia không hợp lệ');
  if (split === 'company') return {a: 0, b: 0, c: amount};
  const b = split === 'half' ? amount / 2 : split === 'a' ? 0 : split === 'b' ? amount : custom;
  if (!exactHalf(b) || b < 0 || b > amount) throw Error('Phần của em phải nằm trong tổng số tiền');
  return {a: amount - b, b, c: 0};
}

// Số dương: Nhi nợ Chị. Số âm: Chị nợ Nhi. Khoản công ty không ảnh hưởng.
export function debt(e) {
  if (e.kind === 'opening') return e.balance;
  if (e.split === 'company') return 0;
  const p = shares(e.amount, e.split, e.custom);
  return (e.payer === 'a' ? p.b : -p.a) || 0;
}

export function totals(entries) {
  const s = {total: 0, net: 0, paid: {a: 0, b: 0}, share: {a: 0, b: 0}, company: 0, categories: {}};
  for (const e of entries) {
    s.net += debt(e);
    if (e.kind === 'opening') continue;
    const p = shares(e.amount, e.split, e.custom);
    s.total += e.amount;
    s.paid[e.payer] += e.amount;
    s.share.a += p.a; s.share.b += p.b; s.company += p.c;
    if (e.split !== 'company') s.categories[e.category] = (s.categories[e.category] || 0) + e.amount;
  }
  if ([s.total, s.net, s.share.a, s.share.b, s.company].some(n => !exactHalf(n))) throw Error('Tổng tiền vượt giới hạn tính chính xác của app.');
  return s;
}

export const monthOf = e => e.date.slice(0, 7);
export const outstanding = entries => entries.filter(e => e.split !== 'company' && !e.settlementId);
export const companyPending = entries => entries.filter(e => e.split === 'company' && !e.reimburseId);

// Chốt tiền với Nhi
// pay (tuỳ chọn) = {paid, via, carryId}: paid là tiền chuyển thật, dương = Nhi chuyển chị, âm = chị chuyển Nhi.
// Nếu paid khác số nợ, phần còn lại thành 1 khoản "Còn lại sau cấn trừ" chờ kỳ sau.
export const transferOf = s => s.paid ?? s.net;
export function closePeriod(db, ids, id, at, label, pay = null) {
  const chosen = db.expenses.filter(e => ids.includes(e.id));
  if (!chosen.length || chosen.some(e => e.settlementId || e.split === 'company')) throw Error('Kỳ này đã được chốt hoặc không có khoản nào');
  const net = totals(chosen).net, row = {id, at, label, net, entryIds: chosen.map(e => e.id)};
  const expenses = db.expenses.map(e => ids.includes(e.id) ? {...e, settlementId: id} : e);
  if (pay) {
    if (!Number.isSafeInteger(pay.paid) || Math.abs(pay.paid) > MAX) throw Error('Số tiền chuyển không hợp lệ');
    row.paid = pay.paid; row.via = pay.paid ? pay.via || null : null;
    const rest = net - pay.paid;
    if (rest) {
      row.carryId = pay.carryId;
      expenses.push({id: pay.carryId, kind: 'opening', description: 'Còn lại sau cấn trừ ' + label, date: localDate(at), balance: rest, settlementId: null, createdAt: at});
    }
  }
  return {...db, expenses, settlements: [row, ...db.settlements]};
}
export function undoPeriod(db, id) {
  const s = db.settlements.find(x => x.id === id), carry = s?.carryId && db.expenses.find(e => e.id === s.carryId);
  if (carry?.settlementId) throw Error('Phần còn lại của kỳ này đã được cấn trừ ở kỳ sau. Hoàn tác kỳ sau trước nhé.');
  return {...db, expenses: db.expenses.filter(e => !carry || e.id !== carry.id).map(e => e.settlementId === id ? {...e, settlementId: null} : e), settlements: db.settlements.filter(x => x.id !== id)};
}

// Công ty đã chuyển hoàn ứng
export function reimburse(db, ids, id, at) {
  const chosen = db.expenses.filter(e => ids.includes(e.id));
  if (!chosen.length || chosen.some(e => e.split !== 'company' || e.reimburseId)) throw Error('Chọn ít nhất một khoản đang chờ hoàn');
  const amount = chosen.reduce((s, e) => s + e.amount, 0);
  return {...db,
    expenses: db.expenses.map(e => ids.includes(e.id) ? {...e, reimburseId: id} : e),
    reimbursements: [{id, at, amount, entryIds: chosen.map(e => e.id)}, ...db.reimbursements]};
}
// Kết sổ phần công ty: coi như công ty đã hoàn đủ mọi khoản đang chờ. Không cộng vào nguồn nào (via null), lịch sử giữ nguyên.
export function closeCompany(db, id, at) {
  const ids = companyPending(db.expenses).map(e => e.id);
  if (!ids.length) return db;
  const next = reimburse(db, ids, id, at);
  Object.assign(next.reimbursements[0], {via: null, closeOut: true});
  return next;
}
export function undoReimburse(db, id) {
  return {...db, expenses: db.expenses.map(e => e.reimburseId === id ? {...e, reimburseId: null} : e), reimbursements: db.reimbursements.filter(r => r.id !== id)};
}

export function dueDate(month, day) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, '0')}`;
}

// Dư nợ còn lại = dư nợ khai báo − các kỳ đã trả của khoản nợ đó
export function debtRemaining(db, t) {
  if (!t.principal) return null;
  const paid = db.fixed.filter(f => f.templateId === t.id && f.paid).reduce((s, f) => s + f.amount, 0);
  return Math.max(0, t.principal - paid);
}

// Tự tạo khoản của tháng từ các mẫu lặp lại. Khoản đã xoá tay (skips) hoặc nợ đã trả hết thì không tạo lại.
export function generateFixed(db, month, makeId) {
  const added = db.templates
    .filter(t => t.start <= month)
    .filter(t => !db.fixed.some(f => f.templateId === t.id && f.due.slice(0, 7) === month))
    .filter(t => !db.skips.includes(t.id + ':' + month))
    .filter(t => t.type !== 'debt' || debtRemaining(db, t) !== 0)
    .map(t => ({id: makeId(), templateId: t.id, type: t.type, name: t.name, amount: t.type === 'debt' && t.principal ? Math.min(t.amount, debtRemaining(db, t)) : t.amount, due: dueDate(month, t.day), paid: false, paidDate: null, note: t.note || '', split: t.split === 'half' ? 'half' : 'a'}));
  return added.length ? {...db, fixed: [...db.fixed, ...added]} : db;
}

export function freshDB() {
  return {version: VERSION, names: {a: 'Chị', b: 'Nhi', c: 'Công ty', full: ''},
    categories: ['Ăn uống', 'Đi chợ', 'Nhà cửa', 'Di chuyển', 'Mua sắm', 'Corgi', 'Sức khoẻ', 'Khác'],
    expenses: [], settlements: [], reimbursements: [], templates: [], fixed: [], skips: [], lastBackup: null, updatedAt: null,
    sources: defaultSources(), incomes: [], incomeCategories: ['Lương', 'Thưởng', 'Vay', 'Thu nhập khác'], adjustments: [], lastNotified: null};
}
function defaultSources() {
  return [['acb', 'ACB tiền mặt', 'bank'], ['tcb', 'TCB tiền mặt', 'bank'], ['tcb-card', 'TCB thẻ tín dụng', 'card'], ['momo-later', 'Momo trả sau', 'later'],
    ['tpb-card', 'TPB thẻ tín dụng', 'card'], ['vikki-card', 'Vikki thẻ tín dụng', 'card'], ['hds-card', 'HDSaison thẻ tín dụng', 'card'], ['cake-card', 'Cake thẻ tín dụng', 'card']]
    .map(([id, name, kind]) => ({id, name, kind}));
}

// Bản 1 → 2: thêm nguồn tiền và khoản thu. Khoản chi cũ để trống nguồn.
export function migrateDB(d) {
  if (d && d.version === 1) d = {...d, version: 2, sources: defaultSources(), incomes: [], incomeCategories: freshDB().incomeCategories};
  if (d && d.version === 2) d = {...d, version: 3, adjustments: [], lastNotified: null};
  if (d && d.version === 3) d = {...closeCompany(d, 'ket-so-cong-ty', new Date().toISOString()), version: 4};
  return validateDB(d);
}

// ---------- Ví: số dư từng nguồn ----------
// Nguồn tiền mặt/ngân hàng/ví: số dư = số dư đầu ngày openingDate + thu − chi − trả cố định ± tiền với Nhi/công ty + chỉnh tay.
// Thẻ/trả sau: dư nợ = dư nợ đầu + quẹt − các kỳ thẻ đã trả; còn quẹt được = hạn mức − dư nợ.
export const isConfigured = s => Number.isSafeInteger(s.opening) && dateValid(s.openingDate) && typeof s.openingAt === 'string';
export function cardSourceOf(db, f) {
  return db.sources.find(x => isCredit(x.kind) && ((f.templateId && x.templateId === f.templateId) || x.name.toLowerCase() === f.name.toLowerCase()));
}
// Một kỳ cố định đã trả có thể trừ từ 1–3 nguồn (paidSplit). Bản cũ: 1 nguồn paidFrom.
// Khoản cố định chia đôi: khi đã trả thì có 1 dòng chi gắn kèm (fixedId) để tính nợ với Nhi.
// Dòng đã chốt sổ thì giữ nguyên. Trả về false nếu dòng gắn kèm đã chốt mà khoản cố định đổi.
export function syncFixedShare(db, fixedId, makeId) {
  const f = db.fixed.find(x => x.id === fixedId), linked = db.expenses.find(e => e.fixedId === fixedId);
  const want = f && f.paid && f.split === 'half' && f.amount > 0;
  if (linked?.settlementId) return !!want && linked.amount === f.amount;
  if (!want) { if (linked) db.expenses = db.expenses.filter(e => e !== linked); return true; }
  const row = {description: f.name, amount: f.amount, split: 'half', custom: 0, payer: 'a', category: FIXED_TYPES[f.type], date: f.paidDate, note: 'Từ khoản cố định', sourceId: null, fixedId};
  if (linked) Object.assign(linked, row); else db.expenses.push({id: makeId(), settlementId: null, reimburseId: null, createdAt: new Date().toISOString(), ...row});
  return true;
}
export const paidParts = f => !f.paid ? [] : Array.isArray(f.paidSplit) ? f.paidSplit : f.paidFrom ? [{sourceId: f.paidFrom, amount: f.amount}] : [];
export function balance(db, s) {
  if (!isConfigured(s)) return null;
  // Khoản ghi sau lúc chị nhập số dư mới được cộng/trừ (cùng ngày thì so giờ nhập)
  const from = (d, at) => d > s.openingDate || (d === s.openingDate && (at || '') > s.openingAt);
  let n = s.opening;
  const adj = db.adjustments.filter(a => a.sourceId === s.id && a.at > s.openingAt).reduce((t, a) => t + a.amount, 0);
  if (isCredit(s.kind)) {
    for (const e of db.expenses) if (e.kind !== 'opening' && e.payer === 'a' && e.sourceId === s.id && from(e.date, e.createdAt)) n += e.amount;
    for (const f of db.fixed) if (f.paid && from(f.paidDate, f.paidAt) && f.type === 'card' && cardSourceOf(db, f)?.id === s.id) n -= f.amount;
    return n + adj;
  }
  for (const i of db.incomes) if (i.sourceId === s.id && from(i.date, i.createdAt)) n += i.amount;
  for (const e of db.expenses) if (e.kind !== 'opening' && e.payer === 'a' && e.sourceId === s.id && from(e.date, e.createdAt)) n -= e.amount;
  for (const f of db.fixed) if (f.paid && from(f.paidDate, f.paidAt)) for (const p of paidParts(f)) if (p.sourceId === s.id) n -= p.amount;
  for (const x of db.settlements) if (x.via === s.id && from(localDate(x.at), x.at)) n += transferOf(x);
  for (const x of db.reimbursements) if (x.via === s.id && from(localDate(x.at), x.at)) n += x.amount;
  return n + adj;
}
export function wallet(db, todayStr) {
  const month = todayStr.slice(0, 7), rows = [];
  let cash = 0, creditDebt = 0, creditLeft = 0, hasLimit = false, missing = 0;
  for (const s of db.sources) {
    const b = balance(db, s);
    if (b === null) { missing++; rows.push({source: s, balance: null}); continue; }
    if (isCredit(s.kind)) {
      creditDebt += b;
      const left = Number.isSafeInteger(s.limit) && s.limit > 0 ? s.limit - b : null;
      if (left !== null) { creditLeft += left; hasLimit = true; }
      rows.push({source: s, balance: b, left});
    } else { cash += b; rows.push({source: s, balance: b}); }
  }
  const dueItems = db.fixed.filter(f => !f.paid && f.due.slice(0, 7) <= month);
  const due = dueItems.reduce((t, f) => t + f.amount, 0);
  const debtLeft = db.templates.filter(t => t.type === 'debt' && t.principal).reduce((t, x) => t + debtRemaining(db, x), 0);
  return {rows, cash, due, dueItems, noAmount: dueItems.filter(f => !f.amount).length, spendable: cash - due, creditDebt, creditLeft: hasLimit ? creditLeft : null, debtLeft, missing};
}

// Khoản chưa trả: quá hạn hoặc tới hạn trong `days` ngày tới
export function upcoming(db, todayStr, days = 7) {
  const end = new Date(todayStr + 'T12:00:00'); end.setDate(end.getDate() + days);
  const endStr = localDate(end.toISOString());
  return db.fixed.filter(f => !f.paid && f.due <= endStr).sort((a, b) => a.due.localeCompare(b.due))
    .map(f => ({...f, daysLeft: Math.round((new Date(f.due + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 864e5)}));
}

// File lịch .ics: iPhone tự nhắc (9h sáng hôm trước và 9h sáng ngày đến hạn) kể cả khi không mở app
export function buildICS(db, todayStr, names = FIXED_TYPES) {
  const esc = t => String(t).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ymd = d => d.replaceAll('-', '');
  const next = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1); return ymd(localDate(x.toISOString())); };
  const money = n => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
  const alarm = ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Sắp đến hạn', 'TRIGGER:-PT15H', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hôm nay đến hạn', 'TRIGGER:PT9H', 'END:VALARM'];
  const ev = [], stamp = ymd(todayStr) + 'T000000Z';
  const month = todayStr.slice(0, 7);
  for (const t of db.templates) {
    const left = t.type === 'debt' ? debtRemaining(db, t) : null;
    if (left === 0) continue;
    const startMonth = t.start > month ? t.start : month, first = dueDate(startMonth, Math.min(t.day, 28));
    const count = left && t.amount ? Math.ceil(left / t.amount) : null;
    ev.push('BEGIN:VEVENT', `UID:corgi-${t.id}@corgi-pocket`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(first)}`, `DTEND;VALUE=DATE:${next(first)}`,
      `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Math.min(t.day, 28)}${count ? ';COUNT=' + count : ''}`,
      `SUMMARY:${esc(`🐶 Trả ${names[t.type].toLowerCase()}: ${t.name}${t.amount ? ' ' + money(t.amount) : ''}`)}`, ...alarm, 'END:VEVENT');
  }
  for (const f of db.fixed) {
    if (f.paid || f.templateId || f.due < todayStr) continue;
    ev.push('BEGIN:VEVENT', `UID:corgi-${f.id}@corgi-pocket`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(f.due)}`, `DTEND;VALUE=DATE:${next(f.due)}`,
      `SUMMARY:${esc(`🐶 Trả ${f.name}${f.amount ? ' ' + money(f.amount) : ''}`)}`, ...alarm, 'END:VEVENT');
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Corgi Pocket//VI', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Corgi Pocket', ...ev, 'END:VCALENDAR'].join('\r\n');
}

const localDate = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Dòng tiền của chị trong 1 tháng (YYYY-MM).
// Chi tiêu = mọi khoản chị trả (kể cả quẹt thẻ). Tiền thật ra = trả ngay + kỳ cố định đã tick trả + chị trả Nhi.
export function cashflow(db, month) {
  const src = id => db.sources.find(x => x.id === id);
  const inMonth = d => d.slice(0, 7) === month;
  const r = {income: 0, incomeBy: {}, fromNhi: 0, fromCompany: 0, toNhi: 0, spend: 0, spendBy: {}, credit: 0, immediate: 0, fixedPaid: 0, fixedBy: {}, cashIn: 0, cashOut: 0, net: 0};
  for (const i of db.incomes) if (inMonth(i.date)) { r.income += i.amount; r.incomeBy[i.category] = (r.incomeBy[i.category] || 0) + i.amount; }
  for (const s of db.settlements) if (inMonth(localDate(s.at))) { const t = transferOf(s); if (t > 0) r.fromNhi += t; else r.toNhi -= t; }
  for (const x of db.reimbursements) if (!x.closeOut && inMonth(localDate(x.at))) r.fromCompany += x.amount;
  for (const e of db.expenses) {
    if (e.kind === 'opening' || e.fixedId || e.payer !== 'a' || !inMonth(e.date)) continue; // khoản chia đôi từ cố định đã tính ở fixedPaid
    const key = e.sourceId && src(e.sourceId) ? e.sourceId : '';
    r.spend += e.amount; r.spendBy[key] = (r.spendBy[key] || 0) + e.amount;
    if (isCredit(src(e.sourceId)?.kind)) r.credit += e.amount; else r.immediate += e.amount;
  }
  for (const f of db.fixed) if (f.paid && inMonth(f.paidDate)) { r.fixedPaid += f.amount; r.fixedBy[f.type] = (r.fixedBy[f.type] || 0) + f.amount; }
  r.cashIn = r.income + r.fromNhi + r.fromCompany;
  r.cashOut = r.immediate + r.fixedPaid + r.toNhi;
  r.net = r.cashIn - r.cashOut;
  return r;
}

export function dateValid(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

export function validateDB(d) {
  const fail = () => { throw Error('File backup không đúng định dạng Corgi Pocket hoặc dữ liệu bị lỗi.'); };
  const str = (s, n = 100) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
  const opt = (s, n = 300) => s === undefined || s === null || (typeof s === 'string' && s.length <= n);
  const integer = n => Number.isSafeInteger(n) && n >= 0 && n <= MAX;
  const unique = arr => new Set(arr.map(x => x.id)).size === arr.length;
  if (!d || d.version !== VERSION || !d.names || !str(d.names.a, 30) || !str(d.names.b, 30) || !str(d.names.c, 60) || !opt(d.names.full, 80)) fail();
  for (const key of ['categories', 'incomeCategories']) if (!Array.isArray(d[key]) || !d[key].length || d[key].some(x => !str(x))) fail();
  const int = n => n === undefined || n === null || (Number.isSafeInteger(n) && Math.abs(n) <= MAX);
  if (!Array.isArray(d.sources) || !d.sources.length || !unique(d.sources) || d.sources.some(x => !str(x.id) || !str(x.name, 60) || !SOURCE_KINDS[x.kind] || !int(x.opening) || !(x.openingDate == null || dateValid(x.openingDate)) || !opt(x.openingAt, 40) || !int(x.limit))) fail();
  if (!Array.isArray(d.adjustments) || !unique(d.adjustments) || d.adjustments.some(a => !str(a.id) || !str(a.sourceId) || !dateValid(a.date) || !str(a.at, 40) || !Number.isSafeInteger(a.amount) || !opt(a.note))) fail();
  if (!Array.isArray(d.incomes) || !unique(d.incomes)) fail();
  for (const i of d.incomes) if (!str(i.id) || !str(i.description, 200) || !dateValid(i.date) || !integer(i.amount) || !str(i.category) || !opt(i.note) || !(i.sourceId == null || d.sources.some(x => x.id === i.sourceId))) fail();
  for (const key of ['expenses', 'settlements', 'reimbursements', 'templates', 'fixed', 'skips']) if (!Array.isArray(d[key]) || d[key].length > 100000) fail();
  for (const key of ['expenses', 'settlements', 'reimbursements', 'templates', 'fixed']) if (!unique(d[key])) fail();
  for (const e of d.expenses) {
    if (!str(e.id) || !str(e.description, 200) || !dateValid(e.date) || !opt(e.note)) fail();
    if (e.kind === 'opening') { if (!Number.isSafeInteger(e.balance) || Math.abs(e.balance) > MAX) fail(); }
    else {
      if (!integer(e.amount) || !['a', 'b'].includes(e.payer) || !str(e.category)) fail();
      try { shares(e.amount, e.split, e.custom); } catch { fail(); }
      if (e.split === 'company' && (e.payer !== 'a' || e.settlementId)) fail();
      if (e.sourceId != null && typeof e.sourceId !== 'string') fail();
      if (e.fixedId != null && (typeof e.fixedId !== 'string' || e.sourceId)) fail();
    }
    if (e.settlementId && !d.settlements.some(s => s.id === e.settlementId && s.entryIds.includes(e.id))) fail();
    if (e.reimburseId && !d.reimbursements.some(r => r.id === e.reimburseId && r.entryIds.includes(e.id))) fail();
  }
  for (const s of d.settlements) {
    if (!str(s.id) || !str(s.at) || !str(s.label, 200) || !Array.isArray(s.entryIds) || !s.entryIds.length) fail();
    const rows = d.expenses.filter(e => s.entryIds.includes(e.id));
    if (rows.length !== s.entryIds.length || rows.some(e => e.settlementId !== s.id) || totals(rows).net !== s.net) fail();
    if (!(s.paid == null || (Number.isSafeInteger(s.paid) && Math.abs(s.paid) <= MAX)) || !(s.carryId == null || d.expenses.some(e => e.id === s.carryId && e.kind === 'opening'))) fail();
  }
  for (const r of d.reimbursements) {
    if (!str(r.id) || !str(r.at) || !Array.isArray(r.entryIds) || !r.entryIds.length) fail();
    const rows = d.expenses.filter(e => r.entryIds.includes(e.id));
    if (rows.length !== r.entryIds.length || rows.some(e => e.reimburseId !== r.id) || rows.reduce((s, e) => s + e.amount, 0) !== r.amount) fail();
  }
  for (const t of d.templates) if (!str(t.id) || !FIXED_TYPES[t.type] || !str(t.name) || !integer(t.amount) || !Number.isInteger(t.day) || t.day < 1 || t.day > 31 || !/^\d{4}-\d{2}$/.test(t.start) || !(t.principal === undefined || t.principal === null || integer(t.principal)) || !opt(t.note) || ![undefined, null, 'a', 'half'].includes(t.split)) fail();
  for (const f of d.fixed) if (!str(f.id) || !FIXED_TYPES[f.type] || !str(f.name) || !integer(f.amount) || !dateValid(f.due) || typeof f.paid !== 'boolean' || (f.paid && !dateValid(f.paidDate)) || !opt(f.note) || ![undefined, null, 'a', 'half'].includes(f.split) || !(f.paidFrom == null || typeof f.paidFrom === 'string') ||
    !(f.paidSplit == null || (Array.isArray(f.paidSplit) && f.paidSplit.length <= 5 && f.paidSplit.every(p => str(p.sourceId) && integer(p.amount)) && f.paidSplit.reduce((t, p) => t + p.amount, 0) <= f.amount))) fail();
  for (const x of [...d.settlements, ...d.reimbursements]) if (!(x.via == null || typeof x.via === 'string')) fail();
  if (d.skips.some(x => typeof x !== 'string')) fail();
  totals(d.expenses);
  return d;
}

// Nhập thêm từ file (ví dụ sao kê ngân hàng): cộng vào dữ liệu đang có, không xoá gì, không nhập trùng
export function mergeImport(db, pack, makeId, nowIso) {
  if (!pack || pack.corgiImport !== 1 || !pack.source || !Array.isArray(pack.expenses) || !Array.isArray(pack.incomes)) throw Error('File không phải file nhập của Corgi Pocket.');
  const next = structuredClone(db);
  let src = next.sources.find(x => x.name.toLowerCase() === String(pack.source.name).toLowerCase());
  if (!src) { src = {id: makeId(), name: pack.source.name, kind: pack.source.kind}; next.sources.push(src); }
  const setOpening = !isConfigured(src) && Number.isSafeInteger(pack.source.closing);
  if (setOpening) Object.assign(src, {opening: pack.source.closing, openingDate: pack.source.closingDate, openingAt: nowIso});
  for (const c of pack.categories || []) if (!next.categories.includes(c)) next.categories.push(c);
  for (const c of pack.incomeCategories || []) if (!next.incomeCategories.includes(c)) next.incomeCategories.push(c);
  const has = new Set([...next.expenses, ...next.incomes].map(x => x.id));
  const exp = pack.expenses.filter(e => !has.has(e.id)).map(e => ({...e, sourceId: src.id}));
  const inc = pack.incomes.filter(i => !has.has(i.id)).map(i => ({...i, sourceId: src.id}));
  next.expenses.push(...exp); next.incomes.push(...inc);
  validateDB(next);
  return {db: next, expenses: exp.length, incomes: inc.length, duplicates: pack.expenses.length + pack.incomes.length - exp.length - inc.length, source: src.name, setOpening};
}

// Gộp nguồn `fromId` vào `toId`: mọi khoản chi/thu, trả cố định, chỉnh tay, chốt sổ đều chuyển sang nguồn giữ lại
export function mergeSource(db, fromId, toId) {
  if (fromId === toId) return;
  for (const x of [...db.expenses, ...db.incomes, ...db.adjustments]) if (x.sourceId === fromId) x.sourceId = toId;
  for (const f of db.fixed) { if (f.paidFrom === fromId) f.paidFrom = toId; for (const p of f.paidSplit || []) if (p.sourceId === fromId) p.sourceId = toId; }
  for (const x of [...db.settlements, ...db.reimbursements]) if (x.via === fromId) x.via = toId;
  const from = db.sources.find(x => x.id === fromId), to = db.sources.find(x => x.id === toId);
  if (from?.templateId && !to.templateId) to.templateId = from.templateId;
  db.sources = db.sources.filter(x => x.id !== fromId);
}
export const sourceInUse = (db, id) => db.expenses.some(e => e.sourceId === id) || db.incomes.some(i => i.sourceId === id) || db.adjustments.some(a => a.sourceId === id)
  || db.fixed.some(f => f.paidFrom === id || (f.paidSplit || []).some(p => p.sourceId === id)) || [...db.settlements, ...db.reimbursements].some(x => x.via === id);

// Gói nhập bản 2: dọn nguồn tiền (đổi tên, gộp, chốt số dư), xoá khoản trùng, thêm/cập nhật khoản từ sao kê.
// Khoản đã có: chỉ cập nhật nếu còn “cần xem” hoặc “Chưa phân loại”; khoản chị đã phân loại thì giữ nguyên.
export function applyPack(db, pack, makeId, nowIso) {
  if (!pack || pack.corgiImport !== 2) throw Error('File không phải file nhập của Corgi Pocket.');
  const next = structuredClone(db), r = {renamed: [], merged: [], created: [], removed: [], deleted: 0, added: 0, updated: 0, kept: 0};
  const byName = n => next.sources.find(x => x.name.toLowerCase() === String(n).trim().toLowerCase());
  for (const s of pack.sources || []) {
    if (!s || typeof s.name !== 'string' || !SOURCE_KINDS[s.kind]) throw Error('Nguồn tiền trong file không hợp lệ.');
    const olds = [...new Set([s.name, ...(s.from || [])].map(byName).filter(Boolean))];
    let keep = olds.find(x => x.templateId) || olds.find(x => x.name.toLowerCase() === s.name.toLowerCase()) || olds[0];
    if (!keep) { keep = {id: makeId(), name: s.name, kind: s.kind}; next.sources.push(keep); r.created.push(s.name); }
    for (const o of olds) if (o !== keep) { mergeSource(next, o.id, keep.id); r.merged.push(`${o.name} → ${s.name}`); }
    if (keep.name !== s.name && olds.length) r.renamed.push(`${keep.name} → ${s.name}`);
    keep.name = s.name; keep.kind = s.kind;
    if (Number.isSafeInteger(s.opening) && dateValid(s.openingDate)) Object.assign(keep, {opening: s.opening, openingDate: s.openingDate, openingAt: s.openingAt || nowIso});
  }
  const order = (pack.sources || []).map(s => s.name.toLowerCase()), rank = x => { const i = order.indexOf(x.name.toLowerCase()); return i < 0 ? order.length : i; };
  next.sources.sort((x, y) => rank(x) - rank(y));
  const del = new Set(pack.deleteIds || []);
  const before = next.expenses.length + next.incomes.length;
  next.expenses = next.expenses.filter(e => !del.has(e.id) || e.settlementId || e.reimburseId); next.incomes = next.incomes.filter(i => !del.has(i.id));
  r.deleted = before - next.expenses.length - next.incomes.length;
  for (const n of pack.removeSources || []) {
    const x = byName(n);
    if (x && !sourceInUse(next, x.id) && next.sources.length > 1) { next.sources = next.sources.filter(y => y !== x); r.removed.push(x.name); }
  }
  for (const c of pack.categories || []) if (!next.categories.includes(c)) next.categories.push(c);
  for (const c of pack.incomeCategories || []) if (!next.incomeCategories.includes(c)) next.incomeCategories.push(c);
  for (const [key, list] of [['expenses', pack.expenses || []], ['incomes', pack.incomes || []]]) for (const raw of list) {
    const {source: sname, ...item} = raw, src = sname ? byName(sname) : null;
    if (sname && !src) throw Error(`Không tìm thấy nguồn “${sname}”.`);
    if (src) item.sourceId = src.id;
    const cur = next[key].find(x => x.id === item.id);
    if (!cur) { next[key].push({createdAt: nowIso, ...item}); r.added++; }
    else if ((cur.review || cur.category === 'Chưa phân loại') && !cur.settlementId && !cur.reimburseId) { Object.assign(cur, item); r.updated++; }
    else r.kept++;
  }
  // Lịch cố định: sửa/thêm/xoá mẫu hằng tháng; chỉ đụng các kỳ chưa trả từ tháng hiện tại trở đi
  const month = nowIso.slice(0, 7);
  Object.assign(r, {tplAdded: [], tplUpdated: [], tplRemoved: [], fixedDeleted: 0});
  const delFixed = new Set(pack.deleteFixedIds || []), nFixed = next.fixed.length;
  next.fixed = next.fixed.filter(f => f.paid || !delFixed.has(f.id));
  r.fixedDeleted = nFixed - next.fixed.length;
  for (const t of pack.templates || []) {
    if (!t || (t.match == null && t.name == null)) throw Error('Lịch cố định trong file không hợp lệ.');
    const key = String(t.match ?? t.name).trim().toLowerCase();
    const cur = next.templates.find(x => x.id === t.match) || next.templates.find(x => x.name.toLowerCase() === key);
    const open = x => !x.paid && x.templateId === cur.id && x.due.slice(0, 7) >= month;
    if (t.remove) {
      if (!cur) continue;
      next.templates = next.templates.filter(x => x !== cur);
      next.fixed = next.fixed.filter(x => !open(x));
      r.tplRemoved.push(cur.name);
      continue;
    }
    const fields = Object.fromEntries(['type', 'name', 'amount', 'day', 'start', 'principal', 'note'].filter(k => t[k] !== undefined).map(k => [k, t[k]]));
    if (!cur) { next.templates.push({id: makeId(), principal: null, note: '', ...fields}); r.tplAdded.push(fields.name); continue; }
    Object.assign(cur, fields);
    for (const f of next.fixed) if (open(f)) Object.assign(f, {type: cur.type, name: cur.name, amount: cur.amount, due: dueDate(f.due.slice(0, 7), cur.day)});
    r.tplUpdated.push(cur.name);
  }
  validateDB(next);
  return {db: next, ...r};
}

export function csvCell(v) {
  const s = String(v ?? '');
  return '"' + (/^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
