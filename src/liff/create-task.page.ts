/** สร้างหน้า HTML ฟอร์ม "สร้างงาน" ที่เปิดผ่าน LIFF (LINE mini-webapp ในแชท)
 *  รองรับทั้งแชทกลุ่ม (context.type === 'group') และแชทส่วนตัว 1-ต่อ-1 กับบอท (context.type === 'utou')
 *  สำหรับแชทส่วนตัว จะซ่อนส่วนมอบหมายงานทั้งหมด แล้วสร้างเป็น "งานส่วนตัว" มอบให้ตัวเองอัตโนมัติ */
export function renderCreateTaskPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover" />
<title>สร้างงาน — เจ้านาย</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
  :root {
    --accent: #5B5FEE;
    --accent-dark: #4448D6;
    --accent-soft: #EEF0FF;
    --ink: #1A1B25;
    --ink-soft: #6B6E85;
    --line-soft: #E6E8F0;
    --bg: #F5F6FB;
    --danger: #FF5A5F;
    --warn: #FFB020;
    --good: #06C755;
    --radius-lg: 20px;
    --radius-md: 14px;
    --radius-sm: 10px;
    --shadow: 0 8px 28px rgba(43, 47, 92, 0.10);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; }
  body {
    font-family: "Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 0;
    background: linear-gradient(180deg, #EEF0FF 0%, var(--bg) 240px);
    color: var(--ink);
    min-height: 100vh;
    padding-bottom: calc(28px + env(safe-area-inset-bottom));
  }

  .topbar {
    padding: 22px 20px 14px;
    text-align: center;
  }
  .topbar .badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: #fff; border-radius: 999px; padding: 6px 14px;
    font-size: 12px; font-weight: 700; color: var(--accent);
    box-shadow: var(--shadow);
  }
  .topbar h1 {
    font-size: 20px; font-weight: 800; margin: 12px 0 2px; letter-spacing: -0.2px;
  }
  .topbar p {
    font-size: 13px; color: var(--ink-soft); margin: 0;
  }

  .card {
    background: #fff;
    border-radius: var(--radius-lg);
    margin: 0 16px 16px;
    padding: 20px 18px;
    box-shadow: var(--shadow);
  }

  .field { margin-bottom: 18px; }
  .field:last-child { margin-bottom: 0; }
  label.field-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 8px;
  }
  label.field-label .opt {
    font-weight: 500; color: var(--ink-soft); font-size: 12px;
  }

  input[type="text"], input[type="datetime-local"], textarea {
    width: 100%;
    padding: 13px 14px;
    border: 1.5px solid var(--line-soft);
    border-radius: var(--radius-sm);
    font-size: 15px;
    background: #FBFBFE;
    font-family: inherit;
    color: var(--ink);
    transition: border-color 0.15s, background 0.15s;
  }
  input[type="text"]:focus, input[type="datetime-local"]:focus, textarea:focus {
    outline: none; border-color: var(--accent); background: #fff;
  }
  textarea { min-height: 78px; resize: vertical; line-height: 1.4; }
  input::placeholder, textarea::placeholder { color: #B7B9C8; }

  .segmented {
    display: flex; gap: 8px;
  }
  .seg-btn {
    flex: 1; padding: 12px 0; text-align: center; border-radius: var(--radius-sm);
    border: 1.5px solid var(--line-soft); font-size: 14px; font-weight: 600;
    cursor: pointer; background: #FBFBFE; color: var(--ink-soft);
    transition: all 0.15s;
    user-select: none;
  }
  .seg-btn[data-value="HIGH"].selected { border-color: var(--danger); background: #FFF0F0; color: var(--danger); }
  .seg-btn[data-value="MEDIUM"].selected { border-color: var(--warn); background: #FFF8E8; color: #B87400; }
  .seg-btn[data-value="LOW"].selected { border-color: var(--good); background: #E9FBF0; color: #0A8C40; }

  .choice-row { display: flex; flex-direction: column; gap: 10px; }
  .choice-card {
    display: flex; align-items: center; gap: 12px;
    border: 1.5px solid var(--line-soft); border-radius: var(--radius-md);
    padding: 13px 14px; cursor: pointer; transition: all 0.15s; background: #FBFBFE;
  }
  .choice-card.selected { border-color: var(--accent); background: var(--accent-soft); }
  .choice-card .dot {
    width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--line-soft);
    flex-shrink: 0; position: relative; background: #fff;
  }
  .choice-card.selected .dot { border-color: var(--accent); }
  .choice-card.selected .dot::after {
    content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--accent);
  }
  .choice-card .txt { font-size: 14px; font-weight: 600; }
  .choice-card .sub { font-size: 12px; color: var(--ink-soft); font-weight: 400; margin-top: 1px; }

  select#assignee {
    width: 100%; padding: 13px 14px; border: 1.5px solid var(--line-soft); border-radius: var(--radius-sm);
    font-size: 15px; background: #FBFBFE url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B6E85' stroke-width='1.6' fill='none'/%3E%3C/svg%3E") no-repeat right 14px center;
    appearance: none; font-family: inherit; color: var(--ink);
  }

  #assigneeWrap { margin-top: 12px; display: none; }

  .personal-note {
    display: flex; align-items: center; gap: 10px;
    background: var(--accent-soft); border-radius: var(--radius-md);
    padding: 13px 14px; font-size: 13px; color: var(--accent-dark); font-weight: 600;
  }

  .submit-bar {
    padding: 4px 16px 0;
  }
  button#submitBtn {
    width: 100%; padding: 16px; border: none; border-radius: var(--radius-md);
    font-size: 16px; font-weight: 800; cursor: pointer; color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent-dark));
    box-shadow: 0 10px 24px rgba(91, 95, 238, 0.35);
    transition: transform 0.1s, opacity 0.15s;
  }
  button#submitBtn:active { transform: scale(0.98); }
  button#submitBtn:disabled { opacity: 0.55; box-shadow: none; }

  #status {
    text-align: center; padding: 90px 24px 24px; font-size: 15px; color: var(--ink-soft);
    display: flex; flex-direction: column; align-items: center; gap: 14px;
  }
  #status .spinner {
    width: 30px; height: 30px; border-radius: 50%;
    border: 3px solid var(--accent-soft); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  #status.done .spinner { display: none; }
  #status .big-check {
    width: 56px; height: 56px; border-radius: 50%; background: #E9FBF0;
    display: flex; align-items: center; justify-content: center; font-size: 28px;
  }
</style>
</head>
<body>
  <div id="status"><div class="spinner"></div><div>กำลังโหลดฟอร์ม...</div></div>

  <form id="form" style="display:none">
    <div class="topbar">
      <span class="badge">📝 เจ้านาย · สร้างงานใหม่</span>
      <h1 id="pageTitle">สร้างงานในกลุ่ม</h1>
      <p id="pageSub">กรอกรายละเอียดแล้วกดสร้างงานได้เลย</p>
    </div>

    <div class="card">
      <div class="field">
        <label class="field-label" for="title">หัวข้องาน</label>
        <input type="text" id="title" required maxlength="200" placeholder="เช่น ทำสไลด์นำเสนอลูกค้า" />
      </div>
      <div class="field">
        <label class="field-label" for="description">รายละเอียดเพิ่มเติม <span class="opt">(ไม่บังคับ)</span></label>
        <textarea id="description" maxlength="1000" placeholder="อธิบายเพิ่มเติมเกี่ยวกับงานนี้..."></textarea>
      </div>
    </div>

    <div class="card">
      <div class="field">
        <label class="field-label">ความสำคัญ</label>
        <div class="segmented" id="priorityRow">
          <div class="seg-btn" data-value="HIGH">🔴 สูง</div>
          <div class="seg-btn selected" data-value="MEDIUM">🟡 กลาง</div>
          <div class="seg-btn" data-value="LOW">🟢 ต่ำ</div>
        </div>
        <input type="hidden" id="priority" value="MEDIUM" />
      </div>
      <div class="field">
        <label class="field-label" for="deadline">เส้นตาย <span class="opt">(ไม่บังคับ)</span></label>
        <input type="datetime-local" id="deadline" />
      </div>
    </div>

    <div class="card" id="assignCard">
      <div class="field" id="assignModeField">
        <label class="field-label">มอบหมายงานนี้ยังไง?</label>
        <div class="choice-row" id="assignModeRow">
          <div class="choice-card selected" data-value="OPEN_CLAIM">
            <div class="dot"></div>
            <div><div class="txt">🙋 เปิดให้ใครก็ได้กดรับ</div><div class="sub">ใครในกลุ่มก็กดรับงานได้ก่อน</div></div>
          </div>
          <div class="choice-card" data-value="EXCLUSIVE">
            <div class="dot"></div>
            <div><div class="txt">👤 มอบให้คนใดคนหนึ่ง</div><div class="sub">เจาะจงผู้รับผิดชอบ</div></div>
          </div>
        </div>
        <div id="assigneeWrap">
          <select id="assignee"></select>
        </div>
      </div>
      <div class="personal-note" id="personalNote" style="display:none">
        🔒 นี่คืองานส่วนตัวของคุณ — มอบหมายให้ตัวเองอัตโนมัติ
      </div>
    </div>

    <div class="submit-bar">
      <button id="submitBtn" type="submit">✅ สร้างงาน</button>
    </div>
  </form>

<script>
  var LIFF_ID = ${JSON.stringify(liffId)};
  var groupId = null;      // LINE groupId เมื่ออยู่ในแชทกลุ่ม, null เมื่อเป็นแชทส่วนตัว
  var isPersonal = false;
  var idToken = null;
  var assignmentMode = 'OPEN_CLAIM';

  function setStatus(html, opts) {
    var el = document.getElementById('status');
    el.innerHTML = html;
    el.style.display = 'flex';
    el.classList.toggle('done', !!(opts && opts.done));
  }

  function showForm() {
    document.getElementById('status').style.display = 'none';
    document.getElementById('form').style.display = 'block';
  }

  document.getElementById('priorityRow').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#priorityRow .seg-btn').forEach(function (b) { b.classList.remove('selected'); });
    btn.classList.add('selected');
    document.getElementById('priority').value = btn.getAttribute('data-value');
  });

  document.getElementById('assignModeRow').addEventListener('click', function (e) {
    var card = e.target.closest('.choice-card');
    if (!card) return;
    document.querySelectorAll('#assignModeRow .choice-card').forEach(function (c) { c.classList.remove('selected'); });
    card.classList.add('selected');
    assignmentMode = card.getAttribute('data-value');
    document.getElementById('assigneeWrap').style.display = assignmentMode === 'EXCLUSIVE' ? 'block' : 'none';
  });

  async function loadMembers() {
    try {
      var res = await fetch('/liff/api/members?groupId=' + encodeURIComponent(groupId), {
        headers: { Authorization: 'Bearer ' + idToken },
      });
      if (!res.ok) return;
      var data = await res.json();
      var select = document.getElementById('assignee');
      (data.members || []).forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.displayName;
        select.appendChild(opt);
      });
    } catch (e) { /* เงียบไว้ ไม่บล็อกฟอร์ม */ }
  }

  function applyPersonalMode() {
    isPersonal = true;
    document.getElementById('pageTitle').textContent = 'สร้างงานส่วนตัว';
    document.getElementById('pageSub').textContent = 'งานนี้จะเห็นแค่คุณคนเดียวในแชทกับเจ้านาย';
    document.getElementById('assignModeField').style.display = 'none';
    document.getElementById('personalNote').style.display = 'flex';
  }

  document.getElementById('form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    var payload = {
      lineGroupId: isPersonal ? undefined : groupId,
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      priority: document.getElementById('priority').value,
      deadline: document.getElementById('deadline').value || null,
      assignmentMode: isPersonal ? 'EXCLUSIVE' : assignmentMode,
      assignedToUserId: !isPersonal && assignmentMode === 'EXCLUSIVE' ? document.getElementById('assignee').value : undefined,
    };

    try {
      var res = await fetch('/liff/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        document.getElementById('form').style.display = 'none';
        setStatus('<div class="big-check">✅</div><div><b>สร้างงานสำเร็จแล้วครับ!</b><br/>ปิดหน้านี้ได้เลย</div>', { done: true });
        setTimeout(function () { try { liff.closeWindow(); } catch (e) {} }, 1200);
      } else {
        var err = await res.json().catch(function () { return {}; });
        alert('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่ทราบสาเหตุ'));
        btn.disabled = false;
        btn.textContent = '✅ สร้างงาน';
      }
    } catch (err) {
      alert('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งครับ');
      btn.disabled = false;
      btn.textContent = '✅ สร้างงาน';
    }
  });

  (async function init() {
    try {
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      var context = liff.getContext();
      idToken = liff.getIDToken();
      if (!idToken) {
        setStatus('<div>⚠️ ไม่สามารถยืนยันตัวตนได้ ลองปิดแล้วเปิดใหม่อีกครั้งครับ</div>');
        return;
      }

      if (context && context.type === 'group') {
        groupId = context.groupId;
        await loadMembers();
      } else if (context && context.type === 'utou') {
        applyPersonalMode();
      } else {
        setStatus('<div>🙏 เปิดฟอร์มนี้จากในแชทกลุ่ม หรือแชทส่วนตัวกับเจ้านายเท่านั้นครับ</div>');
        return;
      }

      showForm();
    } catch (err) {
      setStatus('<div>⚠️ เกิดข้อผิดพลาดในการโหลดฟอร์ม: ' + (err && err.message ? err.message : 'unknown') + '</div>');
    }
  })();
</script>
</body>
</html>`;
}
