import {moneyInput, formatMoney, shares, debt, totals, monthOf, outstanding, companyPending, closePeriod, undoPeriod, reimburse, undoReimburse, generateFixed, debtRemaining, dueDate, freshDB, validateDB, migrateDB, cashflow, wallet, balance, upcoming, buildICS, isConfigured, mergeImport, dateValid, csvCell, FIXED_TYPES, SOURCE_KINDS, isCredit} from './core.js';

const KEY = 'corgi-pocket-v1:' + new URL('./', location.href).pathname;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
const fmt = formatMoney;
const compact = n => n >= 1e6 ? (Math.round(n / 1e5) / 10).toString().replace('.', ',') + 'tr' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const signedHTML = n => `<span class="${n < 0 ? 'red' : n > 0 ? 'green' : ''}">${signed(n)}</span>`;
const niceDate = s => s.split('-').reverse().join('/');
const shortDate = s => niceDate(s).slice(0, 5);
const monthName = m => 'Tháng ' + Number(m.slice(5)) + '/' + m.slice(0, 4);
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ICONS = [[/ăn|uống|cafe|cà phê|trà/i, '🍜'], [/chợ|siêu thị/i, '🛒'], [/nhà|điện|nước|internet/i, '🏠'], [/di chuyển|xe|grab|xăng/i, '🛵'], [/mua sắm|quần|áo/i, '🛍'], [/corgi|chó|pet/i, '🐶'], [/sức khoẻ|thuốc|khám/i, '💊'], [/công ty|công tác/i, '💼']];
const catIcon = c => (ICONS.find(([re]) => re.test(c)) || [, '✦'])[1];
const COLORS = ['#e11d2e', '#ec8b2c', '#f2c14e', '#b33951', '#8f8a86', '#ff7a6e', '#6d1a24', '#d9d4cf'];
const TYPE_ICON = {card: '💳', debt: '🏦', bill: '🧾'};
const SOURCE_ICON = {cash: '💵', bank: '🏛', wallet: '📱', card: '💳', later: '🕐'};
const INCOME_ICON = [[/lương/i, '💰'], [/thưởng/i, '🎁'], [/vay/i, '🤝']];
const incomeIcon = c => (INCOME_ICON.find(([re]) => re.test(c)) || [, '＋'])[1];

let db = freshDB(), loadError = false;
try { const raw = localStorage.getItem(KEY); if (raw) db = migrateDB(JSON.parse(raw)); } catch { loadError = true; }
let page = 'home', month = today().slice(0, 7), selected = today(), fixedMonth = month, fixedType = 'all', nhiScope = 'all', flowMonth = month;
const unpicked = new Set();

// ---------- lưu trữ ----------
let toastTimer;
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 3500); }
function commit(next) {
  if (loadError) { toast('Dữ liệu cũ chưa đọc được. Vào Cài đặt tải bản gốc trước khi khôi phục.'); return false; }
  try { next.updatedAt = new Date().toISOString(); validateDB(next); localStorage.setItem(KEY, JSON.stringify(next)); db = next; return true; }
  catch (e) { toast('Chưa lưu được: ' + e.message); return false; }
}
function mutate(fn) { const next = structuredClone(db); fn(next); return commit(next); }
function ensureFixed(m) { if (loadError) return; const next = generateFixed(db, m, uid); if (next !== db) commit(structuredClone(next)); }

// ---------- chữ dùng chung ----------
const source = id => db.sources.find(x => x.id === id);
const sourceName = id => id ? (source(id)?.name || 'Nguồn đã xoá') : 'Chưa chọn nguồn';
const sourceLabel = x => `${SOURCE_ICON[x.kind]} ${x.name}`;
const N = () => db.names;
function netText(net) { return net > 0 ? `${N().b} cần trả ${N().a}` : net < 0 ? `${N().a} cần trả ${N().b}` : `${N().a} & ${N().b} đã cân bằng`; }
function owedText(net) { return net > 0 ? `${N().b} nợ ${N().a} ${fmt(net)}` : net < 0 ? `${N().a} nợ ${N().b} ${fmt(-net)}` : 'Không phát sinh nợ'; }
function splitLabel(e) {
  if (e.kind === 'opening') return 'Nợ ban đầu';
  return {half: 'Chia đôi', a: 'Riêng ' + N().a.toLowerCase(), b: 'Riêng ' + N().b, custom: `${N().b} chịu ${fmt(e.custom)}`, company: N().c + ' ứng'}[e.split];
}
function stat(label, value, note, cls = '') { return `<div class="stat ${cls}"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-note">${esc(note)}</div></div>`; }
function empty(title, text, action = '') { return `<div class="empty"><img src="./icons/corgi.svg" alt=""><strong>${esc(title)}</strong><p>${esc(text)}</p>${action}</div>`; }
function head(title, sub, button = '') { return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="subtitle">${sub}</p>` : ''}</div>${button}</div>`; }
function monthNav(m, type) { return `<div class="month-nav"><button class="icon-btn" data-shift="${type}:-1" aria-label="Tháng trước">‹</button><strong>${monthName(m)}</strong><button class="icon-btn" data-shift="${type}:1" aria-label="Tháng sau">›</button></div>`; }

function expenseHTML(e) {
  const locked = !!(e.settlementId || e.reimburseId), company = e.split === 'company';
  const status = company ? (e.reimburseId ? '<span class="tag green">✓ Đã hoàn</span>' : '<span class="tag orange">Chờ hoàn</span>') : e.settlementId ? '<span class="tag green">✓ Đã chốt</span>' : '';
  const amount = e.kind === 'opening' ? Math.abs(e.balance) : e.amount;
  const meta = e.kind === 'opening' ? owedText(e.balance) : `${esc(N()[e.payer])} trả${e.payer === 'a' && e.sourceId ? ' · ' + esc(sourceName(e.sourceId)) : ''} · ${esc(e.category)}`;
  return `<article class="expense ${company ? 'is-company' : ''}"><span class="cat-icon">${e.kind === 'opening' ? '↶' : company ? '💼' : catIcon(e.category)}</span>
    <div class="expense-body"><div class="expense-name">${esc(e.description)}</div><div class="expense-meta">${meta}</div>${e.note ? `<div class="expense-note">${esc(e.note)}</div>` : ''}
    <div class="expense-tags"><span class="tag ${company ? 'orange' : ''}">${esc(splitLabel(e))}</span>${status}${e.review ? reviewTag(e.id) : ''}</div></div>
    <div class="expense-side"><span class="expense-amount">${fmt(amount)}</span>${locked ? '' : `<div>${e.kind !== 'opening' ? `<button class="text-btn" data-edit="${e.id}">Sửa</button>` : ''}<button class="text-btn danger" data-delete="${e.id}">Xoá</button></div>`}</div></article>`;
}

const reviewTag = id => `<button class="tag orange" data-reviewed="${id}" title="Bấm để bỏ đánh dấu">🔎 Cần xem lại ✓</button>`;
const reviewItems = () => [...db.expenses.filter(e => e.review), ...db.incomes.filter(i => i.review)];
function incomeHTML(i) {
  return `<article class="expense is-income"><span class="cat-icon">${incomeIcon(i.category)}</span>
    <div class="expense-body"><div class="expense-name">${esc(i.description)}</div><div class="expense-meta">${esc(i.category)} · vào ${esc(sourceName(i.sourceId))}</div>${i.note ? `<div class="expense-note">${esc(i.note)}</div>` : ''}${i.review ? `<div class="expense-tags">${reviewTag(i.id)}</div>` : ''}</div>
    <div class="expense-side"><span class="expense-amount green">+${fmt(i.amount)}</span><div><button class="text-btn" data-edit-income="${i.id}">Sửa</button><button class="text-btn danger" data-delete-income="${i.id}">Xoá</button></div></div></article>`;
}

// ---------- Ví của chị ----------
function walletHTML(full) {
  const w = wallet(db, today()), cashRows = w.rows.filter(r => !isCredit(r.source.kind)), creditRows = w.rows.filter(r => isCredit(r.source.kind));
  const row = r => `<button class="money-row src-row" data-set-source="${r.source.id}"><span>${sourceLabel(r.source)}${r.balance === null ? '<small class="orange">Chưa nhập số dư · bấm để nhập</small>' : isCredit(r.source.kind) ? `<small>${r.left !== null ? 'Còn quẹt được ' + fmt(r.left) : 'Chưa nhập hạn mức'}</small>` : ''}</span><b>${r.balance === null ? '—' : isCredit(r.source.kind) ? (r.balance ? '−' + fmt(r.balance) : fmt(0)) : signedHTML(r.balance)}</b></button>`;
  const tiles = `<div class="wallet-grid">
      <div class="wtile"><span>Tiền đang có</span><b>${signedHTML(w.cash)}</b></div>
      <div class="wtile"><span>Nợ còn trả tháng này</span><b class="${w.due ? 'red' : ''}">${w.due ? '−' + fmt(w.due) : fmt(0)}</b></div>
      <div class="wtile big ${w.spendable < 0 ? 'neg' : 'pos'}"><span>Còn được tiêu tháng này ≈</span><b>${signed(w.spendable)}</b></div>
      <div class="wtile"><span>Hạn mức thẻ còn</span><b>${w.creditLeft === null ? '—' : fmt(w.creditLeft)}</b></div>
      <div class="wtile"><span>Dư nợ thẻ / trả sau</span><b class="${w.creditDebt ? 'red' : ''}">${w.creditDebt ? '−' + fmt(w.creditDebt) : fmt(0)}</b></div>
    </div>`;
  if (!full) return `<button class="wallet-mini ${w.spendable < 0 ? 'neg' : ''}" data-page="flow"><span>Còn được tiêu tháng này ≈</span><b>${signed(w.spendable)}</b><small>Tiền đang có ${signed(w.cash)} · nợ còn trả ${fmt(w.due)}${w.missing ? ` · ${w.missing} nguồn chưa nhập số dư` : ''} ›</small></button>`;
  return `<section class="panel"><div class="panel-head"><h2>👛 Ví của ${esc(N().a.toLowerCase())}</h2><span class="tag">hôm nay</span></div>${tiles}
    ${w.noAmount ? `<p class="hint orange">${w.noAmount} khoản (thường là thẻ) chưa nhập số tiền, nên “nợ còn trả” đang thiếu.</p>` : ''}
    ${w.missing ? `<p class="hint">Bấm vào nguồn có chữ cam để nhập số dư 1 lần. Sau đó app tự cộng trừ.</p>` : ''}
    <details class="wallet-detail" ${w.missing ? 'open' : ''}><summary>Chi tiết từng nguồn ▾</summary>
      <div class="field-label" style="margin-top:10px">Tiền mặt · ngân hàng · ví</div>${cashRows.map(row).join('')}
      <div class="field-label" style="margin-top:14px">Thẻ tín dụng · trả sau (dư nợ)</div>${creditRows.length ? creditRows.map(row).join('') : '<p class="hint">Chưa có.</p>'}
      ${w.debtLeft ? `<div class="money-row"><span>🏦 Tổng dư nợ vay còn lại<small>từ Góc cố định</small></span><b class="red">−${fmt(w.debtLeft)}</b></div>` : ''}
      <p class="hint">Lệch với số thật trong app ngân hàng? Bấm vào nguồn đó → nhập số thực tế, app tự chỉnh.</p></details></section>`;
}
function dueSoonHTML() {
  const list = upcoming(db, today(), 7);
  if (!list.length) return '';
  const when = d => d < 0 ? `<b class="red">quá hạn ${-d} ngày</b>` : d === 0 ? '<b class="red">hôm nay</b>' : d === 1 ? '<b class="orange">ngày mai</b>' : `còn ${d} ngày`;
  return `<section class="panel due-panel"><div class="panel-head"><h2>⏰ Sắp đến hạn trong tuần</h2><span class="tag red-tag">${fmt(list.reduce((t, f) => t + f.amount, 0))}</span></div>
    ${list.map(f => `<div class="due-row"><button class="paid-toggle" data-paid="${f.id}" aria-label="Đánh dấu đã trả ${esc(f.name)}"></button><span>${TYPE_ICON[f.type]} ${esc(f.name)}<small>${shortDate(f.due)} · ${when(f.daysLeft)}</small></span><b>${f.amount ? fmt(f.amount) : '<span class="orange">Nhập số</span>'}</b></div>`).join('')}
    <button class="text-btn" data-page="settings">🔔 Cài nhắc trên iPhone ›</button></section>`;
}

// ---------- trang Lịch ----------
function upcomingNextMonth() { return addDays(today(), 7).slice(0, 7) !== today().slice(0, 7); }
function renderHome() {
  ensureFixed(today().slice(0, 7));
  if (upcomingNextMonth()) ensureFixed(shiftMonth(today().slice(0, 7), 1));
  const rows = db.expenses.filter(e => e.kind !== 'opening' && monthOf(e) === month), s = totals(rows);
  const net = totals(outstanding(db.expenses)).net, comp = companyPending(db.expenses).reduce((t, e) => t + e.amount, 0);
  const dayRows = db.expenses.filter(e => e.date === selected).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const dayIncomes = db.incomes.filter(i => i.date === selected), monthIncome = db.incomes.filter(i => i.date.slice(0, 7) === month).reduce((t, i) => t + i.amount, 0);
  const [y, m] = month.split('-').map(Number), count = new Date(y, m, 0).getDate(), start = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  let cells = Array.from({length: start}, () => '<div class="day blank"></div>').join('');
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${pad(d)}`, list = rows.filter(e => e.date === date), total = list.reduce((t, e) => t + e.amount, 0);
    cells += `<button class="day ${date === selected ? 'selected' : ''} ${date === today() ? 'today' : ''}" data-date="${date}" aria-label="${niceDate(date)}${total ? ', chi ' + fmt(total) : ''}"><span class="day-num">${d}</span>${total ? `<span class="day-money">${compact(total)}</span>` : ''}<span class="dots">${list.some(e => e.split === 'company') ? '<i class="dot"></i>' : ''}${db.incomes.some(i => i.date === date) ? '<i class="dot green"></i>' : ''}</span></button>`;
  }
  const backupDays = db.lastBackup ? Math.floor((Date.now() - new Date(db.lastBackup)) / 864e5) : null;
  const needBackup = db.expenses.length >= 10 && (backupDays === null || backupDays >= 14);
  return `<section class="hero"><div><span class="eyebrow">${monthName(month).toUpperCase()}</span><div class="hero-value">${fmt(s.total)}</div><p>${rows.length} khoản đã chi · phần ${esc(N().a.toLowerCase())} chịu <b>${fmt(s.share.a)}</b></p><button class="hero-link" data-page="flow">Thu tháng này <b>+${fmt(monthIncome)}</b> · xem dòng tiền ›</button></div><img src="./icons/corgi.svg" alt=""></section>
  <section class="stats">
    <button class="stat link" data-page="nhi"><div class="stat-label">${esc(N().a)} ⇄ ${esc(N().b)}</div><div class="stat-value">${fmt(Math.abs(net))}</div><div class="stat-note">${esc(netText(net))}</div></button>
    <button class="stat link" data-page="company"><div class="stat-label">${esc(N().c)} còn nợ</div><div class="stat-value orange">${fmt(comp)}</div><div class="stat-note">${companyPending(db.expenses).length} khoản chờ hoàn ứng</div></button>
  </section>
  ${reviewItems().length ? `<button class="due-banner soft" data-page="review"><strong>🔎 ${reviewItems().length} khoản từ sao kê cần xem lại</strong><span>Chi cho ai, mục đích gì · bấm để xem và sửa dần</span></button>` : ''}
  ${walletHTML(false)}
  ${dueSoonHTML()}
  ${needBackup ? `<button class="due-banner soft" data-page="settings"><strong>💾 Nên tải backup</strong><span>${backupDays === null ? 'Chưa có bản backup nào.' : `Lần gần nhất ${backupDays} ngày trước.`} Dữ liệu chỉ nằm trên máy này.</span></button>` : ''}
  <section class="panel"><div class="panel-head">${monthNav(month, 'home')}<button class="btn ghost small" data-action="today">Hôm nay</button></div>
    <div class="calendar">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(x => `<div class="weekday">${x}</div>`).join('')}${cells}</div>
    <div class="legend"><span><i class="dot"></i> ${esc(N().c)} ứng <i class="dot green"></i> Có thu</span><span>${new Set(rows.map(e => e.date)).size} ngày đã ghi</span></div></section>
  <section class="panel"><div class="panel-head"><div><h2>Ngày ${shortDate(selected)}</h2><small class="muted">Chi ${fmt(totals(dayRows).total)}${dayIncomes.length ? ` · thu +${fmt(dayIncomes.reduce((t, i) => t + i.amount, 0))}` : ''}</small></div><button class="btn primary small" data-action="add">＋ Thêm</button></div>
    <div class="list">${dayRows.length || dayIncomes.length ? dayIncomes.map(incomeHTML).join('') + dayRows.map(expenseHTML).join('') : empty('Ngày này còn trống', 'Bấm ＋ để ghi khoản chi hoặc khoản thu.')}</div></section>`;
}

// ---------- trang Chị & Nhi ----------
function nhiRows() { return nhiScope === 'all' ? db.expenses : db.expenses.filter(e => monthOf(e) === nhiScope); }
function nhiLabel() { return nhiScope === 'all' ? 'Tất cả các tháng' : monthName(nhiScope); }
function donut(categories) {
  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]), sum = entries.reduce((s, e) => s + e[1], 0);
  if (!sum) return empty('Chưa có dữ liệu', 'Ghi vài khoản chi để xem tiền đi đâu.');
  let cursor = 0;
  const gradient = entries.map((e, i) => { const a = cursor; cursor += e[1] / sum * 100; return `${COLORS[i % COLORS.length]} ${a}% ${cursor}%`; }).join(',');
  return `<div class="chart"><div class="donut" role="img" aria-label="Tỷ trọng theo danh mục" style="background:conic-gradient(${gradient})"></div><div class="legend-list">${entries.map(([c, v], i) => `<div class="money-row"><span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(c)}</span><b>${fmt(v)} <small class="muted">${Math.round(v / sum * 100)}%</small></b></div>`).join('')}</div></div>`;
}
function renderNhi() {
  const months = [...new Set(db.expenses.map(monthOf))].sort().reverse();
  const rows = nhiRows().filter(e => e.split !== 'company'), s = totals(rows), pending = outstanding(rows), n = totals(pending).net;
  return head(`${esc(N().a)} & ${esc(N().b)}`, 'Ai chịu bao nhiêu, ai cần trả ai. Không gồm khoản công ty.') +
  `<div class="filters"><select id="nhiScope" aria-label="Phạm vi"><option value="all">Tất cả các tháng</option>${months.map(m => `<option value="${m}" ${m === nhiScope ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select></div>
  <section class="hero debt"><div><span class="eyebrow">CHƯA THANH TOÁN · ${esc(nhiLabel().toUpperCase())}</span><h2>${esc(netText(n))}</h2><div class="hero-value">${fmt(Math.abs(n))}</div><p>${pending.length} khoản chưa chốt</p>
    <div class="actions"><button class="btn light" data-action="settle" ${pending.length ? '' : 'disabled'}>✓ Đã thanh toán xong</button><button class="btn outline" data-action="copy-nhi">↗ Gửi ${esc(N().b)}</button></div></div></section>
  <section class="stats">${stat(`Phần ${N().a.toLowerCase()} chịu`, fmt(s.share.a), `${N().a} đã trả ${fmt(s.paid.a)}`)}${stat(`Phần ${N().b} chịu`, fmt(s.share.b), `${N().b} đã trả ${fmt(s.paid.b)}`)}</section>
  <section class="panel"><div class="panel-head"><h2>Khoản chờ chốt</h2><span class="tag">${pending.length}</span></div>
    ${pending.length ? pending.slice().sort((a, b) => b.date.localeCompare(a.date)).map(e => `<div class="money-row"><span>${shortDate(e.date)} · ${esc(e.description)}<small>${esc(splitLabel(e))}${e.payer ? ' · ' + esc(N()[e.payer]) + ' trả' : ''}</small></span><b class="${debt(e) < 0 ? 'orange' : ''}">${debt(e) > 0 ? '+' : ''}${fmt(debt(e))}</b></div>`).join('') : empty('Gọn gàng rồi', 'Khoản chưa thanh toán sẽ hiện ở đây.')}
    <p class="hint">Số dương: ${esc(N().b)} nợ ${esc(N().a.toLowerCase())}. Số âm: ${esc(N().a.toLowerCase())} nợ ${esc(N().b)}.</p></section>
  <section class="panel"><div class="panel-head"><h2>Tiền đi đâu?</h2><span class="tag">${esc(nhiLabel())}</span></div>${donut(s.categories)}</section>
  <section class="panel"><div class="panel-head"><h2>Lịch sử chốt tiền</h2></div>
    ${db.settlements.length ? db.settlements.map(x => `<div class="history-row"><div><strong>${esc(owedText(x.net))}</strong><small>${esc(x.label)} · ${x.entryIds.length} khoản · ${new Date(x.at).toLocaleDateString('vi-VN')}</small></div><button class="btn ghost small" data-undo="${x.id}">Hoàn tác</button></div>`).join('') : '<p class="hint">Chưa có kỳ nào được chốt.</p>'}</section>
  <details class="panel"><summary><h2>Nợ từ trước khi dùng app</h2></summary>
    <form id="openingForm"><label>Chiều nợ<select name="direction"><option value="1">${esc(N().b)} nợ ${esc(N().a.toLowerCase())}</option><option value="-1">${esc(N().a)} nợ ${esc(N().b)}</option></select></label>
    <div class="form-row"><label>Số tiền<input name="amount" required inputmode="decimal" placeholder="Ví dụ: 500k"></label><label>Ngày<input name="date" type="date" required value="${today()}"></label></div>
    <button class="btn ghost small">Thêm số dư ban đầu</button></form></details>`;
}

// ---------- trang Hoàn ứng ----------
function renderCompany() {
  const pending = companyPending(db.expenses).sort((a, b) => a.date.localeCompare(b.date));
  const total = pending.reduce((s, e) => s + e.amount, 0), picked = pending.filter(e => !unpicked.has(e.id)), pickedSum = picked.reduce((s, e) => s + e.amount, 0);
  const done = db.reimbursements.reduce((s, r) => s + r.amount, 0);
  return head('Hoàn ứng ' + esc(N().c), 'Các khoản chị chi hộ công ty, chờ kế toán hoàn lại.') +
  `<section class="hero company"><div><span class="eyebrow">${esc(N().c.toUpperCase())} CÒN NỢ ${esc(N().a.toUpperCase())}</span><div class="hero-value">${fmt(total)}</div><p>${pending.length} khoản chờ hoàn${pending.length ? ` · cũ nhất từ ${niceDate(pending[0].date)}` : ''}</p>
    <div class="actions"><button class="btn light" data-action="copy-company" ${pending.length ? '' : 'disabled'}>↗ Sao chép bảng kê</button><button class="btn outline" data-action="company-csv" ${pending.length ? '' : 'disabled'}>↓ Excel</button></div></div></section>
  <section class="panel"><div class="panel-head"><h2>Chờ hoàn</h2>${pending.length ? `<button class="text-btn" data-action="pick-all">${picked.length === pending.length ? 'Bỏ chọn hết' : 'Chọn hết'}</button>` : ''}</div>
    ${pending.length ? pending.map(e => `<label class="pick-row"><input type="checkbox" data-pick="${e.id}" ${unpicked.has(e.id) ? '' : 'checked'}><span><b>${esc(e.description)}</b><small>${niceDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</small></span><strong>${fmt(e.amount)}</strong></label>`).join('') +
      `<div class="pick-total"><span>Đã chọn ${picked.length} khoản</span><b>${fmt(pickedSum)}</b></div><button class="btn primary wide" data-action="reimburse" ${picked.length ? '' : 'disabled'}>✓ Công ty đã chuyển ${fmt(pickedSum)}</button>`
      : empty('Không có khoản chờ hoàn', `Khi thêm khoản chi, chọn “${N().c} ứng” để app ghi vào đây.`)}</section>
  <section class="stats">${stat('Đã được hoàn', fmt(done), db.reimbursements.length + ' lần nhận tiền')}${stat('Tổng đã ứng', fmt(done + total), 'Từ khi dùng app')}</section>
  <section class="panel"><div class="panel-head"><h2>Lịch sử nhận hoàn ứng</h2></div>
    ${db.reimbursements.length ? db.reimbursements.map(r => { const items = db.expenses.filter(e => e.reimburseId === r.id); return `<details class="history-row"><summary><div><strong>${fmt(r.amount)}</strong><small>Nhận ngày ${new Date(r.at).toLocaleDateString('vi-VN')} · ${items.length} khoản</small></div><span class="muted">▾</span></summary>${items.map(e => `<div class="money-row"><span>${shortDate(e.date)} · ${esc(e.description)}</span><b>${fmt(e.amount)}</b></div>`).join('')}<button class="btn ghost small" data-unreimburse="${r.id}">Hoàn tác lần nhận này</button></details>`; }).join('') : '<p class="hint">Chưa nhận lần hoàn ứng nào.</p>'}</section>`;
}

// ---------- trang Cố định ----------
function cardSwipe(f) {
  const src = db.sources.find(x => x.kind === 'card' && ((f.templateId && x.templateId === f.templateId) || x.name.toLowerCase() === f.name.toLowerCase()));
  if (!src) return '';
  const m = shiftMonth(f.due.slice(0, 7), -1), sum = db.expenses.filter(e => e.sourceId === src.id && e.payer === 'a' && e.date.slice(0, 7) === m).reduce((t, e) => t + e.amount, 0);
  return sum ? `<div class="expense-note">Quẹt ${monthName(m).toLowerCase()}: ${fmt(sum)} (đối chiếu sao kê)</div>` : '';
}
function fixedRow(f) {
  const t = db.templates.find(x => x.id === f.templateId), remaining = t && t.type === 'debt' ? debtRemaining(db, t) : null, overdue = !f.paid && f.due < today();
  return `<article class="fixed-row ${f.paid ? 'paid' : ''}"><button class="paid-toggle ${f.paid ? 'on' : ''}" data-paid="${f.id}" aria-label="${f.paid ? 'Bỏ đánh dấu' : 'Đánh dấu'} đã trả ${esc(f.name)}" aria-pressed="${f.paid}">${f.paid ? '✓' : ''}</button>
    <div class="expense-body"><div class="expense-name">${TYPE_ICON[f.type]} ${esc(f.name)}${t ? ' <span class="muted small">↻</span>' : ''}</div>
    ${f.type === 'card' ? cardSwipe(f) : ''}<div class="expense-meta ${overdue ? 'red' : ''}">${f.paid ? `Đã trả ${shortDate(f.paidDate)}` : `Hạn ${shortDate(f.due)}${overdue ? ' · <b>quá hạn</b>' : ''}`}${remaining !== null ? ` · còn nợ ${fmt(remaining)}` : ''}</div>${f.note ? `<div class="expense-note">${esc(f.note)}</div>` : ''}</div>
    <div class="expense-side"><span class="expense-amount">${f.amount ? fmt(f.amount) : '<span class="orange">Nhập số</span>'}</span><div><button class="text-btn" data-edit-fixed="${f.id}">Sửa</button><button class="text-btn danger" data-delete-fixed="${f.id}">Xoá</button></div></div></article>`;
}
function renderFixed() {
  ensureFixed(fixedMonth);
  const all = db.fixed.filter(f => f.due.slice(0, 7) === fixedMonth), rows = all.filter(f => fixedType === 'all' || f.type === fixedType).sort((a, b) => a.paid - b.paid || a.due.localeCompare(b.due));
  const sum = rows.reduce((s, f) => s + f.amount, 0), paid = rows.filter(f => f.paid).reduce((s, f) => s + f.amount, 0), overdue = rows.filter(f => !f.paid && f.due < today()).length;
  const templates = db.templates.filter(t => fixedType === 'all' || t.type === fixedType);
  const tabs = [['all', 'Tất cả'], ['card', '💳 Thẻ'], ['debt', '🏦 Nợ'], ['bill', '🧾 Chi']];
  return head('Góc cố định', 'Thẻ tín dụng, nợ, chi cố định. Riêng của chị, không chia với ai.', `<button class="btn primary small" data-action="add-fixed">＋ Thêm</button>`) +
  `<div class="segment">${tabs.map(([k, l]) => `<button data-ftype="${k}" class="${fixedType === k ? 'on' : ''}">${l}<small>${k === 'all' ? all.length : all.filter(f => f.type === k).length}</small></button>`).join('')}</div>
  <section class="hero fixed"><div>${monthNav(fixedMonth, 'fixed')}<div class="hero-value">${fmt(sum - paid)}</div><p>còn phải trả · tổng ${fmt(sum)} · đã trả ${fmt(paid)}${overdue ? ` · <b>${overdue} quá hạn</b>` : ''}</p>
    <div class="progress"><i style="width:${sum ? Math.round(paid / sum * 100) : 0}%"></i></div></div></section>
  <section class="panel"><div class="list">${rows.length ? rows.map(fixedRow).join('') : empty('Tháng này chưa có khoản nào', 'Thêm thẻ, khoản vay, tiền nhà… Chọn “Lặp lại mỗi tháng” để app tự tạo các tháng sau.', '<button class="btn ghost small" data-action="add-fixed">＋ Thêm khoản</button>')}</div></section>
  <section class="panel"><div class="panel-head"><h2>Lặp lại hằng tháng</h2><span class="tag">${templates.length}</span></div>
    ${templates.length ? templates.map(t => { const r = t.type === 'debt' ? debtRemaining(db, t) : null; return `<div class="template-row"><div><strong>${TYPE_ICON[t.type]} ${esc(t.name)}</strong><small>${FIXED_TYPES[t.type]} · ${t.amount ? fmt(t.amount) : 'số tiền nhập mỗi tháng'} · ngày ${t.day}${r !== null ? ` · còn nợ ${fmt(r)}${t.amount ? ` (~${Math.ceil(r / t.amount)} kỳ)` : ''}` : ''}</small></div><div><button class="text-btn" data-edit-template="${t.id}">Sửa</button><button class="text-btn danger" data-del-template="${t.id}">Xoá</button></div></div>`; }).join('') : '<p class="hint">Chưa có khoản lặp lại. Thêm một khoản và tick “Lặp lại mỗi tháng”.</p>'}
    <p class="hint">Đầu mỗi tháng app tự tạo khoản từ danh sách này. Thẻ tín dụng để số tiền 0 rồi nhập số sao kê khi có.</p></section>`;
}

// ---------- trang Dòng tiền ----------
function line(label, value, cls = '') { return `<div class="money-row"><span>${label}</span><b class="${cls}">${value}</b></div>`; }
function renderFlow() {
  ensureFixed(flowMonth);
  const c = cashflow(db, flowMonth), incomes = db.incomes.filter(i => i.date.slice(0, 7) === flowMonth).sort((a, b) => b.date.localeCompare(a.date));
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  const spendRows = Object.entries(c.spendBy).sort((a, b) => b[1] - a[1]);
  return head('Dòng tiền', 'Tiền thật vào – ra túi chị mỗi tháng.', '<button class="btn primary small green-btn" data-action="add-income">＋ Khoản thu</button>') +
  walletHTML(true) + `<section class="hero flow ${c.net < 0 ? 'neg' : ''}"><div>${monthNav(flowMonth, 'flow')}<span class="eyebrow">CÒN LẠI SAU THÁNG</span><div class="hero-value">${sign(c.net)}</div>
    <div class="flow-bars"><div><span>Tiền vào</span><b class="green">+${fmt(c.cashIn)}</b></div><div><span>Tiền ra thật</span><b class="red">−${fmt(c.cashOut)}</b></div></div></div></section>
  <section class="panel"><div class="panel-head"><h2>Tiền vào</h2><b class="green">+${fmt(c.cashIn)}</b></div>
    ${Object.entries(c.incomeBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => line(`${incomeIcon(k)} ${esc(k)}`, '+' + fmt(v))).join('')}
    ${c.fromNhi ? line(`⇄ ${esc(N().b)} trả ${esc(N().a.toLowerCase())} <small>tự tính khi chốt</small>`, '+' + fmt(c.fromNhi)) : ''}
    ${c.fromCompany ? line(`💼 ${esc(N().c)} hoàn ứng <small>tự tính khi nhận</small>`, '+' + fmt(c.fromCompany)) : ''}
    ${c.cashIn ? '' : '<p class="hint">Chưa có khoản thu tháng này. Bấm “＋ Khoản thu” để ghi lương, vay, thu khác.</p>'}</section>
  <section class="panel"><div class="panel-head"><h2>Tiền ra thật</h2><b class="red">−${fmt(c.cashOut)}</b></div>
    ${line('💵 Chi trả ngay <small>tiền mặt, chuyển khoản, ví</small>', fmt(c.immediate))}
    ${Object.entries(c.fixedBy).map(([k, v]) => line(`${TYPE_ICON[k]} Trả ${FIXED_TYPES[k].toLowerCase()} <small>đã tick ở Góc cố định</small>`, fmt(v))).join('')}
    ${c.toNhi ? line(`⇄ ${esc(N().a)} trả ${esc(N().b)}`, fmt(c.toNhi)) : ''}
    ${c.credit ? `<p class="hint">💳 ${fmt(c.credit)} quẹt thẻ / trả sau tháng này <b>chưa tính</b> vào đây. Tiền thật ra khi chị tick đã trả thẻ ở Góc cố định, nên không bị tính trùng.</p>` : ''}</section>
  <section class="panel"><div class="panel-head"><h2>Chi tiêu theo nguồn</h2><span class="tag">${fmt(c.spend)}</span></div>
    ${spendRows.length ? spendRows.map(([id, v]) => { const x = source(id); return line(`${x ? SOURCE_ICON[x.kind] : '❔'} ${esc(sourceName(id))}${x && isCredit(x.kind) ? ' <span class="tag orange">trả sau</span>' : ''}`, fmt(v)); }).join('') : '<p class="hint">Chưa có khoản chi nào chị trả trong tháng.</p>'}
    <p class="hint">Gồm mọi khoản chị trả, kể cả phần chi hộ ${esc(N().b)} và ${esc(N().c.toLowerCase())}.</p></section>
  <section class="panel"><div class="panel-head"><h2>Các khoản thu</h2><span class="tag">${incomes.length}</span></div>
    <div class="list">${incomes.length ? incomes.map(incomeHTML).join('') : empty('Chưa ghi khoản thu', 'Lương, thưởng, tiền vay, thu nhập khác…', '<button class="btn ghost small" data-action="add-income">＋ Ghi khoản thu</button>')}</div></section>`;
}

// ---------- trang Cần xem lại ----------
function renderReview() {
  const list = reviewItems().sort((a, b) => b.date.localeCompare(a.date) || (b.amount - a.amount));
  let lastMonth = '';
  return head('Cần xem lại', 'Khoản nhập từ sao kê chưa rõ chi cho ai / mục đích gì. Bấm Sửa để chọn danh mục, cách chia. Đúng rồi thì bấm “Cần xem lại ✓” để bỏ đánh dấu.') +
  `<div class="list">${list.length ? list.map(x => { const m = x.date.slice(0, 7), sep = m !== lastMonth ? `<div class="field-label" style="margin-top:8px">${monthName(m)}</div>` : ''; lastMonth = m; return sep + (x.payer ? expenseHTML(x) : incomeHTML(x)); }).join('') : empty('Xong hết rồi', 'Không còn khoản nào cần xem lại 🐶')}</div>`;
}

// ---------- trang Cài đặt ----------
function renderSettings() {
  const backup = db.lastBackup ? new Date(db.lastBackup).toLocaleDateString('vi-VN') : 'chưa có';
  return head('Cài đặt', '') +
  `<section class="panel"><h2>Tên hiển thị</h2><form id="namesForm"><div class="form-row"><label>Chị<input name="a" required maxlength="30" value="${esc(N().a)}"></label><label>Em gái<input name="b" required maxlength="30" value="${esc(N().b)}"></label></div>
    <div class="form-row"><label>Công ty<input name="c" required maxlength="60" value="${esc(N().c)}"></label><label><span>Họ tên đầy đủ <span class="muted">(in trên bảng kê)</span></span><input name="full" maxlength="80" value="${esc(N().full)}" placeholder="Lê Phương Quyên"></label></div>
    <button class="btn primary small">Lưu tên</button></form></section>
  <section class="panel"><h2>Danh mục chi tiêu</h2><div class="chips">${db.categories.map((c, i) => `<span class="chip">${catIcon(c)} ${esc(c)}<button data-del-cat="${i}" aria-label="Xoá ${esc(c)}">×</button></span>`).join('')}</div>
    <form id="categoryForm" class="inline-form"><input name="category" required maxlength="100" placeholder="Danh mục mới" aria-label="Danh mục mới"><button class="btn ghost small">＋ Thêm</button></form></section>
  <section class="panel"><h2>🔔 Nhắc hạn trả</h2>
    <p><b>Cách 1 · Lịch iPhone (nên dùng):</b> tải file nhắc → iPhone hỏi “Thêm tất cả” vào Lịch. iPhone tự báo 9h sáng hôm trước và sáng ngày đến hạn, không cần mở app. Thêm khoản mới thì tải lại.</p>
    <button class="btn primary small" data-action="ics">📅 Tải lịch nhắc (${db.templates.length + db.fixed.filter(f => !f.paid && !f.templateId && f.due >= today()).length} khoản)</button>
    <p style="margin-top:14px"><b>Cách 2 · Thông báo của app:</b> mỗi ngày lần đầu mở app, nếu có khoản tới hạn trong 3 ngày thì app bật thông báo.</p>
    <button class="btn ghost small" data-action="notify">${'Notification' in window && Notification.permission === 'granted' ? '✓ Đã bật thông báo' : '🔔 Bật thông báo'}</button></section>
  <section class="panel"><h2>Nguồn tiền</h2><p>Chọn khi ghi khoản chi / khoản thu. Thẻ tín dụng thêm ở Góc cố định sẽ tự có ở đây. Số dư nhập ở tab Dòng tiền → Ví của chị.</p>
    <div class="chips">${db.sources.map(x => `<span class="chip">${sourceLabel(x)}<button data-del-source="${x.id}" aria-label="Xoá ${esc(x.name)}">×</button></span>`).join('')}</div>
    <form id="sourceForm" class="inline-form"><input name="name" required maxlength="60" placeholder="Ví dụ: Techcombank, Momo" aria-label="Tên nguồn"><select name="kind" aria-label="Loại nguồn" style="max-width:130px">${Object.entries(SOURCE_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn ghost small">＋</button></form></section>
  <section class="panel"><h2>Loại khoản thu</h2><div class="chips">${db.incomeCategories.map((c, i) => `<span class="chip">${incomeIcon(c)} ${esc(c)}<button data-del-icat="${i}" aria-label="Xoá ${esc(c)}">×</button></span>`).join('')}</div>
    <form id="incomeCategoryForm" class="inline-form"><input name="category" required maxlength="100" placeholder="Ví dụ: Cho thuê, Freelance" aria-label="Loại thu mới"><button class="btn ghost small">＋ Thêm</button></form></section>
  <section class="panel"><h2>Backup dữ liệu</h2><p>Dữ liệu chỉ nằm trong điện thoại này, không tự đồng bộ. Tải backup mỗi 2 tuần và lưu vào iCloud Drive. Lần gần nhất: <b>${backup}</b>.</p>
    <div class="btn-row"><button class="btn primary small" data-action="backup">↓ Tải backup</button><button class="btn ghost small" data-action="restore">↑ Khôi phục</button><button class="btn ghost small" data-action="import">＋ Nhập thêm từ file</button><button class="btn ghost small" data-action="csv">↓ Excel chi tiêu</button><button class="btn ghost small" data-action="fixed-csv">↓ Excel cố định</button><button class="btn ghost small" data-action="income-csv">↓ Excel khoản thu</button></div>
    ${loadError ? '<button class="btn ghost small" data-action="raw-backup">Tải dữ liệu gốc chưa đọc được</button>' : ''}</section>
  <section class="panel"><h2>Cài lên iPhone</h2><p>1. Mở link app bằng <b>Safari</b>.<br>2. Bấm nút Chia sẻ ⎋ → <b>Thêm vào MH chính</b>.<br>3. Mở app bằng icon Corgi. Sau lần mở đầu, app chạy được cả khi không có mạng.</p><span class="tag green" id="offlineSetting">Đang kiểm tra offline…</span></section>
  <p class="footer-note">Corgi Pocket v1.3 · làm riêng cho ${esc(N().full || N().a)} 🐶</p>`;
}

function render() {
  const pages = {review: renderReview, home: renderHome, nhi: renderNhi, company: renderCompany, fixed: renderFixed, flow: renderFlow, settings: renderSettings};
  $('#view').innerHTML = (loadError ? '<div class="notice">Chưa đọc được dữ liệu đã lưu. App đang giữ nguyên bản gốc; vào Cài đặt để tải bản gốc hoặc khôi phục backup.</div>' : '') + pages[page]();
  $$('.tabbar [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#tabNhi').textContent = N().b;
  $('#brandSub').textContent = 'Sổ chi tiêu của ' + (N().full || N().a).split(' ').pop();
  $('#fab').hidden = !['home', 'fixed', 'company', 'flow'].includes(page);
  if (page === 'settings') updateOffline();
}
function go(p) { page = p; history.replaceState(null, '', '#' + p); render(); window.scrollTo({top: 0}); }
// pick = {label, value}: hỏi thêm nguồn tiền (trả bằng / nhận vào), trả về id nguồn thay cho true
function confirmAction(title, text, label = 'Xác nhận', pick = null) {
  const d = $('#confirmDialog'); $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmOK').textContent = label; d.returnValue = '';
  $('#confirmPick').hidden = !pick;
  if (pick) { $('#confirmPickLabel').textContent = pick.label; d.querySelector('[name=pick]').value = pick.value; drawConfirmChips(); }
  d.showModal();
  return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? (pick ? d.querySelector('[name=pick]').value || null : true) : false), {once: true}));
}
function drawConfirmChips() {
  const v = $('#confirmDialog [name=pick]').value;
  $('#confirmChips').innerHTML = chipHTML('pick', db.sources.filter(x => !isCredit(x.kind)).map(x => [x.id, sourceLabel(x)]), v);
}
function lastVia() {
  const used = [...db.fixed.filter(f => f.paidFrom).map(f => [f.paidAt || f.paidDate, f.paidFrom]), ...[...db.settlements, ...db.reimbursements].filter(x => x.via).map(x => [x.at, x.via])].sort((a, b) => b[0].localeCompare(a[0]));
  return used.find(([, id]) => source(id))?.[1] || 'bank';
}
const optionHTML = (arr, value) => arr.map(c => `<option ${c === value ? 'selected' : ''} value="${esc(c)}">${esc(c)}</option>`).join('');
const chipHTML = (name, list, value) => list.map(([v, l]) => `<button type="button" role="radio" data-chip="${name}" data-value="${v}" aria-checked="${v === value}" class="${v === value ? 'on' : ''}">${l}</button>`).join('');

// ---------- form khoản chi ----------
const X = () => $('#expenseForm').elements;
function drawExpenseChips() {
  const x = X(), company = x.split.value === 'company';
  if (company) x.payer.value = 'a';
  $('#splitChips').innerHTML = chipHTML('split', [['half', 'Chia đôi'], ['a', 'Riêng ' + N().a.toLowerCase()], ['b', 'Riêng ' + N().b], ['custom', 'Tuỳ chỉnh'], ['company', '💼 ' + N().c + ' ứng']], x.split.value);
  $('#payerChips').innerHTML = chipHTML('payer', [['a', N().a], ['b', N().b]], x.payer.value);
  $('#payerBlock').hidden = company;
  $('#sourceBlock').hidden = x.payer.value === 'b';
  $('#sourceChips').innerHTML = chipHTML('sourceId', db.sources.map(s => [s.id, sourceLabel(s)]), x.sourceId.value);
  $('#customField').hidden = x.split.value !== 'custom';
  $('#customLabel').textContent = 'Phần của ' + N().b;
  previewSplit();
}
function previewSplit() {
  const x = X(), amount = moneyInput(x.amount.value), custom = moneyInput(x.custom.value), p = $('#splitPreview');
  if (!x.amount.value) { p.textContent = ''; return; }
  try {
    const sh = shares(amount, x.split.value, x.split.value === 'custom' ? custom : 0);
    p.textContent = x.split.value === 'company' ? `→ ${fmt(amount)} chờ ${N().c} hoàn ứng` : `= ${fmt(amount)} · ${N().a} ${fmt(sh.a)} · ${N().b} ${fmt(sh.b)} → ${owedText(debt({amount, custom, split: x.split.value, payer: x.payer.value}))}`;
  } catch { p.textContent = 'Kiểm tra số tiền và phần chia nhé.'; }
}
function openExpense(id, preset) {
  const e = db.expenses.find(r => r.id === id);
  if (e && (e.settlementId || e.reimburseId)) return;
  const f = $('#expenseForm'); f.reset(); const x = f.elements;
  x.id.value = e?.id || ''; x.description.value = e?.description || ''; x.amount.value = e?.amount ?? ''; x.date.value = e?.date || (page === 'home' ? selected : today());
  x.category.innerHTML = optionHTML([...new Set([...db.categories, ...(e ? [e.category] : [])])], e?.category);
  x.payer.value = e?.payer || 'a'; x.split.value = e?.split || preset || 'half'; x.custom.value = e?.custom || ''; x.note.value = e?.note || '';
  x.sourceId.value = e ? (e.sourceId || '') : lastSource('expenses');
  $('#toIncome').hidden = !!e;
  $('#expenseTitle').textContent = e ? 'Sửa khoản chi' : 'Thêm khoản chi';
  $('#memoryHint').textContent = '';
  $('#suggestions').innerHTML = [...new Set(db.expenses.filter(r => r.kind !== 'opening').map(r => r.description))].slice(-200).map(s => `<option value="${esc(s)}"></option>`).join('');
  drawExpenseChips();
  $('#expenseDialog').showModal();
  if (!e) setTimeout(() => x.amount.focus(), 50);
}
$('#expenseForm').addEventListener('input', ev => {
  const x = X();
  if (ev.target.name === 'description' && !x.id.value) {
    const desc = x.description.value.trim().toLocaleLowerCase('vi');
    const last = db.expenses.filter(r => r.kind !== 'opening' && r.description.trim().toLocaleLowerCase('vi') === desc).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date))[0];
    if (last) {
      if (![...x.category.options].some(o => o.value === last.category)) x.category.add(new Option(last.category, last.category));
      x.category.value = last.category; x.split.value = last.split; x.payer.value = last.payer; x.custom.value = last.custom || ''; if (last.sourceId && source(last.sourceId)) x.sourceId.value = last.sourceId;
      $('#memoryHint').textContent = '🐶 Corgi nhớ cách chia lần trước, chị đổi lại được.'; drawExpenseChips(); return;
    }
    $('#memoryHint').textContent = '';
  }
  previewSplit();
});
$('#expenseForm').addEventListener('change', previewSplit);
$('#addZeros').onclick = () => { const x = X(), n = moneyInput(x.amount.value || '0'); x.amount.value = Number.isFinite(n) && n ? String(n * 1000) : x.amount.value + '000'; previewSplit(); x.amount.focus(); };
$('#expenseForm').onsubmit = ev => {
  ev.preventDefault();
  const x = X(), amount = moneyInput(x.amount.value), split = x.split.value, custom = split === 'custom' ? moneyInput(x.custom.value) : 0;
  try {
    if (!Number.isFinite(amount) || !amount) throw Error('Số tiền phải lớn hơn 0');
    shares(amount, split, custom);
    if (!dateValid(x.date.value)) throw Error('Ngày không hợp lệ');
    const description = x.description.value.trim(); if (!description) throw Error('Nhập mô tả nhé');
    const old = db.expenses.find(r => r.id === x.id.value);
    const row = {id: old?.id || uid(), description, amount, custom, split, payer: split === 'company' ? 'a' : x.payer.value, category: x.category.value, date: x.date.value, note: x.note.value.trim(), sourceId: (split === 'company' || x.payer.value === 'a') && x.sourceId.value ? x.sourceId.value : null, settlementId: null, reimburseId: null, createdAt: old?.createdAt || new Date().toISOString()};
    if (mutate(d => { d.expenses = old ? d.expenses.map(r => r.id === old.id ? row : r) : [...d.expenses, row]; })) {
      selected = row.date; month = row.date.slice(0, 7); $('#expenseDialog').close(); render(); toast(split === 'company' ? 'Đã ghi vào danh sách chờ hoàn ứng 💼' : 'Đã lưu 🐶');
    }
  } catch (error) { toast(error.message); }
};

// ---------- form khoản thu ----------
function lastSource(list) {
  const rows = db[list].filter(r => r.sourceId && source(r.sourceId)).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));
  return rows[0]?.sourceId || (list === 'incomes' ? 'bank' : 'cash');
}
const I = () => $('#incomeForm').elements;
function drawIncomeChips() {
  const x = I();
  $('#incomeCatChips').innerHTML = chipHTML('category', db.incomeCategories.map(c => [c, incomeIcon(c) + ' ' + c]), x.category.value);
  $('#incomeSourceChips').innerHTML = chipHTML('sourceId', db.sources.filter(s => !isCredit(s.kind)).map(s => [s.id, sourceLabel(s)]), x.sourceId.value);
}
function openIncome(id) {
  const i = db.incomes.find(r => r.id === id), f = $('#incomeForm'); f.reset(); const x = f.elements;
  x.id.value = i?.id || ''; x.amount.value = i?.amount ?? ''; x.description.value = i?.description || ''; x.note.value = i?.note || '';
  x.date.value = i?.date || (page === 'home' ? selected : today());
  x.category.value = i?.category || db.incomeCategories[0]; x.sourceId.value = i ? (i.sourceId || '') : lastSource('incomes');
  $('#incomeTitle').textContent = i ? 'Sửa khoản thu' : 'Thêm khoản thu';
  $('#toExpense').hidden = !!i;
  $('#incomeSuggestions').innerHTML = [...new Set(db.incomes.map(r => r.description))].slice(-100).map(s => `<option value="${esc(s)}"></option>`).join('');
  drawIncomeChips();
  $('#incomeDialog').showModal();
  if (!i) setTimeout(() => x.amount.focus(), 50);
}
$('#incomeForm').onsubmit = ev => {
  ev.preventDefault();
  const x = I(), amount = moneyInput(x.amount.value), description = x.description.value.trim();
  if (!Number.isFinite(amount) || !amount) { toast('Số tiền phải lớn hơn 0'); return; }
  if (!description) { toast('Nhập mô tả nhé'); return; }
  if (!dateValid(x.date.value)) { toast('Ngày không hợp lệ'); return; }
  const old = db.incomes.find(r => r.id === x.id.value);
  const row = {id: old?.id || uid(), amount, description, category: x.category.value || db.incomeCategories[0], sourceId: x.sourceId.value || null, date: x.date.value, note: x.note.value.trim(), createdAt: old?.createdAt || new Date().toISOString()};
  if (mutate(d => { d.incomes = old ? d.incomes.map(r => r.id === old.id ? row : r) : [...d.incomes, row]; })) {
    selected = row.date; month = flowMonth = row.date.slice(0, 7); $('#incomeDialog').close(); render(); toast('Đã ghi khoản thu 💰');
  }
};

// ---------- nhập / chỉnh số dư ----------
function openSourceSet(id) {
  const x = source(id), credit = isCredit(x.kind), b = balance(db, x), f = $('#sourceSetForm'); f.reset(); const e = f.elements;
  e.sid.value = id; e.limit.value = x.limit || '';
  $('#sourceTitle').textContent = sourceLabel(x);
  $('#sourceAmountLabel').textContent = b === null ? (credit ? 'Dư nợ hiện tại (đang nợ thẻ bao nhiêu)' : 'Số dư hiện tại') : (credit ? 'Dư nợ thực tế bây giờ' : 'Số dư thực tế bây giờ');
  $('#sourceNow').textContent = b === null ? 'Nhập 1 lần. Từ giờ app tự cộng khoản thu, trừ khoản chi của nguồn này.' : `App đang tính: ${credit ? 'dư nợ ' + fmt(b) : signed(b)}. Để trống nếu đúng rồi, hoặc nhập số thật để app chỉnh lại.`;
  $('#sourceNegField').hidden = credit;
  $('#sourceLimitField').hidden = !credit;
  $('#sourceHint').textContent = credit ? 'Dư nợ: số đang nợ trên thẻ (xem trong app ngân hàng). Hết nợ thì nhập 0.' : 'Ví dụ: tiền mặt trong ví, số dư tài khoản.';
  $('#sourceDialog').showModal();
}
$('#sourceSetForm').onsubmit = ev => {
  ev.preventDefault();
  const e = ev.target.elements, x = source(e.sid.value), credit = isCredit(x.kind), raw = e.amount.value.trim();
  let amount = raw ? moneyInput(raw) : null; const limit = e.limit.value.trim() ? moneyInput(e.limit.value) : null;
  if ((raw && !Number.isFinite(amount)) || (e.limit.value.trim() && !Number.isFinite(limit))) { toast('Số tiền chưa đúng định dạng.'); return; }
  if (amount !== null && !credit && e.negative.checked) amount = -amount;
  const now = new Date().toISOString(), b = balance(db, x);
  if (b === null && amount === null && limit === null) { toast('Nhập số dư nhé.'); return; }
  if (mutate(d => {
    const t = d.sources.find(y => y.id === x.id);
    if (credit) t.limit = limit;
    if (amount === null) return;
    if (b === null) Object.assign(t, {opening: amount, openingDate: today(), openingAt: now});
    else if (amount !== b) d.adjustments.push({id: uid(), sourceId: x.id, date: today(), at: now, amount: amount - b, note: 'Chỉnh theo số thực tế'});
  })) { $('#sourceDialog').close(); render(); toast('Đã cập nhật ví 👛'); }
};

// ---------- nhắc hạn trả ----------
async function notifyDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || db.lastNotified === today() || loadError) return;
  const list = upcoming(db, today(), 3); if (!list.length) return;
  const body = list.slice(0, 4).map(f => `${f.name}: ${f.amount ? fmt(f.amount) : 'chưa nhập số'} · ${f.daysLeft < 0 ? 'quá hạn' : f.daysLeft === 0 ? 'hôm nay' : 'còn ' + f.daysLeft + ' ngày'}`).join('\n');
  try { const reg = await navigator.serviceWorker?.ready; await (reg ? reg.showNotification('🐶 Sắp đến hạn trả', {body, icon: './icons/icon-192.png', tag: 'corgi-due'}) : new Notification('🐶 Sắp đến hạn trả', {body})); mutate(d => { d.lastNotified = today(); }); } catch {}
}

// ---------- form khoản cố định ----------
const F = () => $('#fixedForm').elements;
function drawFixedChips() {
  const f = F(), type = f.type.value, template = f.mode.value === 'template', isNew = !f.id.value;
  $('#typeChips').innerHTML = chipHTML('type', Object.entries(FIXED_TYPES).map(([k, l]) => [k, TYPE_ICON[k] + ' ' + l]), type);
  $('#nameLabel').textContent = {card: 'Tên thẻ', debt: 'Tên khoản nợ', bill: 'Tên khoản chi'}[type];
  $('#amountLabel').textContent = type === 'card' ? 'Số sao kê cần trả' : type === 'debt' ? 'Trả mỗi kỳ' : 'Số tiền';
  $('#dueText').textContent = template ? 'Ngày đến hạn (theo tháng)' : 'Hạn thanh toán';
  $('#principalField').hidden = type !== 'debt' || !(template || isNew);
  $('#repeatField').hidden = !isNew;
  $('#fixedHint').textContent = type === 'card' ? 'Chưa có sao kê thì để trống, nhập sau.' : 'Góc riêng, không cộng vào tiền chia với ' + N().b + '.';
}
function openFixed(mode, id) {
  const template = mode === 'template', item = (template ? db.templates : db.fixed).find(r => r.id === id);
  const form = $('#fixedForm'); form.reset(); const f = form.elements;
  f.id.value = item?.id || ''; f.mode.value = mode; f.type.value = item?.type || (fixedType === 'all' ? 'card' : fixedType);
  f.name.value = item?.name || ''; f.amount.value = item?.amount || ''; f.note.value = item?.note || '';
  const t = template ? item : db.templates.find(r => r.id === item?.templateId);
  f.principal.value = t?.principal || '';
  f.due.value = template ? dueDate(fixedMonth, item.day) : item?.due || (fixedMonth === today().slice(0, 7) ? today() : fixedMonth + '-10');
  $('#fixedTitle').textContent = (item ? 'Sửa ' : 'Thêm ') + (template ? 'khoản lặp lại' : 'khoản cố định');
  drawFixedChips();
  $('#fixedDialog').showModal();
}
$('#fixedForm').onsubmit = ev => {
  ev.preventDefault();
  const f = F(), template = f.mode.value === 'template', name = f.name.value.trim(), type = f.type.value;
  const amount = f.amount.value.trim() ? moneyInput(f.amount.value) : 0, principal = f.principal.value.trim() ? moneyInput(f.principal.value) : null;
  if (!name || !Number.isFinite(amount)) { toast('Kiểm tra tên và số tiền nhé.'); return; }
  if (principal !== null && !Number.isFinite(principal)) { toast('Dư nợ chưa đúng định dạng.'); return; }
  if (!dateValid(f.due.value)) { toast('Ngày không hợp lệ'); return; }
  const day = Number(f.due.value.slice(8)), note = f.note.value.trim();
  const ok = mutate(d => {
    if (template) {
      const t = d.templates.find(r => r.id === f.id.value);
      Object.assign(t, {type, name, amount, day, note, principal: type === 'debt' ? principal : null});
      return;
    }
    const old = d.fixed.find(r => r.id === f.id.value);
    if (old) {
      Object.assign(old, {type, name, amount, due: f.due.value, note});
      const t = d.templates.find(r => r.id === old.templateId); if (t && type === 'debt' && principal !== null) t.principal = principal;
      return;
    }
    let templateId = null;
    if (f.repeat.checked) { templateId = uid(); d.templates.push({id: templateId, type, name, amount, day, start: f.due.value.slice(0, 7), note, principal: type === 'debt' ? principal : null}); }
    d.fixed.push({id: uid(), templateId, type, name, amount, due: f.due.value, paid: false, paidDate: null, note});
  });
  if (ok && type === 'card') linkCardSource(name, f.id.value);
  if (ok) { if (!template) fixedMonth = f.due.value.slice(0, 7); $('#fixedDialog').close(); render(); toast('Đã lưu 🐶'); }
};

// Thẻ tín dụng ở Góc cố định ↔ nguồn tiền cùng tên, để chọn khi quẹt thẻ
function linkCardSource(name, editedId) {
  const item = db.templates.find(t => t.id === editedId) || db.fixed.find(r => r.id === editedId);
  const templateId = item ? ('templateId' in item ? item.templateId : item.id) : db.templates.find(t => t.type === 'card' && t.name === name)?.id || null;
  const linked = templateId && db.sources.find(x => x.templateId === templateId);
  if (linked) { if (linked.name !== name) mutate(d => { d.sources.find(x => x.id === linked.id).name = name; }); return; }
  if (db.sources.some(x => x.name.toLowerCase() === name.toLowerCase())) return;
  mutate(d => { d.sources.push({id: uid(), name, kind: 'card', templateId: templateId || null}); });
}

// ---------- chia sẻ / xuất file ----------
function download(content, filename, type) { const url = URL.createObjectURL(new Blob([content], {type})); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
function csvDownload(rows, name) { download('﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'), name, 'text/csv;charset=utf-8'); }
async function shareText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { $('#shareText').value = text; $('#textDialog').showModal(); $('#shareText').select(); }
}
function nhiSummary() {
  const rows = nhiRows().filter(e => e.split !== 'company'), s = totals(rows), pending = outstanding(rows), n = totals(pending).net;
  return `🐶 ${N().a.toUpperCase()} & ${N().b.toUpperCase()} · ${nhiLabel()}\n\n${N().a} chịu: ${fmt(s.share.a)} (đã trả ${fmt(s.paid.a)})\n${N().b} chịu: ${fmt(s.share.b)} (đã trả ${fmt(s.paid.b)})\n\nCHƯA THANH TOÁN (${pending.length} khoản)\n${pending.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => `${shortDate(e.date)} · ${e.description}${e.kind === 'opening' ? '' : ' ' + fmt(e.amount)} → ${owedText(debt(e))}`).join('\n')}\n\n👉 ${netText(n)}${n ? ' ' + fmt(Math.abs(n)) : ''}`;
}
function companySummary() {
  const rows = companyPending(db.expenses).filter(e => !unpicked.has(e.id)).sort((a, b) => a.date.localeCompare(b.date));
  return `BẢNG KÊ ĐỀ NGHỊ HOÀN ỨNG\nNgười ứng: ${N().full || N().a}\nĐơn vị: ${N().c}\nNgày lập: ${niceDate(today())}\n\n${rows.map((e, i) => `${i + 1}. ${niceDate(e.date)} · ${e.description}${e.note ? ' (' + e.note + ')' : ''}: ${fmt(e.amount)}`).join('\n')}\n\nTỔNG ĐỀ NGHỊ HOÀN: ${fmt(rows.reduce((s, e) => s + e.amount, 0))} (${rows.length} khoản)`;
}

async function action(a) {
  if (a === 'add') return page === 'fixed' ? openFixed('fixed') : page === 'flow' ? openIncome() : openExpense(null, page === 'company' ? 'company' : undefined);
  if (a === 'add-income') return openIncome();
  if (a === 'ics') { download(buildICS(db, today()), 'corgi-nhac-han.ics', 'text/calendar'); toast('Mở file → “Thêm tất cả” vào Lịch iPhone.'); return; }
  if (a === 'notify') {
    if (!('Notification' in window)) { toast('Máy này chưa hỗ trợ. Trên iPhone cần mở app từ màn hình chính (iOS 16.4+).'); return; }
    const p = await Notification.requestPermission(); render();
    if (p === 'granted') { db.lastNotified = null; notifyDue(); toast('Đã bật thông báo 🔔'); } else toast('Chưa được cho phép. Vào Cài đặt iPhone → Corgi Pocket → Thông báo.');
    return;
  }
  if (a === 'switch-income') { $('#expenseDialog').close(); return openIncome(); }
  if (a === 'switch-expense') { $('#incomeDialog').close(); return openExpense(); }
  if (a === 'income-csv') { csvDownload([['Ngày', 'Mô tả', 'Loại thu', 'Số tiền', 'Nhận vào', 'Ghi chú'], ...db.incomes.slice().sort((x, y) => x.date.localeCompare(y.date)).map(i => [i.date, i.description, i.category, i.amount, sourceName(i.sourceId), i.note || ''])], `corgi-khoan-thu-${today()}.csv`); return; }
  if (a === 'today') { selected = today(); month = selected.slice(0, 7); return render(); }
  if (a === 'add-fixed') return openFixed('fixed');
  if (a === 'copy-nhi') return shareText(nhiSummary(), `Đã sao chép, dán gửi ${N().b} nhé 🐶`);
  if (a === 'copy-company') return shareText(companySummary(), 'Đã sao chép bảng kê, dán gửi kế toán nhé 💼');
  if (a === 'pick-all') { const pending = companyPending(db.expenses); if (pending.some(e => unpicked.has(e.id))) unpicked.clear(); else pending.forEach(e => unpicked.add(e.id)); return render(); }
  if (a === 'company-csv') { const rows = companyPending(db.expenses).filter(e => !unpicked.has(e.id)).sort((x, y) => x.date.localeCompare(y.date)); csvDownload([['STT', 'Ngày', 'Nội dung', 'Ghi chú', 'Số tiền'], ...rows.map((e, i) => [i + 1, niceDate(e.date), e.description, e.note || '', e.amount]), ['', '', 'TỔNG', '', rows.reduce((s, e) => s + e.amount, 0)]], `hoan-ung-${today()}.csv`); return; }
  if (a === 'reimburse') {
    const rows = companyPending(db.expenses).filter(e => !unpicked.has(e.id)); if (!rows.length) return;
    const sum = rows.reduce((s, e) => s + e.amount, 0);
    const via = await confirmAction('Đã nhận tiền hoàn ứng?', `${N().c} đã chuyển ${fmt(sum)} cho ${rows.length} khoản.\n\nCác khoản này chuyển sang “Đã hoàn”. Bấm nhầm thì hoàn tác được.`, 'Đúng, đã nhận', {label: 'Nhận vào', value: lastVia()});
    if (via !== false) {
      try { const id = uid(); const next = reimburse(db, rows.map(e => e.id), id, new Date().toISOString()); next.reimbursements.find(r => r.id === id).via = via; if (commit(next)) { unpicked.clear(); render(); toast('Đã ghi nhận hoàn ứng 💼'); } } catch (e) { toast(e.message); }
    }
    return;
  }
  if (a === 'settle') {
    const rows = outstanding(nhiRows()); if (!rows.length) return;
    const n = totals(rows).net;
    const ok = await confirmAction('Đã thanh toán xong?', `${netText(n)}${n ? ' ' + fmt(Math.abs(n)) : ''}.\n\nChốt ${rows.length} khoản (${nhiLabel().toLowerCase()}). Số dư về 0, lịch sử vẫn giữ. Bấm nhầm thì hoàn tác được.`, 'Đúng, đã trả đủ', n ? {label: n > 0 ? 'Nhận vào' : 'Trả bằng', value: lastVia()} : null);
    if (ok !== false) {
      try { const id = uid(); const next = closePeriod(db, rows.map(e => e.id), id, new Date().toISOString(), nhiLabel()); if (n) next.settlements.find(x => x.id === id).via = ok; if (commit(next)) { render(); toast('Đã chốt kỳ 🐶'); } } catch (e) { toast(e.message); }
    }
    return;
  }
  if (a === 'backup') { const at = new Date().toISOString(); const next = {...structuredClone(db), lastBackup: at}; download(JSON.stringify(next, null, 2), `corgi-pocket-backup-${today()}.json`, 'application/json'); if (commit(next)) render(); toast('Đã tạo file backup. Lưu vào iCloud Drive nhé.'); return; }
  if (a === 'raw-backup') { download(localStorage.getItem(KEY) || '', 'corgi-pocket-recovery.txt', 'text/plain'); return; }
  if (a === 'restore') return $('#restoreFile').click();
  if (a === 'import') return $('#importFile').click();
  if (a === 'csv') { csvDownload([['Ngày', 'Mô tả', 'Danh mục', 'Số tiền', 'Người trả', 'Cách chia', 'Phần ' + N().a, 'Phần ' + N().b, 'Phần ' + N().c, 'Số dư (+ ' + N().b + ' nợ)', 'Chốt với ' + N().b, 'Hoàn ứng', 'Ghi chú', 'Nguồn tiền'], ...db.expenses.slice().sort((x, y) => x.date.localeCompare(y.date)).map(e => { const p = e.kind === 'opening' ? {a: 0, b: 0, c: 0} : shares(e.amount, e.split, e.custom); return [e.date, e.description, e.category || 'Nợ ban đầu', e.amount || 0, e.payer ? N()[e.payer] : '', splitLabel(e), p.a, p.b, p.c, debt(e), e.settlementId ? 'Đã chốt' : '', e.split === 'company' ? (e.reimburseId ? 'Đã hoàn' : 'Chờ hoàn') : '', e.note || '', e.payer === 'a' ? sourceName(e.sourceId) : '']; })], `corgi-chi-tieu-${today()}.csv`); return; }
  if (a === 'fixed-csv') { csvDownload([['Loại', 'Tên', 'Số tiền', 'Hạn trả', 'Đã trả', 'Ngày trả', 'Ghi chú'], ...db.fixed.slice().sort((x, y) => x.due.localeCompare(y.due)).map(f => [FIXED_TYPES[f.type], f.name, f.amount, f.due, f.paid ? 'Có' : 'Chưa', f.paidDate || '', f.note || ''])], `corgi-co-dinh-${today()}.csv`); }
}

// ---------- sự kiện ----------
document.addEventListener('click', async ev => {
  const b = ev.target.closest('button,a[data-page]'); if (!b) return;
  if (b.dataset.chip) {
    const form = b.closest('form'), input = form.elements[b.dataset.chip]; input.value = b.dataset.value;
    form === $('#expenseForm') ? drawExpenseChips() : form === $('#incomeForm') ? drawIncomeChips() : form === $('#confirmDialog form') ? drawConfirmChips() : drawFixedChips(); return;
  }
  if (b.dataset.page) { ev.preventDefault(); return go(b.dataset.page); }
  if (b.dataset.close) return $('#' + b.dataset.close).close();
  if (b.dataset.action) return action(b.dataset.action);
  if (b.dataset.date) { selected = b.dataset.date; return render(); }
  if (b.dataset.ftype) { fixedType = b.dataset.ftype; return render(); }
  if (b.dataset.shift) { const [type, n] = b.dataset.shift.split(':'); if (type === 'fixed') fixedMonth = shiftMonth(fixedMonth, Number(n)); else if (type === 'flow') flowMonth = shiftMonth(flowMonth, Number(n)); else { month = shiftMonth(month, Number(n)); selected = month === today().slice(0, 7) ? today() : month + '-01'; } return render(); }
  if (b.dataset.edit) return openExpense(b.dataset.edit);
  if (b.dataset.editIncome) return openIncome(b.dataset.editIncome);
  if (b.dataset.setSource) return openSourceSet(b.dataset.setSource);
  if (b.dataset.reviewed) { const id = b.dataset.reviewed; if (mutate(d => { for (const x of [...d.expenses, ...d.incomes]) if (x.id === id) delete x.review; })) { render(); toast('Đã bỏ đánh dấu ✓'); } return; }
  if (b.dataset.deleteIncome) {
    const row = db.incomes.find(r => r.id === b.dataset.deleteIncome);
    if (await confirmAction('Xoá khoản thu?', row.description + ' · ' + fmt(row.amount), 'Xoá')) if (mutate(d => { d.incomes = d.incomes.filter(r => r.id !== row.id); })) { render(); toast('Đã xoá.'); }
    return;
  }
  if (b.dataset.delSource) {
    const x = source(b.dataset.delSource);
    if (db.expenses.some(e => e.sourceId === x.id) || db.incomes.some(i => i.sourceId === x.id)) { toast(`“${x.name}” đang có khoản chi/thu, chưa xoá được.`); return; }
    if (db.sources.length <= 1) { toast('Cần giữ ít nhất một nguồn tiền.'); return; }
    if (await confirmAction('Xoá nguồn tiền?', x.name, 'Xoá')) if (mutate(d => { d.sources = d.sources.filter(s => s.id !== x.id); })) render();
    return;
  }
  if (b.dataset.delIcat !== undefined) {
    const i = Number(b.dataset.delIcat); if (db.incomeCategories.length <= 1) { toast('Cần giữ ít nhất một loại thu.'); return; }
    if (await confirmAction('Xoá loại thu?', `Xoá “${db.incomeCategories[i]}” khỏi danh sách. Khoản cũ giữ nguyên.`, 'Xoá')) if (mutate(d => { d.incomeCategories.splice(i, 1); })) render();
    return;
  }
  if (b.dataset.delete) {
    const row = db.expenses.find(r => r.id === b.dataset.delete); if (!row || row.settlementId || row.reimburseId) return;
    if (await confirmAction('Xoá khoản chi?', row.description + ' · ' + fmt(row.amount ?? Math.abs(row.balance)), 'Xoá')) if (mutate(d => { d.expenses = d.expenses.filter(r => r.id !== row.id); })) { render(); toast('Đã xoá.'); }
    return;
  }
  if (b.dataset.undo) { if (await confirmAction('Mở lại kỳ đã chốt?', 'Các khoản trong kỳ này sẽ tính lại vào số chưa thanh toán.', 'Hoàn tác')) if (commit(undoPeriod(db, b.dataset.undo))) { render(); toast('Đã mở lại kỳ.'); } return; }
  if (b.dataset.unreimburse) { if (await confirmAction('Hoàn tác lần nhận tiền?', 'Các khoản sẽ quay lại danh sách chờ hoàn.', 'Hoàn tác')) if (commit(undoReimburse(db, b.dataset.unreimburse))) { render(); toast('Đã hoàn tác.'); } return; }
  if (b.dataset.paid) {
    const f = db.fixed.find(r => r.id === b.dataset.paid);
    if (!f.paid && !f.amount) { toast('Nhập số tiền trước khi đánh dấu đã trả.'); return openFixed('fixed', f.id); }
    let via = null;
    if (!f.paid) { via = await confirmAction('Đã trả khoản này?', `${f.name} · ${fmt(f.amount)}`, 'Đã trả', {label: 'Trả bằng', value: lastVia()}); if (via === false) return; }
    if (mutate(d => { const r = d.fixed.find(x => x.id === f.id); r.paid = !r.paid; r.paidDate = r.paid ? today() : null; r.paidAt = r.paid ? new Date().toISOString() : null; r.paidFrom = r.paid ? via : null; })) { render(); toast(f.paid ? 'Đã bỏ đánh dấu.' : 'Đã trả ✓'); }
    return;
  }
  if (b.dataset.editFixed) return openFixed('fixed', b.dataset.editFixed);
  if (b.dataset.editTemplate) return openFixed('template', b.dataset.editTemplate);
  if (b.dataset.deleteFixed) {
    const f = db.fixed.find(r => r.id === b.dataset.deleteFixed);
    if (await confirmAction('Xoá khoản này?', `${f.name} · ${monthName(f.due.slice(0, 7))}.${f.templateId ? '\n\nChỉ xoá tháng này, các tháng khác vẫn tự tạo.' : ''}`, 'Xoá'))
      if (mutate(d => { d.fixed = d.fixed.filter(r => r.id !== f.id); if (f.templateId) d.skips.push(f.templateId + ':' + f.due.slice(0, 7)); })) { render(); toast('Đã xoá.'); }
    return;
  }
  if (b.dataset.delTemplate) {
    const t = db.templates.find(r => r.id === b.dataset.delTemplate);
    if (await confirmAction('Ngừng lặp lại?', `${t.name} sẽ không tự tạo ở các tháng sau. Các tháng đã có vẫn giữ nguyên.`, 'Ngừng lặp'))
      if (mutate(d => { d.templates = d.templates.filter(r => r.id !== t.id); d.fixed.forEach(r => { if (r.templateId === t.id) r.templateId = null; }); d.skips = d.skips.filter(s => !s.startsWith(t.id + ':')); })) { render(); toast('Đã ngừng lặp lại.'); }
    return;
  }
  if (b.dataset.delCat !== undefined) {
    const i = Number(b.dataset.delCat); if (db.categories.length <= 1) { toast('Cần giữ ít nhất một danh mục.'); return; }
    if (await confirmAction('Xoá danh mục?', `Xoá “${db.categories[i]}” khỏi danh sách. Khoản cũ giữ nguyên.`, 'Xoá')) if (mutate(d => { d.categories.splice(i, 1); })) render();
  }
});
$('#fab').onclick = () => action('add');
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'nhiScope') { nhiScope = t.value; return render(); }
  if (t.dataset.pick) { t.checked ? unpicked.delete(t.dataset.pick) : unpicked.add(t.dataset.pick); return render(); }
  if (t.id === 'importFile') {
    const file = t.files[0]; t.value = ''; if (!file) return;
    try {
      const r = mergeImport(db, JSON.parse(await file.text()), uid, new Date().toISOString());
      if (!r.expenses && !r.incomes) { toast('File này đã nhập rồi, không có khoản mới.'); return; }
      if (await confirmAction('Nhập thêm dữ liệu?', `${r.expenses} khoản chi + ${r.incomes} khoản thu, nguồn “${r.source}”.${r.duplicates ? `\n${r.duplicates} khoản đã có, sẽ bỏ qua.` : ''}${r.setOpening ? '\nSố dư nguồn này lấy theo số dư cuối sao kê.' : ''}\n\nDữ liệu đang có được giữ nguyên.`, 'Nhập thêm')) {
        if (commit(r.db)) { render(); toast(`Đã nhập ${r.expenses + r.incomes} khoản 🐶`); }
      }
    } catch (error) { toast(error.message || 'Không đọc được file.'); }
    return;
  }
  if (t.id === 'restoreFile') {
    const file = t.files[0]; if (!file) return;
    try {
      const next = migrateDB(JSON.parse(await file.text()));
      if (await confirmAction('Khôi phục dữ liệu?', `Backup có ${next.expenses.length} khoản chi, ${next.fixed.length} khoản cố định.\n\nDữ liệu hiện tại sẽ bị thay thế toàn bộ.`, 'Khôi phục')) {
        const prev = loadError; loadError = false; if (commit(next)) { render(); toast('Đã khôi phục 🐶'); } else loadError = prev;
      }
    } catch (error) { toast(error.message || 'Không đọc được file backup.'); }
    t.value = '';
  }
});
document.addEventListener('submit', ev => {
  const id = ev.target.id; if (!['namesForm', 'openingForm', 'categoryForm', 'sourceForm', 'incomeCategoryForm'].includes(id)) return;
  ev.preventDefault(); const f = ev.target.elements;
  if (id === 'namesForm') { const names = {a: f.a.value.trim(), b: f.b.value.trim(), c: f.c.value.trim(), full: f.full.value.trim()}; if (!names.a || !names.b || !names.c) { toast('Nhập đủ tên nhé.'); return; } if (mutate(d => { d.names = names; })) { render(); toast('Đã lưu tên.'); } }
  else if (id === 'openingForm') { const amount = moneyInput(f.amount.value); if (!Number.isFinite(amount) || amount <= 0) { toast('Nhập số tiền lớn hơn 0.'); return; } if (mutate(d => { d.expenses.push({id: uid(), kind: 'opening', description: 'Số dư nợ ban đầu', date: f.date.value, balance: amount * Number(f.direction.value), settlementId: null, createdAt: new Date().toISOString()}); })) { render(); toast('Đã thêm số dư ban đầu.'); } }
  else if (id === 'sourceForm') { const name = f.name.value.trim(); if (!name || db.sources.some(x => x.name.toLowerCase() === name.toLowerCase())) { toast('Tên trống hoặc đã có.'); return; } if (mutate(d => { d.sources.push({id: uid(), name, kind: f.kind.value}); })) { render(); toast('Đã thêm nguồn tiền.'); } }
  else if (id === 'incomeCategoryForm') { const value = f.category.value.trim(); if (!value || db.incomeCategories.includes(value)) { toast('Trống hoặc đã có.'); return; } if (mutate(d => { d.incomeCategories.push(value); })) render(); }
  else { const value = f.category.value.trim(); if (!value || db.categories.includes(value)) { toast('Danh mục trống hoặc đã có.'); return; } if (mutate(d => { d.categories.push(value); })) render(); }
});

// ---------- offline ----------
let offlineReady = false;
function updateOffline() {
  $('#connection').textContent = offlineReady ? (navigator.onLine ? '● Offline sẵn sàng' : '● Đang offline') : '○ Đang chuẩn bị';
  const s = $('#offlineSetting'); if (s) s.textContent = offlineReady ? '✓ Đã dùng được offline' : 'Mở qua link https và đợi lần tải đầu';
}
addEventListener('online', updateOffline); addEventListener('offline', updateOffline);
addEventListener('storage', e => { if (e.key === KEY) { try { db = e.newValue ? migrateDB(JSON.parse(e.newValue)) : freshDB(); loadError = false; } catch { loadError = true; } render(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(async r => { await navigator.serviceWorker.ready; offlineReady = !!r.active; updateOffline(); }).catch(updateOffline);
const PAGES = ['home', 'nhi', 'company', 'fixed', 'flow', 'settings', 'review'];
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PAGES.includes(h) && h !== page) { page = h; render(); } });
const hash = location.hash.slice(1); if (PAGES.includes(hash)) page = hash;
render(); updateOffline(); notifyDue();
