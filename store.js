/* Continum - local data-access layer.
 * All reads and writes go through this module. For production, replace the
 * internals with calls to the Continum API; the UI layer does not change.
 */
const Store = (() => {
  const KEY = 'continum.v1';
  const HOLD_MS = 60 * 60 * 1000;
  const WARDS = ['GENERAL', 'ICU', 'PRIVATE', 'EMERGENCY'];
  const WARD_LABELS = { GENERAL: 'General', ICU: 'ICU', PRIVATE: 'Private', EMERGENCY: 'Emergency' };
  let state = null;

  const nowIso = () => new Date().toISOString();
  const uid = p => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const clone = o => JSON.parse(JSON.stringify(o));
  const clampRank = r => {
    const n = Math.round(Number(r));
    return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
  };
  const byNewest = (a, b) => (b.createdAt > a.createdAt ? 1 : -1);
  const byNewestAdm = (a, b) => (b.admittedAt > a.admittedAt ? 1 : -1);

  function seed() {
    const d = window.SEED_DATA;
    return {
      version: 1,
      hospitals: clone(d.hospitals),
      pincodes: clone(d.pincodes),
      patients: [],
      bookings: [],
      admissions: [],
      prescriptions: [],
      accessLog: [],
      session: null
    };
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error('Could not save to localStorage', e); }
  }

  function init() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : seed();
      if (!state.accessLog) state.accessLog = [];
    } catch (e) {
      state = seed();
    }
    expireHolds();
    persist();
  }

  const hospital = id => state.hospitals.find(h => h.id === id) || null;
  const totalAvailable = h => WARDS.reduce((n, w) => n + h.wards[w].available, 0);
  const adm = id => {
    const a = state.admissions.find(x => x.id === id);
    if (!a) throw new Error('Admission not found.');
    return a;
  };

  function haversineKm(a, b) {
    const R = 6371;
    const rad = d => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function releaseBed(hospitalId, ward) {
    const w = hospital(hospitalId)?.wards[ward];
    if (w) w.available = Math.min(w.total, w.available + 1);
  }

  function takeBed(hospitalId, ward) {
    const w = hospital(hospitalId)?.wards[ward];
    if (!w || w.available < 1) throw new Error('No beds left in that ward. Pick another ward or hospital.');
    w.available -= 1;
  }

  /* Frees any bed whose hold has passed its hour. Returns number expired. */
  function expireHolds() {
    const now = Date.now();
    let n = 0;
    state.bookings.forEach(b => {
      if (b.status === 'HELD' && Date.parse(b.holdUntil) <= now) {
        b.status = 'EXPIRED';
        b.closedAt = nowIso();
        releaseBed(b.hospitalId, b.ward);
        n++;
      }
    });
    if (n) persist();
    return n;
  }

  function validatePatient({ name, phone, age }) {
    if (!String(name || '').trim()) throw new Error('Name is required.');
    if (!/^\d{10}$/.test(String(phone || ''))) throw new Error('Enter a 10-digit mobile number.');
    const a = Number(age);
    if (!(a >= 1 && a <= 120)) throw new Error('Enter a valid age (1 to 120).');
  }

  /* ---------- Patients and sessions ---------- */

  /* Demo-only password hash (cyrb53 over salt + password). Not a substitute for
   * bcrypt or argon2 on a server. Production auth must be server-side. */
  function hashPassword(salt, password) {
    const s = `${salt}|${password}`;
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  /* Mobile number is the unique login name. */
  function registerPatient({ name, phone, age, gender, password, confirm }) {
    validatePatient({ name, phone, age });
    if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters.');
    if (password !== confirm) throw new Error('Passwords do not match.');
    if (state.patients.some(x => x.phone === phone)) {
      throw new Error('This mobile number is already registered. Sign in instead.');
    }
    const salt = uid('S');
    const p = {
      id: uid('PT'), name: name.trim(), phone, age: Number(age), gender,
      salt, passwordHash: hashPassword(salt, password), createdAt: nowIso()
    };
    state.patients.push(p);
    persist();
    return p;
  }

  function loginPatient(phone, password) {
    const p = state.patients.find(x => x.phone === phone);
    if (!p || p.passwordHash !== hashPassword(p.salt, String(password || ''))) {
      throw new Error('Invalid mobile number or password.');
    }
    return p;
  }

  const getPatient = id => state.patients.find(p => p.id === id) || null;
  const getSession = () => state.session;
  function setSession(s) { state.session = s; persist(); }
  function logout() { state.session = null; persist(); }

  /* ---------- Patient: search and book ---------- */

  function searchHospitals({ pincode, radiusKm, ward }) {
    const origin = state.pincodes.find(p => p.pincode === pincode);
    if (!origin) throw new Error(`Pincode ${pincode} is not in the directory.`);
    const hasBed = h => (ward === 'ANY' ? totalAvailable(h) > 0 : h.wards[ward].available > 0);
    return state.hospitals
      .map(h => ({ h, distanceKm: haversineKm(origin, h.location) }))
      .filter(x => x.distanceKm <= radiusKm && hasBed(x.h))
      .sort((a, b) => (a.h.deranked - b.h.deranked) || (b.h.rank - a.h.rank) || (a.distanceKm - b.distanceKm))
      .map(x => ({ ...x, distanceKm: Math.round(x.distanceKm * 10) / 10 }));
  }

  function activeHold(patientId) {
    return state.bookings.find(b => b.patientId === patientId && b.status === 'HELD') || null;
  }

  function bookBed(patientId, hospitalId, ward) {
    if (activeHold(patientId)) throw new Error('You already have a bed on hold. Wait for it to expire or release it first.');
    takeBed(hospitalId, ward);
    const b = {
      id: uid('BK'), patientId, hospitalId, ward, status: 'HELD',
      createdAt: nowIso(), holdUntil: new Date(Date.now() + HOLD_MS).toISOString(),
      admissionId: null, closedAt: null
    };
    state.bookings.push(b);
    persist();
    return b;
  }

  function cancelBooking(bookingId) {
    const b = state.bookings.find(x => x.id === bookingId);
    if (!b || b.status !== 'HELD') throw new Error('Only a held booking can be released.');
    b.status = 'CANCELLED';
    b.closedAt = nowIso();
    releaseBed(b.hospitalId, b.ward);
    persist();
  }

  /* ---------- Hospital admin: bookings, admissions, capacity ---------- */

  function addAdmission({ hospitalId, ward, bookingId, patient }) {
    const a = {
      id: uid('AD'), hospitalId, ward, bookingId: bookingId || null,
      patientId: patient.id || null, patientName: patient.name, patientPhone: patient.phone,
      age: patient.age, gender: patient.gender,
      doctorId: null, status: 'ADMITTED', admittedAt: nowIso(), dischargedAt: null
    };
    state.admissions.push(a);
    return a;
  }

  function admitBooking(bookingId) {
    const b = state.bookings.find(x => x.id === bookingId);
    if (!b || b.status !== 'HELD') throw new Error('Only a held booking can be admitted.');
    const p = getPatient(b.patientId);
    const a = addAdmission({
      hospitalId: b.hospitalId, ward: b.ward, bookingId: b.id,
      patient: { id: p.id, name: p.name, phone: p.phone, age: p.age, gender: p.gender }
    });
    b.status = 'ADMITTED';
    b.closedAt = nowIso();
    b.admissionId = a.id;
    persist();
    return a;
  }

  function walkIn({ hospitalId, ward, name, phone, age, gender }) {
    validatePatient({ name, phone, age });
    takeBed(hospitalId, ward);
    const a = addAdmission({
      hospitalId, ward, bookingId: null,
      patient: { id: null, name: name.trim(), phone, age: Number(age), gender }
    });
    persist();
    return a;
  }

  function assignDoctor(admissionId, doctorId) {
    adm(admissionId).doctorId = doctorId || null;
    persist();
  }

  function discharge(admissionId) {
    const a = adm(admissionId);
    if (a.status !== 'ADMITTED') throw new Error('This patient is not currently admitted.');
    a.status = 'DISCHARGED';
    a.dischargedAt = nowIso();
    releaseBed(a.hospitalId, a.ward);
    persist();
  }

  function setWardTotal(hospitalId, ward, total) {
    const w = hospital(hospitalId).wards[ward];
    const t = Math.floor(Number(total));
    if (!Number.isFinite(t) || t < 0) throw new Error('Total beds must be a whole number, 0 or more.');
    const occupied = w.total - w.available;
    if (t < occupied) throw new Error(`${WARD_LABELS[ward]} has ${occupied} occupied or held beds. Total cannot go below that.`);
    w.total = t;
    w.available = t - occupied;
    persist();
  }

  /* ---------- Doctor: prescriptions ---------- */

  function prescribe(admissionId, doctorId, text) {
    const a = adm(admissionId);
    if (a.doctorId !== doctorId || a.status !== 'ADMITTED') {
      throw new Error('You can only prescribe for your currently admitted patients.');
    }
    const t = String(text || '').trim();
    if (!t) throw new Error('Prescription text is empty.');
    const rx = { id: uid('RX'), admissionId, doctorId, text: t, createdAt: nowIso() };
    state.prescriptions.push(rx);
    persist();
    return rx;
  }

  /* ---------- Medical history ----------
   * Rule: a patient can always see their own history. Any hospital (and its
   * doctors) can see a patient's full history only while that patient is
   * currently admitted to that hospital. Every hospital view is logged. */

  function canViewHistory(patientId, viewer) {
    if (!patientId || !viewer) return false;
    if (viewer.role === 'patient') return viewer.patientId === patientId;
    return state.admissions.some(a =>
      a.patientId === patientId && a.status === 'ADMITTED' && a.hospitalId === viewer.hospitalId);
  }

  function recordView(patientId, viewer) {
    if (!canViewHistory(patientId, viewer)) {
      throw new Error('Medical history is open only while this patient is admitted to your hospital.');
    }
    if (viewer.role !== 'patient') {
      state.accessLog.push({
        id: uid('AL'), patientId, viewerLabel: viewer.label, hospitalId: viewer.hospitalId, at: nowIso()
      });
      persist();
    }
  }

  function getHistory(patientId) {
    const patient = getPatient(patientId);
    const visits = state.admissions
      .filter(a => a.patientId === patientId)
      .sort(byNewestAdm)
      .map(a => ({ admission: a, prescriptions: prescriptionsFor(a.id) }));
    return { patient, visits };
  }

  function accessLogFor(patientId) {
    return state.accessLog.filter(x => x.patientId === patientId).sort((a, b) => (b.at > a.at ? 1 : -1));
  }

  /* ---------- App admin: ranking, import, export ---------- */

  function setRank(hospitalId, rank) {
    hospital(hospitalId).rank = clampRank(rank);
    persist();
  }

  function setDeranked(hospitalId, flag) {
    hospital(hospitalId).deranked = !!flag;
    persist();
  }

  /* Upserts hospitals by id. Ranking and de-rank flags are kept for existing hospitals.
   * Bed availability from the feed is reduced by any holds currently active. */
  function importHospitals(obj) {
    const list = Array.isArray(obj?.hospitals) ? obj.hospitals : null;
    if (!list) return { ok: false, errors: ['Top-level "hospitals" array is missing.'] };
    const pins = Array.isArray(obj.pincodes) ? obj.pincodes : [];
    const errors = [];

    list.forEach((h, i) => {
      const at = `hospitals[${i}]`;
      if (!h?.id) errors.push(`${at}: "id" is required.`);
      if (!h?.name) errors.push(`${at}: "name" is required.`);
      if (typeof h?.location?.lat !== 'number' || typeof h?.location?.lng !== 'number') {
        errors.push(`${at}: "location.lat" and "location.lng" must be numbers.`);
      }
      WARDS.forEach(w => {
        const x = h?.wards?.[w];
        if (!x || !Number.isInteger(x.total) || !Number.isInteger(x.available) || x.available < 0 || x.available > x.total) {
          errors.push(`${at}: wards.${w} needs integer "total" and "available", with 0 <= available <= total.`);
        }
      });
    });
    pins.forEach((p, i) => {
      if (!p?.pincode || typeof p.lat !== 'number' || typeof p.lng !== 'number') {
        errors.push(`pincodes[${i}]: needs "pincode", "lat" and "lng".`);
      }
    });
    if (errors.length) return { ok: false, errors };

    list.forEach(h => {
      const held = w => state.bookings.filter(b => b.hospitalId === h.id && b.ward === w && b.status === 'HELD').length;
      const existing = hospital(h.id);
      const wards = {};
      WARDS.forEach(w => {
        const x = h.wards[w];
        wards[w] = { total: x.total, available: Math.max(0, x.available - held(w)) };
      });
      const rec = {
        id: h.id,
        name: h.name,
        city: h.city || '',
        address: h.address || '',
        phone: h.phone || '',
        pincode: String(h.pincode || ''),
        location: { lat: h.location.lat, lng: h.location.lng },
        rank: existing ? existing.rank : clampRank(h.rank ?? 5),
        deranked: existing ? existing.deranked : !!h.deranked,
        wards,
        doctors: Array.isArray(h.doctors) ? h.doctors : (existing?.doctors || [])
      };
      if (existing) Object.assign(existing, rec);
      else state.hospitals.push(rec);
    });

    pins.forEach(p => {
      const code = String(p.pincode);
      const rec = { pincode: code, area: p.area || '', city: p.city || '', lat: p.lat, lng: p.lng };
      const ex = state.pincodes.find(x => x.pincode === code);
      if (ex) Object.assign(ex, rec);
      else state.pincodes.push(rec);
    });

    persist();
    return { ok: true, count: list.length };
  }

  const exportHospitals = () => ({
    schemaVersion: 1,
    exportedAt: nowIso(),
    hospitals: clone(state.hospitals),
    pincodes: clone(state.pincodes)
  });

  function reset() {
    state = seed();
    persist();
  }

  /* ---------- Read helpers ---------- */

  const hospitals = () => state.hospitals;
  const getHospital = id => hospital(id);
  const bookingsFor = hid => state.bookings.filter(b => b.hospitalId === hid).sort(byNewest);
  const bookingsForPatient = pid => state.bookings.filter(b => b.patientId === pid).sort(byNewest);
  const admissionsFor = hid => state.admissions.filter(a => a.hospitalId === hid).sort(byNewestAdm);
  const admissionsForDoctor = did => state.admissions.filter(a => a.doctorId === did && a.status === 'ADMITTED').sort(byNewestAdm);
  const admissionsForPatient = pid => state.admissions.filter(a => a.patientId === pid).sort(byNewestAdm);
  const prescriptionsFor = aid => state.prescriptions
    .filter(r => r.admissionId === aid)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const counts = () => ({
    hospitals: state.hospitals.length,
    bookings: state.bookings.length,
    admissions: state.admissions.length,
    patients: state.patients.length
  });

  return {
    WARDS, WARD_LABELS, HOLD_MS,
    init, expireHolds, reset,
    getSession, setSession, logout,
    hospitals, getHospital, counts,
    searchHospitals, activeHold, bookBed, cancelBooking,
    registerPatient, loginPatient, getPatient, bookingsForPatient, admissionsForPatient,
    bookingsFor, admissionsFor, admitBooking, walkIn, assignDoctor, discharge, setWardTotal,
    admissionsForDoctor, prescribe, prescriptionsFor,
    canViewHistory, recordView, getHistory, accessLogFor,
    setRank, setDeranked, importHospitals, exportHospitals,
    totalAvailable
  };
})();
