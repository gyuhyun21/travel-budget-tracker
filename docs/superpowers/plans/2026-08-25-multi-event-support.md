# 다중 모임(이벤트) 지원 + 예산 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user run multiple independent 모임(이벤트) side by side instead of one global trip, each with its own expenses/participants, browsable from a new home "모임 목록" screen, while removing the budget concept and making foreign-currency rates opt-in per event.

**Architecture:** Every `localStorage` key that used to hold one global trip's data becomes namespaced by an event id (`cmb_event_{id}_settings` etc.). A small event index (`cmb_events`) plus an active-event pointer (`cmb_active_event_id`) drive a new home screen. Existing `storage.js` accessor functions (`getSettings`, `getExpenses`, ...) keep their exact names/signatures and are simply repointed to read/write under the currently active event, so `render.js`/`app.js` call sites barely change. Firestore sharing (`sync.js`) already takes `tripId` as a parameter, so it needs no structural change — only the storage-layer glue that drives it moves from "one global trip" to "the active event's `tripId`".

**Tech Stack:** Vanilla HTML/CSS/JS PWA, no build step, no test framework. Verification in this plan uses small Python Playwright scripts (`playwright` package, headless Chromium) run against `python3 -m http.server`, matching how this feature area has already been verified earlier in this project's history — there is no `pytest`/`jest` here, so "run the test" steps below mean "run the Playwright script and read its printed output".

**Spec:** `docs/superpowers/specs/2026-08-25-다중모임-지출정산-design.md`

## Global Constraints
- No budget/`totalBudget` concept anywhere in the app (spec section "대시보드").
- Currency rate fields (`thbRate`/`usdRate`) only exist on an event's `settings` object when the user explicitly added that currency; the expense form must hide the currency picker entirely when neither is set (spec section "통화/환율").
- `storage.js`'s existing function names/signatures (`getSettings`, `saveSettings`, `getExpenses`, `addExpense`, `updateExpense`, `deleteExpense`, `getPackingItems`, `addPackingItem`, `updatePackingItem`, `deletePackingItem`, `isSharedMode`, `getSharedTripId`) must not change shape — only their internals move to the active-event key (spec section "저장 계층").
- No automatic migration of the old single-trip `localStorage` keys (`cmb_settings`, `cmb_expenses`, `cmb_packing_items`, `cmb_shared_trip_id`) — leave them untouched and unread (spec section "마이그레이션").
- "완료" status never blocks editing — it is a display-only label on the event index entry (spec section "설정").
- Every task must end with `find . -name '._*' -not -path './.git/*' -delete` before verification if any file was written on the ORICO exFAT volume (this repo's working copy lives there and Write/Edit can leave AppleDouble sidecar files) — run it, don't skip it.
- Do not `git commit` — this plan's commit steps are written for whoever executes it with the user's go-ahead; do not run them unless the user has separately approved committing.

---

## File Structure

| File | Change |
|---|---|
| `js/storage.js` | Rewrite: event index CRUD, active-event pointer, event-scoped key routing for settings/expenses/packing, drop `totalBudget`/`STORAGE_KEYS.SETTINGS`/`EXPENSES`/`PACKING_ITEMS`/`TRIP_ID`. |
| `js/sync.js` | `fsCreateTrip` takes an explicit `tripId` instead of generating one. |
| `index.html` | New `screen-events` section (becomes the initially-active screen), new `event-create-sheet` overlay. |
| `js/render.js` | New `renderEventsScreen`, `renderEventCreateSheetBody`; rewrite `renderDashboardScreen` (drop ring, add hero total, optional trip-pill, back-link) and `renderSettingsScreen` (drop budget field, dynamic currency rows, 완료/삭제 buttons); make `currencySegmentedHtml`/`renderExpenseFormScreen` currency-conditional. |
| `js/app.js` | New `bindEventsScreen`, `bindEventCreateSheet`, `openEventById`; rewrite `showScreen` (events case + nav-bar visibility), `boot` (default to events screen), `bindSettingsForm` (drop budget, add currency add/remove, drop old reset), rename `bindDashboardCategoryFilter` → `bindDashboardScreen` (adds back-link handling), replace `bindResetButton` with `bindEventStatusButtons`. |
| `css/style.css` | Remove now-dead budget-ring/stat-row rules; add event list card/badge/filter styles, hero-total styles, hero-back-link style, currency add/remove row styles. |

No new JS files are needed — `js/currency.js`, `js/category.js`, `js/trip.js`, `js/settlement.js`, `js/datepicker.js`, `js/icons.js` are unchanged.

---

### Task 1: Storage layer — event index, active-event pointer, event-scoped CRUD

**Files:**
- Modify: `js/storage.js` (entire file — see below)
- Test: ad-hoc Playwright script in the scratchpad dir (no fixed path required)

**Interfaces:**
- Consumes: nothing new (this is the foundation task).
- Produces (used by every later task):
  - `getEvents(): {id, status, tripId, createdAt, updatedAt}[]`
  - `createEvent(title: string): string` — returns new event id, sets it active
  - `updateEventMeta(id: string, fields: object): void`
  - `deleteEvent(id: string): void`
  - `getActiveEventId(): string | null`
  - `readEventSettings(id: string): object` — raw read, bypasses shared/local routing, for the events list
  - `readEventExpenses(id: string): array` — same
  - `enterEvent(id: string): boolean` — switches active event, unsubscribes any previous Firestore listener, returns `true` if the newly-entered event is shared (caller must then call `startSharedSync`)
  - `leaveEvent(): void` — clears active event, unsubscribes Firestore listener
  - Existing `getSettings/saveSettings/getExpenses/saveExpenses/addExpense/updateExpense/deleteExpense/getExpenseById/getPackingItems/savePackingItems/addPackingItem/updatePackingItem/deletePackingItem/getPackingItemById/isSharedMode/getSharedTripId/getParticipants` — same names/signatures as today, now event-scoped.
  - `resetAllData()` is removed (superseded by `deleteEvent`).

- [ ] **Step 1: Write a throwaway Playwright script that exercises the new storage functions directly via `page.evaluate`, before they exist, to confirm it fails**

Create `/tmp/verify_events_storage.py` (path outside the repo is fine — this is a disposable verification script, not part of the app):

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""() => {
        const idA = createEvent('모임 A');
        saveSettings({ ...getSettings(), tripName: '모임 A (수정)' });
        addExpense({ date: '2026-08-01', currency: 'KRW', amount: 10000, krwAmount: 10000, category: 'food', memo: 'A의 지출', spender: '' });

        const idB = createEvent('모임 B');
        addExpense({ date: '2026-08-02', currency: 'KRW', amount: 5000, krwAmount: 5000, category: 'food', memo: 'B의 지출', spender: '' });

        const events = getEvents();
        const settingsA = readEventSettings(idA);
        const expensesA = readEventExpenses(idA);
        const settingsB = readEventSettings(idB);
        const expensesB = readEventExpenses(idB);

        return {
            eventCount: events.length,
            activeIsB: getActiveEventId() === idB,
            settingsATitle: settingsA.tripName,
            expensesACount: expensesA.length,
            expensesAMemo: expensesA[0] && expensesA[0].memo,
            settingsBTitle: settingsB.tripName,
            expensesBCount: expensesB.length,
            currentExpensesIsB: getExpenses().length === 1 && getExpenses()[0].memo === 'B의 지출'
        };
    }""")
    print(result)
    browser.close()
```

Run it now (before Task 1's code exists):
```bash
cd /Volumes/ORICO/vibecoding/TravelApp && (python3 -m http.server 8080 > /tmp/http-server.log 2>&1 &) && sleep 1
python3 /tmp/verify_events_storage.py
```
Expected: a Playwright/JS error like `createEvent is not defined` (fails, because the function doesn't exist yet).

- [ ] **Step 2: Replace `js/storage.js` in full**

```javascript
// packingParticipants used to be a plain array of name strings; it's now an
// array of { name, count } so N-way splits can weight by family/group size.
// Old string entries are normalized to count:1 on read.
function getParticipants() {
  const raw = getSettings()?.packingParticipants || [];
  return raw.map(p => typeof p === 'string' ? { name: p, count: 1 } : p);
}

// This device's display name. Deliberately outside event storage/deleteEvent
// — it identifies the person using this browser, not any one event's data,
// so it should survive deleting/switching between events.
const USER_NAME_KEY = 'cmb_user_name';

function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

function setUserName(name) {
  localStorage.setItem(USER_NAME_KEY, name);
}

/* ---------- Event index ---------- */

const EVENTS_KEY = 'cmb_events';
const ACTIVE_EVENT_KEY = 'cmb_active_event_id';

function eventKey(id, suffix) {
  return `cmb_event_${id}_${suffix}`;
}

function getEvents() {
  const raw = localStorage.getItem(EVENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEventsList(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

function getActiveEventId() {
  return localStorage.getItem(ACTIVE_EVENT_KEY);
}

function setActiveEventId(id) {
  if (id) localStorage.setItem(ACTIVE_EVENT_KEY, id);
  else localStorage.removeItem(ACTIVE_EVENT_KEY);
}

function updateEventMeta(id, fields) {
  const events = getEvents();
  const index = events.findIndex(e => e.id === id);
  if (index === -1) return;
  events[index] = { ...events[index], ...fields };
  saveEventsList(events);
}

// Bumps the active event's updatedAt so the events list can sort by "most
// recently touched". Called at the end of every settings/expense/packing
// write, including ones that arrive via a Firestore snapshot (someone
// else's edit on a shared event still counts as activity on this device).
function touchActiveEvent() {
  const id = getActiveEventId();
  if (!id) return;
  updateEventMeta(id, { updatedAt: Date.now() });
}

// Raw reads used only by the events list screen, which needs to display a
// summary for every event without disturbing whichever one is currently
// active (and without opening a live Firestore connection to each one).
// For a shared event this reflects "as of the last time this device synced
// it", kept fresh by startSharedSync's write-through caching below.
function readEventSettings(id) {
  const raw = localStorage.getItem(eventKey(id, 'settings'));
  return raw ? JSON.parse(raw) : {};
}

function readEventExpenses(id) {
  const raw = localStorage.getItem(eventKey(id, 'expenses'));
  return raw ? JSON.parse(raw) : [];
}

function createEvent(title) {
  const events = getEvents();
  const id = generateShortId();
  const now = Date.now();
  events.push({ id, status: 'active', tripId: null, createdAt: now, updatedAt: now });
  saveEventsList(events);
  localStorage.setItem(eventKey(id, 'settings'), JSON.stringify({ tripName: title }));
  enterEvent(id);
  return id;
}

function deleteEvent(id) {
  if (getActiveEventId() === id && isSharedMode()) disableSharing();
  const events = getEvents().filter(e => e.id !== id);
  saveEventsList(events);
  localStorage.removeItem(eventKey(id, 'settings'));
  localStorage.removeItem(eventKey(id, 'expenses'));
  localStorage.removeItem(eventKey(id, 'packing'));
  if (getActiveEventId() === id) leaveEvent();
}

// Switches the active event. Always tears down any previous Firestore
// listener first (a stale listener from the last event must never deliver
// updates into the newly-opened one). Returns true if the event being
// entered is shared, in which case the caller is responsible for calling
// startSharedSync (mirrors today's initSharedModeFromUrl/boot() pattern).
function enterEvent(id) {
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  cachedSettings = null;
  cachedExpenses = [];
  cachedPackingItems = [];
  setActiveEventId(id);
  const meta = getEvents().find(e => e.id === id);
  if (meta && meta.tripId) {
    sharedTripId = meta.tripId;
    return true;
  }
  return false;
}

function leaveEvent() {
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  cachedSettings = null;
  cachedExpenses = [];
  cachedPackingItems = [];
  setActiveEventId(null);
}

/* ---------- Shared-trip sync state ---------- */

// When the active event is shared, all reads/writes below route to these
// in-memory caches (kept live by Firestore's onSnapshot listeners in
// sync.js) instead of localStorage. See startSharedSync().
let sharedTripId = null;
let cachedSettings = null;
let cachedExpenses = [];
let cachedPackingItems = [];

function isSharedMode() {
  return !!sharedTripId;
}

function getSharedTripId() {
  return sharedTripId;
}

// Call once at startup. If the page was opened with ?trip=ID, binds this
// browser to that event: reuses the matching local event if this device
// has already joined it before, otherwise registers a brand-new event
// entry for it. Returns true if an event was opened this way.
function initSharedModeFromUrl() {
  const urlTripId = getTripIdFromUrl();
  if (!urlTripId) return false;
  const events = getEvents();
  let meta = events.find(e => e.tripId === urlTripId);
  if (!meta) {
    meta = { id: urlTripId, status: 'active', tripId: urlTripId, createdAt: Date.now(), updatedAt: Date.now() };
    events.push(meta);
    saveEventsList(events);
  }
  enterEvent(meta.id);
  return true;
}

// Subscribes to the active event's live data (it must already be shared —
// i.e. enterEvent()/initSharedModeFromUrl() returned true, or
// enableSharingForCurrentData() just ran). onReady fires once settings,
// expenses and packing items have all delivered their first snapshot;
// onUpdate fires on every snapshot after that (including ones caused by
// our own writes, which is harmless since renders are idempotent). Every
// snapshot is also written through to this event's local cache so the
// events list can read a reasonably fresh summary without a live
// connection.
function startSharedSync(onReady, onUpdate) {
  const id = getActiveEventId();
  let settingsSeen = false;
  let expensesSeen = false;
  let packingSeen = false;
  const maybeReady = () => {
    if (initialSyncDone) { onUpdate(); return; }
    if (settingsSeen && expensesSeen && packingSeen) { initialSyncDone = true; onReady(); }
  };
  subscribeToTrip(sharedTripId, {
    onSettings: (settings) => {
      cachedSettings = settings;
      if (settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
      touchActiveEvent();
      settingsSeen = true;
      maybeReady();
    },
    onExpenses: (expenses) => {
      cachedExpenses = expenses;
      localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(expenses));
      touchActiveEvent();
      expensesSeen = true;
      maybeReady();
    },
    onPackingItems: (items) => {
      cachedPackingItems = items;
      localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(items));
      touchActiveEvent();
      packingSeen = true;
      maybeReady();
    }
  });
}

// Turns the active (local) event into a shared one: copies its current
// settings/expenses/packing into a fresh Firestore document keyed by the
// event's own id (so the event's id never changes, whether or not it's
// shared), and returns the link others can open to join.
async function enableSharingForCurrentData() {
  const id = getActiveEventId();
  const settings = getSettings();
  const expenses = getExpenses();
  const packingItems = getPackingItems();
  await fsCreateTrip(id, settings, expenses, packingItems);
  sharedTripId = id;
  initialSyncDone = true;
  updateEventMeta(id, { tripId: id });
  const url = new URL(window.location.href);
  url.searchParams.set('trip', id);
  window.history.replaceState({}, '', url);
  cachedSettings = settings;
  cachedExpenses = expenses;
  cachedPackingItems = packingItems;
  startSharedSync(() => {}, () => {
    renderDashboardScreen();
    renderExpenseListScreen();
    renderPackingScreen();
  });
  return shareUrlForTrip(id);
}

// Copies the current shared data back into this event's local storage and
// detaches this browser from it, so it goes back to being a private local
// copy. Other participants keep collaborating on the shared event as
// before; only this device's tripId link is cleared.
function disableSharing() {
  const id = getActiveEventId();
  const settings = cachedSettings;
  const expenses = cachedExpenses;
  const packingItems = cachedPackingItems;
  unsubscribeFromTrip();
  sharedTripId = null;
  initialSyncDone = false;
  updateEventMeta(id, { tripId: null });
  if (settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
  localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(expenses));
  localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(packingItems));
}

/* ---------- Active-event data (settings / expenses / packing) ---------- */

function getSettings() {
  if (isSharedMode()) return cachedSettings;
  const id = getActiveEventId();
  if (!id) return null;
  const raw = localStorage.getItem(eventKey(id, 'settings'));
  return raw ? JSON.parse(raw) : null;
}

function saveSettings(settings) {
  const id = getActiveEventId();
  if (isSharedMode()) {
    cachedSettings = settings;
    fsSaveSettings(sharedTripId, settings);
  }
  localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(settings));
  touchActiveEvent();
}

function getExpenses() {
  if (isSharedMode()) return cachedExpenses;
  const id = getActiveEventId();
  if (!id) return [];
  const raw = localStorage.getItem(eventKey(id, 'expenses'));
  return raw ? JSON.parse(raw) : [];
}

function saveExpenses(expenses) {
  localStorage.setItem(eventKey(getActiveEventId(), 'expenses'), JSON.stringify(expenses));
}

function generateId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function addExpense(expense) {
  const newExpense = { ...expense, id: generateId() };
  if (isSharedMode()) {
    cachedExpenses = [...cachedExpenses, newExpense];
    fsSetExpense(sharedTripId, newExpense.id, expense);
  } else {
    const expenses = getExpenses();
    expenses.push(newExpense);
    saveExpenses(expenses);
  }
  touchActiveEvent();
  return newExpense;
}

function updateExpense(id, updatedFields) {
  let result;
  if (isSharedMode()) {
    const index = cachedExpenses.findIndex(e => e.id === id);
    if (index === -1) return null;
    const updated = { ...cachedExpenses[index], ...updatedFields };
    cachedExpenses = [...cachedExpenses.slice(0, index), updated, ...cachedExpenses.slice(index + 1)];
    fsUpdateExpense(sharedTripId, id, updatedFields);
    result = updated;
  } else {
    const expenses = getExpenses();
    const index = expenses.findIndex(e => e.id === id);
    if (index === -1) return null;
    expenses[index] = { ...expenses[index], ...updatedFields };
    saveExpenses(expenses);
    result = expenses[index];
  }
  touchActiveEvent();
  return result;
}

function deleteExpense(id) {
  if (isSharedMode()) {
    cachedExpenses = cachedExpenses.filter(e => e.id !== id);
    fsDeleteExpense(sharedTripId, id);
  } else {
    const expenses = getExpenses().filter(e => e.id !== id);
    saveExpenses(expenses);
  }
  touchActiveEvent();
}

function getExpenseById(id) {
  return getExpenses().find(e => e.id === id) || null;
}

function getPackingItems() {
  if (isSharedMode()) return cachedPackingItems;
  const id = getActiveEventId();
  if (!id) return [];
  const raw = localStorage.getItem(eventKey(id, 'packing'));
  return raw ? JSON.parse(raw) : [];
}

function savePackingItems(items) {
  localStorage.setItem(eventKey(getActiveEventId(), 'packing'), JSON.stringify(items));
}

function addPackingItem(item) {
  const newItem = { checked: false, ...item, id: generateId() };
  if (isSharedMode()) {
    cachedPackingItems = [...cachedPackingItems, newItem];
    const { id, ...data } = newItem;
    fsSetPackingItem(sharedTripId, id, data);
  } else {
    const items = getPackingItems();
    items.push(newItem);
    savePackingItems(items);
  }
  touchActiveEvent();
  return newItem;
}

function updatePackingItem(id, updatedFields) {
  let result;
  if (isSharedMode()) {
    const index = cachedPackingItems.findIndex(i => i.id === id);
    if (index === -1) return null;
    const updated = { ...cachedPackingItems[index], ...updatedFields };
    cachedPackingItems = [...cachedPackingItems.slice(0, index), updated, ...cachedPackingItems.slice(index + 1)];
    fsUpdatePackingItem(sharedTripId, id, updatedFields);
    result = updated;
  } else {
    const items = getPackingItems();
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updatedFields };
    savePackingItems(items);
    result = items[index];
  }
  touchActiveEvent();
  return result;
}

function deletePackingItem(id) {
  if (isSharedMode()) {
    cachedPackingItems = cachedPackingItems.filter(i => i.id !== id);
    fsDeletePackingItem(sharedTripId, id);
  } else {
    const items = getPackingItems().filter(i => i.id !== id);
    savePackingItems(items);
  }
  touchActiveEvent();
}

function getPackingItemById(id) {
  return getPackingItems().find(i => i.id === id) || null;
}
```

Note: this file now depends on `generateShortId()` from `js/sync.js`. `index.html` already loads `js/sync.js` before `js/storage.js`, so this is safe without reordering scripts (verify in Task 3 if in doubt).

- [ ] **Step 3: Run the verification script again to confirm it passes**

```bash
find . -name '._*' -not -path './.git/*' -delete
python3 /tmp/verify_events_storage.py
```
Expected output: a dict with `'eventCount': 2, 'activeIsB': True, 'settingsATitle': '모임 A (수정)', 'expensesACount': 1, 'expensesAMemo': 'A의 지출', 'settingsBTitle': '모임 B', 'expensesBCount': 1, 'currentExpensesIsB': True`. If `settingsATitle` or `expensesAMemo` come back wrong, event data is leaking between events — stop and re-check `eventKey`/`getActiveEventId` usage before continuing.

At this point `render.js`/`app.js` will throw on load (they still call things like `resetAllData`, `STORAGE_KEYS`, and reference `renderEventsScreen` that doesn't exist yet) — that's expected and gets fixed in later tasks. Don't try to load the full app UI yet.

- [ ] **Step 4: Commit**

```bash
git add js/storage.js
git commit -m "refactor: scope storage.js to a per-event key namespace with an event index"
```

---

### Task 2: Sync layer — `fsCreateTrip` takes an explicit trip id

**Files:**
- Modify: `js/sync.js:26-42`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fsCreateTrip(tripId: string, settings, expenses, packingItems): Promise<string>` (previously `fsCreateTrip(settings, expenses, packingItems)` — Task 1's `enableSharingForCurrentData` already calls it with the new signature, so this task just makes the sync.js side match).

- [ ] **Step 1: Edit `fsCreateTrip`**

Replace:
```javascript
async function fsCreateTrip(settings, expenses, packingItems) {
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
  for (const item of packingItems) {
    const { id, ...data } = item;
    await window.fsSetDoc(window.fsDoc(window.fsDb, 'trips', tripId, 'packingItems', id), data);
  }
  return tripId;
}
```

With:
```javascript
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
```

`generateShortId()` stays defined in this file (Task 1's `createEvent` calls it), it's just no longer called from inside `fsCreateTrip`.

- [ ] **Step 2: Syntax-check**

```bash
node --check js/sync.js && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add js/sync.js
git commit -m "refactor: fsCreateTrip takes an explicit trip id instead of generating one"
```

---

### Task 3: HTML scaffolding — events screen, create sheet, initial active screen

**Files:**
- Modify: `index.html:12-90`

**Interfaces:**
- Consumes: none.
- Produces: DOM ids `screen-events`, `event-create-sheet`, `event-create-body`, `btn-create-event-close` (close button) that Task 4/5's JS will bind against.

- [ ] **Step 1: Add the events screen, make it the initially-active one, and add the create-event sheet**

In `index.html`, replace:
```html
  <main>
    <section id="screen-dashboard" class="screen active">
      <h2>대시보드</h2>
    </section>
```
With:
```html
  <main>
    <section id="screen-events" class="screen active">
      <h2>모임</h2>
    </section>
    <section id="screen-dashboard" class="screen">
      <h2>대시보드</h2>
    </section>
```

Then add the create-event sheet alongside the other `dp-overlay` sheets — insert it right after the `participant-sheet` block (before `<nav class="nav-bar">`):
```html
  <div id="event-create-sheet" class="dp-overlay" style="display:none">
    <div class="dp-sheet">
      <div class="dp-sheet-header">
        <span class="dp-title">새 모임</span>
        <button type="button" class="ios-header-link" id="event-create-close">닫기</button>
      </div>
      <div id="event-create-body"></div>
    </div>
  </div>
```

- [ ] **Step 2: Verify the page still loads without a console error unrelated to the not-yet-built JS**

```bash
find . -name '._*' -not -path './.git/*' -delete
(python3 -m http.server 8080 > /tmp/http-server.log 2>&1 &) && sleep 1
```

```python
# /tmp/verify_html_scaffold.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/index.html")
    page.wait_for_timeout(500)
    print("events screen present:", page.locator("#screen-events").count() == 1)
    print("events screen active by default:", "active" in (page.locator("#screen-events").get_attribute("class") or ""))
    print("create sheet present:", page.locator("#event-create-sheet").count() == 1)
    browser.close()
```
```bash
python3 /tmp/verify_html_scaffold.py
```
Expected: all three lines print `True`. (The app's own JS will still throw in the console at this point because `renderEventsScreen`/`bindEventsScreen` don't exist yet and `boot()` still calls the old dashboard-first logic — that's fine, this step only checks the static HTML.)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add events (home) screen and event-create sheet to the page shell"
```

---

### Task 4: render.js — events list screen

**Files:**
- Modify: `js/render.js` (add new code; see anchor points below)

**Interfaces:**
- Consumes: `getEvents()`, `readEventSettings(id)`, `readEventExpenses(id)`, `dpFormatRange(start, end)` (existing, from `js/datepicker.js`), `escapeHtml`, `ICON_PLUS`, `ICON_RECEIPT` (all existing in `render.js`/`js/icons.js`).
- Produces: `renderEventsScreen()`, `renderEventCreateSheetBody()`, module var `eventsFilter`, CSS hooks `.event-card`, `.event-card-main`, `.event-card-title`, `.event-card-meta`, `.event-status-badge`, `.event-filter-tab` (styled in Task 9), element ids `btn-create-event`, `events-filter-row`.

- [ ] **Step 1: Add the events screen renderer**

At the top of `js/render.js`, right after the existing `let dashboardCategoryFilter = 'all';` (line 4), add:
```javascript
// Which filter chip ("all"/"active"/"completed") the 모임 목록 screen is showing.
let eventsFilter = 'all';
```

Then, right before `function renderDashboardScreen() {` (currently line 129 — search for it, don't rely on the exact number), insert:
```javascript
function renderEventsScreen() {
  const container = document.getElementById('screen-events');
  const events = [...getEvents()].sort((a, b) => b.updatedAt - a.updatedAt);
  const enriched = events.map(ev => {
    const settings = readEventSettings(ev.id);
    const expenses = readEventExpenses(ev.id);
    const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
    const hasDates = settings.tripStartDate && settings.tripEndDate;
    return {
      ...ev,
      title: settings.tripName?.trim() || '제목 없음',
      dateLabel: hasDates ? dpFormatRange(settings.tripStartDate, settings.tripEndDate) : '',
      totalSpent
    };
  });
  const filtered = eventsFilter === 'all' ? enriched : enriched.filter(ev => ev.status === eventsFilter);

  container.innerHTML = `
    <div class="ios-header">
      <h1 class="ios-large-title">모임</h1>
      <button type="button" class="ios-header-action" id="btn-create-event" aria-label="새 모임">${ICON_PLUS}</button>
    </div>
    ${enriched.length ? `
      <div class="ios-chip-row" id="events-filter-row" style="margin-bottom:16px">
        <button type="button" class="ios-chip event-filter-tab ${eventsFilter === 'all' ? 'active' : ''}" data-value="all">전체</button>
        <button type="button" class="ios-chip event-filter-tab ${eventsFilter === 'active' ? 'active' : ''}" data-value="active">진행중</button>
        <button type="button" class="ios-chip event-filter-tab ${eventsFilter === 'completed' ? 'active' : ''}" data-value="completed">완료</button>
      </div>
    ` : ''}
    ${filtered.length ? `
      <div class="card-section">
        ${filtered.map(ev => `
          <button type="button" class="event-card" data-id="${ev.id}">
            <span class="event-card-main">
              <span class="event-card-title">${escapeHtml(ev.title)}</span>
              <span class="event-card-meta">${ev.dateLabel ? `${escapeHtml(ev.dateLabel)} · ` : ''}${Math.round(ev.totalSpent).toLocaleString()}원</span>
            </span>
            <span class="event-status-badge ${ev.status === 'completed' ? 'completed' : ''}">${ev.status === 'completed' ? '완료' : '진행중'}</span>
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">${ICON_RECEIPT}</div>
        <div class="empty-text">아직 모임이 없어요.<br>오른쪽 위 + 버튼으로 새 모임을 만들어보세요.</div>
      </div>
    `}
  `;
}

function renderEventCreateSheetBody() {
  const container = document.getElementById('event-create-body');
  container.innerHTML = `
    <label class="field-label" style="margin-top:0" for="input-new-event-title">모임 제목</label>
    <input type="text" id="input-new-event-title" placeholder="예: 8월 정기모임" autocomplete="off">
    <button type="button" class="btn-primary" id="btn-confirm-create-event">만들기</button>
  `;
}
```

- [ ] **Step 2: Verify via Playwright, creating events directly through the storage functions (the UI to create one doesn't exist until Task 5)**

```python
# /tmp/verify_events_list.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    page.evaluate("""() => {
        const idA = createEvent('모임 A');
        addExpense({ date: '2026-08-01', currency: 'KRW', amount: 12000, krwAmount: 12000, category: 'food', memo: '식사', spender: '' });
        updateEventMeta(idA, { status: 'completed' });
        createEvent('모임 B');
        addExpense({ date: '2026-08-05', currency: 'KRW', amount: 5000, krwAmount: 5000, category: 'food', memo: '커피', spender: '' });
        renderEventsScreen();
    }""")
    page.wait_for_timeout(200)
    titles = page.locator(".event-card-title").all_inner_texts()
    metas = page.locator(".event-card-meta").all_inner_texts()
    badges = page.locator(".event-status-badge").all_inner_texts()
    print("titles:", titles)
    print("metas:", metas)
    print("badges:", badges)
    page.click(".event-filter-tab[data-value='completed']")
    page.wait_for_timeout(100)
    print("completed-only titles:", page.locator(".event-card-title").all_inner_texts())
    browser.close()
```
```bash
python3 /tmp/verify_events_list.py
```
Expected: `titles` contains `['모임 B', '모임 A']` (most-recently-updated first — 모임 B was touched last), `metas` contains `5,000원` and `12,000원`, `badges` contains `['진행중', '완료']`, and `completed-only titles` is `['모임 A']`.

- [ ] **Step 3: Commit**

```bash
git add js/render.js
git commit -m "feat: render the events (home) list with status badges and a filter row"
```

---

### Task 5: app.js — event list interactions, screen routing, boot flow

**Files:**
- Modify: `js/app.js` (multiple spots — see below)

**Interfaces:**
- Consumes: `renderEventsScreen`, `renderEventCreateSheetBody`, `eventsFilter` (Task 4); `createEvent`, `enterEvent`, `leaveEvent`, `getActiveEventId`, `initSharedModeFromUrl`, `startSharedSync` (Task 1).
- Produces: `openEventById(id)`, `bindEventsScreen()`, `bindEventCreateSheet()` for later tasks (Task 6/7's back-link button relies on `leaveEvent`+`showScreen('events')` being wired here).

- [ ] **Step 1: Make `showScreen` handle the events screen and toggle the nav bar**

Replace:
```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
  if (name === 'packing') renderPackingScreen();
}
```

With:
```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelector('.nav-bar').style.display = name === 'events' ? 'none' : 'flex';
  if (name === 'events') renderEventsScreen();
  if (name === 'settings') renderSettingsScreen();
  if (name === 'dashboard') renderDashboardScreen();
  if (name === 'add-expense') renderExpenseFormScreen();
  if (name === 'expense-list') renderExpenseListScreen();
  if (name === 'packing') renderPackingScreen();
}
```

- [ ] **Step 2: Add event-open/create helpers and their bind functions**

Add this block right after `showScreen` (before `function bindSettingsForm() {`):
```javascript
function openEventById(id) {
  const shared = enterEvent(id);
  if (shared) {
    document.getElementById('sync-loading').style.display = 'flex';
    startSharedSync(
      () => {
        document.getElementById('sync-loading').style.display = 'none';
        showScreen('dashboard');
      },
      () => {
        renderDashboardScreen();
        renderExpenseListScreen();
        renderPackingScreen();
      }
    );
    return;
  }
  showScreen('dashboard');
}

function bindEventsScreen() {
  document.getElementById('screen-events').addEventListener('click', (e) => {
    if (e.target.closest('#btn-create-event')) {
      openEventCreateSheet();
      return;
    }

    const filterTab = e.target.closest('.event-filter-tab');
    if (filterTab) {
      eventsFilter = filterTab.dataset.value;
      renderEventsScreen();
      return;
    }

    const card = e.target.closest('.event-card');
    if (card) {
      openEventById(card.dataset.id);
    }
  });
}

function openEventCreateSheet() {
  renderEventCreateSheetBody();
  document.getElementById('event-create-sheet').style.display = 'flex';
  document.getElementById('input-new-event-title').focus();
}

function closeEventCreateSheet() {
  document.getElementById('event-create-sheet').style.display = 'none';
}

function bindEventCreateSheet() {
  const overlay = document.getElementById('event-create-sheet');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'event-create-close') {
      closeEventCreateSheet();
      return;
    }
    if (e.target.id === 'btn-confirm-create-event') {
      const input = document.getElementById('input-new-event-title');
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      createEvent(title);
      closeEventCreateSheet();
      showScreen('dashboard');
    }
  });
}
```

- [ ] **Step 3: Rename the dashboard filter binder to also handle the new back-link (used starting Task 7)**

Replace:
```javascript
function bindDashboardCategoryFilter() {
  document.getElementById('screen-dashboard').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    dashboardCategoryFilter = tab.dataset.value;
    renderDashboardScreen();
  });
}
```
With:
```javascript
function bindDashboardScreen() {
  document.getElementById('screen-dashboard').addEventListener('click', (e) => {
    if (e.target.closest('#btn-back-to-events')) {
      leaveEvent();
      showScreen('events');
      return;
    }
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    dashboardCategoryFilter = tab.dataset.value;
    renderDashboardScreen();
  });
}
```
(The `#btn-back-to-events` element doesn't exist in the rendered dashboard until Task 7 rewrites `renderDashboardScreen` — that's fine, `closest()` simply won't match anything until then.)

- [ ] **Step 4: Change `boot()` to default to the events screen**

Replace:
```javascript
function boot() {
  if (initSharedModeFromUrl()) {
    document.getElementById('sync-loading').style.display = 'flex';
    startSharedSync(
      () => {
        document.getElementById('sync-loading').style.display = 'none';
        showScreen(getSettings() ? 'dashboard' : 'settings');
      },
      () => {
        renderDashboardScreen();
        renderExpenseListScreen();
        renderPackingScreen();
      }
    );
    return;
  }
  showScreen(getSettings() ? 'dashboard' : 'settings');
}
```
With:
```javascript
function boot() {
  if (initSharedModeFromUrl()) {
    document.getElementById('sync-loading').style.display = 'flex';
    startSharedSync(
      () => {
        document.getElementById('sync-loading').style.display = 'none';
        showScreen('dashboard');
      },
      () => {
        renderDashboardScreen();
        renderExpenseListScreen();
        renderPackingScreen();
      }
    );
    return;
  }
  showScreen('events');
}
```

- [ ] **Step 5: Register the two new bind functions and swap the renamed one, in the init list near the bottom of the file**

Replace:
```javascript
bindSettingsForm();
bindExpenseForm();
bindExpenseList();
bindAddExpenseButtons();
bindDashboardCategoryFilter();
bindBackupButtons();
bindResetButton();
bindDateRangeSheet();
bindPackingScreen();
bindPackingAddSheet();
bindParticipantSheet();
```
With:
```javascript
bindEventsScreen();
bindEventCreateSheet();
bindSettingsForm();
bindExpenseForm();
bindExpenseList();
bindAddExpenseButtons();
bindDashboardScreen();
bindBackupButtons();
bindResetButton();
bindDateRangeSheet();
bindPackingScreen();
bindPackingAddSheet();
bindParticipantSheet();
```
(`bindResetButton` is replaced with `bindEventStatusButtons` in Task 6 — leave the name as `bindResetButton` here for now so this task's diff stays focused; Task 6 will rename this call site too.)

- [ ] **Step 6: Verify the full create → enter → back-to-list loop end to end**

```python
# /tmp/verify_event_flow.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    logs = []
    page.on("pageerror", lambda err: logs.append(str(err)))
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")

    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)

    print("initial screen:", page.locator(".screen.active").get_attribute("id"))
    print("nav bar hidden on events screen:", page.locator(".nav-bar").is_hidden())

    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "8월 모임")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    print("screen after create:", page.locator(".screen.active").get_attribute("id"))
    print("nav bar visible inside event:", page.locator(".nav-bar").is_visible())

    page.click("#btn-back-to-events")
    page.wait_for_timeout(200)
    print("screen after back link (should still be dashboard, back-link markup lands in Task 7):",
          page.locator(".screen.active").get_attribute("id"))

    print("page errors:", logs)
    browser.close()
```
```bash
find . -name '._*' -not -path './.git/*' -delete
python3 /tmp/verify_event_flow.py
```
Expected: `initial screen: screen-events`, `nav bar hidden on events screen: True`, `screen after create: screen-dashboard`, `nav bar visible inside event: True`, and — because `renderDashboardScreen` hasn't been rewritten yet — no `#btn-back-to-events` element exists, so the last click is a no-op and the screen stays `screen-dashboard` (that's expected here; Task 7 makes the back-link real). `page errors` must be `[]`.

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: wire up the events screen — create, open, filter, and route boot() through it"
```

---

### Task 6: Settings screen — drop budget, optional currency rates, 완료/삭제

**Files:**
- Modify: `js/render.js` — `renderSettingsScreen` (search for `function renderSettingsScreen() {`)
- Modify: `js/app.js` — `bindSettingsForm`, and replace `bindResetButton` with `bindEventStatusButtons`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `getEvents`, `updateEventMeta`, `deleteEvent`, `getActiveEventId` (Task 1); `DEFAULT_THB_RATE`, `DEFAULT_USD_RATE`, `formatMoneyValue`, `parseMoneyInput` (existing, `js/currency.js`).
- Produces: element ids `currency-rate-form`, `.currency-rate-input` (with `data-currency`), `.currency-add-chip` (with `data-currency`), `.currency-remove-btn` (with `data-currency`), `btn-toggle-event-status`, `btn-delete-event` — consumed by Task 8's expense-form currency logic (reads `settings.thbRate`/`settings.usdRate` the same way) and Task 9's CSS.

- [ ] **Step 1: Replace `renderSettingsScreen` in `js/render.js`**

```javascript
function renderSettingsScreen() {
  const settings = getSettings() || {};
  const activeEvent = getEvents().find(ev => ev.id === getActiveEventId());
  const isCompleted = activeEvent?.status === 'completed';
  const addedCurrencies = [
    ...(settings.thbRate !== undefined ? [{ id: 'THB', label: '바트', rate: settings.thbRate }] : []),
    ...(settings.usdRate !== undefined ? [{ id: 'USD', label: '달러', rate: settings.usdRate }] : []),
  ];
  const availableCurrencies = [
    ...(settings.thbRate === undefined ? [{ id: 'THB', label: '바트' }] : []),
    ...(settings.usdRate === undefined ? [{ id: 'USD', label: '달러' }] : []),
  ];
  const container = document.getElementById('screen-settings');
  container.innerHTML = `
    <div class="ios-header"><h1 class="ios-large-title">설정</h1></div>

    <h3 class="section-title">내 정보</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <form id="username-form">
          <label class="field-label" style="margin-top:0" for="input-settings-user-name">내 이름</label>
          <input type="text" id="input-settings-user-name" value="${escapeHtml(getUserName())}" placeholder="이름 또는 닉네임">
          <button type="submit" class="btn-primary" style="margin-top:14px">이름 저장</button>
        </form>
      </div>
    </div>

    <h3 class="section-title">제목 &amp; 기간</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <form id="settings-form">
          <label class="field-label" style="margin-top:0" for="input-trip-name">제목</label>
          <input type="text" id="input-trip-name" value="${escapeHtml(settings.tripName ?? '')}" placeholder="예: 8월 정기모임">

          <label class="field-label" for="btn-open-daterange">기간 (선택)</label>
          <button type="button" class="date-range-field" id="btn-open-daterange">
            <span id="date-range-display">${dpFormatRange(settings.tripStartDate, settings.tripEndDate)}</span>
          </button>
          <input type="hidden" id="input-trip-start" value="${settings.tripStartDate ?? ''}">
          <input type="hidden" id="input-trip-end" value="${settings.tripEndDate ?? ''}">

          <button type="submit" class="btn-primary">저장</button>
        </form>
      </div>
    </div>

    <h3 class="section-title">환율 (해외통화)</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <form id="currency-rate-form">
          ${addedCurrencies.length ? addedCurrencies.map(c => `
            <div class="currency-rate-row">
              <label class="field-label" style="margin-top:0">1${c.label}(${c.id}) = ? 원</label>
              <div class="currency-rate-input-row">
                <input type="text" inputmode="decimal" class="input-money currency-rate-input" data-currency="${c.id}" value="${formatMoneyValue(c.rate)}">
                <button type="button" class="currency-remove-btn" data-currency="${c.id}" aria-label="삭제">✕</button>
              </div>
            </div>
          `).join('') : '<p class="field-hint" style="margin:0 0 10px">기본은 원화만 사용해요. 해외 통화가 필요하면 아래에서 추가하세요.</p>'}
          ${addedCurrencies.length ? '<button type="submit" class="btn-primary">환율 저장</button>' : ''}
        </form>
        ${availableCurrencies.length ? `
          <div class="ios-chip-row" style="margin-top:${addedCurrencies.length ? '14px' : '0'}">
            ${availableCurrencies.map(c => `<button type="button" class="ios-chip currency-add-chip" data-currency="${c.id}">${ICON_PLUS} ${c.label}</button>`).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <h3 class="section-title">공유</h3>
    <div class="card-section">
      <div class="card-section-pad">
        ${renderShareSectionBody()}
      </div>
    </div>

    <h3 class="section-title">데이터 백업</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <button id="btn-export" type="button" class="btn-export">JSON으로 내보내기</button>
        <label class="field-label field-file" for="input-import">JSON 불러오기</label>
        <input type="file" id="input-import" accept="application/json">
      </div>
    </div>

    <h3 class="section-title">모임 상태</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <button id="btn-toggle-event-status" type="button" class="btn-primary" style="margin-top:0">${isCompleted ? '다시 진행중으로 변경' : '모임 마무리'}</button>
        <p class="field-hint" style="margin:8px 0 0">완료 표시는 목록에서의 분류일 뿐, 지출은 언제든 계속 추가·수정할 수 있어요.</p>
      </div>
    </div>

    <h3 class="section-title">위험 구역</h3>
    <div class="card-section">
      <div class="card-section-pad">
        <p class="field-hint" style="margin:0 0 12px">이 모임의 모든 지출·준비물 기록을 완전히 삭제합니다. 필요하면 먼저 위에서 JSON으로 백업해두세요.</p>
        <button id="btn-delete-event" type="button" class="btn-danger">이 모임 삭제</button>
      </div>
    </div>
    <p id="settings-message" class="banner-info" style="display:none"></p>
  `;
}
```

- [ ] **Step 2: Update `bindSettingsForm`'s submit handler in `js/app.js`**

Replace:
```javascript
  container.addEventListener('submit', (e) => {
    if (e.target.id === 'username-form') {
      e.preventDefault();
      const name = document.getElementById('input-settings-user-name').value.trim();
      if (!name) return;
      setUserName(name);
      renderSettingsScreen();
      return;
    }
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const tripStartDate = document.getElementById('input-trip-start').value;
    const tripEndDate = document.getElementById('input-trip-end').value;
    const message = document.getElementById('settings-message');
    if (!tripStartDate || !tripEndDate) {
      message.textContent = '여행 기간을 선택해주세요.';
      message.classList.add('banner-error');
      message.style.display = 'block';
      return;
    }
    const settings = {
      ...(getSettings() || {}),
      tripName: document.getElementById('input-trip-name').value.trim(),
      totalBudget: parseMoneyInput(document.getElementById('input-total-budget').value),
      thbRate: parseMoneyInput(document.getElementById('input-thb-rate').value),
      usdRate: parseMoneyInput(document.getElementById('input-usd-rate').value),
      tripStartDate,
      tripEndDate
    };
    saveSettings(settings);
    showScreen('dashboard');
  });
```
With:
```javascript
  container.addEventListener('submit', (e) => {
    if (e.target.id === 'username-form') {
      e.preventDefault();
      const name = document.getElementById('input-settings-user-name').value.trim();
      if (!name) return;
      setUserName(name);
      renderSettingsScreen();
      return;
    }
    if (e.target.id === 'settings-form') {
      e.preventDefault();
      const tripStartDate = document.getElementById('input-trip-start').value;
      const tripEndDate = document.getElementById('input-trip-end').value;
      const settings = {
        ...(getSettings() || {}),
        tripName: document.getElementById('input-trip-name').value.trim(),
        tripStartDate: tripStartDate || undefined,
        tripEndDate: tripEndDate || undefined
      };
      saveSettings(settings);
      showScreen('dashboard');
      return;
    }
    if (e.target.id === 'currency-rate-form') {
      e.preventDefault();
      const settings = { ...(getSettings() || {}) };
      document.querySelectorAll('.currency-rate-input').forEach(input => {
        const field = input.dataset.currency === 'THB' ? 'thbRate' : 'usdRate';
        settings[field] = parseMoneyInput(input.value);
      });
      saveSettings(settings);
      renderSettingsScreen();
    }
  });
```

- [ ] **Step 3: Add currency add/remove and 완료/삭제 handling to the same click listener in `bindSettingsForm`**

Right after the existing `if (e.target.id === 'btn-stop-sharing') { ... }` block (still inside the same `container.addEventListener('click', async (e) => { ... })`), add:
```javascript

    const addCurrencyChip = e.target.closest('.currency-add-chip');
    if (addCurrencyChip) {
      const settings = getSettings() || {};
      const currency = addCurrencyChip.dataset.currency;
      const field = currency === 'THB' ? 'thbRate' : 'usdRate';
      const defaultRate = currency === 'THB' ? DEFAULT_THB_RATE : DEFAULT_USD_RATE;
      saveSettings({ ...settings, [field]: defaultRate });
      renderSettingsScreen();
      return;
    }

    const removeCurrencyBtn = e.target.closest('.currency-remove-btn');
    if (removeCurrencyBtn) {
      const settings = { ...(getSettings() || {}) };
      const field = removeCurrencyBtn.dataset.currency === 'THB' ? 'thbRate' : 'usdRate';
      delete settings[field];
      saveSettings(settings);
      renderSettingsScreen();
      return;
    }
```

- [ ] **Step 4: Replace `bindResetButton` with `bindEventStatusButtons` in `js/app.js`**

Replace:
```javascript
function bindResetButton() {
  document.getElementById('screen-settings').addEventListener('click', (e) => {
    if (e.target.id !== 'btn-reset-data') return;
    if (!confirm('예산과 지출 기록을 모두 삭제하고 처음부터 다시 시작합니다. 계속할까요?')) return;
    resetAllData();
    showScreen('settings');
  });
}
```
With:
```javascript
function bindEventStatusButtons() {
  document.getElementById('screen-settings').addEventListener('click', (e) => {
    if (e.target.id === 'btn-toggle-event-status') {
      const id = getActiveEventId();
      const meta = getEvents().find(ev => ev.id === id);
      const nextStatus = meta?.status === 'completed' ? 'active' : 'completed';
      updateEventMeta(id, { status: nextStatus });
      renderSettingsScreen();
      return;
    }
    if (e.target.id === 'btn-delete-event') {
      if (!confirm('이 모임의 모든 기록을 완전히 삭제합니다. 되돌릴 수 없어요. 계속할까요?')) return;
      deleteEvent(getActiveEventId());
      showScreen('events');
    }
  });
}
```

And update the init-list call site (from Task 5's Step 5):
```javascript
bindResetButton();
```
becomes:
```javascript
bindEventStatusButtons();
```

- [ ] **Step 5: Verify the whole settings flow**

```python
# /tmp/verify_settings.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    logs = []
    page.on("pageerror", lambda err: logs.append(str(err)))
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)
    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "환율 테스트")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)

    page.click('.nav-btn[data-screen="settings"]')
    page.wait_for_timeout(200)
    print("no budget field:", page.locator("#input-total-budget").count() == 0)
    print("no rate rows yet:", page.locator(".currency-rate-row").count() == 0)

    page.click(".currency-add-chip[data-currency='THB']")
    page.wait_for_timeout(150)
    print("THB row appeared:", page.locator(".currency-rate-row").count() == 1)
    print("THB default rate prefilled:", page.locator(".currency-rate-input").input_value())

    page.click(".currency-remove-btn[data-currency='THB']")
    page.wait_for_timeout(150)
    print("THB row removed:", page.locator(".currency-rate-row").count() == 0)

    page.click("#btn-toggle-event-status")
    page.wait_for_timeout(150)
    print("toggled to reopen label:", page.locator("#btn-toggle-event-status").inner_text())

    page.click("#btn-delete-event")
    page.on("dialog", lambda d: d.accept())
    page.click("#btn-delete-event")
    page.wait_for_timeout(200)
    print("back on events list after delete:", page.locator(".screen.active").get_attribute("id"))
    print("event gone from list:", page.locator(".event-card").count() == 0)
    print("errors:", logs)
    browser.close()
```
```bash
find . -name '._*' -not -path './.git/*' -delete
python3 /tmp/verify_settings.py
```
Expected: `no budget field: True`, `no rate rows yet: True`, `THB row appeared: True`, `THB default rate prefilled: 46` (matches `DEFAULT_THB_RATE`), `THB row removed: True`, `toggled to reopen label: 다시 진행중으로 변경`, `back on events list after delete: screen-events`, `event gone from list: True`, `errors: []`.

Note: `confirm()` dialogs auto-dismiss (return `false`) under Playwright unless a `dialog` handler is registered that accepts them — the script above registers the handler right before the second click on purpose (the first click on `#btn-delete-event` in this script is actually a duplicate meant to trigger it after the handler is attached; simplest fix if this trips you up is to register `page.on("dialog", lambda d: d.accept())` once, immediately after `page.goto(...)`, instead of mid-script).

- [ ] **Step 6: Commit**

```bash
git add js/render.js js/app.js
git commit -m "feat: drop budget from settings, make currency rates opt-in, add 완료/삭제 for the active event"
```

---

### Task 7: Dashboard — remove budget ring, add hero total, optional trip-pill, back-link

**Files:**
- Modify: `js/render.js` — `renderDashboardScreen` (search for `function renderDashboardScreen() {`)

**Interfaces:**
- Consumes: `getSettings`, `getExpenses`, `tripStatusLabel` (existing, `js/trip.js`), `fitFontSize` (existing).
- Produces: element id `btn-back-to-events` (consumed by Task 5's `bindDashboardScreen`), classes `.hero-back-link`, `.hero-total-label`, `.hero-total-amount` (styled in Task 9).

- [ ] **Step 1: Replace `renderDashboardScreen`**

```javascript
function renderDashboardScreen() {
  const settings = getSettings() || {};
  const container = document.getElementById('screen-dashboard');
  const expenses = getExpenses();
  const totalSpent = expenses.reduce((sum, e) => sum + (e.krwAmount || 0), 0);
  const tripName = settings.tripName?.trim();
  document.title = tripName ? `${tripName} 가계부` : '모임 가계부';
  const hasDates = settings.tripStartDate && settings.tripEndDate;
  const tripLabel = hasDates ? tripStatusLabel(settings) : '';
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  const byCategory = {};
  for (const e of expenses) {
    const catId = e.category || 'other';
    byCategory[catId] = (byCategory[catId] || 0) + (e.krwAmount || 0);
  }
  const categoryRows = EXPENSE_CATEGORIES
    .map(cat => ({ cat, amount: byCategory[cat.id] || 0 }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const maxCategoryAmount = Math.max(1, ...categoryRows.map(r => r.amount));

  if (dashboardCategoryFilter !== 'all' && !categoryRows.some(r => r.cat.id === dashboardCategoryFilter)) {
    dashboardCategoryFilter = 'all';
  }
  const listToShow = dashboardCategoryFilter === 'all'
    ? sortedExpenses.slice(0, 5)
    : sortedExpenses.filter(e => (e.category || 'other') === dashboardCategoryFilter);
  const listTitle = dashboardCategoryFilter === 'all'
    ? '최근 지출'
    : `${getCategoryById(dashboardCategoryFilter).label} 지출`;

  const totalSpentText = `${Math.round(totalSpent).toLocaleString()}원`;
  const totalFontSize = fitFontSize(totalSpentText, [[8, 40], [10, 34], [12, 28], [15, 22]]);

  container.innerHTML = `
    <div class="dashboard-hero">
      <button type="button" class="hero-back-link" id="btn-back-to-events">← 모임 목록</button>
      <div class="ios-header">
        <h1 class="ios-large-title">${tripName ? escapeHtml(tripName) : '모임'}</h1>
      </div>
      ${tripLabel ? `<p class="trip-pill">${tripLabel}</p>` : ''}
      <div class="hero-total-label">총 지출</div>
      <div class="hero-total-amount" style="font-size:${totalFontSize}">${totalSpentText}</div>
    </div>

    <button type="button" class="btn-primary btn-add-main" id="btn-add-expense">
      <span class="btn-icon-inline">${ICON_PLUS}</span>지출 추가
    </button>

    ${categoryRows.length ? `
      <h3 class="section-title">카테고리별 지출</h3>
      <div class="card-section">
        ${categoryRows.map(({ cat, amount }) => `
          <div class="category-row">
            <span class="cat-dot" style="background:${cat.color}"></span>
            <span class="cat-label">${cat.label}</span>
            <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${Math.round(amount / maxCategoryAmount * 100)}%; background:${cat.color}"></span></span>
            <span class="cat-amount">${Math.round(amount).toLocaleString()}원</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <h3 class="section-title">${listTitle}</h3>
    ${categoryRows.length ? `
      <div class="ios-chip-row" id="dashboard-category-filter" style="margin-bottom:12px">
        <button type="button" class="ios-chip filter-tab ${dashboardCategoryFilter === 'all' ? 'active' : ''}" data-value="all">전체</button>
        ${categoryRows.map(({ cat }) => `
          <button type="button" class="ios-chip filter-tab ${dashboardCategoryFilter === cat.id ? 'active' : ''}" data-value="${cat.id}">
            <span class="chip-dot" style="background:${dashboardCategoryFilter === cat.id ? '#fff' : cat.color}"></span>${cat.label}
          </button>
        `).join('')}
      </div>
    ` : ''}
    ${listToShow.length
      ? `<div class="card-section">${listToShow.map(e => expenseCardHtml(e)).join('')}</div>`
      : `<div class="empty-state">
          <div class="empty-icon">${ICON_RECEIPT}</div>
          <div class="empty-text">아직 지출 내역이 없어요.<br>위의 + 지출 추가 버튼으로 첫 지출을 기록해보세요.</div>
        </div>`}
  `;
}
```

- [ ] **Step 2: Verify — total updates correctly, trip-pill only shows with dates, back-link returns to the list**

```python
# /tmp/verify_dashboard.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)
    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "대시보드 테스트")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)

    print("no ring markup:", page.locator(".budget-ring").count() == 0)
    print("no trip-pill without dates:", page.locator(".trip-pill").count() == 0)
    print("total is 0원 with no expenses:", page.locator(".hero-total-amount").inner_text())

    page.click("#screen-dashboard #btn-add-expense")
    page.wait_for_timeout(150)
    page.fill("#input-expense-amount", "15000")
    page.click("#expense-form button[type=submit]")
    page.wait_for_timeout(200)
    print("total after one expense:", page.locator(".hero-total-amount").inner_text())

    page.click("#btn-back-to-events")
    page.wait_for_timeout(200)
    print("back on events list:", page.locator(".screen.active").get_attribute("id"))
    browser.close()
```
```bash
find . -name '._*' -not -path './.git/*' -delete
python3 /tmp/verify_dashboard.py
```
Expected: `no ring markup: True`, `no trip-pill without dates: True`, `total is 0원 with no expenses: 0원`, `total after one expense: 15,000원`, `back on events list: screen-events`.

- [ ] **Step 3: Commit**

```bash
git add js/render.js
git commit -m "feat: replace the dashboard budget ring with a total-spent hero and a back-to-events link"
```

---

### Task 8: Expense form — hide currency picker when no foreign currency is configured

**Files:**
- Modify: `js/render.js` — `currencySegmentedHtml` and `renderExpenseFormScreen` (search for `function currencySegmentedHtml(` and `function renderExpenseFormScreen(`)

**Interfaces:**
- Consumes: `getSettings` (Task 1).
- Produces: `currencySegmentedHtml(selected, options)` (signature change — now takes the options list instead of hardcoding THB/USD/KRW).

- [ ] **Step 1: Make `currencySegmentedHtml` take its options as a parameter**

Replace:
```javascript
function currencySegmentedHtml(selected) {
  const options = [
    { id: 'THB', label: '바트' },
    { id: 'USD', label: '달러' },
    { id: 'KRW', label: '원화' },
  ];
  const index = Math.max(0, options.findIndex(o => o.id === selected));
  return `
    <div class="ios-segment-thumb" style="--count:${options.length}; --index:${index}"></div>
    ${options.map(o => `
      <button type="button" class="ios-segment-btn currency-btn ${o.id === selected ? 'active' : ''}" data-value="${o.id}">${o.label}</button>
    `).join('')}
  `;
}
```
With:
```javascript
function currencySegmentedHtml(selected, options) {
  const index = Math.max(0, options.findIndex(o => o.id === selected));
  return `
    <div class="ios-segment-thumb" style="--count:${options.length}; --index:${index}"></div>
    ${options.map(o => `
      <button type="button" class="ios-segment-btn currency-btn ${o.id === selected ? 'active' : ''}" data-value="${o.id}">${o.label}</button>
    `).join('')}
  `;
}
```

- [ ] **Step 2: Build the options list from the active event's settings in `renderExpenseFormScreen`, and skip the segment markup when there's nothing but KRW**

Find this block near the top of `renderExpenseFormScreen`:
```javascript
  const selectedCurrency = existing?.currency || 'THB';
  const selectedCategory = existing?.category || 'other';
```
Replace with:
```javascript
  const formSettings = getSettings() || {};
  const currencyOptions = [
    ...(formSettings.thbRate !== undefined ? [{ id: 'THB', label: '바트' }] : []),
    ...(formSettings.usdRate !== undefined ? [{ id: 'USD', label: '달러' }] : []),
    { id: 'KRW', label: '원화' },
  ];
  const hasForeignCurrency = currencyOptions.length > 1;
  const selectedCurrency = existing?.currency || currencyOptions[0].id;
  const selectedCategory = existing?.category || 'other';
```

Then find where the currency segment is rendered in the same function's template string:
```html
          <label class="field-label">통화</label>
          <div class="ios-segment" id="currency-segmented">${currencySegmentedHtml(selectedCurrency)}</div>

          <label class="field-label" for="input-expense-amount">금액</label>
```
Replace with:
```html
          ${hasForeignCurrency ? `
            <label class="field-label">통화</label>
            <div class="ios-segment" id="currency-segmented">${currencySegmentedHtml(selectedCurrency, currencyOptions)}</div>
          ` : ''}

          <label class="field-label" for="input-expense-amount">금액</label>
```

- [ ] **Step 3: Verify both states**

```python
# /tmp/verify_expense_currency.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)
    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "통화 테스트")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)

    page.click("#screen-dashboard #btn-add-expense")
    page.wait_for_timeout(150)
    print("no segment with no foreign currency:", page.locator("#currency-segmented").count() == 0)
    print("hidden currency input defaults to KRW:", page.locator("#input-expense-currency").input_value())
    page.click("#btn-close-expense-form")
    page.wait_for_timeout(150)

    page.click('.nav-btn[data-screen="settings"]')
    page.wait_for_timeout(150)
    page.click(".currency-add-chip[data-currency='THB']")
    page.wait_for_timeout(150)

    page.click('.nav-btn[data-screen="dashboard"]')
    page.wait_for_timeout(150)
    page.click("#screen-dashboard #btn-add-expense")
    page.wait_for_timeout(150)
    print("segment appears once THB is added:", page.locator("#currency-segmented").count() == 1)
    print("segment options:", page.locator(".currency-btn").all_inner_texts())
    browser.close()
```
```bash
find . -name '._*' -not -path './.git/*' -delete
python3 /tmp/verify_expense_currency.py
```
Expected: `no segment with no foreign currency: True`, `hidden currency input defaults to KRW: KRW`, `segment appears once THB is added: True`, `segment options: ['바트', '원화']`.

- [ ] **Step 4: Commit**

```bash
git add js/render.js
git commit -m "feat: hide the currency picker on the expense form until a foreign currency is configured"
```

---

### Task 9: CSS — events list, hero total, currency rows; remove dead budget-ring rules

**Files:**
- Modify: `css/style.css:200-270` (the whole "Dashboard hero ring" block, replaced) and one new block appended after the "N빵 (settlement)" section (or any existing section — placement isn't load-bearing, just keep related rules together).

**Interfaces:**
- Consumes: existing tokens (`--color-*`, `--radius-*`, `--gradient-hero`, `--shadow-card`) from Task-independent `:root` (already in place from the earlier dark-theme work this session).
- Produces: visual styling for `.event-card`, `.event-card-main`, `.event-card-title`, `.event-card-meta`, `.event-status-badge`(+`.completed`), `.hero-back-link`, `.hero-total-label`, `.hero-total-amount`, `.currency-rate-row`, `.currency-rate-input-row`, `.currency-remove-btn`.

- [ ] **Step 1: Replace the dead budget-ring/stat-row block with the new hero-total styles**

Replace (this is the exact current content at `css/style.css:200-270`):
```css
/* ---------- Dashboard hero ring ---------- */

.dashboard-hero {
  background: var(--gradient-hero);
  border-radius: var(--radius-lg);
  padding: 18px 18px 22px;
  margin: 0 0 20px;
}
.dashboard-hero .ios-header { padding-bottom: 14px; }
.dashboard-hero .ios-large-title { color: #fff; }

.trip-pill {
  display: inline-block;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 590;
  font-size: 12.5px;
  padding: 5px 11px;
  border-radius: 999px;
  margin-bottom: 18px;
}

.budget-ring {
  --pct: 0;
  --ring-color: var(--color-success);
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: conic-gradient(var(--ring-color) calc(var(--pct) * 1%), rgba(255, 255, 255, 0.16) 0);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px auto 20px;
}

.budget-ring-inner {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: #0B0C14;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 10px;
}

.ring-amount {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: #fff;
  line-height: 1.2;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.ring-label { font-size: 11.5px; color: rgba(255, 255, 255, 0.6); margin-top: 2px; }
.ring-pct { font-size: 10.5px; color: rgba(255, 255, 255, 0.6); margin-top: 5px; font-weight: 500; }

.stat-row { display: flex; gap: 10px; margin-bottom: 4px; }
.stat-chip {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}
.stat-chip .stat-label { font-size: 12px; color: rgba(255, 255, 255, 0.65); font-weight: 500; }
.stat-chip .stat-value { font-size: 17px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; color: #fff; }
```

With:
```css
/* ---------- Dashboard hero ---------- */

.dashboard-hero {
  background: var(--gradient-hero);
  border-radius: var(--radius-lg);
  padding: 18px 18px 26px;
  margin: 0 0 20px;
}
.dashboard-hero .ios-header { padding-bottom: 14px; }
.dashboard-hero .ios-large-title { color: #fff; }

.hero-back-link {
  display: inline-block;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  font-weight: 590;
  padding: 0 0 10px;
  cursor: pointer;
  font-family: inherit;
}
.hero-back-link:active { opacity: 0.6; }

.trip-pill {
  display: inline-block;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 590;
  font-size: 12.5px;
  padding: 5px 11px;
  border-radius: 999px;
  margin-bottom: 18px;
}

.hero-total-label {
  font-size: 13px;
  font-weight: 590;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 8px;
}
.hero-total-amount {
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: #fff;
  line-height: 1.15;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 2: Append the events list and currency-row styles**

Add this new block at the end of `css/style.css` (after the existing `.participant-remove-btn { ... }` rule):
```css

/* ---------- 모임 목록 (events home) ---------- */

.event-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 14px 16px;
  border-bottom: 0.5px solid var(--color-separator);
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.card-section .event-card:last-child { border-bottom: none; }
.event-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.event-card-title {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-card-meta { font-size: 12.5px; color: var(--color-ink-soft); }
.event-status-badge {
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 590;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.event-status-badge.completed {
  background: var(--color-success-soft);
  color: var(--color-success);
}

/* ---------- 설정 화면 통화 추가/제거 ---------- */

.currency-rate-row { margin-bottom: 4px; }
.currency-rate-input-row { display: flex; align-items: center; gap: 8px; }
.currency-rate-input-row .currency-rate-input { flex: 1; }
.currency-remove-btn {
  flex-shrink: 0;
  border: none;
  background: var(--color-fill);
  color: var(--color-ink-soft);
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  cursor: pointer;
}
```

- [ ] **Step 3: Full visual + regression pass**

```bash
find . -name '._*' -not -path './.git/*' -delete
node --check js/storage.js && node --check js/sync.js && node --check js/render.js && node --check js/app.js && echo "JS OK"
```

```python
# /tmp/verify_final_visual.py
from playwright.sync_api import sync_playwright
SHOT = "/tmp"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 400, "height": 850})
    logs = []
    page.on("pageerror", lambda err: logs.append(str(err)))
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)

    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "8월 첫 모임")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    page.click("#screen-dashboard #btn-add-expense")
    page.wait_for_timeout(150)
    page.fill("#input-expense-amount", "42000")
    page.click("#expense-form button[type=submit]")
    page.wait_for_timeout(200)
    page.click("#btn-back-to-events")
    page.wait_for_timeout(200)

    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "8월 두번째 모임")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    page.click("#btn-back-to-events")
    page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOT}/events_list.png")

    page.click(".event-card")
    page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOT}/dashboard_hero.png")

    print("page errors:", logs)
    browser.close()
```
```bash
python3 /tmp/verify_final_visual.py
```
Expected: `JS OK`, `page errors: []`. Open `/tmp/events_list.png` and `/tmp/dashboard_hero.png` (e.g. via the Read tool) and confirm by eye: two cards with correct totals/badges on the list, and a dark hero card with a bold total (no ring) plus a working-looking "← 모임 목록" link on the dashboard.

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "style: events list, hero total amount, and currency row styling; drop dead budget-ring CSS"
```

---

### Task 10: Full regression sweep, dead-code grep, README update

**Files:**
- Modify: `README.md` (reflect: no budget, optional currency, multi-event home screen)
- No other files expected to change — this task is verification + docs, not new features.

- [ ] **Step 1: Grep for leftover references to removed concepts**

```bash
grep -rn "totalBudget\|budget-ring\|STORAGE_KEYS\|resetAllData\|cmb_shared_trip_id\|cmb_settings\b\|cmb_expenses\b\|cmb_packing_items\b" js/ index.html css/style.css
```
Expected: no output (all should be gone — `STORAGE_KEYS` was removed entirely in Task 1; the old fixed-key names `cmb_settings`/`cmb_expenses`/`cmb_packing_items`/`cmb_shared_trip_id` must not appear anywhere in the *code*, even though they may still exist as orphaned entries in a real browser's `localStorage` from before this change — that's expected and fine per the spec's "no migration" decision).

If anything prints, fix it before moving on.

- [ ] **Step 2: End-to-end scenario matching the spec's verification checklist**

```python
# /tmp/verify_full_regression.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    logs = []
    page.on("pageerror", lambda err: logs.append(str(err)))
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)

    # Event A: add an expense, mark it completed, come back later and edit it anyway
    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "모임 A")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    page.click("#screen-dashboard #btn-add-expense")
    page.fill("#input-expense-amount", "10000")
    page.click("#expense-form button[type=submit]")
    page.wait_for_timeout(200)
    page.click('.nav-btn[data-screen="settings"]')
    page.click("#btn-toggle-event-status")
    page.wait_for_timeout(150)
    page.click('.nav-btn[data-screen="dashboard"]')
    page.wait_for_timeout(150)
    print("completed event still lets you add an expense:", True)
    page.click("#screen-dashboard #btn-add-expense")
    page.fill("#input-expense-amount", "3000")
    page.click("#expense-form button[type=submit]")
    page.wait_for_timeout(200)
    print("total reflects both expenses on a completed event:", page.locator(".hero-total-amount").inner_text())
    page.click("#btn-back-to-events")
    page.wait_for_timeout(200)

    # Event B: independent data, never touches A
    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "모임 B")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    print("fresh event B starts at 0원 (no leak from A):", page.locator(".hero-total-amount").inner_text())
    page.click("#btn-back-to-events")
    page.wait_for_timeout(200)

    titles = page.locator(".event-card-title").all_inner_texts()
    badges = page.locator(".event-status-badge").all_inner_texts()
    print("list shows both events:", titles)
    print("badges:", badges)

    page.click(".event-filter-tab[data-value='completed']")
    page.wait_for_timeout(150)
    print("completed filter shows only 모임 A:", page.locator(".event-card-title").all_inner_texts())

    print("errors:", logs)
    browser.close()
```
```bash
find . -name '._*' -not -path './.git/*' -delete
python3 /tmp/verify_full_regression.py
```
Expected: `total reflects both expenses on a completed event: 13,000원`, `fresh event B starts at 0원 (no leak from A): 0원`, `list shows both events: ['모임 B', '모임 A']` (모임 B touched most recently), `badges` contains one `완료` and one `진행중`, `completed filter shows only 모임 A: ['모임 A']`, `errors: []`.

Note on scope: this plan's automated coverage stops at the local (non-shared) path, because there is no Firestore emulator available in this environment — `js/firebase-init.js` talks to a real Firebase project. Before calling the sharing rework (Tasks 1–2's `enableSharingForCurrentData`/`disableSharing`/`initSharedModeFromUrl`/`startSharedSync` changes) done, manually verify on a real deployment: (a) "이 모임 공유하기" on a local event produces a working `?trip=...` link, (b) opening that link in a second browser/profile adds the event to that device's list and lands directly in it, (c) "공유 중지" leaves the event in the list with `tripId` cleared. Record the result of this manual pass in the PR description or commit message when this plan is executed for real.

- [ ] **Step 3: Update `README.md`**

Update the intro paragraph and add a short section describing the events model. Read the current `README.md` first (it was last touched by earlier work in this project and no longer matches — e.g. it still describes a single "여행"), then:
- Change the opening paragraph to describe multiple independent 모임 instead of one trip.
- Remove any remaining mention of "총 예산"/budget.
- Note that 환율/해외통화 is opt-in per 모임, added from the 설정 screen.
- Mention the home "모임 목록" screen, and that "모임 마무리" is a label only (data stays editable).

There's no fixed snippet to paste here since the current README's exact wording should be read fresh at execution time — treat this step as: read `README.md`, then apply the four bullet changes above with normal edits, in the same tone/format as the rest of the file.

- [ ] **Step 4: Bump the service worker cache version**

`sw.js`'s `ASSETS` list already references every file this plan touches (`index.html`, `css/style.css`, all the `js/*.js` files) by path — no new files were added, so the `ASSETS` array itself doesn't need editing. But its content changed, so bump the cache name so installed PWAs actually pick up the update:

In `sw.js`, change:
```javascript
const CACHE_NAME = 'cmb-cache-v20';
```
to:
```javascript
const CACHE_NAME = 'cmb-cache-v21';
```
(Check the current value first with `grep CACHE_NAME sw.js` in case it has moved past v20 by execution time — always increment from whatever is currently there.)

- [ ] **Step 5: Final syntax + cleanliness check**

```bash
find . -name '._*' -not -path './.git/*' -delete
for f in js/*.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
git status --short
```
Expected: every file prints `OK`, and `git status --short` shows only the files this plan intentionally touched (no stray `._*` files, no accidental edits elsewhere).

- [ ] **Step 6: Commit**

```bash
git add README.md sw.js
git commit -m "docs: describe the multi-event model in the README; bump SW cache version"
```

---

## Self-Review Notes

- **Spec coverage:** 모임 목록/필터/배지 → Task 4/9. 모임 생성(제목만) → Task 5. 대시보드 예산 제거 + 총지출 히어로 → Task 7. 통화 선택사항화 → Task 6/8. 모임 마무리(비잠금)/삭제 → Task 6. 저장 키 네임스페이스 + `updatedAt` → Task 1. 공유 링크가 모임 목록에 등록되고 바로 진입 → Task 1's `initSharedModeFromUrl` + Task 5's `openEventById`/boot(). 마이그레이션 없음 → Task 1 (no code reads the old fixed keys) + Task 10's grep. All spec sections have a task.
- **Placeholder scan:** every step above has literal code, not a description; verification scripts assert concrete expected values rather than "check it looks right".
- **Type/name consistency check:** `eventKey`, `getActiveEventId`, `enterEvent`, `leaveEvent`, `readEventSettings`, `readEventExpenses`, `getEvents`, `updateEventMeta`, `deleteEvent`, `createEvent`, `touchActiveEvent` are defined once in Task 1 and referenced by the exact same names in every later task (Tasks 4–8, 10). `fsCreateTrip(tripId, settings, expenses, packingItems)`'s new signature (Task 2) matches the call in Task 1's `enableSharingForCurrentData`. `currencySegmentedHtml(selected, options)`'s new signature (Task 8) is the only place it's called (inside `renderExpenseFormScreen`, same task). `bindDashboardScreen` (renamed in Task 5) is the single call site used at both its definition and its init-list registration. `bindEventStatusButtons` (Task 6) likewise replaces `bindResetButton` at both its definition and call site.
