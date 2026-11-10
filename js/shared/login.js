/* CEO플래너 — 시작 · 로그인 · 회사 등록(가입) 화면 (Supabase 모드에서만 사용)
   시작 화면은 로드플래너 · 마이플래너와 같은 구성: 앱 아이콘 · 이름 · 한 줄 소개 → 고르는 카드 → 데모 · 약관
   카카오/구글 로그인 없음. 아이디 + 비밀번호.
   가입 = 회사 등록: 사업자번호(국세청 확인) · 대표자 이름 · 사업장 주소 + 가입하는 분(대표 또는 비서).
   비서가 가입하면 대표님 아이디도 같이 만들고, 기사 · 추가 비서는 나중에 '계정 관리'에서 만들어요. */
const Login = {
  /** 시작 화면 — 로드플래너처럼 '어떻게 시작하시나요?' 카드 두 개 + 데모 둘러보기 */
  render(root, title, onDone) {
    this._title = title; this._done = onDone;
    if (Store.loginError) return this.renderId(root, title, onDone);   // 로그인 문제는 바로 아이디 화면에서 안내
    const chev = Icon.svg('chevron', 18);
    root.innerHTML = `
      <div class="auth auth-start">
        <div class="auth-brand">
          <img src="icon.svg" alt="" class="auth-logo" width="84" height="84">
          <h1>CEO플래너</h1>
          <p>도착 시간만 정하면<br>비서실과 기사님이 같이 움직여요</p>
        </div>
        <div class="auth-choices">
          <h2>어떻게 시작하시나요?</h2>
          <button type="button" class="auth-card" data-id>
            <span class="ico">${Icon.svg('building', 24)}</span>
            <span class="t"><b>회사에서 아이디를 받았어요</b><small>대표 · 비서 · 기사님 계정으로 로그인</small></span>${chev}
          </button>
          <button type="button" class="auth-card" data-signup>
            <span class="ico brass">${Icon.svg('file', 24)}</span>
            <span class="t"><b>처음이에요 · 회사 등록</b><small>사업자번호로 가입 · ${Plan.PRICES.trialDays}일 무료 체험</small></span>${chev}
          </button>
          <button type="button" class="auth-demo" data-demo>${Icon.svg('bolt', 16)} 데모 대표 계정으로 둘러보기</button>
        </div>
        <footer class="auth-foot">
          <span>카카오 · 구글 로그인 없이, 회사가 만든 아이디로만 들어와요</span>
          <a href="privacy.html" target="_blank">개인정보 처리방침</a>
        </footer>
      </div>`;
    root.querySelector('[data-id]').addEventListener('click', () => this.renderId(root, title, onDone));
    root.querySelector('[data-signup]').addEventListener('click', () => this.renderSignup(root, title, onDone));
    root.querySelector('[data-demo]').addEventListener('click', () => Store.enterDemo());
  },

  /** 아이디 · 비밀번호 로그인 */
  renderId(root, title, onDone) {
    const who = Store.role === 'secretary' ? '비서 · 대표 · 기사님' : '대표 · 비서 · 기사님';
    root.innerHTML = `
      <div class="auth auth-form">
        <button type="button" class="auth-back" data-back aria-label="뒤로">${Icon.svg('left', 22)}</button>
        <div class="auth-title"><h1>회사에서 받은<br>아이디로 로그인</h1><p>${who} 모두 같은 화면이에요</p></div>
        <form id="loginForm" autocomplete="on" class="auth-fields">
          <label>아이디<input type="text" name="uid" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="latin"></label>
          <label>비밀번호<input type="password" name="pw" required autocomplete="current-password" placeholder="8자 이상"></label>
          <p class="login-err" id="loginErr" role="alert">${U.esc(Store.loginError || '')}</p>
          <button class="auth-primary" type="submit">로그인</button>
        </form>
        <div class="auth-note">${Icon.svg('info', 20)}<p>계정은 회사에서 발급해요. 아이디나 비밀번호를 잊으셨다면 <b>비서실 · 회사 담당자</b>에게 재설정을 요청해 주세요.</p></div>
        <p class="auth-switch">처음이세요? <button type="button" data-signup>회사 등록하기</button></p>
      </div>`;
    Store.loginError = null;
    const f = root.querySelector('#loginForm');
    root.querySelector('[data-back]').addEventListener('click', () => this.render(root, title, onDone));
    root.querySelector('[data-signup]').addEventListener('click', () => this.renderSignup(root, title, onDone));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = '확인 중…';
      try { await Store.signIn(f.uid.value, f.pw.value); onDone(); }
      catch (err) { root.querySelector('#loginErr').textContent = err.message || String(err); }
      finally { btn.disabled = false; btn.textContent = '로그인'; }
    });
    f.uid.focus();
  },

  /** 사업자번호 10자리 계산식 (서버에서 국세청 조회를 한 번 더 해요) */
  bizOk(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length !== 10) return false;
    const n = [...d].map(Number), w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += n[i] * w[i];
    sum += Math.floor((n[8] * 5) / 10);
    return (10 - (sum % 10)) % 10 === n[9];
  },
  bizFmt(raw) {
    const d = String(raw || '').replace(/\D/g, '').slice(0, 10);
    return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
  },

  renderSignup(root, title, onDone) {
    const page = Store.role;   // 'ceo'(대표 앱) | 'secretary'(비서 웹)
    const idIn = (name, ph) => `<input type="text" name="${name}" placeholder="${ph}" required autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="latin" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{2,29}" title="영어·숫자 3~30자 (기호는 . _ - 만)">`;
    root.innerHTML = `
      <form class="auth auth-form login signup" id="suForm" novalidate>
        <button type="button" class="auth-back" data-back aria-label="뒤로">${Icon.svg('left', 22)}</button>
        <div class="auth-title"><h1>회사 등록</h1><p>사업자 정보로 가입해요. 대표님도, 비서님도 가입할 수 있어요.</p></div>

        <fieldset><legend>사업자 정보</legend>
          <label>사업자등록번호<input type="text" name="bizNo" placeholder="000-00-00000" inputmode="numeric" required autocomplete="off"></label>
          <small class="hint" id="bizHint">국세청에서 영업 중인 사업자인지 확인해요.</small>
          <label>대표자 이름<input type="text" name="ceoName" required autocomplete="off"></label>
          <label>사업장 주소<input type="text" name="address" required autocomplete="street-address" placeholder="예: 서울 강남구 테헤란로 123"></label>
          <label><span>상호 <span class="muted">(선택)</span></span><input type="text" name="bizName" autocomplete="organization"></label>
        </fieldset>

        <fieldset><legend>가입하는 분</legend>
          <div class="seg" role="radiogroup">
            <label><input type="radio" name="who" value="secretary" ${page === 'secretary' ? 'checked' : ''}> 비서예요</label>
            <label><input type="radio" name="who" value="ceo" ${page === 'ceo' ? 'checked' : ''}> 대표예요</label>
          </div>
          <label data-sec>내 이름<input type="text" name="myName" autocomplete="name"></label>
          <label>내 아이디${idIn('myId', '영어·숫자 3~30자')}</label>
          <label>비밀번호<input type="password" name="myPw" placeholder="8자 이상" minlength="8" required autocomplete="new-password"></label>
          <label>비밀번호 확인<input type="password" name="myPw2" required autocomplete="new-password"></label>
          <label><span>휴대폰 <span class="muted">(선택)</span></span><input type="tel" name="myPhone" autocomplete="tel" placeholder="010-0000-0000"></label>
        </fieldset>

        <fieldset data-sec><legend>대표님 계정</legend>
          <p class="muted small" style="margin:0">대표님이 폰 앱에서 쓸 아이디예요. 가입 후 대표님께 아이디와 임시 비밀번호를 전해 주세요.</p>
          <label>대표님 아이디${idIn('ceoId', '예: kim')}</label>
          <label>임시 비밀번호<input type="text" name="ceoPw" placeholder="8자 이상" minlength="8" autocomplete="off"></label>
          <label><span>대표님 휴대폰 <span class="muted">(선택)</span></span><input type="tel" name="ceoPhone" placeholder="010-0000-0000"></label>
        </fieldset>

        <label class="agree"><input type="checkbox" name="agree" required> <span><a href="privacy.html" target="_blank">개인정보 처리방침</a>에 동의해요 <span class="muted">(필수)</span></span></label>
        <p class="login-err" id="suErr" role="alert"></p>
        <button class="auth-primary" type="submit">사업자 확인하고 가입</button>
        <p class="auth-switch">이미 아이디가 있어요 · <button type="button" data-tologin>로그인</button></p>
      </form>`;
    const f = root.querySelector('#suForm'), err = root.querySelector('#suErr');
    const sync = () => {
      const sec = f.who.value === 'secretary';
      f.querySelectorAll('[data-sec]').forEach(el => { el.hidden = !sec; el.querySelectorAll('input').forEach(i => { if (i.name !== 'ceoPhone') i.required = sec; }); });
    };
    f.querySelectorAll('[name=who]').forEach(r => r.addEventListener('change', sync));
    sync();
    f.bizNo.addEventListener('input', () => {
      f.bizNo.value = this.bizFmt(f.bizNo.value);
      const d = f.bizNo.value.replace(/\D/g, ''), h = root.querySelector('#bizHint');
      h.textContent = d.length < 10 ? '국세청에서 영업 중인 사업자인지 확인해요.' : this.bizOk(d) ? '번호 형식이 맞아요. 가입할 때 국세청에 확인해요.' : '번호가 맞지 않아요. 다시 확인해 주세요.';
      h.classList.toggle('bad', d.length === 10 && !this.bizOk(d));
    });
    root.querySelector('[data-back]').addEventListener('click', () => this.render(root, title, onDone));
    root.querySelector('[data-tologin]').addEventListener('click', () => this.renderId(root, title, onDone));

    f.addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = '';
      const sec = f.who.value === 'secretary';
      const bad = [...f.querySelectorAll('input')].find(i => !i.closest('[hidden]') && !i.checkValidity());
      if (bad) { bad.focus(); err.textContent = bad.name === 'agree' ? '개인정보 처리방침에 동의해 주세요.' : `'${bad.closest('label').firstChild.textContent.replace(/\(선택\)/, '').trim()}' 칸을 확인해 주세요.`; return; }
      if (!this.bizOk(f.bizNo.value)) { f.bizNo.focus(); err.textContent = '사업자등록번호를 다시 확인해 주세요.'; return; }
      if (f.myPw.value !== f.myPw2.value) { f.myPw2.focus(); err.textContent = '비밀번호 확인이 달라요.'; return; }
      const form = {
        bizNo: f.bizNo.value, ceoName: f.ceoName.value.trim(), address: f.address.value.trim(), bizName: f.bizName.value.trim(), agree: true,
        signer: { role: f.who.value, name: sec ? f.myName.value.trim() : f.ceoName.value.trim(), loginId: f.myId.value.trim().toLowerCase(), password: f.myPw.value, phone: f.myPhone.value.trim() },
        ...(sec ? { ceo: { loginId: f.ceoId.value.trim().toLowerCase(), password: f.ceoPw.value, phone: f.ceoPhone.value.trim() } } : {}),
      };
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = '국세청 확인 중…';
      try {
        await Store.signUp(form);
        this.renderDone(root, title, onDone, form);
      } catch (x) { err.textContent = x.message || String(x); }
      finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = '사업자 확인하고 가입'; } }
    });
  },

  /** 가입 완료: 이 화면(대표 앱/비서 웹)에 맞으면 바로 시작, 아니면 맞는 곳 안내 */
  renderDone(root, title, onDone, form) {
    const s = form.signer, here = s.role === Store.role;
    const other = s.role === 'ceo' ? { url: CEOP_CONFIG.APP_URL, label: '대표 앱 열기' } : { url: CEOP_CONFIG.SECRETARY_URL, label: '비서 웹 열기' };
    root.innerHTML = `
      <div class="auth auth-form login signup">
        <div class="auth-title"><span class="auth-ok">${Icon.svg('check', 28)}</span><h1>가입 완료</h1><p>사업자 확인을 마쳤어요. 이제 아래 아이디로 로그인할 수 있어요.</p></div>
        <dl class="kv acc">
          <dt>${s.role === 'ceo' ? '대표' : '비서'} (나)</dt><dd><b>${U.esc(s.loginId)}</b></dd>
          ${form.ceo ? `<dt>대표님</dt><dd><b>${U.esc(form.ceo.loginId)}</b> · 임시 비밀번호 <b>${U.esc(form.ceo.password)}</b></dd>` : ''}
        </dl>
        ${form.ceo ? '<p class="muted small" style="margin:0">대표님께 아이디와 임시 비밀번호를 전해 주세요. 이 화면을 닫으면 임시 비밀번호는 다시 보이지 않아요.</p>' : ''}
        <p class="muted small" style="margin:0">기사님 · 다른 비서님 계정은 ${s.role === 'secretary' ? '비서 웹' : '앱'}의 '계정 관리'에서 만들 수 있어요.</p>
        <p class="login-err" id="doneErr" role="alert"></p>
        ${here ? '<button class="auth-primary" data-go>시작하기</button>' : `<p style="margin:0">${s.role === 'secretary' ? '비서님은 PC의 비서 웹' : '대표님은 폰의 대표 앱'}에서 로그인해 주세요.</p><a class="auth-primary" href="${U.esc(other.url)}">${other.label}</a>`}
      </div>`;
    root.querySelector('[data-go]')?.addEventListener('click', async e => {
      e.target.disabled = true;
      try { await Store.signIn(s.loginId, s.password); onDone(); }
      catch (x) { root.querySelector('#doneErr').textContent = x.message || String(x); e.target.disabled = false; }
    });
  },
};
