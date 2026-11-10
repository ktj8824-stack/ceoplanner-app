/* CEO플래너 — 선 아이콘 (이모지 대신 사용, 24x24 stroke) */
const Icon = (() => {
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    chat: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>',
    siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M4 21h16"/><path d="M12 2v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r=".5"/><circle cx="16.5" cy="16" r=".5"/>',
    phone: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 19.1 2.1-2.1"/><path d="m17 7 2.1-2.1"/>',
    x: '<path d="m6 6 12 12"/><path d="M18 6 6 18"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 12.5h18"/>',
    handshake: '<path d="m11 17 2 2a1.5 1.5 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.5 1.5 0 0 0 2-2l-4.5-4.5-2 1a2 2 0 0 1-2.5-3L12 5l3 0 6 6"/><path d="M3 11l5-5 3 1"/><path d="m3 11 7 7a1.5 1.5 0 0 0 2-2"/>',
    utensils: '<path d="M6 3v8a2 2 0 0 0 2 2v8"/><path d="M10 3v8"/><path d="M4 3v8"/><path d="M18 21V3a4 4 0 0 0-3 4v7h3"/>',
    flag: '<path d="M6 21V3"/><path d="M6 4h11l-2 4 2 4H6"/><circle cx="6" cy="21" r=".5"/>',
    suitcase: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3"/><path d="M8 11v5"/><path d="M16 11v5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14"/><path d="m8 21 2-4"/><path d="m16 21-2-4"/>',
    plane: '<path d="M10.5 21 12 17l4 3v-2.5L13 13l7-1.5V9l-7 1V4.5a1 1 0 0 0-2 0V10L4 9v2.5l7 1.5-3 4.5V20z"/>',
    walk: '<circle cx="13" cy="4" r="1.6"/><path d="m9 21 2.5-6.5L14 16v5"/><path d="M8 11.5 10.5 8h3l2 4 2.5 1"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    door: '<path d="M14 3H6v18h8"/><path d="M14 3l5 2v14l-5 2z"/><circle cx="16.5" cy="12" r=".5"/>',
    flagEnd: '<path d="M5 12.5 10 17.5 19 7"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21 10 14 3 9.5z"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
    nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    sms: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  };
  const CAT = { meeting: 'briefcase', external: 'handshake', dinner: 'utensils', golf: 'flag', trip: 'suitcase', event: 'mic', personal: 'lock' };
  const MODE = { driver: 'car', car: 'car', taxi: 'car', walk: 'walk', train: 'train', flight: 'plane', none: 'building' };
  const KIND = { wake: 'sun', driver: 'phone', leave: 'door', wait: 'clock', move: 'route', arrive: 'pin', start: 'calendar', end: 'flagEnd' };
  const svg = (name, size = 18, cls = '') =>
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.calendar}</svg>`;
  return { svg, cat: (c, s, cls) => svg(CAT[c] || 'calendar', s, cls), mode: (m, s, cls) => svg(MODE[m] || 'building', s, cls), kind: (k, s, cls) => svg(KIND[k] || 'clock', s, cls) };
})();
if (typeof window !== 'undefined') window.Icon = Icon;
