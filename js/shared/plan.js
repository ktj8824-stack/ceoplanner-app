/* CEO플래너 — 구독 요금제 (화면용). 로드플래너 plan.js 와 같은 역할.
   - 가격 · 상태 규칙은 서버(supabase/functions/ceo-account/billing.js)와 같아요. 실제 금액은 서버가 정해요.
   - 무료 체험(가입 후 14일, AI 포함) → 기본(AI 없음) / AI 비서 포함 중 골라 월 결제
   - 매달 자동결제 기준 (자동결제 연결 전에는 결제 1번 = 1개월). 같은 요금제로 또 결제하면 끝나는 날 뒤로 1개월
   - 이용 중 늘리기는 일할 결제(결제일 그대로), 줄이기는 다음 결제일부터 (예약)
   - 막는 곳: AI 비서(기본 요금제 · 기간 끝) · 기간이 끝나면 앱 · 웹 전체에 결제 안내 (데이터는 그대로 보관) */
const Plan = {
  // 가격은 모두 부가세 별도(VAT 별도)예요. 결제 금액 = 가격 + 부가세 10% (B2B 관행, 세금계산서 기준)
  VAT_RATE: 0.1,
  PRICES: { basic: 59000, premium: 100000, perExec: 50000, maxExec: 20, trialDays: 14 },
  NAMES: { trial: '무료 체험', basic: '기본', premium: 'AI 비서 포함', expired: '이용 기간 끝남' },
  FEATURES: {
    basic: ['비서 웹 · 대표 앱 · 기사 계정', '역산 알림 (기상 · 기사 호출 · 출발)', '일정 겹침 · 동선 확인, 비서톡'],
    premium: ['기본의 모든 기능', 'AI 비서 — 말로 일정 등록 · 변경 · 미루기', '아침 브리핑 자동 정리'],
  },

  /** 지금 상태 { plan, active, ai, until, daysLeft } — 서버 planState 와 같은 규칙 */
  state(now = new Date()) {
    const c = Store.company() || {};
    const paid = c.paidUntil && new Date(c.paidUntil) > now;
    const trial = !paid && c.trialUntil && new Date(c.trialUntil) > now;
    const plan = paid ? c.plan : trial ? 'trial' : 'expired';
    const until = paid ? c.paidUntil : trial ? c.trialUntil : null;
    const daysLeft = until ? Math.max(0, Math.ceil((new Date(until) - now) / 86400000)) : 0;
    return { plan, active: !!(paid || trial), ai: plan === 'premium' || plan === 'trial', until, daysLeft, extraExecs: c.extraExecs || 0 };
  },
  can(feature) { const s = this.state(); return feature === 'ai' ? s.ai : s.active; },

  won(n) { return Number(n).toLocaleString('ko-KR') + '원'; },
  /** 요금표 가격(공급가) → { supply, vat, total } — 서버 quote 와 같은 계산 */
  charge(plan, execs = 0) {
    const supply = this.PRICES[plan] + this.PRICES.perExec * execs;
    const vat = Math.round(supply * this.VAT_RATE);
    return { supply, vat, total: supply + vat };
  },
  /** 견적 — 서버 billing.js companyQuote 와 같은 규칙 (화면 미리보기 · 데모용, 실제 금액은 서버가 정함)
   *  kind 'month'(한 달) · 'prorate'(이용 중 늘리기: 오늘 일할, 결제일 그대로) · 'reduce'(이용 중 줄이기: 다음 결제일부터) */
  quote(c, plan, execs = 0, now = new Date()) {
    const RANK = { basic: 0, premium: 1 };
    const m = this.charge(plan, execs), monthly = { supply: m.supply, vat: m.vat, amount: m.total };
    const base = { plan, extraExecs: execs, supply: m.supply, vat: m.vat, amount: m.total, monthly,
      orderName: `CEO플래너 ${this.NAMES[plan]}${execs ? ` + 임원 ${execs}명` : ''} (월 정기)` };
    const paid = c && c.paidUntil && new Date(c.paidUntil) > now && RANK[c.plan] !== undefined;
    const addM = (d) => { const x = new Date(d); const day = x.getUTCDate(); x.setUTCMonth(x.getUTCMonth() + 1); if (x.getUTCDate() < day) x.setUTCDate(0); return x.toISOString(); };
    if (!paid) return { kind: 'month', ...base, nextBillAt: addM(now) };
    const cur = c.extraExecs || 0;
    const up = RANK[plan] > RANK[c.plan] || execs > cur, down = RANK[plan] < RANK[c.plan] || execs < cur;
    if (up && down) return { kind: 'mixed', ...base, amount: 0 };
    if (down) return { kind: 'reduce', ...base, supply: 0, vat: 0, amount: 0, nextBillAt: c.paidUntil };
    if (up) {
      const end = new Date(c.paidUntil), start = new Date(c.paidUntil);
      const day = start.getUTCDate(); start.setUTCMonth(start.getUTCMonth() - 1); if (start.getUTCDate() < day) start.setUTCDate(0);
      const cycleDays = Math.round((end - start) / 86400000);
      const daysLeft = Math.min(cycleDays, Math.max(1, Math.ceil((end - now) / 86400000)));
      const diff = m.supply - this.charge(c.plan, cur).supply;
      const supply = Math.floor(diff * daysLeft / cycleDays / 10) * 10, vat = Math.round(supply * this.VAT_RATE);
      return { kind: 'prorate', ...base, supply, vat, amount: supply + vat, daysLeft, cycleDays, nextBillAt: c.paidUntil };
    }
    return { kind: 'month', ...base, nextBillAt: addM(c.paidUntil) };
  },
  md(iso) { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; },
  untilText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  },
  /** 한 줄 요약 — 예: 'AI 비서 포함 · 12.10까지' / '무료 체험 · 3일 남음' */
  summary() {
    const s = this.state();
    if (s.plan === 'expired') return '이용 기간이 끝났어요';
    if (s.plan === 'trial') return `무료 체험 · ${s.daysLeft}일 남음`;
    return `${this.NAMES[s.plan]} · ${this.untilText(s.until)}까지`;
  },

  /** 결제 화면 주소. 아이폰 앱(파일로 열림)에서는 사파리로 웹 결제 화면을 열어요 */
  /** 아이폰 앱 데모에서는 결제 화면이 사파리로 열려 앱에 반영되지 않음 → 안내 한 줄 */
  payNote() { return location.protocol === 'file:' && Store.mode === 'demo' ? '데모에서는 사파리 결제 화면만 보여요 (앱에는 반영되지 않아요)' : ''; },
  payUrl() {
    const from = Store.role === 'secretary' ? 'web' : 'app';
    if (location.protocol === 'file:') return CEOP_CONFIG.PAY_URL + '?from=app';
    return `payment.html?from=${from}`;
  },

  /** 기간이 끝났을 때 화면 전체를 덮는 안내 (데이터는 그대로) */
  lockHtml() {
    const can = ['ceo', 'secretary'].includes(Store.role);
    return `<div class="plan-lock card" role="alertdialog" aria-labelledby="lockT">
      <h2 id="lockT">이용 기간이 끝났어요</h2>
      <p>일정 · 비서톡 기록은 그대로 보관돼 있어요. 결제하면 바로 다시 쓸 수 있어요.</p>
      <ul class="plan-mini">
        <li><b>기본</b> 월 ${this.won(this.PRICES.basic)}</li>
        <li><b>AI 비서 포함</b> 월 ${this.won(this.PRICES.premium)}</li>
      </ul>
      <p class="muted small">VAT 별도 가격이에요 (결제 시 부가세 10% 추가)</p>
      ${can ? `<a class="btn primary" href="${U.esc(this.payUrl())}">결제하고 계속 쓰기</a>` : '<p class="muted small">회사 대표님이나 비서님께 결제를 요청해 주세요.</p>'}
      ${Store.mode === 'supabase' ? '<button class="btn quiet" data-logout>로그아웃</button>' : '<button class="btn quiet" data-plan-reset>데모: 체험 기간 다시 시작</button>'}
    </div>`;
  },
  bindLock(root) {
    root.querySelector('[data-logout]')?.addEventListener('click', () => Store.signOut());
    root.querySelector('[data-plan-reset]')?.addEventListener('click', () => Store.demoSetCompany({ plan: 'trial', trialUntil: new Date(Date.now() + this.PRICES.trialDays * 86400000).toISOString(), paidUntil: null }));
  },
};
if (typeof window !== 'undefined') window.Plan = Plan;
