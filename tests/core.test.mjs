import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moneyInput, shares, debt, totals, outstanding, companyPending, closePeriod, undoPeriod, reimburse, undoReimburse, generateFixed, debtRemaining, dueDate, freshDB, validateDB} from '../docs/core.js';

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
