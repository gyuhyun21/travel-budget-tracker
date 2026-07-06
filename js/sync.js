const TRIP_ID_PARAM = 'trip';

window.firebaseReady = new Promise((resolve) => {
  if (window.fsDb) { resolve(); return; }
  window.addEventListener('firebase-ready', () => resolve(), { once: true });
});

function getTripIdFromUrl() {
  return new URLSearchParams(window.location.search).get(TRIP_ID_PARAM);
}

function generateShortId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 14);
}

function shareUrlForTrip(tripId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(TRIP_ID_PARAM, tripId);
  return url.toString();
}

async function fsCreateTrip(settings, expenses) {
  await window.firebaseReady;
  const tripId = generateShortId();
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId), {
    ...settings,
    updatedAt: window.fsServerTimestamp()
  });
  for (const expense of expenses) {
    const { id, ...data } = expense;
    await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'expenses', id), data);
  }
  return tripId;
}

async function fsSaveSettings(tripId, settings) {
  await window.firebaseReady;
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId), {
    ...settings,
    updatedAt: window.fsServerTimestamp()
  });
}

async function fsSetExpense(tripId, id, data) {
  await window.firebaseReady;
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'expenses', id), data);
}

async function fsUpdateExpense(tripId, id, fields) {
  await window.firebaseReady;
  await window.fsUpdateDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'expenses', id), fields);
}

async function fsDeleteExpense(tripId, id) {
  await window.firebaseReady;
  await window.fsDeleteDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'expenses', id));
}

let unsubSettings = null;
let unsubExpenses = null;

function subscribeToTrip(tripId, { onSettings, onExpenses }) {
  window.firebaseReady.then(() => {
    unsubSettings = window.fsOnSnapshot(window.fsDoc(window.fsDb, 'trips', tripId), (snap) => {
      onSettings(snap.exists() ? snap.data() : null);
    });
    unsubExpenses = window.fsOnSnapshot(
      window.fsCollection(window.fsDb, 'trips', tripId, 'expenses'),
      (snap) => onExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  });
}

function unsubscribeFromTrip() {
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
}
