# Continum (prototype)

Care that continues, from bed search to discharge. Static HTML, CSS and vanilla JS. No build step, no server.

## Run

Open `index.html` in Chrome, Edge, Firefox or Safari. Double-click works.

## Roles

Patients register and sign in with a mobile number (unique login ID) and a password. Hospital admin, doctor and app admin use a demo login with no password.

| Role | Sees | Key actions |
|---|---|---|
| Patient | Hospitals with free beds by pincode and radius; own bookings; own medical history; who viewed it | Register or sign in, hold a bed for 60 minutes, release, read history |
| Hospital Admin | Bookings, admissions, ward capacity | Mark admitted, walk-in admission, assign doctor, view history of admitted patients, discharge, edit total beds |
| Doctor | Admitted patients assigned to them | Write prescriptions; each one joins the patient's medical history |
| App Admin | All hospitals | Rank 1 to 10, de-rank, import JSON feed, export JSON, reset |

## Business rules

- A booking holds one bed for 60 minutes. If the hospital does not admit the patient in that window, the bed is released automatically. Expiry is checked on load and every second while the app is open.
- A patient can hold one bed at a time.
- Search lists hospitals within the chosen radius of the pincode that have free beds in the chosen ward. Order: not de-ranked first, then rank high to low, then distance.
- A doctor sees only patients admitted to their hospital and assigned to them by the hospital admin.

## Medical history

- Each prescription is saved against an admission and appears in the patient's history, grouped by visit.
- The history is keyed to the patient's mobile number, so it carries over to later admissions at any hospital.
- The patient always sees their own history.
- A hospital and its doctors can open a patient's history only while that patient is currently admitted to that hospital. Each open is recorded, and the patient can see who viewed their history.
- Walk-in admissions without a mobile account have no linked history.

## Data

- `data/hospitals.json`: sample feed in the ingest format. Load it with App Admin > Data & import.
- `data/seed-data.js`: same content, loaded on start.
- Everything the user adds is stored in the browser's `localStorage` under key `continum.v1`.
- Use App Admin > Data & import > Export to back up. Use Reset to restore sample data.
- Hospital logos are in `assets/logos/<hospital id>.svg`.

### Ingest format

```json
{
  "schemaVersion": 1,
  "pincodes": [{ "pincode": "411018", "area": "Pimpri", "city": "Pune", "lat": 18.6279, "lng": 73.8007 }],
  "hospitals": [{
    "id": "HSP-001", "name": "...", "city": "...", "address": "...", "phone": "...", "pincode": "411018",
    "location": { "lat": 18.6298, "lng": 73.8000 },
    "wards": {
      "GENERAL":   { "total": 40, "available": 18 },
      "ICU":       { "total": 12, "available": 3 },
      "PRIVATE":   { "total": 15, "available": 6 },
      "EMERGENCY": { "total": 10, "available": 4 }
    },
    "doctors": [{ "id": "DOC-001", "name": "...", "specialty": "..." }]
  }]
}
```

Import upserts by `id`. Ranking and de-rank settings are kept for hospitals that already exist.

## Production path

- Replace `js/store.js` internals with REST calls to the Continum API. The UI reads and writes only through the `Store` API.
- Swap JSON ingest for the hospital API feed. Keep the same shape.
- Real auth (server-side password hashing, session management), audit logging, encryption at rest and PHI handling are required before any real patient data is used. This prototype has none of them.
- Cross-hospital history sharing needs a consent model in production (for example, patient consent per admission, and an emergency-access override with its own audit trail). The prototype uses the admitted-at-this-hospital rule only.
