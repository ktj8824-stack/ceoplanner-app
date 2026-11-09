/* =========================================
   CEO플래너 — 데이터 저장소 (비서 웹 · CEO 앱 공용)
   - 데모 모드: 이 브라우저 localStorage 에 저장.
     같은 브라우저의 다른 탭(비서 웹 ↔ CEO 앱)에도 바로 반영됩니다.
   - Supabase 모드: config.js 에 주소·키가 있으면 서버에 저장하고 실시간 동기화.
   화면 코드는 모드와 상관없이 Store.* 만 사용합니다.
   ========================================= */
const Store = {
  KEY: 'CEOP_DATA_V1',
  role: 'ceo',          // 'ceo' | 'secretary' | 'driver'
  mode: 'demo',         // 'demo' | 'supabase'
  data: null,
  client: null,
  user: null,
  ceoId: null,
  companyId: null,
  needsLogin: false,
  loginError: null,
  _subs: [],

  async init(role) {
    this.role = role;
    const cfg = window.CEOP_CONFIG || {};
    if (cfg.SUPABASE_URL && cfg.SUPABASE_KEY && window.supabase) {
      this.mode = 'supabase';
      this.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
      const { data } = await this.client.auth.getSession();
      if (!data.session) { this.needsLogin = true; this.data = this._empty(); return; }
      try { await this._afterLogin(data.session.user); }
      catch (err) { await this.client.auth.signOut(); this.loginError = err.message; this.needsLogin = true; this.data = this._empty(); }
    } else {
      this.mode = 'demo';
      this._loadDemo();
      window.addEventListener('storage', e => { if (e.key === this.KEY) { this._loadDemo(); this._emit(); } });
    }
  },

  _empty() { return { profile: {}, schedules: [], messages: [], members: [] }; },

  // ───────── 구독 (데이터가 바뀌면 화면 다시 그리기) ─────────
  on(fn) { this._subs.push(fn); },
  _emit() { this._subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },

  // ───────── 읽기 ─────────
  profile() { return this.data.profile || {}; },
  /** 비서에게는 CEO 개인 일정을 '바쁨'으로 가려서 돌려줍니다. */
  _view(s) {
    if (this.role === 'secretary' && s.visibility === 'private') {
      return { id: s.id, date: s.date, start: s.start, end: s.end, title: '바쁨', category: 'personal', mode: 'none', visibility: 'private', masked: true, briefing: {} };
    }
    return s;
  },
  list() { return this.data.schedules.map(s => this._view(s)); },
  byDate(ymd) { return this.list().filter(s => s.date === ymd).sort((a, b) => a.start.localeCompare(b.start)); },
  get(id) { const s = this.data.schedules.find(x => x.id === id); return s ? this._view(s) : null; },
  messages() { return [...this.data.messages].sort((a, b) => a.at.localeCompare(b.at)); },
  /** 우리 회사 계정 목록 (대표 · 비서 화면의 '계정 관리') */
  members() {
    const order = { ceo: 0, secretary: 1, driver: 2 };
    const list = this.data.members || Demo.members(this.data.profile);
    return [...list].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  },

  // ───────── 쓰기 ─────────
  async upsert(s) {
    if (!s.id) s.id = U.uid();
    if (!s.createdBy) s.createdBy = this.role;
    // 비서가 수정하면 CEO 확인을 다시 받음
    if (this.role === 'secretary') s.ackAt = null;
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('ceo_schedules').upsert(this._toRow(s));
      if (error) throw error;
      await this._reload();
    } else {
      const i = this.data.schedules.findIndex(x => x.id === s.id);
      if (i >= 0) this.data.schedules[i] = { ...this.data.schedules[i], ...s }; else this.data.schedules.push(s);
      this._saveDemo();
    }
    return s;
  },

  async remove(id) {
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('ceo_schedules').delete().eq('id', id);
      if (error) throw error;
      await this._reload();
    } else {
      this.data.schedules = this.data.schedules.filter(s => s.id !== id);
      this._saveDemo();
    }
  },

  /** 확인 상태는 건드리지 않고 일부 값만 바꿈 (예: 다시 알린 시각) */
  async patch(id, fields) {
    if (this.mode === 'supabase') {
      const map = { nudgedAt: 'nudged_at' };
      const row = Object.fromEntries(Object.entries(fields).map(([k, v]) => [map[k] || k, v]));
      const { error } = await this.client.from('ceo_schedules').update(row).eq('id', id);
      if (error) throw error;
      await this._reload();
    } else {
      const s = this.data.schedules.find(x => x.id === id);
      if (s) { Object.assign(s, fields); this._saveDemo(); }
    }
  },

  /** CEO가 일정을 확인함 */
  async ack(id) {
    const at = new Date().toISOString();
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('ceo_schedules').update({ ack_at: at }).eq('id', id);
      if (error) throw error;
      await this._reload();
    } else {
      const s = this.data.schedules.find(x => x.id === id);
      if (s) { s.ackAt = at; this._saveDemo(); }
    }
  },

  /** ref: 관련 일정 id (비서 웹에서 '일정 열기'로 바로 이동) */
  async send(body, { urgent = false, ref = null } = {}) {
    const msg = { id: U.uid(), from: this.role, body: String(body).slice(0, 1000), urgent, ref, at: new Date().toISOString() };
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('ceo_messages').insert({ ceo_id: this.ceoId, sender_id: this.user.id, sender_role: this.role, body: msg.body, urgent, ref_id: ref });
      if (error) throw error;
      await this._reload();
    } else {
      this.data.messages.push(msg);
      this._saveDemo();
    }
  },

  async saveProfile(patch) {
    this.data.profile = { ...this.data.profile, ...patch };
    if (this.mode === 'supabase') {
      if (this.role !== 'ceo') return; // 대표 설정은 대표만 바꿈
      const { error } = await this.client.from('ceo_profiles').update({ settings: Object.fromEntries(Object.entries(this.data.profile).filter(([k]) => k !== 'name')) }).eq('id', this.ceoId);
      if (error) throw error;
    } else this._saveDemo();
  },

  // ───────── 회사 등록 (가입) · 계정 관리 ─────────
  /** 서버 함수 ceo-account 호출. 실패하면 쉬운 말 오류를 던짐 */
  async _account(body) {
    const { data, error } = await this.client.functions.invoke('ceo-account', { body });
    if (error) {
      let msg = '';
      try { msg = (await error.context.json()).error; } catch { /* 응답이 JSON 아님 */ }
      throw new Error(msg || '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  },
  async signUp(form) { return this._account({ action: 'signup', ...form }); },

  /** action: 'add_member' | 'reset_password' | 'remove_member' */
  async account(action, payload) {
    if (this.mode === 'supabase') {
      const r = await this._account({ action, ...payload });
      await this._reload(); this._emit();
      return r;
    }
    // 데모: 이 브라우저 안에서만 흉내 (비밀번호는 저장하지 않음)
    const list = this.data.members = this.members();
    const id = String(payload.loginId || '').trim().toLowerCase();
    const t = list.find(m => m.loginId === id);
    if (action === 'add_member') {
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(id)) throw new Error(`아이디 '${id}'는 쓸 수 없어요. 영어 소문자·숫자로 3~30자 (기호는 . _ - 만)`);
      if (t) throw new Error(`아이디 '${id}'는 이미 있어요. 다른 아이디로 정해 주세요.`);
      if (String(payload.password || '').length < 8) throw new Error('비밀번호는 8자 이상으로 정해 주세요.');
      if (!String(payload.name || '').trim()) throw new Error('이름을 넣어 주세요.');
      list.push({ loginId: id, name: payload.name.trim(), role: payload.role, phone: payload.phone || '' });
    } else if (!t) throw new Error('우리 회사 계정에서 찾지 못했어요.');
    else if (action === 'reset_password') { if (String(payload.password || '').length < 8) throw new Error('비밀번호는 8자 이상으로 정해 주세요.'); }
    else if (action === 'remove_member') {
      if (t.role === 'ceo') throw new Error('대표 계정은 지울 수 없어요. 해지는 고객센터로 문의해 주세요.');
      if (t.role === this.role && t.role === 'secretary' && list.filter(m => m.role === 'secretary').length === 1) throw new Error('내 계정은 여기서 지울 수 없어요.');
      this.data.members = list.filter(m => m !== t);
    }
    this._saveDemo();
    return { ok: true };
  },

  resetDemo() { localStorage.removeItem(this.KEY); this._loadDemo(); this._emit(); },

  // ───────── 데모 모드 ─────────
  _loadDemo() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch { this.data = null; }
    if (!this.data || !Array.isArray(this.data.schedules)) {
      this.data = Demo.build();
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    }
  },
  _saveDemo() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); this._emit(); },

  // ───────── Supabase 모드 ─────────
  /** 발급받은 아이디 → 내부 로그인 주소 (예: kim → kim@ceoplanner.invalid) */
  loginEmail(id) {
    const v = String(id || '').trim().toLowerCase();
    return v.includes('@') ? v : v + '@' + ((window.CEOP_CONFIG || {}).LOGIN_DOMAIN || 'ceoplanner.invalid');
  },
  async signIn(id, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email: this.loginEmail(id), password });
    if (error) throw new Error(/invalid/i.test(error.message) ? '아이디 또는 비밀번호가 맞지 않아요.' : error.message);
    try { await this._afterLogin(data.user); }
    catch (err) { await this.client.auth.signOut(); throw err; }
    this.needsLogin = false; this.loginError = null;
    this._emit();
  },
  async signOut() { if (this.client) await this.client.auth.signOut(); location.reload(); },

  async _afterLogin(user) {
    this.user = user;
    // CEO플래너에 등록된 계정인지, 이 화면에 맞는 역할인지 확인 (같은 서버의 다른 앱 계정은 막힘)
    const me = await this.client.from('ceo_profiles').select('role, company_id, login_id').eq('id', user.id).maybeSingle();
    if (me.error) throw me.error;
    if (!me.data) throw new Error('CEO플래너 계정이 아니에요. 회사에서 받은 아이디로 로그인해 주세요.');
    if (me.data.role !== this.role) {
      const where = { ceo: '대표 앱', secretary: '비서 웹', driver: '기사 화면(준비 중)' }[me.data.role];
      throw new Error(`이 아이디는 ${where}용이에요.`);
    }
    this.companyId = me.data.company_id; this.myLogin = me.data.login_id;
    if (this.role === 'ceo') this.ceoId = user.id;
    else {
      const { data, error } = await this.client.from('ceo_links').select('ceo_id').eq('member_id', user.id).eq('role', this.role).limit(1);
      if (error) throw error;
      this.ceoId = data && data[0] ? data[0].ceo_id : null;
      if (!this.ceoId) throw new Error('연결된 대표가 없어요. 관리자에게 연결을 요청해 주세요.');
    }
    await this._reload();
    this.client.channel('ceop-' + this.ceoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ceo_schedules', filter: `ceo_id=eq.${this.ceoId}` }, () => this._reload().then(() => this._emit()))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ceo_messages', filter: `ceo_id=eq.${this.ceoId}` }, () => this._reload().then(() => this._emit()))
      .subscribe();
  },

  async _reload() {
    if (!this.ceoId) { this.data = this._empty(); return; }
    // schedule_feed 뷰: 비서에게는 개인 일정을 서버에서 '바쁨'으로 가려서 내려줌
    const [sch, msg, prof, mem] = await Promise.all([
      this.client.from('ceo_schedule_feed').select('*').eq('ceo_id', this.ceoId),
      this.client.from('ceo_messages').select('*').eq('ceo_id', this.ceoId).order('created_at', { ascending: true }).limit(300),
      this.client.from('ceo_profiles').select('name, settings').eq('id', this.ceoId).single(),
      this.companyId ? this.client.from('ceo_profiles').select('login_id, name, role, phone').eq('company_id', this.companyId) : Promise.resolve({ data: [] }),
    ]);
    if (sch.error) throw sch.error;
    if (msg.error) throw msg.error;
    this.data = {
      profile: { name: prof.data?.name, ...(prof.data?.settings || {}) },
      schedules: (sch.data || []).map(r => this._fromRow(r)),
      members: (mem.data || []).map(r => ({ loginId: r.login_id, name: r.name, role: r.role, phone: r.phone || '' })),
      messages: (msg.data || []).map(r => ({ id: r.id, from: r.sender_role, body: r.body, urgent: r.urgent, ref: r.ref_id, at: r.created_at })),
    };
  },

  _toRow(s) {
    return {
      id: s.id, ceo_id: this.ceoId, title: s.title, category: s.category, date: s.date,
      start_time: s.start, end_time: s.end || s.start, location: s.location || null,
      mode: s.mode || 'none', travel_min: s.travelMin || 0, buffer_min: s.bufferMin ?? 10,
      visibility: s.visibility || 'normal', trip: s.trip || null, briefing: s.briefing || {},
      status: s.status || 'scheduled', ack_at: s.ackAt || null, created_role: s.createdBy || this.role,
      origin: s.origin || null, nudged_at: s.nudgedAt || null,
    };
  },
  _fromRow(r) {
    return {
      id: r.id, title: r.title, category: r.category, date: r.date,
      start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5),
      location: r.location || '', mode: r.mode, travelMin: r.travel_min, bufferMin: r.buffer_min,
      visibility: r.visibility, trip: r.trip, briefing: r.briefing || {}, status: r.status,
      ackAt: r.ack_at, createdBy: r.created_role, masked: !!r.masked, origin: r.origin || '', nudgedAt: r.nudged_at || null,
    };
  },
};
