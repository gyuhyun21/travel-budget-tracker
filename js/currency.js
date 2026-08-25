// Approximate reference rates shown as a first-run starting point only —
// the settings screen always asks the user to confirm/adjust them.
// (checked against real market rates around 2026-07: ~46 KRW/THB, ~1530 KRW/USD)
const DEFAULT_THB_RATE = 46;
const DEFAULT_USD_RATE = 1530;

function formatMoneyValue(n) {
  if (n === undefined || n === null || n === '') return '';
  const num = Number(n);
  return isNaN(num) ? '' : num.toLocaleString('en-US');
}

function parseMoneyInput(value) {
  const num = Number(String(value ?? '').replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function formatMoneyInput(el) {
  const cursorFromEnd = el.value.length - el.selectionEnd;
  const raw = el.value.replace(/[^0-9.]/g, '');
  const firstDot = raw.indexOf('.');
  const intPart = firstDot === -1 ? raw : raw.slice(0, firstDot);
  const decPart = firstDot === -1 ? '' : raw.slice(firstDot, firstDot + 3);
  const cleanInt = intPart.replace(/^0+(?=\d)/, '');
  const formattedInt = cleanInt === '' ? '' : Number(cleanInt).toLocaleString('en-US');
  el.value = formattedInt + decPart;
  const newPos = Math.max(0, el.value.length - cursorFromEnd);
  el.setSelectionRange(newPos, newPos);
}

function toKRW(amount, currency, settings) {
  if (currency === 'KRW') return amount;
  if (currency === 'THB') {
    if (!settings || !settings.thbRate) return null;
    return amount * settings.thbRate;
  }
  if (currency === 'USD') {
    if (!settings || !settings.usdRate) return null;
    return amount * settings.usdRate;
  }
  return null;
}
