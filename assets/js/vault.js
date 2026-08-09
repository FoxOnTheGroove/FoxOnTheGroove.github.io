/* vault.js — Private Isles의 잠금 장치.
 *
 * 구조는 봉투 암호화다. 실제 데이터는 무작위로 만든 키(DEK) 하나로 잠그고,
 * 그 DEK를 다시 두 가지 방법으로 각각 잠가 둔다.
 *
 *   비밀번호  → 서버의 isles.enc 안에 들어 있다. 어느 기기에서나 열 수 있다.
 *   지문(PRF) → 그 기기의 localStorage에만 있다. 등록한 기기에서만 열린다.
 *
 * 이렇게 나눈 이유:
 *   - PC에서 편집할 때 폰 패스키를 QR로 끌어올 필요가 없다. 비밀번호로 연다.
 *   - 폰에 지문을 등록해도 서버 파일을 고칠 필요가 없다. 기기 안에서 끝난다.
 *   - 폰을 잃어도 비밀번호만 있으면 데이터를 되찾을 수 있다.
 *
 * 그래서 비밀번호는 편의 수단이 아니라 유일한 복구 수단이다. 잊으면 끝이다.
 */
const Vault = (function () {
  'use strict';

  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // PBKDF2 반복 횟수. 폰에서 1초 안팎이고, 비밀번호 경로는 자주 쓰지 않는다.
  const ITERATIONS = 600000;

  // PRF에 넘길 고정 salt. 이 값이 바뀌면 기존에 등록한 지문으로 못 연다.
  const PRF_SALT = enc.encode('private-isles/prf/v1');

  /* --- 바이트 ↔ 문자열 -------------------------------------------------- */

  function toB64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    // 한 번에 넘기면 큰 입력에서 스택이 넘친다. 잘라서 넣는다.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function fromB64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
  }

  /* --- 기본 연산 --------------------------------------------------------- */

  /** AES-GCM으로 잠근다. 매번 새 IV를 쓴다. IV 재사용은 GCM을 무너뜨린다. */
  async function seal(key, bytes) {
    const iv = randomBytes(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { iv: toB64(iv), ct: toB64(ct) };
  }

  /** 푼다. 키가 틀리면 예외가 난다 — GCM이 위조를 잡아낸다. */
  async function open(key, box) {
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(box.iv) },
      key,
      fromB64(box.ct)
    );
    return new Uint8Array(plain);
  }

  async function newDataKey() {
    return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
  }

  async function importDataKey(raw) {
    return subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ]);
  }

  /* --- 비밀번호로 키 만들기 ---------------------------------------------- */

  async function keyFromPassword(password, salt, iterations) {
    const base = await subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* --- 지문(PRF)으로 키 만들기 -------------------------------------------- */

  /** PRF가 뱉은 바이트를 그대로 키로 쓰지 않고 HKDF로 한 번 걸러 쓴다. */
  async function keyFromPrf(prfOutput) {
    const base = await subtle.importKey('raw', prfOutput, 'HKDF', false, [
      'deriveKey',
    ]);
    return subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: enc.encode('private-isles/wrap/v1'),
      },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* --- 금고 만들기 / 열기 ------------------------------------------------- */

  /** 평문 객체와 비밀번호로 isles.enc 내용을 만든다. */
  async function create(data, password) {
    const dek = await newDataKey();
    const salt = randomBytes(16);
    const wrapKey = await keyFromPassword(password, salt, ITERATIONS);
    const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));

    return {
      v: 1,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: ITERATIONS,
        salt: toB64(salt),
      },
      passwordWrap: await seal(wrapKey, rawDek),
      payload: await seal(dek, enc.encode(JSON.stringify(data))),
    };
  }

  /** 비밀번호로 연다. 틀리면 예외. */
  async function openWithPassword(vault, password) {
    const wrapKey = await keyFromPassword(
      password,
      fromB64(vault.kdf.salt),
      vault.kdf.iterations
    );

    let rawDek;
    try {
      rawDek = await open(wrapKey, vault.passwordWrap);
    } catch (e) {
      throw new Error('wrong-password');
    }

    const dek = await importDataKey(rawDek);
    return { dek, data: await readPayload(vault, dek) };
  }

  async function readPayload(vault, dek) {
    return JSON.parse(dec.decode(await open(dek, vault.payload)));
  }

  /* --- 지문 등록 / 지문으로 열기 ------------------------------------------ */

  /**
   * 이 기기에 패스키를 만들고, DEK를 그 지문으로 잠근 결과를 돌려준다.
   * 돌려받은 값은 이 기기의 localStorage에만 둔다. 서버로 보내지 않는다.
   */
  async function registerPasskey(dek, label) {
    const created = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'Private Isles' },
        user: {
          id: randomBytes(16),
          name: label || 'owner',
          displayName: label || 'owner',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        timeout: 60000,
        extensions: { prf: {} },
      },
    });

    const ext = created.getClientExtensionResults();
    if (!ext.prf || !ext.prf.enabled) throw new Error('prf-unsupported');

    // 등록 응답에는 PRF 값이 안 오는 경우가 많다. 한 번 더 인증해서 받아온다.
    const prfOutput = await evaluatePrf(created.rawId);
    const wrapKey = await keyFromPrf(prfOutput);
    const rawDek = new Uint8Array(await subtle.exportKey('raw', dek));

    return {
      credentialId: toB64(created.rawId),
      wrap: await seal(wrapKey, rawDek),
    };
  }

  /** 지문을 받아 PRF 출력을 얻는다. */
  async function evaluatePrf(rawId) {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: rawId }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_SALT } } },
      },
    });

    const ext = assertion.getClientExtensionResults();
    const first = ext.prf && ext.prf.results && ext.prf.results.first;
    if (!first) throw new Error('prf-missing');
    return new Uint8Array(first);
  }

  /** 등록해 둔 지문으로 연다. */
  async function openWithPasskey(vault, record) {
    const prfOutput = await evaluatePrf(fromB64(record.credentialId));
    const wrapKey = await keyFromPrf(prfOutput);

    let rawDek;
    try {
      rawDek = await open(wrapKey, record.wrap);
    } catch (e) {
      throw new Error('stale-passkey');
    }

    const dek = await importDataKey(rawDek);
    return { dek, data: await readPayload(vault, dek) };
  }

  return {
    create,
    openWithPassword,
    openWithPasskey,
    registerPasskey,
    readPayload,
    toB64,
    fromB64,
    ITERATIONS,
  };
})();

if (typeof window !== 'undefined') window.Vault = Vault;
if (typeof module !== 'undefined') module.exports = Vault;
