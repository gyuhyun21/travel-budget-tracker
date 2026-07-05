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
