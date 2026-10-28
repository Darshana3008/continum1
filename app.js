/* Continum - UI controller for all four personas. */
(() => {
  'use strict';

  const WARDS = Store.WARDS;
  const WL = Store.WARD_LABELS;
  const ROLE_NAMES = {
    patient: 'Patient',
    hospital_admin: 'Hospital Admin',
    doctor: 'Doctor',
    app_admin: 'App Admin'
  };
  const ROLE_HINT = {
    patient: 'Find a bed, hold it, and keep your medical history',
    hospital_admin: 'Bed board, admissions and capacity',
    doctor: 'Prescriptions for your admitted patients',
    app_admin: 'Hospital ranking and data feeds'
  };
  const ROLE_ICON = { patient: '♡', hospital_admin: '✚', doctor: '✎', app_admin: '◎' };
  const TABS = {
    patient: [['search', 'Find beds'], ['bookings', 'My bookings'], ['history', 'Medical history']],
    hospital_admin: [['bookings', 'Bookings'], ['admissions', 'Admissions'], ['capacity', 'Ward capacity']],
    doctor: [['patients', 'My patients']],
    app_admin: [['hospitals', 'Hospitals & ranking'], ['data', 'Data & import']]
  };
  const STATUS_CLASS = {
    HELD: 'warn', ADMITTED: 'ok', DISCHARGED: 'muted-badge',
    EXPIRED: 'muted-badge', CANCELLED: 'muted-badge'
  };

  const ui = {
    tab: null,
    loginRole: null,
    patientMode: 'signin',
    importErrors: null,
    historyPid: null,
    search: { pincode: '', radiusKm: 10, ward: 'ANY', submitted: false }
  };

  /* ---------- Helpers ---------- */

  const $ = sel => document.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const fmt = iso => iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
  const fmtMs = ms => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  const hospitalName = id => Store.getHospital(id)?.name ?? 'Unknown hospital';
  const doctorName = id => Store.hospitals().flatMap(h => h.doctors).find(d => d.id === id)?.name ?? 'Unassigned';
  const patientLabel = pid => {
    const p = Store.getPatient(pid);
    return p ? `${p.name} · ${p.phone}` : 'Unknown patient';
  };
  const badge = st => `<span class="badge ${STATUS_CLASS[st] || ''}">${esc(st)}</span>`;
  const logo = (h, size = '') => `<img class="logo ${size}" src="assets/logos/${esc(h.id)}.svg" alt="" onerror="this.style.visibility='hidden'">`;
  const freeBeds = h => Store.totalAvailable(h);
  const viewerOf = s => (s.role === 'patient'
    ? { role: 'patient', patientId: s.patientId }
    : { role: 'hospital', hospitalId: s.hospitalId, label: s.label });
  const tbl = (headers, rows, emptyText) => `
    <div class="table-wrap"><table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${headers.length}" class="muted">${emptyText}</td></tr>`}</tbody>
    </table></div>`;
  const prescriptionList = aid => {
    const rx = Store.prescriptionsFor(aid);
    if (!rx.length) return '<p class="muted small">No prescriptions recorded for this stay.</p>';
    return rx.map(r => `
      <div class="rx">
        <div class="rx-meta">${fmt(r.createdAt)} · ${esc(doctorName(r.doctorId))}</div>
        <pre>${esc(r.text)}</pre>
      </div>`).join('');
  };

  let toastTimer;
  function toast(msg, kind = 'ok') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  /* Runs a state change, reports the outcome, then re-renders. */
  function run(fn, okMsg) {
    try {
      fn();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(err.message, 'error');
    }
    render();
  }

  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Home / login ---------- */

  function patientForm() {
    const isSignin = ui.patientMode === 'signin';
    const toggle = `
      <div class="seg" role="group" aria-label="Patient access">
        <button type="button" class="${isSignin ? 'on' : ''}" data-action="patient-mode" data-value="signin">Sign in</button>
        <button type="button" class="${!isSignin ? 'on' : ''}" data-action="patient-mode" data-value="register">New patient</button>
      </div>`;
    const fields = isSignin
      ? `
        <label>Mobile number (login ID)<input name="phone" inputmode="numeric" pattern="[0-9]{10}" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>`
      : `
        <label>Full name<input name="name" required maxlength="60" autocomplete="name"></label>
        <label>Mobile number (login ID, 10 digits)<input name="phone" inputmode="numeric" pattern="[0-9]{10}" autocomplete="username" required></label>
        <div class="grid-2">
          <label>Age<input name="age" type="number" min="1" max="120" required></label>
          <label>Gender<select name="gender"><option>Female</option><option>Male</option><option>Other</option></select></label>
        </div>
        <div class="grid-2">
          <label>Password (min 6 characters)<input name="password" type="password" minlength="6" autocomplete="new-password" required></label>
          <label>Confirm password<input name="confirm" type="password" minlength="6" autocomplete="new-password" required></label>
        </div>
        <p class="notice">Demo only. Do not enter real patient details.</p>`;
    return `
      <form class="card form" data-form="login">
        ${toggle}
        ${fields}
        <button class="btn primary block" type="submit">${isSignin ? 'Sign in' : 'Create account'}</button>
      </form>`;
  }

  function renderLogin() {
    const hs = Store.hospitals();
    const totalFree = hs.reduce((n, h) => n + freeBeds(h), 0);
    const cities = new Set(hs.map(h => h.city)).size;

    const partners = hs.map(h => `
      <article class="partner">
        ${logo(h, 'lg')}
        <strong>${esc(h.name)}</strong>
        <span class="muted small">${esc(h.city)}</span>
        <span class="pill">${freeBeds(h)} beds free</span>
      </article>`).join('');

    const roleCards = Object.keys(ROLE_NAMES).map(r => `
      <button type="button" class="role-card${ui.loginRole === r ? ' selected' : ''}" data-action="login-role" data-value="${r}">
        <span class="role-icon">${ROLE_ICON[r]}</span>
        <strong>${ROLE_NAMES[r]}</strong><span>${ROLE_HINT[r]}</span>
      </button>`).join('');

    let form = '<p class="muted center">Choose your role to continue.</p>';
    if (ui.loginRole === 'patient') form = patientForm();
    else if (ui.loginRole === 'hospital_admin') {
      form = `<form class="card form" data-form="login">
        <label>Hospital<select name="hospitalId">${hs.map(h =>
          `<option value="${esc(h.id)}">${esc(h.name)} (${esc(h.city)})</option>`).join('')}</select></label>
        <p class="notice">Demo login, no password.</p>
        <button class="btn primary block" type="submit">Continue as ${ROLE_NAMES.hospital_admin}</button></form>`;
    } else if (ui.loginRole === 'doctor') {
      form = `<form class="card form" data-form="login">
        <label>Doctor<select name="doctor">${hs.flatMap(h => h.doctors.map(d =>
          `<option value="${esc(h.id)}|${esc(d.id)}">${esc(d.name)} · ${esc(d.specialty)} · ${esc(h.name)}</option>`)).join('')}</select></label>
        <p class="notice">Demo login, no password.</p>
        <button class="btn primary block" type="submit">Continue as ${ROLE_NAMES.doctor}</button></form>`;
    } else if (ui.loginRole === 'app_admin') {
      form = `<form class="card form" data-form="login">
        <p class="muted">Demo login, no password.</p>
        <button class="btn primary block" type="submit">Continue as ${ROLE_NAMES.app_admin}</button></form>`;
    }

    return `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Continum</p>
          <h1>Care that continues, from search to discharge</h1>
          <p class="hero-sub">Find an IPD bed across partner hospitals, hold it for an hour, and carry your medical history with you to every admission.</p>
        </div>
        <div class="hero-stats">
          <div><strong>${hs.length}</strong><span>Partner hospitals</span></div>
          <div><strong>${totalFree}</strong><span>Beds free now</span></div>
          <div><strong>${cities}</strong><span>Cities</span></div>
        </div>
      </section>

      <section>
        <div class="section-head"><h2>Partner hospitals</h2></div>
        <div class="partner-grid">${partners}</div>
      </section>

      <section class="login-section">
        <div class="section-head"><h2>Sign in</h2></div>
        <div class="role-grid">${roleCards}</div>
        <div class="login-form">${form}</div>
      </section>`;
  }

  function handleLogin(form) {
    const f = new FormData(form);
    try {
      if (ui.loginRole === 'patient') {
        const phone = String(f.get('phone') || '').trim();
        let p;
        if (ui.patientMode === 'register') {
          p = Store.registerPatient({
            name: f.get('name'), phone, age: f.get('age'), gender: f.get('gender'),
            password: f.get('password'), confirm: f.get('confirm')
          });
        } else {
          p = Store.loginPatient(phone, f.get('password'));
        }
        Store.setSession({ role: 'patient', patientId: p.id, label: p.name });
      } else if (ui.loginRole === 'hospital_admin') {
        const h = Store.getHospital(f.get('hospitalId'));
        Store.setSession({ role: 'hospital_admin', hospitalId: h.id, label: h.name });
      } else if (ui.loginRole === 'doctor') {
        const [hid, did] = String(f.get('doctor')).split('|');
        const h = Store.getHospital(hid);
        const d = h.doctors.find(x => x.id === did);
        Store.setSession({ role: 'doctor', hospitalId: h.id, doctorId: d.id, label: `${d.name} · ${h.name}` });
      } else if (ui.loginRole === 'app_admin') {
        Store.setSession({ role: 'app_admin', label: 'Platform' });
      } else {
        return;
      }
      ui.loginRole = null;
      ui.patientMode = 'signin';
      ui.tab = null;
      ui.historyPid = null;
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    render();
  }

  /* ---------- Medical history panel (shared) ---------- */

  function historyPanel(pid, { closable = false } = {}) {
    const h = Store.getHistory(pid);
    if (!h.patient) return '';
    const visits = h.visits.map(v => {
      const a = v.admission;
      return `
        <li class="visit">
          <span class="visit-dot" aria-hidden="true"></span>
          <div class="visit-body">
            <div class="row">
              <strong>${esc(hospitalName(a.hospitalId))} · ${WL[a.ward]} ward</strong>
              ${badge(a.status)}
            </div>
            <p class="muted small">
              Admitted ${fmt(a.admittedAt)}${a.dischargedAt ? ` · Discharged ${fmt(a.dischargedAt)}` : ''}
              · Doctor: ${esc(doctorName(a.doctorId))}
            </p>
            ${prescriptionList(a.id)}
          </div>
        </li>`;
    }).join('');
    return `
      <section class="card history">
        <header class="row">
          <div>
            <h3>Medical history · ${esc(h.patient.name)}</h3>
            <p class="muted small">${h.patient.age} · ${esc(h.patient.gender)} · ${esc(h.patient.phone)}</p>
          </div>
          ${closable ? '<button class="btn ghost small" type="button" data-action="close-history">Close</button>' : ''}
        </header>
        ${h.visits.length ? `<ol class="timeline">${visits}</ol>` : '<p class="muted">No visits recorded yet.</p>'}
      </section>`;
  }

  /* ---------- Patient ---------- */

  function hospitalCard({ h, distanceKm }, wardFilter, hold) {
    const badgeHtml = h.deranked
      ? '<span class="badge muted-badge">De-ranked</span>'
      : `<span class="badge">Rank ${h.rank}/10</span>`;
    const wards = (wardFilter === 'ANY' ? WARDS : [wardFilter]).map(w => {
      const x = h.wards[w];
      const disabled = x.available < 1 || !!hold;
      return `
        <div class="ward${x.available < 1 ? ' empty' : ''}">
          <div><span class="ward-name">${WL[w]}</span>
            <span class="muted small"> · ${x.available} of ${x.total} free</span></div>
          <button class="btn small primary" type="button" data-action="book"
            data-hospital="${esc(h.id)}" data-ward="${w}" ${disabled ? 'disabled' : ''}>Hold bed</button>
        </div>`;
    }).join('');
    return `
      <article class="card hospital">
        <header class="row">
          <div class="hospital-head">${logo(h, 'sm')}<div><h3>${esc(h.name)}</h3><p class="muted small">${esc(h.address)}</p></div></div>
          ${badgeHtml}
        </header>
        <p class="muted small">${distanceKm} km away · ${esc(h.phone)}</p>
        <div class="ward-list">${wards}</div>
      </article>`;
  }

  function renderSearch(s) {
    const S = ui.search;
    const hold = Store.activeHold(s.patientId);
    const holdBanner = hold
      ? `<div class="notice warn">You are holding a ${WL[hold.ward]} bed at ${esc(hospitalName(hold.hospitalId))}.
           <span data-until="${hold.holdUntil}"></span></div>`
      : '';
    const wardOpts = ['ANY', ...WARDS].map(w =>
      `<option value="${w}" ${S.ward === w ? 'selected' : ''}>${w === 'ANY' ? 'Any ward' : WL[w]}</option>`).join('');
    const radiusOpts = [5, 10, 25, 50].map(r =>
      `<option value="${r}" ${S.radiusKm === r ? 'selected' : ''}>${r} km</option>`).join('');

    let results = '';
    if (S.submitted) {
      if (!/^\d{6}$/.test(S.pincode)) {
        results = '<div class="notice error">Enter a 6-digit pincode.</div>';
      } else {
        try {
          const list = Store.searchHospitals({ pincode: S.pincode, radiusKm: S.radiusKm, ward: S.ward });
          results = list.length
            ? `<p class="muted">${list.length} hospital(s) with beds within ${S.radiusKm} km</p>` +
              list.map(r => hospitalCard(r, S.ward, hold)).join('')
            : `<div class="notice">No hospitals with free beds within ${S.radiusKm} km. Try a larger radius or another ward.</div>`;
        } catch (err) {
          results = `<div class="notice error">${esc(err.message)}</div>`;
        }
      }
    }

    return `
      ${holdBanner}
      <div class="section-head"><h2>Find an IPD bed</h2></div>
      <form class="card form" data-form="search">
        <div class="grid-3">
          <label>Pincode<input name="pincode" inputmode="numeric" pattern="[0-9]{6}" value="${esc(S.pincode)}" required></label>
          <label>Radius<select name="radius">${radiusOpts}</select></label>
          <label>Ward type<select name="ward">${wardOpts}</select></label>
        </div>
        <div><button class="btn primary" type="submit">Search beds</button></div>
      </form>
      <section>${results}</section>`;
  }

  function renderMyBookings(s) {
    const bks = Store.bookingsForPatient(s.patientId);
    const rows = bks.map(b => `
      <tr>
        <td>${esc(hospitalName(b.hospitalId))}</td>
        <td>${WL[b.ward]}</td>
        <td>${badge(b.status)}</td>
        <td>${b.status === 'HELD'
          ? `<span data-until="${b.holdUntil}"></span>
             <div><button class="btn small ghost" type="button" data-action="cancel" data-id="${esc(b.id)}">Release bed</button></div>`
          : fmt(b.closedAt || b.createdAt)}</td>
      </tr>`).join('');
    return `
      <div class="section-head"><h2>My bed bookings</h2></div>
      ${tbl(['Hospital', 'Ward', 'Status', 'Hold / closed'], rows, 'No bookings yet.')}`;
  }

  function renderMyHistory(s) {
    const logs = Store.accessLogFor(s.patientId).map(x => `
      <tr>
        <td>${esc(x.viewerLabel)}</td>
        <td>${esc(hospitalName(x.hospitalId))}</td>
        <td>${fmt(x.at)}</td>
      </tr>`).join('');
    return `
      <div class="section-head"><h2>My medical history</h2></div>
      <p class="muted small">Your history follows you. Hospitals and doctors see it only while you are admitted to them.</p>
      ${historyPanel(s.patientId)}
      <div class="section-head"><h3>Who has viewed your history</h3></div>
      ${tbl(['Viewed by', 'Hospital', 'When'], logs, 'No one has viewed your history yet.')}`;
  }

  /* ---------- Hospital admin ---------- */

  function renderHospitalBookings(s) {
    const bks = Store.bookingsFor(s.hospitalId);
    const row = b => {
      const acts = b.status === 'HELD'
        ? `<div class="actions">
             <button class="btn small primary" type="button" data-action="admit" data-id="${esc(b.id)}">Mark admitted</button>
             <button class="btn small ghost" type="button" data-action="cancel" data-id="${esc(b.id)}">Release bed</button>
           </div>`
        : '';
      const timer = b.status === 'HELD' ? `<div class="small"><span data-until="${b.holdUntil}"></span></div>` : '';
      return `
        <tr>
          <td>${esc(patientLabel(b.patientId))}</td>
          <td>${WL[b.ward]}</td>
          <td>${fmt(b.createdAt)}</td>
          <td>${badge(b.status)}${timer}</td>
          <td>${acts}</td>
        </tr>`;
    };
    const held = bks.filter(b => b.status === 'HELD');
    const past = bks.filter(b => b.status !== 'HELD').slice(0, 20);
    const headers = ['Patient', 'Ward', 'Held on', 'Status', 'Action'];
    return `
      <div class="section-head"><h2>Active holds (${held.length})</h2></div>
      ${tbl(headers, held.map(row).join(''), 'No active holds.')}
      <div class="section-head"><h2>Recent history</h2></div>
      ${tbl(headers, past.map(row).join(''), 'No history yet.')}`;
  }

  function renderHospitalAdmissions(s) {
    const h = Store.getHospital(s.hospitalId);
    const wardOpts = WARDS.map(w => `<option value="${w}">${WL[w]}</option>`).join('');
    const panel = ui.historyPid ? historyPanel(ui.historyPid, { closable: true }) : '';
    const rows = Store.admissionsFor(s.hospitalId).slice(0, 50).map(a => {
      const doctorSel = `
        <select data-change="assign" data-id="${esc(a.id)}" aria-label="Assign doctor" ${a.status !== 'ADMITTED' ? 'disabled' : ''}>
          <option value="">Unassigned</option>
          ${h.doctors.map(d => `<option value="${esc(d.id)}" ${a.doctorId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>`;
      const acts = `<div class="actions">
        ${a.patientId ? `<button class="btn small ghost" type="button" data-action="open-history" data-id="${esc(a.id)}">History</button>` : ''}
        ${a.status === 'ADMITTED' ? `<button class="btn small danger" type="button" data-action="discharge" data-id="${esc(a.id)}">Discharge</button>` : ''}
      </div>`;
      return `
        <tr>
          <td><strong>${esc(a.patientName)}</strong><div class="muted small">${esc(a.patientPhone)} · ${a.age} · ${esc(a.gender)}</div></td>
          <td>${WL[a.ward]}</td>
          <td>${fmt(a.admittedAt)}</td>
          <td>${doctorSel}</td>
          <td>${badge(a.status)}</td>
          <td>${acts}</td>
        </tr>`;
    }).join('');

    return `
      ${panel}
      <div class="section-head"><h2>Add walk-in admission</h2></div>
      <form class="card form" data-form="walkin">
        <div class="grid-3">
          <label>Patient name<input name="name" required maxlength="60"></label>
          <label>Mobile (10 digits)<input name="phone" inputmode="numeric" pattern="[0-9]{10}" required></label>
          <label>Age<input name="age" type="number" min="1" max="120" required></label>
        </div>
        <div class="grid-2">
          <label>Gender<select name="gender"><option>Female</option><option>Male</option><option>Other</option></select></label>
          <label>Ward<select name="ward">${wardOpts}</select></label>
        </div>
        <div><button class="btn primary" type="submit">Admit patient</button></div>
      </form>
      <div class="section-head"><h2>Admissions</h2></div>
      ${tbl(['Patient', 'Ward', 'Admitted', 'Doctor', 'Status', ''], rows, 'No admissions yet.')}`;
  }

  function renderCapacity(s) {
    const h = Store.getHospital(s.hospitalId);
    const rows = WARDS.map(w => {
      const x = h.wards[w];
      return `
        <tr>
          <td>${WL[w]}</td>
          <td><input type="number" min="0" step="1" name="total_${w}" value="${x.total}" aria-label="${WL[w]} total beds"></td>
          <td>${x.total - x.available}</td>
          <td>${x.available}</td>
        </tr>`;
    }).join('');
    return `
      <div class="section-head"><h2>Ward capacity · ${esc(h.name)}</h2></div>
      <form class="card form" data-form="capacity">
        <div class="table-wrap"><table>
          <thead><tr><th>Ward</th><th>Total beds</th><th>Occupied or held</th><th>Available</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div><button class="btn primary" type="submit">Save capacity</button></div>
      </form>
      <p class="muted small">Available = total minus occupied or held beds. A total cannot go below the occupied count.</p>`;
  }

  /* ---------- Doctor ---------- */

  function renderDoctor(s) {
    const panel = ui.historyPid ? historyPanel(ui.historyPid, { closable: true }) : '';
    const list = Store.admissionsForDoctor(s.doctorId);
    if (!list.length) {
      return `${panel}<div class="notice">No admitted patients assigned to you. The hospital admin assigns patients to doctors.</div>`;
    }
    return panel + list.map(a => `
      <article class="card patient-card">
        <header class="row">
          <div><h3>${esc(a.patientName)}</h3>
          <p class="muted small">${a.age} · ${esc(a.gender)} · ${WL[a.ward]} ward · admitted ${fmt(a.admittedAt)} · ${esc(a.patientPhone)}</p></div>
          <div class="actions">
            ${a.patientId ? `<button class="btn small ghost" type="button" data-action="open-history" data-id="${esc(a.id)}">Medical history</button>` : ''}
            ${badge(a.status)}
          </div>
        </header>
        <form class="form" data-form="prescribe" data-id="${esc(a.id)}">
          <label>New prescription (plain text)<textarea name="text" rows="3" required maxlength="4000"></textarea></label>
          <div><button class="btn primary small" type="submit">Save prescription</button></div>
        </form>
        <h4>This stay</h4>
        ${prescriptionList(a.id)}
      </article>`).join('');
  }

  /* ---------- App admin ---------- */

  function renderAdminHospitals() {
    const rows = Store.hospitals().map(h => {
      const t = WARDS.reduce((a, w) => ({ total: a.total + h.wards[w].total, avail: a.avail + h.wards[w].available }), { total: 0, avail: 0 });
      const rankOpts = Array.from({ length: 10 }, (_, i) => i + 1)
        .map(r => `<option value="${r}" ${h.rank === r ? 'selected' : ''}>${r}</option>`).join('');
      return `
        <tr>
          <td><div class="hospital-head">${logo(h, 'sm')}<div><strong>${esc(h.name)}</strong><div class="muted small">${esc(h.city)} · ${esc(h.pincode)}</div></div></div></td>
          <td>${t.avail} / ${t.total}</td>
          <td><select data-change="rank" data-id="${esc(h.id)}" aria-label="Rank for ${esc(h.name)}">${rankOpts}</select></td>
          <td><label class="check"><input type="checkbox" data-change="deranked" data-id="${esc(h.id)}" ${h.deranked ? 'checked' : ''}> De-rank</label></td>
        </tr>`;
    }).join('');
    return `
      <div class="section-head"><h2>Hospital ranking</h2></div>
      <p class="muted">Rank 10 shows first in patient search. De-ranked hospitals move to the bottom and carry a label.</p>
      ${tbl(['Hospital', 'Beds free / total', 'Rank (1 to 10)', 'De-rank'], rows, 'No hospitals loaded.')}`;
  }

  function renderAdminData() {
    const c = Store.counts();
    const errs = ui.importErrors
      ? `<div class="notice error"><strong>Import failed:</strong><ul>${ui.importErrors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`
      : '';
    return `
      <div class="section-head"><h2>Data</h2></div>
      <div class="stats">
        <div class="stat"><strong>${c.hospitals}</strong>Hospitals</div>
        <div class="stat"><strong>${c.bookings}</strong>Bookings</div>
        <div class="stat"><strong>${c.admissions}</strong>Admissions</div>
        <div class="stat"><strong>${c.patients}</strong>Patients</div>
      </div>
      ${errs}
      <div class="card form">
        <h3>Import hospital feed (JSON)</h3>
        <p class="muted small">Upserts hospitals by id. Existing ranking and de-rank settings are kept. Bed counts from the file are reduced by holds that are currently active. Logos load from assets/logos/&lt;hospital id&gt;.svg.</p>
        <input type="file" accept="application/json,.json" data-change="import" aria-label="Choose hospital JSON file">
      </div>
      <div class="card form">
        <h3>Export</h3>
        <p class="muted small">Downloads current hospitals, bed counts and ranking in the same JSON format.</p>
        <div><button class="btn" type="button" data-action="export">Download hospitals JSON</button></div>
      </div>
      <div class="card form">
        <h3>Reset</h3>
        <p class="muted small">Restores sample data and clears bookings, admissions, prescriptions, medical history and patient accounts.</p>
        <div><button class="btn danger" type="button" data-action="reset">Reset to sample data</button></div>
      </div>`;
  }

  function handleImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try {
        obj = JSON.parse(reader.result);
      } catch (e) {
        ui.importErrors = ['File is not valid JSON.'];
        toast('Import failed. See the errors below.', 'error');
        render();
        return;
      }
      const r = Store.importHospitals(obj);
      ui.importErrors = r.ok ? null : r.errors;
      toast(r.ok ? `Imported ${r.count} hospital(s).` : 'Import failed. See the errors below.', r.ok ? 'ok' : 'error');
      render();
    };
    reader.readAsText(file);
  }

  /* ---------- Panel routing ---------- */

  const PANEL = {
    patient: { search: renderSearch, bookings: renderMyBookings, history: renderMyHistory },
    hospital_admin: { bookings: renderHospitalBookings, admissions: renderHospitalAdmissions, capacity: renderCapacity },
    doctor: { patients: renderDoctor },
    app_admin: { hospitals: renderAdminHospitals, data: renderAdminData }
  };

  function render() {
    const s = Store.getSession();
    $('#login-view').hidden = !!s;
    $('#app-view').hidden = !s;
    $('#logout').hidden = !s;
    $('#session-info').textContent = s ? `${ROLE_NAMES[s.role]} · ${s.label}` : '';

    if (!s) {
      $('#login-view').innerHTML = renderLogin();
      return;
    }
    const tabs = TABS[s.role];
    if (!tabs.some(([k]) => k === ui.tab)) ui.tab = tabs[0][0];
    $('#tabs').innerHTML = tabs.map(([k, l]) => `
      <button type="button" class="tab${k === ui.tab ? ' active' : ''}" role="tab"
        aria-selected="${k === ui.tab}" data-action="tab" data-value="${k}">${esc(l)}</button>`).join('');
    $('#panel').innerHTML = PANEL[s.role][ui.tab](s);
    tick();
  }

  /* ---------- Events ---------- */

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const s = Store.getSession();
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'login-role':
        ui.loginRole = el.dataset.value;
        ui.patientMode = 'signin';
        render();
        break;
      case 'patient-mode':
        ui.patientMode = el.dataset.value;
        render();
        break;
      case 'tab':
        ui.tab = el.dataset.value;
        ui.historyPid = null;
        render();
        break;
      case 'logout':
        Store.logout();
        ui.tab = null;
        ui.loginRole = null;
        ui.historyPid = null;
        render();
        break;
      case 'book': {
        const h = el.dataset.hospital;
        const w = el.dataset.ward;
        if (!confirm(`Hold a ${WL[w]} bed at ${hospitalName(h)} for 60 minutes?`)) break;
        run(() => Store.bookBed(s.patientId, h, w), 'Bed held for 60 minutes.');
        break;
      }
      case 'cancel':
        run(() => Store.cancelBooking(id), 'Hold released. Bed is available again.');
        break;
      case 'admit':
        run(() => Store.admitBooking(id), 'Patient admitted. Assign a doctor in Admissions.');
        break;
      case 'discharge':
        if (confirm('Discharge this patient and free the bed?')) {
          run(() => Store.discharge(id), 'Patient discharged.');
        }
        break;
      case 'open-history': {
        const a = Store.admissionsFor(s.hospitalId).find(x => x.id === id)
          || Store.admissionsForDoctor(s.doctorId).find(x => x.id === id);
        if (!a?.patientId) { toast('Walk-in admission: no linked medical history.', 'warn'); break; }
        run(() => {
          Store.recordView(a.patientId, viewerOf(s));
          ui.historyPid = a.patientId;
        });
        break;
      }
      case 'close-history':
        ui.historyPid = null;
        render();
        break;
      case 'export':
        download(`continum-hospitals-${new Date().toISOString().slice(0, 10)}.json`, Store.exportHospitals());
        break;
      case 'reset':
        if (confirm('Reset all data to sample data? Bookings, admissions, prescriptions, medical history and patient accounts will be cleared.')) {
          Store.reset();
          ui.tab = null;
          ui.historyPid = null;
          ui.importErrors = null;
          run(() => {}, 'Sample data restored. Please sign in again.');
        }
        break;
    }
  });

  document.addEventListener('change', e => {
    const el = e.target;
    const kind = el.dataset.change;
    if (!kind) return;
    if (kind === 'rank') {
      run(() => Store.setRank(el.dataset.id, Number(el.value)), 'Rank updated.');
    } else if (kind === 'deranked') {
      run(() => Store.setDeranked(el.dataset.id, el.checked),
        el.checked ? 'Hospital de-ranked.' : 'De-rank removed.');
    } else if (kind === 'assign') {
      run(() => Store.assignDoctor(el.dataset.id, el.value || null), 'Doctor assigned.');
    } else if (kind === 'import' && el.files[0]) {
      handleImport(el.files[0]);
    }
  });

  document.addEventListener('submit', e => {
    const form = e.target;
    const kind = form.dataset.form;
    if (!kind) return;
    e.preventDefault();
    const s = Store.getSession();
    const f = new FormData(form);
    switch (kind) {
      case 'login':
        handleLogin(form);
        break;
      case 'search':
        ui.search = {
          pincode: String(f.get('pincode')).trim(),
          radiusKm: Number(f.get('radius')),
          ward: f.get('ward'),
          submitted: true
        };
        render();
        break;
      case 'walkin':
        run(() => Store.walkIn({
          hospitalId: s.hospitalId,
          ward: f.get('ward'),
          name: f.get('name'),
          phone: String(f.get('phone')).trim(),
          age: f.get('age'),
          gender: f.get('gender')
        }), 'Walk-in patient admitted.');
        break;
      case 'capacity':
        run(() => WARDS.forEach(w => Store.setWardTotal(s.hospitalId, w, f.get(`total_${w}`))),
          'Ward capacity saved.');
        break;
      case 'prescribe':
        run(() => {
          Store.prescribe(form.dataset.id, s.doctorId, f.get('text'));
        }, 'Prescription saved to the medical history.');
        break;
    }
  });

  /* ---------- Live hold countdowns and expiry ---------- */

  function tick() {
    document.querySelectorAll('[data-until]').forEach(el => {
      const ms = Date.parse(el.dataset.until) - Date.now();
      el.textContent = ms > 0 ? `Hold ends in ${fmtMs(ms)}` : 'Hold expired';
    });
  }

  setInterval(() => {
    const expired = Store.expireHolds();
    if (expired > 0) {
      toast(`${expired} bed hold(s) expired and the bed(s) were released.`, 'warn');
      render();
    } else {
      tick();
    }
  }, 1000);

  /* ---------- Boot ---------- */

  Store.init();
  render();
})();
