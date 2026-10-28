/* Sample hospital feed. Same content as hospitals.json, loaded as a classic script
 * so the app runs by double-clicking index.html (browsers block fetch() on file://). */
window.SEED_DATA = {
  "schemaVersion": 1,
  "generatedAt": "2026-10-26T00:00:00+05:30",
  "pincodes": [
    { "pincode": "411018", "area": "Pimpri", "city": "Pune", "lat": 18.6279, "lng": 73.8007 },
    { "pincode": "411057", "area": "Hinjewadi", "city": "Pune", "lat": 18.5912, "lng": 73.7389 },
    { "pincode": "411004", "area": "Deccan Gymkhana", "city": "Pune", "lat": 18.5167, "lng": 73.8413 },
    { "pincode": "411001", "area": "Camp", "city": "Pune", "lat": 18.5196, "lng": 73.8553 },
    { "pincode": "400050", "area": "Bandra West", "city": "Mumbai", "lat": 19.0596, "lng": 72.8295 },
    { "pincode": "400070", "area": "Kurla", "city": "Mumbai", "lat": 19.0728, "lng": 72.8826 },
    { "pincode": "400001", "area": "Fort", "city": "Mumbai", "lat": 18.9322, "lng": 72.8347 }
  ],
  "hospitals": [
    {
      "id": "HSP-001", "name": "Sunrise Multispeciality Hospital", "city": "Pune",
      "address": "Pimpri, Pune, Maharashtra", "phone": "+91-20-5550-0101", "pincode": "411018",
      "location": { "lat": 18.6298, "lng": 73.8000 }, "rank": 8, "deranked": false,
      "wards": {
        "GENERAL": { "total": 40, "available": 18 },
        "ICU": { "total": 12, "available": 3 },
        "PRIVATE": { "total": 15, "available": 6 },
        "EMERGENCY": { "total": 10, "available": 4 }
      },
      "doctors": [
        { "id": "DOC-001", "name": "Dr. Anjali Rao", "specialty": "General Medicine" },
        { "id": "DOC-002", "name": "Dr. Vikram Shah", "specialty": "Critical Care" }
      ]
    },
    {
      "id": "HSP-002", "name": "Lotus Care Hospital", "city": "Pune",
      "address": "Hinjewadi Phase 1, Pune, Maharashtra", "phone": "+91-20-5550-0102", "pincode": "411057",
      "location": { "lat": 18.5950, "lng": 73.7400 }, "rank": 6, "deranked": false,
      "wards": {
        "GENERAL": { "total": 30, "available": 12 },
        "ICU": { "total": 8, "available": 1 },
        "PRIVATE": { "total": 10, "available": 5 },
        "EMERGENCY": { "total": 8, "available": 3 }
      },
      "doctors": [
        { "id": "DOC-003", "name": "Dr. Neha Kulkarni", "specialty": "Internal Medicine" },
        { "id": "DOC-004", "name": "Dr. Rahul Joshi", "specialty": "Cardiology" }
      ]
    },
    {
      "id": "HSP-003", "name": "Metro Heart & Trauma Centre", "city": "Mumbai",
      "address": "Bandra West, Mumbai, Maharashtra", "phone": "+91-22-5550-0103", "pincode": "400050",
      "location": { "lat": 19.0550, "lng": 72.8300 }, "rank": 9, "deranked": false,
      "wards": {
        "GENERAL": { "total": 25, "available": 9 },
        "ICU": { "total": 15, "available": 2 },
        "PRIVATE": { "total": 12, "available": 4 },
        "EMERGENCY": { "total": 12, "available": 6 }
      },
      "doctors": [
        { "id": "DOC-005", "name": "Dr. Farah Siddiqui", "specialty": "Cardiology" },
        { "id": "DOC-006", "name": "Dr. Sameer Desai", "specialty": "Trauma Surgery" }
      ]
    },
    {
      "id": "HSP-004", "name": "City General Hospital", "city": "Mumbai",
      "address": "Kurla West, Mumbai, Maharashtra", "phone": "+91-22-5550-0104", "pincode": "400070",
      "location": { "lat": 19.0710, "lng": 72.8800 }, "rank": 5, "deranked": false,
      "wards": {
        "GENERAL": { "total": 50, "available": 22 },
        "ICU": { "total": 10, "available": 0 },
        "PRIVATE": { "total": 8, "available": 3 },
        "EMERGENCY": { "total": 14, "available": 5 }
      },
      "doctors": [
        { "id": "DOC-007", "name": "Dr. Priya Nair", "specialty": "General Medicine" },
        { "id": "DOC-008", "name": "Dr. Arjun Menon", "specialty": "Pulmonology" }
      ]
    },
    {
      "id": "HSP-005", "name": "Riverside Community Hospital", "city": "Pune",
      "address": "Deccan Gymkhana, Pune, Maharashtra", "phone": "+91-20-5550-0105", "pincode": "411004",
      "location": { "lat": 18.5180, "lng": 73.8430 }, "rank": 3, "deranked": true,
      "wards": {
        "GENERAL": { "total": 20, "available": 7 },
        "ICU": { "total": 4, "available": 1 },
        "PRIVATE": { "total": 6, "available": 2 },
        "EMERGENCY": { "total": 5, "available": 2 }
      },
      "doctors": [
        { "id": "DOC-009", "name": "Dr. Meera Patil", "specialty": "Family Medicine" },
        { "id": "DOC-010", "name": "Dr. Karan Gupta", "specialty": "Orthopaedics" }
      ]
    }
  ]
};
