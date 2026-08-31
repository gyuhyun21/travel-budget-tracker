const LIST_ID_PARAM = 'list';

function getListIdFromUrl() {
  return new URLSearchParams(window.location.search).get(LIST_ID_PARAM);
}

function shareUrlForList(listId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(LIST_ID_PARAM, listId);
  return url.toString();
}

// Accepts either a pasted full share link or a bare list id (in case
// someone strips the link down themselves) and returns the id to join,
// or null for empty input. Used by the "다른 공유 링크로 참가하기" flow —
// a fallback for contexts where opening the link directly doesn't work
// (e.g. an iOS Home Screen install, which launches from its own fixed
// start_url and never sees the ?list= the user actually tapped).
function extractListId(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get(LIST_ID_PARAM);
    if (id) return id;
  } catch (err) {
    // not a full URL — fall through and treat the raw input as a bare id
  }
  return trimmed;
}

window.firebaseReady = new Promise((resolve) => {
  if (window.fsDb) { resolve(); return; }
  window.addEventListener('firebase-ready', () => resolve(), { once: true });
});

function generateShortId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 14);
}

async function fsCreateTrip(tripId, settings, expenses, packingItems) {
  await window.firebaseReady;
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId), {
    ...settings,
    updatedAt: window.fsServerTimestamp()
  });
  for (const expense of expenses) {
    const { id, ...data } = expense;
    await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'expenses', id), data);
  }
  for (const item of packingItems) {
    const { id, ...data } = item;
    await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'packingItems', id), data);
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

async function fsSetPackingItem(tripId, id, data) {
  await window.firebaseReady;
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'packingItems', id), data);
}

async function fsUpdatePackingItem(tripId, id, fields) {
  await window.firebaseReady;
  await window.fsUpdateDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'packingItems', id), fields);
}

async function fsDeletePackingItem(tripId, id) {
  await window.firebaseReady;
  await window.fsDeleteDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'packingItems', id));
}

async function fsCreateList(listId) {
  await window.firebaseReady;
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'lists', listId), {
    createdAt: window.fsServerTimestamp()
  });
}

async function fsAddListEvent(listId, eventId) {
  await window.firebaseReady;
  await window.fsSetDoc(window.fsDoc(window.fsDb, 'lists', listId, 'events', eventId), {
    addedAt: window.fsServerTimestamp()
  });
}

async function fsRemoveListEvent(listId, eventId) {
  await window.firebaseReady;
  await window.fsDeleteDoc(window.fsDoc(window.fsDb, 'lists', listId, 'events', eventId));
}

// One-time read of a trip's full data (settings + both subcollections),
// as opposed to subscribeToTrip's live listener. Used when a device needs
// to display or copy a trip's data without opening a standing live
// connection to it (e.g. showing a newly-joined shared event on the
// events list before the user has ever opened it).
async function fsFetchTripOnce(tripId) {
  await window.firebaseReady;
  const settingsSnap = await window.fsGetDoc(window.fsDoc(window.fsDb, 'trips', tripId));
  const expensesSnap = await window.fsGetDocs(window.fsCollection(window.fsDb, 'trips', tripId, 'expenses'));
  const packingSnap = await window.fsGetDocs(window.fsCollection(window.fsDb, 'trips', tripId, 'packingItems'));
  return {
    settings: settingsSnap.exists() ? settingsSnap.data() : null,
    expenses: expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    packingItems: packingSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}

let unsubSettings = null;
let unsubExpenses = null;
let unsubPackingItems = null;
// Bumped by unsubscribeFromTrip() so a subscribeToTrip() call still waiting
// on firebaseReady can tell it's been superseded and must not attach its
// listeners at all — otherwise they'd leak past the event switch that
// cancelled them.
let subscriptionGeneration = 0;

function subscribeToTrip(tripId, { onSettings, onExpenses, onPackingItems }) {
  const generation = ++subscriptionGeneration;
  window.firebaseReady.then(() => {
    if (generation !== subscriptionGeneration) return;
    unsubSettings = window.fsOnSnapshot(window.fsDoc(window.fsDb, 'trips', tripId), (snap) => {
      onSettings(snap.exists() ? snap.data() : null);
    });
    unsubExpenses = window.fsOnSnapshot(
      window.fsCollection(window.fsDb, 'trips', tripId, 'expenses'),
      (snap) => onExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    unsubPackingItems = window.fsOnSnapshot(
      window.fsCollection(window.fsDb, 'trips', tripId, 'packingItems'),
      (snap) => onPackingItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  });
}

function unsubscribeFromTrip() {
  subscriptionGeneration++;
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
  if (unsubPackingItems) { unsubPackingItems(); unsubPackingItems = null; }
}

// Separate subscription state from the trip-level one above — a device
// can be watching its shared list's membership AND have one event open at
// the same time, and the two must never interfere with each other's
// generation counters or unsub handles.
let unsubListEvents = null;
let listSubscriptionGeneration = 0;

function subscribeToList(listId, onEventIds) {
  const generation = ++listSubscriptionGeneration;
  window.firebaseReady.then(() => {
    if (generation !== listSubscriptionGeneration) return;
    unsubListEvents = window.fsOnSnapshot(
      window.fsCollection(window.fsDb, 'lists', listId, 'events'),
      (snap) => onEventIds(snap.docs.map(d => d.id), snap.metadata.fromCache)
    );
  });
}

function unsubscribeFromList() {
  listSubscriptionGeneration++;
  if (unsubListEvents) { unsubListEvents(); unsubListEvents = null; }
}
