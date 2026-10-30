// Corgi Pocket — phần tính toán thuần (không đụng giao diện), có test trong tests/core.test.mjs
export const VERSION = 1;
export const MAX = 1_000_000_000_000;
const exactHalf = n => Number.isSafeInteger(n * 2);

export const SPLITS = ['half', 'a', 'b', 'custom', 'company'];
export const FIXED_TYPES = {card: 'Thẻ tín dụng', debt: 'Nợ cố định', bill: 'Chi cố định'};

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
export function closePeriod(db, ids, id, at, label) {
  const chosen = db.expenses.filter(e => ids.includes(e.id));
  if (!chosen.length || chosen.some(e => e.settlementId || e.split === 'company')) throw Error('Kỳ này đã được chốt hoặc không có khoản nào');
  const net = totals(chosen).net;
  return {...db,
    expenses: db.expenses.map(e => ids.includes(e.id) ? {...e, settlementId: id} : e),
    settlements: [{id, at, label, net, entryIds: chosen.map(e => e.id)}, ...db.settlements]};
}
export function undoPeriod(db, id) {
  return {...db, expenses: db.expenses.map(e => e.settlementId === id ? {...e, settlementId: null} : e), settlements: db.settlements.filter(s => s.id !== id)};
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
    .map(t => ({id: makeId(), templateId: t.id, type: t.type, name: t.name, amount: t.type === 'debt' && t.principal ? Math.min(t.amount, debtRemaining(db, t)) : t.amount, due: dueDate(month, t.day), paid: false, paidDate: null, note: t.note || ''}));
  return added.length ? {...db, fixed: [...db.fixed, ...added]} : db;
}

export function freshDB() {
  return {version: VERSION, names: {a: 'Chị', b: 'Nhi', c: 'Công ty', full: ''},
    categories: ['Ăn uống', 'Đi chợ', 'Nhà cửa', 'Di chuyển', 'Mua sắm', 'Corgi', 'Sức khoẻ', 'Khác'],
    expenses: [], settlements: [], reimbursements: [], templates: [], fixed: [], skips: [], lastBackup: null, updatedAt: null};
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
  if (!Array.isArray(d.categories) || !d.categories.length || d.categories.some(x => !str(x))) fail();
  for (const key of ['expenses', 'settlements', 'reimbursements', 'templates', 'fixed', 'skips']) if (!Array.isArray(d[key]) || d[key].length > 100000) fail();
  for (const key of ['expenses', 'settlements', 'reimbursements', 'templates', 'fixed']) if (!unique(d[key])) fail();
  for (const e of d.expenses) {
    if (!str(e.id) || !str(e.description, 200) || !dateValid(e.date) || !opt(e.note)) fail();
    if (e.kind === 'opening') { if (!Number.isSafeInteger(e.balance) || Math.abs(e.balance) > MAX) fail(); }
    else {
      if (!integer(e.amount) || !['a', 'b'].includes(e.payer) || !str(e.category)) fail();
      try { shares(e.amount, e.split, e.custom); } catch { fail(); }
      if (e.split === 'company' && (e.payer !== 'a' || e.settlementId)) fail();
    }
    if (e.settlementId && !d.settlements.some(s => s.id === e.settlementId && s.entryIds.includes(e.id))) fail();
    if (e.reimburseId && !d.reimbursements.some(r => r.id === e.reimburseId && r.entryIds.includes(e.id))) fail();
  }
  for (const s of d.settlements) {
    if (!str(s.id) || !str(s.at) || !str(s.label, 200) || !Array.isArray(s.entryIds) || !s.entryIds.length) fail();
    const rows = d.expenses.filter(e => s.entryIds.includes(e.id));
    if (rows.length !== s.entryIds.length || rows.some(e => e.settlementId !== s.id) || totals(rows).net !== s.net) fail();
  }
  for (const r of d.reimbursements) {
    if (!str(r.id) || !str(r.at) || !Array.isArray(r.entryIds) || !r.entryIds.length) fail();
    const rows = d.expenses.filter(e => r.entryIds.includes(e.id));
    if (rows.length !== r.entryIds.length || rows.some(e => e.reimburseId !== r.id) || rows.reduce((s, e) => s + e.amount, 0) !== r.amount) fail();
  }
  for (const t of d.templates) if (!str(t.id) || !FIXED_TYPES[t.type] || !str(t.name) || !integer(t.amount) || !Number.isInteger(t.day) || t.day < 1 || t.day > 31 || !/^\d{4}-\d{2}$/.test(t.start) || !(t.principal === undefined || t.principal === null || integer(t.principal)) || !opt(t.note)) fail();
  for (const f of d.fixed) if (!str(f.id) || !FIXED_TYPES[f.type] || !str(f.name) || !integer(f.amount) || !dateValid(f.due) || typeof f.paid !== 'boolean' || (f.paid && !dateValid(f.paidDate)) || !opt(f.note)) fail();
  if (d.skips.some(x => typeof x !== 'string')) fail();
  totals(d.expenses);
  return d;
}

export function csvCell(v) {
  const s = String(v ?? '');
  return '"' + (/^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
