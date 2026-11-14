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
  /** 기사님이 기다릴 곳: '본사 15층 대회의실' → '본사' (층 · 호실 · 회의실은 빼고 건물 이름만) */
  building(place) {
    const p = String(place || '').trim();
    const b = p.replace(/\s*(지하\s*)?\d+\s*층.*$|\s*\d+\s*호.*$|\s*(대|소|중)?회의실.*$|\s*(접견실|사무실|대표실|임원실|라운지).*$/, '').trim();
    return b || p;
  },
  /** 연결 실패 화면 (대표 앱 · 비서 웹 · 기사님 · 결제 공용) — '다시 시도' 버튼 */
  failBox(err) {
    const msg = (err && err.message) || String(err || '');
    return `<div style="padding:48px 24px;text-align:center;max-width:420px;margin:0 auto"><p style="font-size:17px;font-weight:700;margin:0 0 8px">연결하지 못했어요</p>`
      + `<p style="color:#556274;margin:0 0 20px">${U.esc(msg)}</p><button type="button" class="btn primary" onclick="location.reload()">다시 시도</button></div>`;
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
