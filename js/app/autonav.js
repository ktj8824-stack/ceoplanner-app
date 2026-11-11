/* =========================================
   CEO플래너 — 차에 타면 자동 길안내 (버디·로드·마이플래너와 같은 방식)
   대표 앱 주소 뒤에 ?go=next 를 붙여 열거나, 아이폰 앱을 ceoplanner://next 로 열면
   오늘 일정에서 '지금 가야 할 곳'으로 내비를 엽니다. 출발지는 넘기지 않아 내비가 현재 위치에서 안내.
   - 아이폰: 단축어 자동화 "CarPlay(또는 차 블루투스)에 연결되면 → URL 열기"
   - 갤럭시: 모드 및 루틴 "차량 블루투스 연결 시 → 웹페이지 열기"
   ========================================= */
const AutoNav = {
  APP_LINK: 'ceoplanner://next',
  get WEB_LINK() { const u = window.CEOP_CONFIG && CEOP_CONFIG.APP_URL; return (u && /^https?:/.test(u) ? u : 'https://ktj8824-stack.github.io/ceoplanner-app/') + '?go=next'; },
  get LINK() { return this.isApp() ? this.APP_LINK : this.WEB_LINK; },
  EARLY_MIN: 30,     // 출발 30분 전부터는 그 일정으로
  LATE_MIN: 45,      // 시작 + 45분까지는 늦게 출발해도 그 장소로
  AHEAD_MIN: 120,    // 2시간보다 더 뒤에 출발하는 일정은 '다음 일정' 안내만
  KEY: 'CEOP_NAVI',

  /** 아이폰 앱 안 (앱 화면은 file:// 로 열림) */
  isApp() { return location.protocol === 'file:'; },

  _consumeFlag() {
    try {
      const u = new URL(location.href);
      const q = u.searchParams.get('go');
      const h = (u.hash || '').replace(/^#/, '');
      if (q !== 'next' && h !== 'go=next' && h !== 'next') return false;
      u.searchParams.delete('go');
      if (h === 'go=next' || h === 'next') u.hash = '';
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      return true;
    } catch (e) { return false; }
  },
  /** 화면이 준비된 뒤 (App.boot 끝) 부름. 아이폰 앱은 ceoplanner://next 로 열리면 앱이 AutoNav.fromApp() 을 부름 */
  init() { if (this._consumeFlag() || window.__ceopGoNext) { window.__ceopGoNext = false; setTimeout(() => this.start(), 300); } },
  fromApp() {
    if (typeof App === 'undefined' || !App._booted) { window.__ceopGoNext = true; return; }   // 아직 로그인·로딩 중이면 끝나고 시작
    this.start();
  },

  /** 지금 가야 할 곳 */
  nextLeg(now = new Date()) {
    if (typeof App === 'undefined' || !App.dayPlan) return null;
    const t = now.getTime();
    let todayCount = 0, later = null;
    const cands = [];
    for (const ymd of [U.today(), U.addDays(U.today(), 1)]) {
      for (const { s, p } of App.dayPlan(ymd)) {
        if (!s.location || !s.mode || s.mode === 'none' || !p.leaveAt) continue;
        if (ymd === U.today()) todayCount++;
        const dep = p.leaveAt.getTime(), until = p.startAt.getTime() + this.LATE_MIN * 60000;
        if (t >= until) continue;
        if (dep <= t + this.EARLY_MIN * 60000) cands.push({ s, p, dep });
        else if (dep - t <= this.AHEAD_MIN * 60000) cands.push({ s, p, dep });
        else if (!later || dep < later.dep) later = { s, p, dep };
      }
    }
    // 이미 출발 시각이 지난(또는 30분 안) 일정 중 가장 늦은 것 = 지금 타야 하는 것, 없으면 가장 가까운 것
    const due = cands.filter(c => c.dep <= t + this.EARLY_MIN * 60000).sort((a, b) => b.dep - a.dep);
    const leg = due[0] || cands.sort((a, b) => a.dep - b.dep)[0] || null;
    return { todayCount, leg, later };
  },

  start() {
    const r = this.nextLeg();
    if (r && r.leg) return this._ready(r.leg);
    if (r && r.later) return this._laterMsg(r.later);
    if (r && r.todayCount) return this._message('오늘 이동이 모두 끝났어요', '수고하셨습니다.');
    return this._message('지금 갈 일정이 없어요', '일정이 있는 날 차에 타면 목적지로 바로 안내해 드려요.');
  },

  pref() { try { return localStorage.getItem(this.KEY) || 'choice'; } catch (e) { return 'choice'; } },
  setPref(v, el) {
    try { localStorage.setItem(this.KEY, v); } catch (e) { /* */ }
    if (el && el.parentElement) el.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
  },

  _ready(leg) {
    this._leg = leg;
    const pref = this.pref();
    if (pref === 'tmap' || pref === 'kakaomap') return this.go(pref);
    this._overlay(`
      <div class="an-k">${U.esc(leg.s.title || '일정')} · ${U.esc(leg.s.start)} 시작</div>
      <div class="an-t">${U.hm(leg.p.leaveAt)} 출발</div>
      <div class="an-d">📍 ${U.esc(leg.s.location)}</div>
      <div class="an-c">어느 내비로 안내할까요?</div>
      <div class="an-b">
        <button type="button" class="an-go an-tmap" onclick="AutoNav.go('tmap')">티맵</button>
        <button type="button" class="an-go an-kakao" onclick="AutoNav.go('kakaomap')">카카오맵</button>
      </div>
      <button type="button" class="an-link" onclick="AutoNav.cancel()">닫기</button>`, true);
  },

  /** 장소 이름으로 내비 열기 (출발지 없음 → 현재 위치) */
  go(app) {
    const l = this._leg;
    this._close();
    if (!l) return;
    const q = encodeURIComponent(l.s.location);
    const url = app === 'kakaomap' ? `kakaomap://search?q=${q}` : U.tmapLink(l.s.location);
    const web = `https://map.kakao.com/link/search/${q}`;
    const mobile = this.isApp() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (!mobile) { window.open(web, '_blank'); return; }
    let left = false;
    const onHide = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', onHide);
    location.href = url;
    setTimeout(() => { document.removeEventListener('visibilitychange', onHide); if (!left && !document.hidden && !this.isApp()) location.href = web; }, 1600);
  },
  cancel() { this._close(); },

  _laterMsg(l) {
    this._leg = l;
    this._overlay(`<div class="an-t">다음 일정은 ${U.hm(l.p.leaveAt)} 출발이에요</div>
      <div class="an-d">${U.esc(l.s.title || '')} · 📍 ${U.esc(l.s.location)}</div>
      <div class="an-b"><button type="button" class="an-x" onclick="AutoNav.cancel()">닫기</button>
      <button type="button" class="an-go" onclick="AutoNav._ready(AutoNav._leg)">지금 길안내</button></div>`, true);
  },
  _message(title, sub) {
    this._overlay(`<div class="an-t">${title}</div>${sub ? `<div class="an-d">${sub}</div>` : ''}
      <div class="an-b"><button type="button" class="an-go" onclick="AutoNav.cancel()">확인</button></div>`, true);
  },
  _overlay(html, closable) {
    let bg = document.getElementById('an-bg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'an-bg';
      bg.innerHTML = '<div id="an-box" role="dialog" aria-live="polite"></div>';
      document.body.appendChild(bg);
    }
    bg.onclick = closable ? (e => { if (e.target === bg) this.cancel(); }) : null;
    document.getElementById('an-box').innerHTML = html;
  },
  _close() { const bg = document.getElementById('an-bg'); if (bg) bg.remove(); },

  copyLink(el) {
    const link = this.LINK;
    const done = () => { U.toast('링크를 복사했어요'); if (el) { el.textContent = '복사됨'; setTimeout(() => { el.textContent = '링크 복사'; }, 1600); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => prompt('아래 링크를 복사하세요', link));
    else prompt('아래 링크를 복사하세요', link);
  },

  /** 내 정보 > 차에 타면 자동 길안내 */
  openGuide() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const pref = this.pref();
    const opt = (v, label) => `<button type="button" aria-pressed="${pref === v}" onclick="AutoNav.setPref('${v}', this)">${label}</button>`;
    const ios = `<div class="an-g-h">아이폰</div><ol class="an-g-ol">
        <li><b>단축어</b> 앱 → 아래 <b>자동화</b> → <b>＋</b></li>
        <li><b>CarPlay</b> 선택 → <b>연결될 때</b> → <b>즉시 실행</b></li>
        <li>동작에서 <b>URL 열기</b> 추가 → 위 링크 붙여넣기</li></ol>
      <p class="an-g-note">CarPlay가 없으면 2번에서 <b>블루투스</b> → 차량 이름을 고르세요. ${this.isApp() ? 'CEO플래너 앱이 바로 열려요.' : '사파리에서 열려요. CEO플래너 앱을 쓰면 앱에서 이 링크를 복사해 넣으세요. 내비를 열 때 확인 창이 뜨지 않아요.'}</p>`;
    const android = `<div class="an-g-h">갤럭시</div><ol class="an-g-ol">
        <li><b>설정</b> → <b>모드 및 루틴</b> → <b>루틴</b> → <b>＋</b></li>
        <li>조건: <b>블루투스 기기 연결</b> → 차량 선택</li>
        <li>실행: <b>웹페이지 열기</b> → 위 링크</li></ol>`;
    App.modal(`<h3>차에 타면 자동 길안내</h3>
      <p class="an-g-note">휴대폰이 차와 연결되면 CEO플래너가 열리면서 <b>지금 가야 할 일정 장소</b>로 내비가 켜져요. 출발지는 지금 있는 곳이에요.</p>
      <div class="an-g-h">1. 기본 내비</div>
      <div class="seg-mini an-g-seg" role="group">${opt('tmap', '티맵')}${opt('kakaomap', '카카오맵')}${opt('choice', '매번 선택')}</div>
      <div class="an-g-h">2. 자동 실행 링크</div>
      <div class="an-g-link"><input readonly value="${this.LINK}" onclick="this.select()"><button type="button" class="btn primary" onclick="AutoNav.copyLink(this)">링크 복사</button></div>
      <div class="an-g-h">3. 휴대폰에 자동 실행 등록</div>
      ${isAndroid ? android + ios : ios + android}
      <div class="modal-foot"><button type="button" class="btn" data-close>닫기</button><button type="button" class="btn primary" data-close onclick="AutoNav.start()">지금 시험해 보기</button></div>`);
  },
};
window.AutoNav = AutoNav;
