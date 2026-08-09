/* isles.js — Private Isles. 잠금 해제 후 링크를 런치패드 격자로 그린다.
 *
 * 데이터는 assets/data/isles.enc 하나뿐이고, 통째로 암호화되어 있다.
 * 주소를 직접 열어 파일을 받아 가도 비밀번호나 지문 없이는 아무것도 못 본다.
 *
 * 여는 방법은 두 가지다.
 *   지문      이 기기에 등록해 둔 패스키. 등록 기록은 localStorage에만 있다.
 *   비밀번호  어느 기기에서나 통한다. 유일한 복구 수단이다.
 *
 * 한 번 열면 10분 동안은 다시 묻지 않는다. 그동안 키가 sessionStorage에
 * 남아 있다는 뜻이므로, 자리를 뜰 때는 「지금 잠그기」를 누르는 게 좋다.
 * 탭을 닫으면 유예도 함께 끝난다.
 */
(function () {
  'use strict';

  const GRACE_MS = 10 * 60 * 1000;

  const PASSKEY_KEY = 'isles.passkey';
  const GRACE_KEY = 'isles.grace';

  const el = {
    lock: document.getElementById('lock'),
    bio: document.getElementById('unlock-bio'),
    form: document.getElementById('pw-form'),
    pw: document.getElementById('pw'),
    msg: document.getElementById('lock-msg'),
    vault: document.getElementById('vault'),
    pad: document.getElementById('pad'),
    register: document.getElementById('register-bio'),
    lockNow: document.getElementById('lock-now'),
    grace: document.getElementById('grace-note'),
  };

  let encrypted = null;   // isles.enc 내용
  let graceTimer = null;

  /* --- 저장소 도우미 ------------------------------------------------------ */

  function readJSON(store, key) {
    try {
      const raw = store.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function drop(store, key) {
    try { store.removeItem(key); } catch (e) {}
  }

  /* --- 10분 유예 ---------------------------------------------------------- */

  /** 푼 키를 유예 기간 동안만 들고 있는다. 만료되면 스스로 버린다. */
  async function holdKey(dek) {
    const raw = await crypto.subtle.exportKey('raw', dek);
    writeJSON(sessionStorage, GRACE_KEY, {
      key: Vault.toB64(raw),
      until: Date.now() + GRACE_MS,
    });
    scheduleRelock();
  }

  function heldKey() {
    const held = readJSON(sessionStorage, GRACE_KEY);
    if (!held) return null;
    if (Date.now() >= held.until) {
      drop(sessionStorage, GRACE_KEY);
      return null;
    }
    return held;
  }

  function scheduleRelock() {
    clearTimeout(graceTimer);
    const held = heldKey();
    if (!held) return;

    graceTimer = setTimeout(lockNow, held.until - Date.now());
    showGraceNote(held.until);
  }

  function showGraceNote(until) {
    if (!el.grace) return;
    const minutes = Math.max(1, Math.round((until - Date.now()) / 60000));
    el.grace.textContent = `약 ${minutes}분 후 자동으로 잠깁니다`;
  }

  function lockNow() {
    clearTimeout(graceTimer);
    drop(sessionStorage, GRACE_KEY);
    el.pad.replaceChildren();
    el.vault.hidden = true;
    el.lock.hidden = false;
    el.pw.value = '';
    message('');
  }

  /* --- 화면 --------------------------------------------------------------- */

  function message(text, isError) {
    el.msg.textContent = text;
    el.msg.className = 'lock__msg' + (isError ? ' lock__msg--error' : '');
  }

  function letterFor(site) {
    const span = document.createElement('span');
    span.className = 'pad__letter';
    span.textContent = (site.name || '?').trim().charAt(0);
    return span;
  }

  function iconFor(site) {
    const box = document.createElement('span');
    box.className = 'pad__icon';

    if (!site.icon) {
      box.append(letterFor(site));
      return box;
    }

    // 아이콘은 data URI로 암호문 안에 들어 있다. 따로 받아오는 파일이 없다.
    const img = document.createElement('img');
    img.src = site.icon;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => box.replaceChildren(letterFor(site)));
    box.append(img);
    return box;
  }

  function tileFor(site) {
    const link = document.createElement('a');
    link.className = 'pad__link';
    link.href = site.url;
    link.rel = 'noopener noreferrer';

    const name = document.createElement('span');
    name.className = 'pad__name';
    name.textContent = site.name;

    link.append(iconFor(site), name);

    const item = document.createElement('li');
    item.className = 'pad__item';
    item.append(link);
    return item;
  }

  function render(data) {
    el.pad.style.setProperty('--cols', Number(data.columns) || 4);
    el.pad.replaceChildren(...(data.sites || []).map(tileFor));

    el.lock.hidden = true;
    el.vault.hidden = false;

    // 지문을 아직 안 쓰는 기기라면 등록을 권한다.
    const registered = !!readJSON(localStorage, PASSKEY_KEY);
    el.register.hidden = registered || !window.PublicKeyCredential;

    scheduleRelock();
  }

  /* --- 여는 경로들 --------------------------------------------------------- */

  async function openFromGrace() {
    const held = heldKey();
    if (!held) return false;

    try {
      const dek = await crypto.subtle.importKey(
        'raw', Vault.fromB64(held.key), { name: 'AES-GCM' }, true,
        ['encrypt', 'decrypt']
      );
      render(await Vault.readPayload(encrypted, dek));
      return true;
    } catch (e) {
      drop(sessionStorage, GRACE_KEY);
      return false;
    }
  }

  async function openWithPasskey() {
    const record = readJSON(localStorage, PASSKEY_KEY);
    if (!record) return;

    message('지문을 확인하는 중…');
    try {
      const { dek, data } = await Vault.openWithPasskey(encrypted, record);
      await holdKey(dek);
      render(data);
    } catch (e) {
      if (e.message === 'stale-passkey') {
        // 비밀번호를 바꿔 금고를 새로 만들면 예전 등록은 못 쓴다.
        drop(localStorage, PASSKEY_KEY);
        el.bio.hidden = true;
        message('등록해 둔 지문이 이 데이터와 맞지 않습니다. 비밀번호로 열고 다시 등록해 주세요.', true);
      } else {
        message('지문 확인에 실패했습니다. 비밀번호로 열 수 있습니다.', true);
      }
    }
  }

  async function openWithPassword(password) {
    message('여는 중…');
    try {
      const { dek, data } = await Vault.openWithPassword(encrypted, password);
      await holdKey(dek);
      el.pw.value = '';
      render(data);
    } catch (e) {
      message(e.message === 'wrong-password'
        ? '비밀번호가 맞지 않습니다.'
        : '열지 못했습니다.', true);
    }
  }

  async function registerThisDevice() {
    const held = heldKey();
    if (!held) { message('먼저 잠금을 풀어 주세요.', true); return; }

    el.register.disabled = true;
    try {
      const dek = await crypto.subtle.importKey(
        'raw', Vault.fromB64(held.key), { name: 'AES-GCM' }, true,
        ['encrypt', 'decrypt']
      );
      const record = await Vault.registerPasskey(dek, 'private isles');
      writeJSON(localStorage, PASSKEY_KEY, record);
      el.register.hidden = true;
      message('이 기기에 지문을 등록했습니다.');
    } catch (e) {
      message(e.message === 'prf-unsupported'
        ? '이 기기는 지문 잠금을 지원하지 않습니다.'
        : '지문 등록에 실패했습니다.', true);
    } finally {
      el.register.disabled = false;
    }
  }

  /* --- 시작 --------------------------------------------------------------- */

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (el.pw.value) openWithPassword(el.pw.value);
  });

  el.bio.addEventListener('click', openWithPasskey);
  el.register.addEventListener('click', registerThisDevice);
  el.lockNow.addEventListener('click', lockNow);

  // 탭을 다시 볼 때 유예가 지났으면 즉시 잠근다.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !el.vault.hidden && !heldKey()) lockNow();
  });

  Content.loadJSON('/assets/data/isles.enc')
    .then(async (vault) => {
      encrypted = vault;

      if (await openFromGrace()) return;

      el.lock.hidden = false;
      el.bio.hidden = !readJSON(localStorage, PASSKEY_KEY);

      // 지문이 등록된 기기라면 바로 물어본다. 버튼을 한 번 덜 누른다.
      if (!el.bio.hidden) openWithPasskey();
    })
    .catch(() => {
      el.lock.hidden = false;
      el.form.hidden = true;
      message('아직 금고가 없습니다. tools/lock.html에서 만들어 주세요.', true);
    });
})();
