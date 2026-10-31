import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moneyInput, shares, debt, totals, outstanding, companyPending, closePeriod, undoPeriod, reimburse, undoReimburse, generateFixed, debtRemaining, dueDate, freshDB, validateDB, migrateDB, cashflow, balance, wallet, upcoming, buildICS, mergeImport} from '../docs/core.js';

let n = 0;
const id = () => 'id' + (++n);
const exp = (o) => ({id: id(), description: 'x', date: '2026-10-05', category: 'Ăn uống', payer: 'a', split: 'half', custom: 0, amount: 100000, settlementId: null, reimburseId: null, ...o});

test('nhập tiền nhanh', () => {
  assert.equal(moneyInput('165k'), 165000);
  assert.equal(moneyInput('1,5k'), 1500);
  assert.equal(moneyInput('1,2tr'), 1200000);
  assert.equal(moneyInput('2tr'), 2000000);
  assert.equal(moneyInput('165.700'), 165700);
  assert.equal(moneyInput('165700 đ'), 165700);
  assert.ok(Number.isNaN(moneyInput('abc')));
  assert.ok(Number.isNaN(moneyInput('')));
});

test('chia phần chị / Nhi / công ty, giữ 0,5đ', () => {
  assert.deepEqual(shares(92789, 'half'), {a: 46394.5, b: 46394.5, c: 0});
  assert.deepEqual(shares(100, 'a'), {a: 100, b: 0, c: 0});
  assert.deepEqual(shares(100, 'b'), {a: 0, b: 100, c: 0});
  assert.deepEqual(shares(100, 'custom', 30), {a: 70, b: 30, c: 0});
  assert.deepEqual(shares(100, 'company'), {a: 0, b: 0, c: 100});
  assert.throws(() => shares(100, 'custom', 200));
});

test('ai nợ ai', () => {
  assert.equal(debt(exp({payer: 'a', split: 'half', amount: 200})), 100);   // chị trả, Nhi nợ 100
  assert.equal(debt(exp({payer: 'b', split: 'half', amount: 200})), -100);  // Nhi trả, chị nợ 100
  assert.equal(debt(exp({payer: 'a', split: 'b', amount: 200})), 200);      // chị trả hộ Nhi
  assert.equal(debt(exp({payer: 'a', split: 'a', amount: 200})), 0);
  assert.equal(debt(exp({payer: 'a', split: 'company', amount: 200})), 0);  // công ty không đụng tới Nhi
  const s = totals([exp({amount: 200}), exp({split: 'company', amount: 500}), {id: id(), kind: 'opening', balance: -50, date: '2026-10-01', description: 'x'}]);
  assert.equal(s.net, 50); assert.equal(s.company, 500); assert.equal(s.share.a, 100); assert.equal(s.total, 700);
  assert.deepEqual(s.categories, {'Ăn uống': 200});
});

test('chốt với Nhi bỏ qua khoản công ty, hoàn tác được', () => {
  const db = {...freshDB(), expenses: [exp({amount: 200}), exp({split: 'company', amount: 500})]};
  const pend = outstanding(db.expenses);
  assert.equal(pend.length, 1);
  const closed = closePeriod(db, pend.map(e => e.id), 's1', '2026-10-30T00:00:00Z', 'Tất cả');
  assert.equal(closed.settlements[0].net, 100);
  assert.equal(outstanding(closed.expenses).length, 0);
  validateDB(closed);
  assert.throws(() => closePeriod(db, db.expenses.map(e => e.id), 's2', 'x', 'y'));
  assert.equal(outstanding(undoPeriod(closed, 's1').expenses).length, 1);
});

test('hoàn ứng công ty', () => {
  const db = {...freshDB(), expenses: [exp({split: 'company', amount: 500}), exp({split: 'company', amount: 300}), exp({amount: 10})]};
  assert.equal(companyPending(db.expenses).length, 2);
  const ids = [db.expenses[0].id];
  const done = reimburse(db, ids, 'r1', '2026-10-30T00:00:00Z');
  assert.equal(done.reimbursements[0].amount, 500);
  assert.equal(companyPending(done.expenses).length, 1);
  validateDB(done);
  assert.throws(() => reimburse(done, ids, 'r2', 'x'));
  assert.throws(() => reimburse(db, [db.expenses[2].id], 'r3', 'x'));
  assert.equal(companyPending(undoReimburse(done, 'r1').expenses).length, 2);
});

test('khoản cố định tự tạo mỗi tháng, nợ tự trừ dần', () => {
  let db = {...freshDB(), templates: [
    {id: 't1', type: 'card', name: 'VIB', amount: 0, day: 31, start: '2026-10'},
    {id: 't2', type: 'debt', name: 'Vay', amount: 400, day: 5, start: '2026-10', principal: 1000},
  ]};
  assert.equal(dueDate('2026-02', 31), '2026-02-28');
  db = generateFixed(db, '2026-09', id); assert.equal(db.fixed.length, 0); // trước tháng bắt đầu
  db = generateFixed(db, '2026-10', id); assert.equal(db.fixed.length, 2);
  assert.equal(generateFixed(db, '2026-10', id), db);                        // không tạo trùng
  db.fixed.forEach(f => { f.paid = true; f.paidDate = '2026-10-05'; });
  db = generateFixed(db, '2026-11', id); db.fixed.forEach(f => { f.paid = true; f.paidDate = '2026-11-05'; });
  assert.equal(debtRemaining(db, db.templates[1]), 200);
  db = generateFixed(db, '2026-12', id);
  const dec = db.fixed.find(f => f.templateId === 't2' && f.due.startsWith('2026-12'));
  assert.equal(dec.amount, 200);                                             // kỳ cuối chỉ còn 200
  dec.paid = true; dec.paidDate = '2026-12-05';
  db = generateFixed(db, '2027-01', id);
  assert.ok(!db.fixed.some(f => f.templateId === 't2' && f.due.startsWith('2027-01'))); // trả hết thì ngừng
  db.skips.push('t1:2027-02');
  db = generateFixed(db, '2027-02', id);
  assert.ok(!db.fixed.some(f => f.templateId === 't1' && f.due.startsWith('2027-02'))); // đã xoá tay thì không tạo lại
  validateDB(db);
});

test('backup hỏng bị chặn', () => {
  assert.throws(() => validateDB({version: 99}));
  const db = {...freshDB(), expenses: [exp({split: 'company', payer: 'b'})]};
  assert.throws(() => validateDB(db));
});

test('dữ liệu bản cũ tự nâng lên bản mới', () => {
  const old = {...freshDB(), version: 1}; delete old.sources; delete old.incomes; delete old.incomeCategories;
  old.expenses = [exp({amount: 200})];
  const d = migrateDB(old);
  assert.equal(d.version, 3); assert.ok(d.sources.length >= 4); assert.deepEqual(d.incomes, []); assert.deepEqual(d.adjustments, []);
});

test('dòng tiền: quẹt thẻ không tính trùng, tiền Nhi trả & công ty hoàn tự vào', () => {
  let db = freshDB();
  db.sources.push({id: 'vib', name: 'VIB', kind: 'card'});
  db.incomes = [{id: 'i1', date: '2026-10-05', amount: 30000000, category: 'Lương', description: 'Lương T10', sourceId: 'bank'},
                {id: 'i2', date: '2026-11-01', amount: 999, category: 'Lương', description: 'khác tháng', sourceId: 'bank'}];
  db.expenses = [
    exp({amount: 200000, sourceId: 'cash'}),                          // chi đôi, chị trả tiền mặt
    exp({amount: 1000000, sourceId: 'vib'}),                          // quẹt thẻ
    exp({amount: 500000, split: 'company', sourceId: 'bank'}),        // ứng cho công ty
    exp({amount: 90000, payer: 'b'}),                                 // Nhi trả, không phải tiền của chị
  ];
  db.fixed = [{id: 'f1', type: 'card', name: 'VIB', amount: 4000000, due: '2026-10-05', paid: true, paidDate: '2026-10-05'}];
  db = closePeriod(db, outstanding(db.expenses).map(e => e.id), 's1', '2026-10-20T05:00:00Z', 'T10'); // Nhi trả chị 100k + 500k (nửa khoản quẹt thẻ) - 45k = 555k
  db = reimburse(db, companyPending(db.expenses).map(e => e.id), 'r1', '2026-10-25T05:00:00Z');
  validateDB(db);
  const c = cashflow(db, '2026-10');
  assert.equal(c.income, 30000000);
  assert.equal(c.fromNhi, 555000);
  assert.equal(c.fromCompany, 500000);
  assert.equal(c.spend, 1700000);
  assert.equal(c.credit, 1000000);
  assert.equal(c.immediate, 700000);
  assert.equal(c.fixedPaid, 4000000);
  assert.equal(c.cashIn, 31055000);
  assert.equal(c.cashOut, 4700000);
  assert.equal(c.net, 26355000);
  assert.equal(c.spendBy.vib, 1000000);
});

test('ví: số dư âm/dương, không trừ trùng khoản ghi trước lúc nhập số dư', () => {
  const db = migrateDB({...freshDB(), version: 2});
  const cash = db.sources.find(s => s.id === 'cash'), bank = db.sources.find(s => s.id === 'bank');
  Object.assign(cash, {opening: 500000, openingDate: '2026-10-30', openingAt: '2026-10-30T05:00:00Z'});
  Object.assign(bank, {opening: 2000000, openingDate: '2026-10-30', openingAt: '2026-10-30T05:00:00Z'});
  db.sources.push({id: 'vib', name: 'VIB', kind: 'card', opening: 3000000, openingDate: '2026-10-30', openingAt: '2026-10-30T05:00:00Z', limit: 20000000});
  db.expenses = [
    exp({amount: 100000, sourceId: 'cash', date: '2026-10-30', createdAt: '2026-10-30T04:00:00Z'}), // ghi trước lúc nhập số dư → bỏ qua
    exp({amount: 200000, sourceId: 'cash', date: '2026-10-30', createdAt: '2026-10-30T06:00:00Z'}),
    exp({amount: 1500000, sourceId: 'vib', date: '2026-10-31', createdAt: '2026-10-31T06:00:00Z'}),
  ];
  db.incomes = [{id: 'i1', date: '2026-10-31', amount: 1000000, category: 'Lương', description: 'x', sourceId: 'bank', createdAt: '2026-10-31T01:00:00Z'}];
  db.fixed = [
    {id: 'f1', type: 'card', name: 'VIB', amount: 3000000, due: '2026-10-31', paid: true, paidDate: '2026-10-31', paidAt: '2026-10-31T02:00:00Z', paidFrom: 'bank'},
    {id: 'f2', type: 'debt', name: 'Vay', amount: 4000000, due: '2026-10-28', paid: false, paidDate: null},  // quá hạn
    {id: 'f3', type: 'bill', name: 'Nhà', amount: 6000000, due: '2026-11-03', paid: false, paidDate: null},
  ];
  db.adjustments = [{id: 'a1', sourceId: 'cash', date: '2026-10-31', at: '2026-10-31T09:00:00Z', amount: -50000}];
  validateDB(db);
  assert.equal(balance(db, cash), 250000);       // 500k − 200k − 50k chỉnh tay
  assert.equal(balance(db, bank), 0);            // 2tr + 1tr − 3tr trả thẻ
  assert.equal(balance(db, db.sources.find(s => s.id === 'vib')), 1500000); // 3tr + 1,5tr quẹt − 3tr đã trả
  const w = wallet(db, '2026-10-31');
  assert.equal(w.cash, 250000);
  assert.equal(w.due, 4000000);                  // chỉ khoản chưa trả tới hết tháng 10
  assert.equal(w.spendable, -3750000);           // âm: hết tiền mà còn nợ
  assert.equal(w.creditLeft, 18500000);
  const u = upcoming(db, '2026-10-31', 7);
  assert.deepEqual(u.map(f => [f.id, f.daysLeft]), [['f2', -3], ['f3', 3]]);
});

test('lịch nhắc .ics cho khoản lặp lại và khoản lẻ', () => {
  const db = freshDB();
  db.templates = [{id: 't1', type: 'debt', name: 'Vay xe', amount: 3000000, day: 25, start: '2026-10', principal: 9000000}];
  db.fixed = [{id: 'f9', type: 'bill', name: 'Học phí', amount: 2000000, due: '2026-11-15', paid: false, paidDate: null}];
  const ics = buildICS(db, '2026-10-30');
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=25;COUNT=3/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261115/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 4);
});

test('nhập thêm từ file: giữ dữ liệu cũ, không nhập trùng, số dư lấy theo cuối sao kê', () => {
  const db = migrateDB({...freshDB(), version: 2});
  db.expenses = [exp({id: 'old', amount: 50000})];
  const pack = {corgiImport: 1, source: {name: 'Tiền mặt TCB', kind: 'bank', closing: 5000000, closingDate: '2026-10-31'},
    categories: ['Chưa phân loại'], incomeCategories: ['Hoàn tiền'],
    expenses: [exp({id: 'tcb-1', amount: 100000, category: 'Chưa phân loại', review: true, createdAt: '2026-10-30T00:00:00.000Z', date: '2026-10-30'})],
    incomes: [{id: 'tcb-2', date: '2026-10-30', amount: 300000, category: 'Hoàn tiền', description: 'Hoàn tiền', review: true, createdAt: '2026-10-30T00:00:00.000Z'}]};
  const r = mergeImport(db, pack, () => 'src-tcb', '2026-10-31T03:00:00.000Z');
  assert.equal(r.expenses, 1); assert.equal(r.incomes, 1); assert.equal(r.db.expenses.length, 2);
  const src = r.db.sources.find(s => s.name === 'Tiền mặt TCB');
  assert.equal(balance(r.db, src), 5000000);          // khoản cũ trong sao kê không bị trừ lại
  const again = mergeImport(r.db, pack, () => 'x', '2026-10-31T04:00:00.000Z');
  assert.equal(again.expenses + again.incomes, 0); assert.equal(again.duplicates, 2);
  assert.throws(() => mergeImport(db, {foo: 1}, () => 'x', 'now'));
});
