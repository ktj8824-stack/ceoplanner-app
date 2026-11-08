/* =========================================
   CEO플래너 — 공통 도우미 (화면·계산 공용)
   ========================================= */
const U = {
  pad(n) { return String(n).padStart(2, '0'); },
  ymd(d) { return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; },
  hm(d) { return d ? `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}` : ''; },
  today() { return U.ymd(new Date()); },
  addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    return U.ymd(new Date(y, m - 1, d + n));
  },
  /** 'YYYY-MM-DD' + 'HH:MM' → Date (기기 로컬 시간) */
  at(ymd, hm) {
    const [y, m, d] = ymd.split('-').map(Number);
    const [hh, mm] = (hm || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  },
  addMin(date, min) { return new Date(date.getTime() + Math.round(min) * 60000); },
  diffMin(a, b) { return Math.round((a.getTime() - b.getTime()) / 60000); },
  WEEK: ['일', '월', '화', '수', '목', '금', '토'],
  dateLabel(ymd) {
    const d = U.at(ymd, '00:00');
    const t = U.today();
    const rel = ymd === t ? '오늘' : ymd === U.addDays(t, 1) ? '내일' : ymd === U.addDays(t, -1) ? '어제' : '';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${U.WEEK[d.getDay()]})${rel ? ' · ' + rel : ''}`;
  },
  durLabel(min) {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m}분`;
    return `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  toast(msg) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(U._toastT);
    U._toastT = setTimeout(() => el.classList.remove('show'), 2200);
  },
  /** 티맵 길안내 딥링크 (장소 이름 검색) */
  tmapLink(place) { return `tmap://search?name=${encodeURIComponent(place || '')}`; },
  telLink(phone) { return `tel:${String(phone || '').replace(/[^0-9+]/g, '')}`; },
};

if (typeof window !== 'undefined') window.U = U;
if (typeof module !== 'undefined') module.exports = U;
