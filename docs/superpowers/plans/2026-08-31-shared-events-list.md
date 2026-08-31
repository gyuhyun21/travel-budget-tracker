# 모임 목록 전체 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-event sharing with sharing the whole 모임 목록 as one live, collaborative unit — a link that gives access to every current and future 모임 in that list, not just one.

**Architecture:** A new thin Firestore collection (`lists/{listId}` + a `lists/{listId}/events/{eventId}` membership subcollection) tracks which 모임s belong to a shared list. Each 모임's actual data keeps using the existing `trips/{tripId}` structure and sync code untouched — "being in a shared list" just means a 모임's `tripId` is set and its id is registered in the list's membership subcollection. This lets the plan reuse 100% of the already-hardened per-event sync logic (listener generation counters, active-event guards) with zero changes to it.

**Tech Stack:** Vanilla HTML/CSS/JS PWA, no build step, no test framework. Verification uses small Python Playwright scripts (headless Chromium + `python3 -m http.server`), same as this project's established practice. There is no Firestore emulator in this environment — tasks that touch live Firestore behavior are verified for local-side mechanics only (correct local state, correct Firestore calls made), with real cross-device behavior flagged as a required manual check before this ships, exactly like the multi-event plan before it.

**Spec:** `docs/superpowers/specs/2026-08-31-모임목록-전체공유-design.md`

## Global Constraints
- Individual (per-event) sharing is removed entirely — there is exactly one sharing concept now: the whole 모임 목록.
- A 모임's Firestore `tripId` always equals its own local `id`, exactly as today — this plan does not change that rule.
- 목록 공유를 시작하면 그 시점의 모든 로컬 모임이 자동으로 업로드·등록된다; 공유 중에 새로 만드는 모임도 즉시 자동으로 등록된다.
- 공유 중지 시 이 기기가 가진 모든 모임의 `tripId`는 예외 없이 null로 지워져야 한다 (남겨두면 나중에 그 모임을 다시 열 때 `enterEvent()`가 오판해서 목록 밖에서 혼자 Firestore 구독을 재개하는 버그가 생긴다 — 스펙에서 명시적으로 경고한 사항).
- 개별 모임의 실시간 동기화 코드(`subscribeToTrip`, `startSharedSync`, `enterEvent`, `leaveEvent`, `resetSharedState`)는 이 계획에서 수정하지 않는다.
- 이 저장소는 exFAT 외장 볼륨에 있어 파일 쓰기 후 `._*` AppleDouble 사이드카 파일이 생길 수 있다. `git status`/`git add`/커밋 전에 항상 `find . -name '._*' -not -path './.git/*' -delete`를 실행한다.
- 커밋은 각 태스크가 끝날 때만 한다. 이 계획을 실행하는 사람이 아닌 한 `git push`/PR/배포는 하지 않는다.

---

## File Structure

| File | Change |
|---|---|
| `js/firebase-init.js` | `getDocs`를 import해서 `window.fsGetDocs`로 노출 (한 번만 읽는 컬렉션 조회에 필요). |
| `js/sync.js` | 목록 공유용 Firestore 헬퍼(`fsCreateList`, `fsAddListEvent`, `fsRemoveListEvent`, `subscribeToList`, `unsubscribeFromList`), 한 번만 읽는 `fsFetchTripOnce`, `LIST_ID_PARAM`/`getListIdFromUrl`/`shareUrlForList` 추가. 더 이상 아무도 안 쓰게 되는 `TRIP_ID_PARAM`/`getTripIdFromUrl`/`shareUrlForTrip`는 Task 2에서 함께 제거. |
| `js/storage.js` | `initSharedModeFromUrl()`/`enableSharingForCurrentData()` 제거. `getSharedListId`/`setSharedListId`/`readEventPackingItems`/`writeEventSnapshot`/`ensureEventIsShared`/`shareEventsList`/`stopSharingEventsList`/`startListSync`/`resumeOrJoinSharedList` 추가. `createEvent`(자동 공유 등록 후크는 app.js에서 처리, 여기선 변경 없음)/`deleteEvent`(목록 멤버십 정리) 갱신. |
| `index.html` | 새 `#list-share-sheet` 오버레이 추가. |
| `js/icons.js` | 새 `ICON_SHARE` 아이콘 상수 추가. |
| `js/render.js` | `renderListShareSheetBody()` 신규. `renderEventsScreen()` 헤더에 공유 버튼 추가. `renderShareSectionBody()`와 `renderSettingsScreen()`의 "공유" 섹션 제거. |
| `js/app.js` | `openListShareSheet`/`closeListShareSheet`/`bindListShareSheet` 신규. `bindEventsScreen`에 공유 버튼 처리 추가. `bindEventCreateSheet`의 확인 핸들러가 공유 중이면 새 모임을 즉시 목록에 등록하도록 갱신. `bindSettingsForm`에서 옛 공유 핸들러 제거. `boot()`을 `resumeOrJoinSharedList()` 기반으로 갱신. |
| `css/style.css` | 이벤트 화면 헤더의 버튼 2개를 감싸는 `.ios-header-actions` 추가. |
| `README.md` | "실시간 공유" 섹션을 목록 공유 기준으로 재작성, Firestore 규칙에 `lists` 컬렉션 추가. |
| `sw.js` | `CACHE_NAME` 버전 올림 (ASSETS 목록은 변경 없음 — 새 파일 없음). |

---

### Task 1: Firestore 목록-공유 프리미티브 (sync.js + firebase-init.js)

**Files:**
- Modify: `js/firebase-init.js`
- Modify: `js/sync.js` (추가만, 삭제는 Task 2에서)

**Interfaces:**
- Consumes: 없음 (기반 작업).
- Produces (Task 2가 그대로 호출):
  - `window.fsGetDocs` (Firestore `getDocs` 함수)
  - `LIST_ID_PARAM`, `getListIdFromUrl(): string|null`, `shareUrlForList(listId): string`
  - `fsCreateList(listId): Promise<void>`
  - `fsAddListEvent(listId, eventId): Promise<void>`
  - `fsRemoveListEvent(listId, eventId): Promise<void>`
  - `subscribeToList(listId, onEventIds: (ids: string[]) => void): void`
  - `unsubscribeFromList(): void`
  - `fsFetchTripOnce(tripId): Promise<{settings: object|null, expenses: array, packingItems: array}>`

- [ ] **Step 1: `js/firebase-init.js`에 `getDocs` 노출 추가**

Replace:
```javascript
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
```
With:
```javascript
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
```

Replace:
```javascript
window.fsDb = db;
window.fsDoc = doc;
window.fsGetDoc = getDoc;
window.fsSetDoc = setDoc;
```
With:
```javascript
window.fsDb = db;
window.fsDoc = doc;
window.fsGetDoc = getDoc;
window.fsGetDocs = getDocs;
window.fsSetDoc = setDoc;
```

- [ ] **Step 2: `node --check` 확인**

```bash
node --check js/firebase-init.js
```
Expected: no output (통과). `firebase-init.js`는 ES module(`import`/`export`) 문법을 쓰므로, `node --check`가 이 문법을 지원하지 않는다는 오류(`Cannot use import statement outside a module`)가 나면 정상이다 — 이 파일은 브라우저에서 `<script type="module">`로만 실행되며, 이 프로젝트의 다른 모든 `node --check` 대상 파일과 달리 원래도 Node에서 직접 문법 검사가 되지 않는다. 대신 Step 4의 브라우저 기반 확인으로 실제 동작을 검증한다.

- [ ] **Step 3: `js/sync.js`에 목록 공유 프리미티브 추가**

파일 맨 위, `const TRIP_ID_PARAM = 'trip';` 바로 다음 줄에 추가:
```javascript
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
```

`fsDeletePackingItem` 함수 바로 다음(즉 `let unsubSettings = null;` 줄 바로 앞)에 추가:
```javascript
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
```

`unsubscribeFromTrip` 함수(파일 마지막 함수) 바로 다음, 파일 끝에 추가:
```javascript

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
      (snap) => onEventIds(snap.docs.map(d => d.id))
    );
  });
}

function unsubscribeFromList() {
  listSubscriptionGeneration++;
  if (unsubListEvents) { unsubListEvents(); unsubListEvents = null; }
}
```

- [ ] **Step 4: 브라우저에서 새 함수들이 정의되고 호출 가능한지 확인**

```bash
find . -name '._*' -not -path './.git/*' -delete
python3 -m http.server 8080 &
sleep 1
```

```python
# /tmp/verify_sync_primitives.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    logs = []
    page.on("pageerror", lambda err: logs.append(str(err)))
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")
    result = page.evaluate("""() => ({
        hasGetDocs: typeof window.fsGetDocs === 'function',
        hasGetListIdFromUrl: typeof getListIdFromUrl === 'function',
        hasShareUrlForList: typeof shareUrlForList === 'function',
        hasFsCreateList: typeof fsCreateList === 'function',
        hasFsAddListEvent: typeof fsAddListEvent === 'function',
        hasFsRemoveListEvent: typeof fsRemoveListEvent === 'function',
        hasSubscribeToList: typeof subscribeToList === 'function',
        hasUnsubscribeFromList: typeof unsubscribeFromList === 'function',
        hasFsFetchTripOnce: typeof fsFetchTripOnce === 'function',
        listIdParam: LIST_ID_PARAM,
        shareUrl: shareUrlForList('abc123')
    })""")
    print(result)
    print("errors:", logs)
    browser.close()
```
```bash
python3 /tmp/verify_sync_primitives.py
```
Expected: every `has*` key is `True`, `listIdParam` is `list`, `shareUrl` ends with `?list=abc123`, `errors` is `[]`.

- [ ] **Step 5: Commit**

```bash
git add js/firebase-init.js js/sync.js
git commit -m "feat: add Firestore primitives for sharing a whole events list"
```

---

### Task 2: 목록 공유 핵심 로직 (storage.js) + sync.js의 옛 trip-링크 헬퍼 제거

**Files:**
- Modify: `js/storage.js`
- Modify: `js/sync.js` (옛 개별-공유 URL 헬퍼 제거)

**Interfaces:**
- Consumes: Task 1의 `fsCreateList`, `fsAddListEvent`, `fsRemoveListEvent`, `subscribeToList`, `unsubscribeFromList`, `fsFetchTripOnce`, `getListIdFromUrl`, `shareUrlForList`.
- Produces (Task 6이 그대로 호출):
  - `getSharedListId(): string|null`
  - `setSharedListId(id: string|null): void`
  - `readEventPackingItems(id): array`
  - `shareEventsList(): Promise<string>` — 공유 링크 반환
  - `stopSharingEventsList(): Promise<void>`
  - `resumeOrJoinSharedList(): boolean`
  - `ensureEventIsShared(id): Promise<void>` — Task 6이 새 모임을 공유 목록에 등록할 때 직접 호출
  - `promoteActiveEventToShared(id): void` — Task 6이 방금 만든 활성 이벤트를 공유 모드로 전환할 때 호출
  - (내부용, 다른 태스크가 직접 부르지 않음) `writeEventSnapshot`, `startListSync`

- [ ] **Step 1: `js/storage.js`에 목록 상태 + 보조 함수 추가**

`/* ---------- Event index ---------- */` 섹션 안, `function eventKey(id, suffix) { ... }` 바로 다음에 추가:
```javascript

const SHARED_LIST_KEY = 'cmb_shared_list_id';

function getSharedListId() {
  return localStorage.getItem(SHARED_LIST_KEY);
}

function setSharedListId(id) {
  if (id) localStorage.setItem(SHARED_LIST_KEY, id);
  else localStorage.removeItem(SHARED_LIST_KEY);
}
```

`function readEventExpenses(id) { ... }` 바로 다음에 추가:
```javascript

function readEventPackingItems(id) {
  const raw = localStorage.getItem(eventKey(id, 'packing'));
  return raw ? JSON.parse(raw) : [];
}

// Writes a one-time-fetched trip snapshot (from fsFetchTripOnce) into an
// event's local cache. `data.settings` can be null (trip doc didn't
// exist, e.g. a race with the trip being created) — in that case leave
// whatever settings are already cached rather than overwriting with
// nothing.
function writeEventSnapshot(id, data) {
  if (data.settings) localStorage.setItem(eventKey(id, 'settings'), JSON.stringify(data.settings));
  localStorage.setItem(eventKey(id, 'expenses'), JSON.stringify(data.expenses));
  localStorage.setItem(eventKey(id, 'packing'), JSON.stringify(data.packingItems));
}
```

- [ ] **Step 2: `initSharedModeFromUrl`을 목록 공유 로직으로 교체**

Replace:
```javascript
// Call once at startup. If the page was opened with ?trip=ID, binds this
// browser to that event: reuses the matching local event if this device
// has already joined it before, otherwise registers a brand-new event
// entry for it. Returns true if an event was opened this way.
function initSharedModeFromUrl() {
  const urlTripId = getTripIdFromUrl();
  if (!urlTripId) return false;
  const events = getEvents();
  let meta = events.find(e => e.tripId === urlTripId || e.id === urlTripId);
  if (!meta) {
    meta = { id: urlTripId, status: 'active', tripId: urlTripId, createdAt: nextEventTimestamp(), updatedAt: nextEventTimestamp() };
    events.push(meta);
    saveEventsList(events);
  }
  enterEvent(meta.id);
  return true;
}
```
With:
```javascript
// Fires whenever the shared list's membership changes (including the
// very first snapshot). Registers any event id this device doesn't
// already know about, fetching a one-time snapshot of its data so the
// events list can show a real title/total for it before the user ever
// opens it (opening it later starts the normal live subscription via
// enterEvent/startSharedSync, unrelated to this one-time fetch).
function startListSync() {
  const listId = getSharedListId();
  if (!listId) return;
  subscribeToList(listId, (eventIds) => {
    const events = getEvents();
    const knownIds = new Set(events.map(e => e.id));
    const newIds = eventIds.filter(eid => !knownIds.has(eid));
    if (newIds.length === 0) return;
    for (const eventId of newIds) {
      const now = nextEventTimestamp();
      events.push({ id: eventId, status: 'active', tripId: eventId, createdAt: now, updatedAt: now });
    }
    saveEventsList(events);
    const rerenderIfOnEventsScreen = () => {
      if (document.getElementById('screen-events')?.classList.contains('active')) renderEventsScreen();
    };
    for (const eventId of newIds) {
      fsFetchTripOnce(eventId)
        .then(data => writeEventSnapshot(eventId, data))
        .catch(() => {})
        .finally(rerenderIfOnEventsScreen);
    }
    rerenderIfOnEventsScreen();
  });
}

// Call once at startup. If the page was opened with ?list=ID, binds this
// device to that shared list (switching away from whatever list it was
// previously in, if different). Otherwise, if this device was already in
// a shared list from a previous session, resumes watching it. Returns
// true if this device ends up in shared-list mode either way.
function resumeOrJoinSharedList() {
  const urlListId = getListIdFromUrl();
  const storedListId = getSharedListId();
  const listId = urlListId || storedListId;
  if (!listId) return false;
  if (urlListId && urlListId !== storedListId) {
    setSharedListId(urlListId);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('list', listId);
  window.history.replaceState({}, '', url);
  startListSync();
  return true;
}
```

- [ ] **Step 3: `enableSharingForCurrentData`를 목록 전체 공유 로직으로 교체**

Replace:
```javascript
// Turns the current local trip into a shared one: copies today's settings
// and expenses into a fresh Firestore document keyed by the
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
```
With:
```javascript
// Uploads one event to Firestore if it isn't already shared, keyed by its
// own id (a shared event's tripId always equals its local id). Does not
// touch this device's active-event/shared-mode state — callers decide
// separately whether to also enter/watch it live.
async function ensureEventIsShared(id) {
  const meta = getEvents().find(e => e.id === id);
  if (meta && meta.tripId) return;
  const settings = readEventSettings(id);
  const expenses = readEventExpenses(id);
  const packingItems = readEventPackingItems(id);
  await fsCreateTrip(id, settings, expenses, packingItems);
  updateEventMeta(id, { tripId: id });
}

// Turns this device's whole local 모임 목록 into a shared, live-updating
// group: every event gets uploaded to Firestore (if not already shared)
// and registered in a brand-new list document, then this device starts
// watching that list for events anyone adds from now on. Returns the
// link others can open to join the whole list.
async function shareEventsList() {
  const listId = generateShortId();
  await fsCreateList(listId);
  for (const ev of getEvents()) {
    await ensureEventIsShared(ev.id);
    await fsAddListEvent(listId, ev.id);
  }
  setSharedListId(listId);
  const url = new URL(window.location.href);
  url.searchParams.set('list', listId);
  window.history.replaceState({}, '', url);
  startListSync();
  return shareUrlForList(listId);
}

// Promotes the currently-active event to shared mode right after
// ensureEventIsShared() has given it a tripId. Safe to call only when
// nothing has been written to this event since it was created in this
// same synchronous flow — this device already knows its exact current
// data (readEventSettings/readEventExpenses/readEventPackingItems), so
// enterEvent()'s cache reset can be filled back in immediately instead of
// waiting on a Firestore round-trip. Used when a brand-new event is
// created while this device is already sharing its whole list.
function promoteActiveEventToShared(id) {
  const settings = readEventSettings(id);
  const expenses = readEventExpenses(id);
  const packingItems = readEventPackingItems(id);
  enterEvent(id);
  cachedSettings = settings;
  cachedExpenses = expenses;
  cachedPackingItems = packingItems;
  startSharedSync(() => {}, () => {
    renderDashboardScreen();
    renderExpenseListScreen();
    renderPackingScreen();
  });
}
```

- [ ] **Step 4: `disableSharing`은 그대로 두고, `stopSharingEventsList`를 새로 추가**

`disableSharing` 함수(현재 활성 이벤트 하나를 로컬로 되돌리는 기존 함수)는 삭제하지 않는다 — 목록 공유 중지 시 "지금 열려 있는 이벤트"를 되돌리는 데 그대로 재사용한다. 그 함수 바로 다음에 추가:
```javascript

// Stops watching the shared list and converts every event this device
// currently holds into a fully local copy, clearing each one's tripId —
// see the design note on why this must happen unconditionally for every
// event, not just the ones "from" the list: a leftover tripId would make
// enterEvent() wrongly resume live sync the next time that event opens.
async function stopSharingEventsList() {
  unsubscribeFromList();
  setSharedListId(null);
  const url = new URL(window.location.href);
  url.searchParams.delete('list');
  window.history.replaceState({}, '', url);
  for (const ev of getEvents()) {
    if (!ev.tripId) continue;
    if (ev.id === getActiveEventId() && isSharedMode()) {
      disableSharing();
      continue;
    }
    try {
      const data = await fsFetchTripOnce(ev.tripId);
      writeEventSnapshot(ev.id, data);
    } catch (err) {
      // Firestore unreachable — keep whatever local snapshot already exists
    }
    updateEventMeta(ev.id, { tripId: null });
  }
}
```

- [ ] **Step 5: `deleteEvent`가 목록 멤버십도 함께 정리하도록 갱신**

Replace:
```javascript
function deleteEvent(id) {
  if (getActiveEventId() === id && isSharedMode()) disableSharing();
  const events = getEvents().filter(e => e.id !== id);
  saveEventsList(events);
  localStorage.removeItem(eventKey(id, 'settings'));
  localStorage.removeItem(eventKey(id, 'expenses'));
  localStorage.removeItem(eventKey(id, 'packing'));
  if (getActiveEventId() === id) leaveEvent();
}
```
With:
```javascript
function deleteEvent(id) {
  const meta = getEvents().find(e => e.id === id);
  if (getActiveEventId() === id && isSharedMode()) disableSharing();
  if (meta?.tripId && getSharedListId()) {
    fsRemoveListEvent(getSharedListId(), meta.tripId);
  }
  const events = getEvents().filter(e => e.id !== id);
  saveEventsList(events);
  localStorage.removeItem(eventKey(id, 'settings'));
  localStorage.removeItem(eventKey(id, 'expenses'));
  localStorage.removeItem(eventKey(id, 'packing'));
  if (getActiveEventId() === id) leaveEvent();
}
```

- [ ] **Step 6: `js/sync.js`에서 이제 쓸모없어진 개별-공유 URL 헬퍼 제거**

Replace:
```javascript
const TRIP_ID_PARAM = 'trip';

const LIST_ID_PARAM = 'list';
```
With:
```javascript
const LIST_ID_PARAM = 'list';
```

Replace:
```javascript
function getTripIdFromUrl() {
  return new URLSearchParams(window.location.search).get(TRIP_ID_PARAM);
}

function getListIdFromUrl() {
```
With:
```javascript
function getListIdFromUrl() {
```

Replace:
```javascript
function shareUrlForTrip(tripId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set(TRIP_ID_PARAM, tripId);
  return url.toString();
}

function shareUrlForList(listId) {
```
With:
```javascript
function shareUrlForList(listId) {
```

`generateShortId`/`fsCreateTrip`/`fsSaveSettings`/`fsSetExpense`/`subscribeToTrip`/`unsubscribeFromTrip` 등 나머지 sync.js 코드는 전혀 건드리지 않는다 — 이 파일에서 지우는 건 위 세 개(`TRIP_ID_PARAM`, `getTripIdFromUrl`, `shareUrlForTrip`)뿐이다.

- [ ] **Step 7: `node --check` + Playwright로 로컬 동작 확인**

```bash
find . -name '._*' -not -path './.git/*' -delete
for f in js/*.js; do node --check "$f" || echo "FAIL: $f"; done
```
Expected: `FAIL`이 하나도 안 뜬다 (모든 파일 통과).

```python
# /tmp/verify_list_sharing_local.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    logs = []
    page.on("pageerror", lambda err: logs.append(str(err)))
    page.goto("http://localhost:8080/index.html")
    page.wait_for_load_state("networkidle")

    result = page.evaluate("""() => {
        const idA = createEvent('모임 A');
        const idB = createEvent('모임 B');
        return {
            hasFunctions: typeof shareEventsList === 'function'
                && typeof stopSharingEventsList === 'function'
                && typeof resumeOrJoinSharedList === 'function',
            sharedListIdBefore: getSharedListId(),
            idA, idB
        };
    }""")
    print("before sharing:", result)
    print("errors so far:", logs)
    browser.close()
```
```bash
python3 /tmp/verify_list_sharing_local.py
```
Expected: `hasFunctions: True`, `sharedListIdBefore: None`, `idA`/`idB` are non-empty strings, `errors so far: []`.

이 태스크에서는 실제 Firestore 프로젝트가 필요한 `shareEventsList()`/`stopSharingEventsList()` 호출 자체는 검증하지 않는다 (다음 태스크들에서 UI를 통해 만들어지고, 최종 태스크에서 로컬 메커니즘 전체를 한 번 더 점검한다). 여기서는 함수들이 정의되어 있고 기존 이벤트 CRUD가 깨지지 않았는지만 확인한다.

- [ ] **Step 8: Commit**

```bash
git add js/storage.js js/sync.js
git commit -m "feat: replace per-event sharing with whole-list sharing in storage.js"
```

---

### Task 3: `#list-share-sheet` 오버레이 (index.html)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: 없음 (정적 마크업).
- Produces: DOM id `list-share-sheet`, `list-share-body`, `list-share-close` — Task 5/6이 사용.

- [ ] **Step 1: 새 시트 오버레이 추가**

Replace:
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

  <nav class="nav-bar">
```
With:
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

  <div id="list-share-sheet" class="dp-overlay" style="display:none">
    <div class="dp-sheet">
      <div class="dp-sheet-header">
        <span class="dp-title">모임 목록 공유</span>
        <button type="button" class="ios-header-link" id="list-share-close">닫기</button>
      </div>
      <div id="list-share-body"></div>
    </div>
  </div>

  <nav class="nav-bar">
```

- [ ] **Step 2: 정적 마크업 확인**

```bash
find . -name '._*' -not -path './.git/*' -delete
python3 -m http.server 8080 &
sleep 1
```
```python
# /tmp/verify_list_share_sheet_markup.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/index.html")
    page.wait_for_timeout(300)
    print("sheet present:", page.locator("#list-share-sheet").count() == 1)
    print("body present:", page.locator("#list-share-body").count() == 1)
    print("close link present:", page.locator("#list-share-close").count() == 1)
    browser.close()
```
```bash
python3 /tmp/verify_list_share_sheet_markup.py
```
Expected: 세 줄 모두 `True`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add the list-share sheet overlay to the page shell"
```

---

### Task 4: 공유 시트 렌더링 + 이벤트 화면 헤더 (render.js + icons.js)

**Files:**
- Modify: `js/icons.js`
- Modify: `js/render.js`
- Modify: `js/storage.js` (한 줄만 — `getSharedTripId()` 제거, 아래 Step 2 참고)

**Interfaces:**
- Consumes: `getSharedListId()`, `shareUrlForList()` (Task 1/2), `escapeHtml` (기존).
- Produces: `ICON_SHARE` (아이콘 문자열), `renderListShareSheetBody()` — Task 6이 호출.

- [ ] **Step 1: `js/icons.js`에 공유 아이콘 추가**

파일 끝에 추가:
```javascript

const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5"/></svg>';
```

- [ ] **Step 2: `renderShareSectionBody()`와 그 사용처를 제거, 이제 아무도 안 쓰는 `getSharedTripId()`도 함께 제거**

`js/storage.js`에서 (Task 2가 끝난 뒤 이 태스크를 진행하는 것이 순서이므로, 이 시점에는 `initSharedModeFromUrl`은 이미 `startListSync`/`resumeOrJoinSharedList`로 바뀌어 있다 — `getSharedTripId()` 자체는 Task 2가 건드리지 않았으므로 그대로 남아있다. 이 함수의 유일한 호출부였던 `renderShareSectionBody()`를 바로 아래에서 지우므로, 같은 커밋에서 이 함수도 함께 지워야 아무도 안 쓰는 코드가 남지 않는다):

Replace:
```javascript
function getSharedTripId() {
  return sharedTripId;
}
```
With: (통째로 삭제 — 대체할 코드 없음)

`js/render.js`에서:

Replace (전체 함수 삭제, 바로 다음 함수인 `renderSettingsScreen`의 시작 줄까지 포함):
```javascript
function renderShareSectionBody() {
  if (isSharedMode()) {
    const link = shareUrlForTrip(getSharedTripId());
    const tripName = getSettings()?.tripName?.trim();
    const shareTitle = tripName ? `${tripName} 가계부` : '여행 가계부';
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    return `
      <span class="share-badge"><span class="dot"></span>실시간 공유 중</span>
      <p class="field-hint" style="margin:0 0 10px">이 링크가 있는 사람은 누구나 같이 보고 편집할 수 있어요.</p>
      <div class="share-link-box">
        <span>${escapeHtml(link)}</span>
        <button type="button" id="btn-copy-share-link" data-link="${escapeHtml(link)}" data-title="${escapeHtml(shareTitle)}">${canNativeShare ? '공유' : '복사'}</button>
      </div>
      <button type="button" id="btn-stop-sharing" class="btn-danger">공유 중지 (이 기기만 로컬로 전환)</button>
    `;
  }
  return `
    <p class="field-hint" style="margin:0 0 12px">링크를 만들어서 같이 모임을 하는 사람과 지출을 실시간으로 같이 보고 편집할 수 있어요.</p>
    <button type="button" id="btn-start-sharing" class="btn-primary" style="margin-top:0">이 여행 공유하기</button>
  `;
}

function renderSettingsScreen() {
```
With:
```javascript
function renderSettingsScreen() {
```

- [ ] **Step 3: `renderSettingsScreen()`에서 "공유" 섹션 제거**

Replace:
```javascript
    <h3 class="section-title">공유</h3>
    <div class="card-section">
      <div class="card-section-pad">
        ${renderShareSectionBody()}
      </div>
    </div>

    <h3 class="section-title">데이터 백업</h3>
```
With:
```javascript
    <h3 class="section-title">데이터 백업</h3>
```

- [ ] **Step 4: `renderEventsScreen()` 헤더에 공유 버튼 추가**

Replace:
```javascript
    <div class="ios-header">
      <h1 class="ios-large-title">모임비용정리 1/n</h1>
      <button type="button" class="ios-header-action" id="btn-create-event" aria-label="새 모임">${ICON_PLUS}</button>
    </div>
```
With:
```javascript
    <div class="ios-header">
      <h1 class="ios-large-title">모임비용정리 1/n</h1>
      <div class="ios-header-actions">
        <button type="button" class="ios-header-action" id="btn-share-list" aria-label="목록 공유">${ICON_SHARE}</button>
        <button type="button" class="ios-header-action" id="btn-create-event" aria-label="새 모임">${ICON_PLUS}</button>
      </div>
    </div>
```

- [ ] **Step 5: `renderListShareSheetBody()` 추가**

`function renderEventCreateSheetBody() { ... }` 함수 바로 다음에 추가:
```javascript

function renderListShareSheetBody() {
  const container = document.getElementById('list-share-body');
  const listId = getSharedListId();
  if (listId) {
    const link = shareUrlForList(listId);
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    container.innerHTML = `
      <span class="share-badge"><span class="dot"></span>실시간 공유 중</span>
      <p class="field-hint" style="margin:0 0 10px">이 링크가 있는 사람은 누구나 전체 모임 목록을 보고, 모임을 추가하고, 지출을 기록할 수 있어요.</p>
      <div class="share-link-box">
        <span>${escapeHtml(link)}</span>
        <button type="button" id="btn-copy-share-link" data-link="${escapeHtml(link)}" data-title="모임비용정리 1/n">${canNativeShare ? '공유' : '복사'}</button>
      </div>
      <button type="button" id="btn-stop-list-sharing" class="btn-danger">공유 중지 (이 기기만 로컬로 전환)</button>
    `;
    return;
  }
  container.innerHTML = `
    <p class="field-hint" style="margin:0 0 12px">이 목록을 공유하면 링크를 가진 사람 누구나 모든 모임을 보고, 지출을 기록하고, 새 모임을 추가할 수 있어요.</p>
    <button type="button" id="btn-start-list-sharing" class="btn-primary" style="margin-top:0">목록 공유하기</button>
  `;
}
```

- [ ] **Step 6: 확인**

```bash
find . -name '._*' -not -path './.git/*' -delete
node --check js/icons.js && node --check js/render.js && echo "JS OK"
```

```python
# /tmp/verify_render_changes.py
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
    print("share header button present:", page.locator("#btn-share-list").count() == 1)
    print("create header button present:", page.locator("#btn-create-event").count() == 1)

    page.evaluate("() => { renderListShareSheetBody(); }")
    page.wait_for_timeout(100)
    print("not-shared body has start button:", page.locator("#btn-start-list-sharing").count() == 1)

    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "설정확인")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    page.fill("#input-new-participant", "규현")
    page.click("#btn-add-participant")
    page.wait_for_timeout(150)
    page.click("#participant-sheet-close")
    page.wait_for_timeout(150)
    page.click('.nav-btn[data-screen="settings"]')
    page.wait_for_timeout(150)
    print("no 공유 section on settings screen:", page.locator("#btn-start-sharing").count() == 0 and page.locator("#btn-stop-sharing").count() == 0)
    print("모임 상태 section still present:", page.locator("#btn-toggle-event-status").count() == 1)

    print("errors:", logs)
    browser.close()
```
```bash
python3 /tmp/verify_render_changes.py
```
Expected: 모든 `True`, `errors: []`.

- [ ] **Step 7: Commit**

```bash
git add js/icons.js js/render.js
git commit -m "feat: render the list-share sheet and drop the old per-event share section"
```

---

### Task 5: css/style.css — 이벤트 화면 헤더 버튼 두 개 배치

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 없음.
- Produces: `.ios-header-actions` 클래스 — Task 4의 마크업이 이미 사용 중.

- [ ] **Step 1: `.ios-header-action` 정의 바로 다음에 래퍼 스타일 추가**

`css/style.css`에서 `.ios-header-action svg { width: 17px; height: 17px; }` 줄을 찾아 바로 다음 줄에 추가:
```css
.ios-header-actions { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 2: 확인**

```bash
find . -name '._*' -not -path './.git/*' -delete
```
```python
# /tmp/verify_header_actions_css.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 400, "height": 300})
    page.goto("http://localhost:8080/index.html")
    page.wait_for_timeout(300)
    display = page.eval_on_selector(".ios-header-actions", "el => getComputedStyle(el).display") if page.locator(".ios-header-actions").count() else None
    print("wrapper display:", display)
    page.screenshot(path="/tmp/events_header.png")
    browser.close()
```
```bash
python3 /tmp/verify_header_actions_css.py
```
Expected: `wrapper display: flex`. `/tmp/events_header.png`를 열어 "+"와 공유 아이콘 버튼이 겹치지 않고 나란히 보이는지 눈으로 확인한다.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: lay out the two events-screen header action buttons side by side"
```

---

### Task 6: app.js — 공유 시트 바인딩, 모임 생성 시 자동 등록, boot() 갱신

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: Task 1/2의 `shareEventsList`, `stopSharingEventsList`, `resumeOrJoinSharedList`, `getSharedListId`, `ensureEventIsShared`, `promoteActiveEventToShared`, `fsAddListEvent`; Task 4의 `renderListShareSheetBody`.
- Produces: `openListShareSheet()`, `closeListShareSheet()`, `bindListShareSheet()` — 이 태스크 안에서만 쓰이지만, 다음 태스크의 회귀 테스트가 존재를 확인한다.

- [ ] **Step 1: 공유 시트 열기/닫기/바인딩 함수 추가**

`function closeEventCreateSheet() { ... }` 함수 바로 다음에 추가:
```javascript

function openListShareSheet() {
  renderListShareSheetBody();
  document.getElementById('list-share-sheet').style.display = 'flex';
}

function closeListShareSheet() {
  document.getElementById('list-share-sheet').style.display = 'none';
}

function bindListShareSheet() {
  const overlay = document.getElementById('list-share-sheet');
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.id === 'list-share-close') {
      closeListShareSheet();
      return;
    }

    if (e.target.id === 'btn-start-list-sharing') {
      e.target.disabled = true;
      e.target.textContent = '공유 링크 만드는 중...';
      try {
        await shareEventsList();
        openListShareSheet();
        renderEventsScreen();
      } catch (err) {
        alert('공유 링크를 만들지 못했습니다. 네트워크 연결을 확인해주세요.');
        e.target.disabled = false;
        e.target.textContent = '목록 공유하기';
      }
      return;
    }

    if (e.target.id === 'btn-copy-share-link') {
      const link = e.target.dataset.link;
      const title = e.target.dataset.title;
      if (navigator.share) {
        try {
          await navigator.share({ title, text: `${title} 같이 보기`, url: link });
        } catch (err) {
          // user closed the share sheet without picking anything — not an error
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        const original = e.target.textContent;
        e.target.textContent = '복사됨!';
        setTimeout(() => { e.target.textContent = original; }, 1500);
      } catch (err) {
        prompt('아래 링크를 복사하세요:', link);
      }
      return;
    }

    if (e.target.id === 'btn-stop-list-sharing') {
      if (!confirm('공유를 중지하고 이 기기에만 로컬로 저장할까요? 다른 사람과의 실시간 공유가 끊어집니다.')) return;
      e.target.disabled = true;
      await stopSharingEventsList();
      closeListShareSheet();
      renderEventsScreen();
    }
  });
}
```

- [ ] **Step 2: `bindEventsScreen()`에 공유 버튼 클릭 처리 추가**

Replace:
```javascript
function bindEventsScreen() {
  document.getElementById('screen-events').addEventListener('click', (e) => {
    if (e.target.closest('#btn-create-event')) {
      openEventCreateSheet();
      return;
    }
```
With:
```javascript
function bindEventsScreen() {
  document.getElementById('screen-events').addEventListener('click', (e) => {
    if (e.target.closest('#btn-share-list')) {
      openListShareSheet();
      return;
    }

    if (e.target.closest('#btn-create-event')) {
      openEventCreateSheet();
      return;
    }
```

- [ ] **Step 3: `bindEventCreateSheet()`의 확인 핸들러가 공유 중일 때 새 모임을 즉시 등록하도록 갱신**

Replace:
```javascript
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
      // New event, nobody added yet — walk straight into participant entry
      // before landing on the dashboard, so N빵 has someone to split with.
      openParticipantSheet('create');
    }
  });
}
```
With:
```javascript
function bindEventCreateSheet() {
  const overlay = document.getElementById('event-create-sheet');
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.id === 'event-create-close') {
      closeEventCreateSheet();
      return;
    }
    if (e.target.id === 'btn-confirm-create-event') {
      const input = document.getElementById('input-new-event-title');
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      const listId = getSharedListId();
      if (listId) {
        e.target.disabled = true;
        e.target.textContent = '만드는 중...';
        const id = createEvent(title);
        try {
          await ensureEventIsShared(id);
          await fsAddListEvent(listId, id);
          // Nothing was written to this event in the gap above (the sheet
          // stayed open and blocked input the whole time), so promoting it
          // now safely picks up the tripId that ensureEventIsShared just
          // set and starts live sync for it — no data to lose.
          promoteActiveEventToShared(id);
        } catch (err) {
          alert('모임을 만들었지만 공유 목록에 등록하지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.');
        }
      } else {
        createEvent(title);
      }
      closeEventCreateSheet();
      // New event, nobody added yet — walk straight into participant entry
      // before landing on the dashboard, so N빵 has someone to split with.
      openParticipantSheet('create');
    }
  });
}
```

- [ ] **Step 4: `bindSettingsForm()`에서 옛 개별-공유 클릭 핸들러 3개 제거**

Replace:
```javascript
    if (e.target.id === 'btn-start-sharing') {
      e.target.disabled = true;
      e.target.textContent = '공유 링크 만드는 중...';
      try {
        await enableSharingForCurrentData();
        renderSettingsScreen();
      } catch (err) {
        alert('공유 링크를 만들지 못했습니다. 네트워크 연결을 확인해주세요.');
        e.target.disabled = false;
        e.target.textContent = '이 여행 공유하기';
      }
      return;
    }

    if (e.target.id === 'btn-copy-share-link') {
      const link = e.target.dataset.link;
      const title = e.target.dataset.title;
      if (navigator.share) {
        try {
          await navigator.share({ title, text: `${title} 같이 보기`, url: link });
        } catch (err) {
          // user closed the share sheet without picking anything — not an error
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        const original = e.target.textContent;
        e.target.textContent = '복사됨!';
        setTimeout(() => { e.target.textContent = original; }, 1500);
      } catch (err) {
        prompt('아래 링크를 복사하세요:', link);
      }
      return;
    }

    if (e.target.id === 'btn-stop-sharing') {
      if (!confirm('공유를 중지하고 이 기기에만 로컬로 저장할까요? 다른 사람과의 실시간 공유가 끊어집니다.')) return;
      disableSharing();
      renderSettingsScreen();
    }

    const addCurrencyChip = e.target.closest('.currency-add-chip');
```
With:
```javascript
    const addCurrencyChip = e.target.closest('.currency-add-chip');
```

(주의: `btn-copy-share-link` 핸들러는 여기서 완전히 사라지고 Task 6 Step 1에서 만든 `bindListShareSheet()` 안에 동일한 로직으로 다시 생겼다 — 삭제되는 게 아니라 옮겨진 것이다.)

- [ ] **Step 5: `boot()`을 목록 공유 기준으로 교체**

Replace:
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
With:
```javascript
function boot() {
  resumeOrJoinSharedList();
  showScreen('events');
}
```

- [ ] **Step 6: 초기화 목록에 `bindListShareSheet()` 등록**

Replace:
```javascript
bindEventsScreen();
bindEventCreateSheet();
bindSyncLoadingCancel();
```
With:
```javascript
bindEventsScreen();
bindEventCreateSheet();
bindListShareSheet();
bindSyncLoadingCancel();
```

- [ ] **Step 7: 전체 로컬 플로우 확인 (링크 생성 → 새 모임 자동 등록 → 공유 중지)**

```bash
find . -name '._*' -not -path './.git/*' -delete
for f in js/*.js; do node --check "$f" || echo "FAIL: $f"; done
```

이 단계는 실제 Firestore 프로젝트에 쓰기 요청을 보낸다 (에뮬레이터 없음). 로컬 개발 환경의 `js/firebase-init.js`가 가리키는 프로젝트에 네트워크로 실제 문서가 생성되므로, 검증 후 Firestore 콘솔에서 `lists` 컬렉션에 테스트 데이터가 남았다면 정리해도 무방하다(실제 사용자 데이터가 아님).

```python
# /tmp/verify_list_sharing_e2e.py
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

    def create_event(title):
        page.click("#btn-create-event")
        page.fill("#input-new-event-title", title)
        page.click("#btn-confirm-create-event")
        page.wait_for_timeout(300)
        page.click("#participant-sheet-close")
        page.wait_for_timeout(150)

    create_event("공유전 모임")
    page.click("#btn-back-to-events")
    page.wait_for_timeout(150)

    page.click("#btn-share-list")
    page.wait_for_timeout(200)
    page.click("#btn-start-list-sharing")
    page.wait_for_timeout(3000)  # real Firestore round-trip
    link = page.locator("#btn-copy-share-link").get_attribute("data-link")
    print("share link contains ?list=:", "?list=" in (link or ""))
    print("url now has ?list=:", "?list=" in page.url)

    events_before = page.evaluate("() => getEvents().map(e => ({id: e.id, tripId: e.tripId}))")
    print("event has tripId after sharing:", all(e["tripId"] for e in events_before))

    page.click("#list-share-close")
    page.wait_for_timeout(150)

    create_event("공유중 새모임")
    page.wait_for_timeout(1000)
    events_after = page.evaluate("() => getEvents().map(e => ({id: e.id, tripId: e.tripId}))")
    print("new event also got a tripId:", all(e["tripId"] for e in events_after))
    print("total events now:", len(events_after))
    # Regression check for the cache-population bug caught during plan
    # self-review: after promoteActiveEventToShared() runs, reading this
    # device's own just-created event must NOT come back null/empty.
    live_state = page.evaluate("() => ({ settings: getSettings(), participants: getParticipants() })")
    print("active event settings not null after promotion:", live_state["settings"] is not None)

    page.click("#btn-back-to-events")
    page.wait_for_timeout(150)
    page.click("#btn-share-list")
    page.wait_for_timeout(200)
    page.click("#btn-stop-list-sharing")
    page.wait_for_timeout(2000)
    events_stopped = page.evaluate("() => ({ sharedListId: getSharedListId(), events: getEvents().map(e => e.tripId) })")
    print("shared list id cleared:", events_stopped["sharedListId"] is None)
    print("all tripIds cleared:", all(t is None for t in events_stopped["events"]))
    print("url has no ?list= after stopping:", "?list=" not in page.url)

    print("errors:", logs)
    browser.close()
```
```bash
python3 /tmp/verify_list_sharing_e2e.py
```
Expected: `share link contains ?list=: True`, `url now has ?list=: True`, `event has tripId after sharing: True`, `new event also got a tripId: True`, `total events now: 2`, `active event settings not null after promotion: True`, `shared list id cleared: True`, `all tripIds cleared: True`, `url has no ?list= after stopping: True`, `errors: []`.

이 스크립트는 실제 Firestore 프로젝트에 쓰기/읽기를 하므로 네트워크가 필요하고, 3초 대기가 관대하게 잡혀 있다 — 실제로 더 오래 걸리면 `page.wait_for_function`으로 조건 폴링으로 바꿔서 재시도한다. 두 기기 간 실시간 동기화(다른 브라우저 프로필에서 링크를 열어 목록이 실시간으로 나타나는지)는 이 자동화로 확인할 수 없는 부분이며, Task 8에서 수동 확인 항목으로 남긴다.

- [ ] **Step 8: Commit**

```bash
git add js/app.js
git commit -m "feat: wire up list sharing UI, auto-register new events, and boot() via the shared list"
```

---

### Task 7: README + Firestore 규칙 + 서비스워커 캐시 버전

**Files:**
- Modify: `README.md`
- Modify: `sw.js`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음 (문서/캐시 버전만).

- [ ] **Step 1: "실시간 공유" 섹션을 목록 공유 기준으로 재작성**

Replace:
```markdown
## 실시간 공유 (같이 편집)

설정 화면 → "공유" 섹션 → "이 여행 공유하기"를 누르면 그 모임의 지출 데이터가 Firebase(Firestore)에 올라가고, 접속 주소 끝에 `?trip=...`이 붙은 공유 링크가 생성됩니다. 이 링크를 받은 사람은 누구나 같은 모임 데이터를 실시간으로 같이 보고 편집할 수 있습니다. 링크를 열면 그 모임이 상대방의 모임 목록에도 자동으로 등록됩니다.

- **접근 방식**: 로그인/계정 없이 "링크를 아는 사람은 누구나 편집 가능"한 구조입니다 (구글 문서의 "링크가 있는 모든 사용자" 공유와 동일한 방식). 링크가 유출되면 그 사람도 데이터를 보고 고칠 수 있으니, 신뢰하는 사람에게만 링크를 공유하세요.
- 공유를 시작하면 인터넷 연결이 필요합니다. "공유 중지" 버튼으로 언제든 그 기기만 로컬 저장으로 되돌릴 수 있고, 이후에도 다른 참여자들은 계속 실시간 공유를 이어갈 수 있습니다.
- Firestore 콘솔의 보안 규칙(테스트 모드는 30일 후 자동 만료됨)은 아래로 교체해서 계속 쓸 수 있게 해두세요:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if true;
      match /expenses/{expenseId} {
        allow read, write: if true;
      }
      match /packingItems/{itemId} {
        allow read, write: if true;
      }
    }
  }
}
```
```
With:
```markdown
## 실시간 공유 (같이 편집)

모임 목록 화면 상단의 공유 아이콘을 누르면 "목록 공유하기" 버튼이 나옵니다. 누르면 그 시점의 모든 모임이 Firebase(Firestore)에 올라가고, 접속 주소 끝에 `?list=...`이 붙은 공유 링크가 생성됩니다. 이 링크를 받은 사람은 누구나 모임 목록 전체를 실시간으로 같이 보고, 그 안의 어떤 모임이든 지출을 기록하고, 새 모임을 추가할 수 있습니다. 공유 중에 새로 만드는 모임은 모두 자동으로 같은 목록에 등록되어 다른 사람에게도 바로 나타납니다.

- **개별 모임 단위 공유는 없습니다** — 공유는 항상 "모임 목록 전체" 단위입니다.
- **접근 방식**: 로그인/계정 없이 "링크를 아는 사람은 누구나 편집 가능"한 구조입니다 (구글 문서의 "링크가 있는 모든 사용자" 공유와 동일한 방식). 링크가 유출되면 그 사람도 목록 전체를 보고 고칠 수 있으니, 신뢰하는 사람에게만 링크를 공유하세요.
- 공유를 시작하면 인터넷 연결이 필요합니다. "공유 중지" 버튼으로 언제든 그 기기만 로컬 저장으로 되돌릴 수 있고(이 기기가 갖고 있던 모임들은 마지막으로 동기화된 상태로 로컬에 남습니다), 이후에도 다른 참여자들은 계속 실시간 공유를 이어갈 수 있습니다.
- Firestore 콘솔의 보안 규칙(테스트 모드는 30일 후 자동 만료됨)은 아래로 교체해서 계속 쓸 수 있게 해두세요:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if true;
      match /expenses/{expenseId} {
        allow read, write: if true;
      }
      match /packingItems/{itemId} {
        allow read, write: if true;
      }
    }
    match /lists/{listId} {
      allow read, write: if true;
      match /events/{eventId} {
        allow read, write: if true;
      }
    }
  }
}
```
```

- [ ] **Step 2: `sw.js` 캐시 버전 올리기**

`sw.js`에서 현재 `CACHE_NAME` 값을 확인하고 (`grep CACHE_NAME sw.js`), 그 숫자에서 1 올린 값으로 바꾼다. 예를 들어 현재 값이 `cmb-cache-v21`이면:
```javascript
const CACHE_NAME = 'cmb-cache-v22';
```
`ASSETS` 배열은 건드리지 않는다 — 이 계획에서 새로 만들거나 지운 파일이 없다.

- [ ] **Step 3: 확인**

```bash
find . -name '._*' -not -path './.git/*' -delete
grep -n "실시간 공유\|lists/{listId}" README.md
grep -n "CACHE_NAME" sw.js
```
Expected: README에 "목록 공유하기"와 `match /lists/{listId} {` 규칙이 보이고, `sw.js`의 `CACHE_NAME`이 이전 커밋 대비 1 올라가 있다.

- [ ] **Step 4: Commit**

```bash
git add README.md sw.js
git commit -m "docs: describe whole-list sharing in the README; bump SW cache version"
```

---

### Task 8: 최종 회귀 점검 (죽은 코드 grep + 전체 로컬 플로우)

**Files:**
- 코드 변경 없음 — 검증 전용.

- [ ] **Step 1: 죽은 참조 grep**

```bash
find . -name '._*' -not -path './.git/*' -delete
grep -rn "initSharedModeFromUrl\|enableSharingForCurrentData\|TRIP_ID_PARAM\|getTripIdFromUrl\|shareUrlForTrip\|renderShareSectionBody\|getSharedTripId\|btn-start-sharing\|btn-stop-sharing\b" js/ index.html
```
Expected: 아무 것도 출력되지 않는다. `btn-stop-sharing`은 새 `btn-stop-list-sharing`과 다른 문자열이므로 `\b`(단어 경계)를 붙여 오탐을 피한다 — 혹시 `btn-stop-list-sharing`이 걸린다면 grep 패턴이 잘못된 것이니 `btn-stop-sharing[^-]`처럼 더 좁혀서 다시 확인한다.

- [ ] **Step 2: 문법 검사 전체**

```bash
for f in js/*.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```
Expected: 전부 `OK`.

- [ ] **Step 3: 처음부터 끝까지 로컬 플로우 재확인**

```bash
python3 -m http.server 8080 &
sleep 1
```
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
    print("boots to events screen:", page.locator(".screen.active").get_attribute("id") == "screen-events")

    page.fill("#input-user-name", "테스터")
    page.click("#btn-save-username")
    page.wait_for_timeout(200)

    page.click("#btn-create-event")
    page.fill("#input-new-event-title", "회귀테스트")
    page.click("#btn-confirm-create-event")
    page.wait_for_timeout(200)
    page.fill("#input-new-participant", "규현")
    page.click("#btn-add-participant")
    page.wait_for_timeout(150)
    page.click("#participant-sheet-close")
    page.wait_for_timeout(150)

    page.click("#screen-dashboard #btn-add-expense")
    page.wait_for_timeout(150)
    page.fill("#input-expense-amount", "12000")
    page.click(".spender-chip-btn[data-value='규현']")
    page.fill("#input-expense-memo", "커피")
    page.click("#expense-form button[type=submit]")
    page.wait_for_timeout(200)
    print("expense saved, total:", page.locator(".hero-total-amount").inner_text())

    page.click("#btn-back-to-events")
    page.wait_for_timeout(150)
    print("event card shows on list:", page.locator(".event-card-title").inner_text() == "회귀테스트")

    print("errors:", logs)
    browser.close()
```
```bash
python3 /tmp/verify_full_regression.py
```
Expected: `boots to events screen: True`, `expense saved, total: 12,000원`, `event card shows on list: True`, `errors: []`.

- [ ] **Step 4: 수동 확인이 필요한 항목 기록 (자동화 불가)**

다음은 실제 두 기기/두 브라우저 프로필 간 Firestore 실시간 동기화가 필요해 이 환경에서 자동 검증할 수 없다 — 실제 배포 후 반드시 수동으로 확인한다:
1. 목록 공유 링크를 시크릿 창(또는 다른 브라우저)에서 열었을 때, 공유 시점의 모든 모임이 보이는지.
2. 한쪽 기기가 공유 중 새 모임을 추가하면, 다른 기기의 목록에도 실시간으로 나타나는지.
3. 한쪽이 모임을 삭제하면 다른 기기의 목록에서도 사라지는지.
4. 공유 중인 모임 하나를 열어 지출을 추가했을 때 다른 기기에도 실시간 반영되는지 (기존 개별 동기화 로직이라 이미 검증되어 있지만, 목록을 거쳐 들어간 경우에도 동일한지 최종 확인).

- [ ] **Step 5: 완료 — 커밋 없음 (검증 전용 태스크)**

---

## Self-Review Notes

- **스펙 커버리지:** 목록 공유 시작(Task 2/6) · 공유 중 새 모임 자동 등록(Task 2/6) · 링크로 참가/재개(Task 2) · 공유 중지 시 모든 tripId 확실히 제거(Task 2, 스펙의 명시적 경고 반영) · 개별 공유 기능 완전 제거(Task 4/6) · 모임 삭제 시 목록 멤버십 정리(Task 2) · Firestore 규칙 갱신(Task 7) · 검증 계획의 7개 항목(Task 6/8) — 모두 태스크로 커버됨.
- **플레이스홀더 스캔:** 모든 스텝에 실제 코드/명령이 있고, "TODO"/"적절히 처리" 같은 표현 없음.
- **타입/이름 일관성:** `getSharedListId`/`setSharedListId`/`shareEventsList`/`stopSharingEventsList`/`resumeOrJoinSharedList`/`startListSync`/`ensureEventIsShared`/`promoteActiveEventToShared`/`writeEventSnapshot`/`readEventPackingItems`는 Task 2에서 정의된 그대로 Task 6에서 동일한 이름으로 호출된다. (자체 검토 중 발견: 처음 초안은 새 모임을 공유 등록한 뒤 단순히 `enterEvent(id)`만 다시 불러 `isSharedMode()`는 켜지지만 캐시가 채워지지 않아 그 직후 여는 참여자 시트가 빈 데이터를 보는 버그가 있었다 — `promoteActiveEventToShared`로 캐시를 함께 채우도록 수정.) `ICON_SHARE`(Task 4)는 같은 태스크의 마크업에서 바로 사용. `fsFetchTripOnce`/`fsCreateList`/`fsAddListEvent`/`fsRemoveListEvent`/`subscribeToList`/`unsubscribeFromList`(Task 1)는 Task 2에서 정확히 같은 시그니처로 호출됨. `renderListShareSheetBody`(Task 4)는 Task 6의 `openListShareSheet`에서 그대로 호출됨.
