#!/usr/bin/env node
/* 평문 목록을 잠가 isles.enc로 만든다. 반대 방향도 된다.
 *
 *   node tools/lock.js          isles.json  →  isles.enc   (잠그기)
 *   node tools/lock.js --open   isles.enc   →  isles.json  (열기)
 *
 * 비밀번호는 화면에 찍히지 않게 입력받는다. 명령어 인자로 넘기면 셸 기록에
 * 남기 때문에 인자로는 받지 않는다.
 *
 * tools/lock.html과 같은 vault.js를 쓴다. 어느 쪽으로 만들어도 서로 열린다.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const Vault = require(path.join(ROOT, 'assets/js/vault.js'));

const PLAIN = path.join(ROOT, 'assets/data/isles.json');
const SEALED = path.join(ROOT, 'assets/data/isles.enc');

/* --- 비밀번호 입력 -------------------------------------------------------- */

/* 파이프로 넣을 때 쓰는 한 줄 읽기.
 *
 * 비밀번호를 두 번 묻기 때문에, 들어온 것을 통째로 읽어 버리면 두 번째 질문이
 * 답을 못 받는다. 줄 단위로 큐에 쌓아 두고 하나씩 꺼내 준다.
 */
let takeLine = null;

function pipedLine() {
  if (!takeLine) {
    const rl = require('node:readline').createInterface({ input: process.stdin });
    const ready = [];
    const waiting = [];

    rl.on('line', (line) => {
      if (waiting.length) waiting.shift()(line);
      else ready.push(line);
    });
    rl.on('close', () => {
      while (waiting.length) waiting.shift()('');
    });

    takeLine = () =>
      new Promise((resolve) => {
        if (ready.length) resolve(ready.shift());
        else waiting.push(resolve);
      });
  }
  return takeLine();
}

function ask(prompt) {
  const { stdin, stdout } = process;
  stdout.write(prompt);

  if (!stdin.isTTY) return pipedLine();

  return new Promise((resolve, reject) => {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (char) => {
      switch (char) {
        case '\r':
        case '\n':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(value);
          break;
        case '\u0003': // Ctrl+C
          stdin.setRawMode(false);
          stdout.write('\n');
          reject(new Error('취소했습니다.'));
          break;
        case '\u007f': // Backspace
        case '\b':
          value = value.slice(0, -1);
          break;
        default:
          // 붙여넣기로 여러 글자가 한 번에 올 수 있다.
          if (char >= ' ') value += char;
      }
    };

    stdin.on('data', onData);
  });
}

/* --- 잠그기 --------------------------------------------------------------- */

async function seal() {
  if (!fs.existsSync(PLAIN)) {
    throw new Error(`평문 목록이 없습니다: ${PLAIN}`);
  }

  const data = JSON.parse(fs.readFileSync(PLAIN, 'utf8'));
  const withIcon = (data.sites || []).filter((s) => s.icon).length;

  console.log(`평문   ${(data.sites || []).length}개 항목 · 아이콘 ${withIcon}개 · ${data.columns}열`);

  const password = await ask('비밀번호        : ');
  if (password.length < 12) throw new Error('12자 이상으로 해 주세요.');

  const again = await ask('비밀번호 확인   : ');
  if (password !== again) throw new Error('두 비밀번호가 다릅니다.');

  const vault = await Vault.create(data, password);
  const blob = JSON.stringify(vault);

  // 만든 자리에서 다시 열어 본다. 못 여는 파일을 남기는 사고를 막는다.
  const check = await Vault.openWithPassword(vault, password);
  assert.deepStrictEqual(check.data, data, '복호화 결과가 원본과 다릅니다');
  await assert.rejects(
    () => Vault.openWithPassword(vault, password + 'x'),
    '틀린 비밀번호로도 열립니다'
  );

  // 암호문 안에 평문이 남았는지 확인한다. base64 문자열이 아니라 디코드한
  // 바이트에서 찾아야 한다. 짧은 문자열은 무작위 데이터에서 우연히 걸린다.
  const cipher = Buffer.concat([
    Buffer.from(vault.payload.ct, 'base64'),
    Buffer.from(vault.passwordWrap.ct, 'base64'),
  ]);
  for (const site of data.sites || []) {
    for (const needle of [site.name, site.url]) {
      if (!needle) continue;
      assert.ok(
        !cipher.includes(Buffer.from(needle, 'utf8')),
        `암호문에 "${needle}" 가 그대로 있습니다`
      );
    }
  }
  assert.ok(!blob.includes('data:image'), '아이콘이 새고 있습니다');

  fs.writeFileSync(SEALED, blob);

  console.log('검증   왕복 복호화 · 오답 거부 · 평문 잔존 없음 — 통과');
  console.log(`출력   assets/data/isles.enc  ${(blob.length / 1024).toFixed(0)}KB`);
  console.log('\n다음:  git add assets/data/isles.enc && git commit && git push');
}

/* --- 열기 ----------------------------------------------------------------- */

async function unseal() {
  if (!fs.existsSync(SEALED)) throw new Error(`금고가 없습니다: ${SEALED}`);

  const vault = JSON.parse(fs.readFileSync(SEALED, 'utf8'));
  const password = await ask('비밀번호        : ');

  let data;
  try {
    ({ data } = await Vault.openWithPassword(vault, password));
  } catch (e) {
    throw new Error(
      e.message === 'wrong-password' ? '비밀번호가 맞지 않습니다.' : e.message
    );
  }

  if (fs.existsSync(PLAIN)) {
    const backup = PLAIN + '.bak';
    fs.copyFileSync(PLAIN, backup);
    console.log(`기존 평문을 ${path.basename(backup)}로 옮겨 뒀습니다.`);
  }

  fs.writeFileSync(PLAIN, JSON.stringify(data, null, 2) + '\n');
  console.log(`열림   ${(data.sites || []).length}개 항목 → assets/data/isles.json`);
}

/* --- 시작 ----------------------------------------------------------------- */

const opening = process.argv.includes('--open');

(opening ? unseal() : seal()).catch((e) => {
  console.error('\n' + e.message);
  process.exitCode = 1;
});
