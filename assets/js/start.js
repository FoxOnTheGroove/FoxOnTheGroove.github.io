/* start.js — 즐겨찾기 시작 페이지.
 *
 * 링크는 assets/data/links.json 하나가 원본입니다. HTML은 건드리지 않아도
 * 됩니다. 검색창에 치면 링크가 실시간으로 걸러지고, 걸리는 게 없으면
 * Enter로 웹 검색을 합니다.
 */
(function () {
  'use strict';

  const board  = document.getElementById('board');
  const search = document.getElementById('search');
  const clock  = document.getElementById('clock');
  const hello  = document.getElementById('greeting');

  let groups = [];

  /* --- 시계와 인사말 ----------------------------------------------------- */

  function tick() {
    const now = new Date();
    const h = now.getHours();

    clock.textContent =
      String(h).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    hello.textContent =
      h < 5  ? '아직 밤이에요' :
      h < 12 ? '좋은 아침입니다' :
      h < 18 ? '좋은 오후입니다' :
      h < 22 ? '좋은 저녁입니다' :
               '늦었네요';
  }

  tick();
  setInterval(tick, 10000);

  /* --- 링크 그리기 ------------------------------------------------------- */

  /** 도메인 파비콘. 실패하면 CSS가 첫 글자를 대신 보여줍니다. */
  function faviconFor(url) {
    try {
      return 'https://icons.duckduckgo.com/ip3/' + new URL(url).hostname + '.ico';
    } catch (e) {
      return null;
    }
  }

  function tile(link) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = link.url;
    a.rel = 'noopener';

    const icon = document.createElement('span');
    icon.className = 'tile__icon';
    icon.textContent = link.title.charAt(0);

    const src = faviconFor(link.url);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 20;
      img.height = 20;
      // 아이콘을 못 가져오면 글자 배지가 그대로 남습니다.
      img.addEventListener('load', () => icon.replaceChildren(img));
      icon.append(document.createTextNode(''));
    }

    const name = document.createElement('span');
    name.className = 'tile__name';
    name.textContent = link.title;

    a.append(icon, name);
    return a;
  }

  /** query가 비어 있으면 전부, 아니면 제목·주소에 걸리는 것만 그립니다. */
  function draw(query) {
    const q = query.trim().toLowerCase();
    const frag = document.createDocumentFragment();
    let shown = 0;

    for (const group of groups) {
      const matches = q
        ? group.links.filter((l) =>
            l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))
        : group.links;

      if (!matches.length) continue;
      shown += matches.length;

      const section = document.createElement('section');
      section.className = 'group';

      const title = document.createElement('h2');
      title.className = 'group__title';
      title.textContent = group.name;

      const wrap = document.createElement('div');
      wrap.className = 'tiles';
      for (const link of matches) wrap.append(tile(link));

      section.append(title, wrap);
      frag.append(section);
    }

    if (!shown) {
      const p = document.createElement('p');
      p.className = 'state';
      p.textContent = 'Enter를 누르면 "' + query.trim() + '"을(를) 웹에서 찾습니다.';
      frag.append(p);
    }

    board.className = '';
    board.replaceChildren(frag);
  }

  /* --- 검색창 ------------------------------------------------------------ */

  search.addEventListener('input', () => draw(search.value));

  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      draw('');
      return;
    }
    if (e.key !== 'Enter') return;

    // 걸러진 결과의 첫 번째로 갑니다. 없으면 웹 검색.
    const first = board.querySelector('.tile');
    if (first) {
      location.href = first.href;
    } else if (search.value.trim()) {
      location.href = 'https://www.google.com/search?q=' +
        encodeURIComponent(search.value.trim());
    }
  });

  // 다른 곳에 포커스가 없으면 그냥 타이핑만 해도 검색창으로 들어갑니다.
  document.addEventListener('keydown', (e) => {
    if (e.target === search || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1) search.focus();
  });

  Content.loadJSON('/assets/data/links.json')
    .then((data) => {
      groups = data;
      draw('');
      search.focus();
    })
    .catch(() => Content.showError(board, '링크를 불러오지 못했습니다.'));
})();
