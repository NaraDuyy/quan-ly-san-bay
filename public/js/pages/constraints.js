// Ràng buộc toàn vẹn R1–R10: kiểm tra dữ liệu hiện có và thử vi phạm từng ràng buộc (luôn rollback).
import { api, esc } from '../lib.js';

const MECH_TONE = { Trigger: 'info', UNIQUE: 'ok', CHECK: 'ok', 'Ứng dụng': 'warn' };

export default async function constraints(view, m, stale) {
  const [rules, audit] = await Promise.all([api('/constraints'), api('/constraints/audit')]);
  if (stale()) return;
  const tongViPham = Object.values(audit).reduce((a, b) => a + b, 0);

  view.innerHTML = `
    <div class="page-head"><div><h1>Ràng buộc toàn vẹn</h1>
      <p>Cài đặt theo mục 7 của báo cáo: ràng buộc khai báo được (khóa, UNIQUE, CHECK) nằm trong lược đồ; ràng buộc liên bảng dùng trigger;
      ràng buộc quy trình (R9) kiểm tra ở tầng ứng dụng. Nút <b>Thử vi phạm</b> thực hiện thao tác sai trong một transaction rồi luôn ROLLBACK, dữ liệu không đổi.</p></div>
      <button class="btn primary" id="all">Thử tất cả</button></div>

    <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>Kiểm tra dữ liệu hiện có</h2>
      <p>Số bản ghi đang vi phạm từng ràng buộc — ${tongViPham === 0 ? 'toàn bộ dữ liệu hợp lệ' : `<b style="color:var(--bad)">có ${tongViPham} vi phạm</b>`}</p></div></div>
      <div class="card-body"><div class="audit">${Object.entries(audit).map(([k, n]) =>
        `<div><b>${k}</b><span class="${n ? 'bad' : 'ok'}">${n ? `${n} vi phạm` : '✓ 0'}</span></div>`).join('')}</div></div></div>

    <div class="card">${rules.map((r) => `
      <div class="rule" id="rule-${r.code}">
        <span class="code">${r.code}</span>
        <div><div>${esc(r.text)}</div>
          <div class="row" style="margin-top:4px"><span class="badge ${MECH_TONE[r.mech]}">${esc(r.mech)}</span><code class="muted">${esc(r.impl)}</code></div></div>
        <button class="btn sm" data-test="${r.code}">Thử vi phạm</button>
        <div class="result" hidden></div>
      </div>`).join('')}</div>

    <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Toàn vẹn tham chiếu</h2>
      <p>FOREIGN KEY với ON UPDATE CASCADE; ON DELETE RESTRICT cho dữ liệu giao dịch (VE, HANHLY, PHANCONG, SUDUNGDICHVU).
      Thử xóa một hành khách đã có vé trong mục <a href="#/du-lieu/HANHKHACH">Hành khách</a> để thấy CSDL từ chối.</p></div></div></div>`;

  async function test(code) {
    const box = view.querySelector(`#rule-${code} .result`);
    const btn = view.querySelector(`[data-test="${code}"]`);
    btn.disabled = true;
    try {
      const r = await api(`/constraints/${code}/test`, { method: 'POST' });
      box.className = `result ${r.blocked ? 'ok' : 'bad'}`;
      box.innerHTML = `<b>${r.blocked ? '✓ Đã chặn' : '✗ Không chặn'}</b> — ${esc(r.thuTuc || '')}<br>Thông báo: <code>${esc(r.message)}</code>`;
    } catch (e) {
      box.className = 'result bad'; box.textContent = e.message;
    }
    box.hidden = false; btn.disabled = false;
  }
  view.querySelectorAll('[data-test]').forEach((b) => { b.onclick = () => test(b.dataset.test); });
  view.querySelector('#all').onclick = async () => { for (const r of rules) await test(r.code); };
}
