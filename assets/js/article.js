/* article.js — 마크다운 글 한 편을 그립니다. 블로그와 문서가 같이 씁니다.
 *
 * 페이지는 <body>의 data-* 속성으로 어디서 뭘 읽을지 알려줍니다:
 *   data-manifest   글 목록 JSON 경로
 *   data-dir        .md 파일들이 있는 디렉터리
 *   data-back       "목록으로" 링크가 갈 곳
 *   data-back-label 그 링크에 쓸 이름
 *
 * 주소는 ?slug=파일이름 형태입니다. (예: /blog/post.html?slug=hello-world)
 */
(function () {
  'use strict';

  const cfg = document.body.dataset;
  const root = document.getElementById('article');

  function fail(message) {
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = message;
    root.append(p);
  }

  const slug = new URLSearchParams(location.search).get('slug');

  // slug는 그대로 파일 경로가 되므로 안전한 문자만 허용합니다.
  if (!slug || !/^[a-z0-9._-]+$/i.test(slug)) {
    fail('주소가 올바르지 않습니다.');
    return;
  }

  /** 마크다운이 만든 <table>을 가로 스크롤 컨테이너로 감쌉니다. */
  function wrapTables(container) {
    for (const table of container.querySelectorAll('table')) {
      const box = document.createElement('div');
      box.className = 'table-scroll';
      table.replaceWith(box);
      box.append(table);
    }
  }

  /** h2·h3에 id와 앵커를 붙이고, 그걸로 목차를 만듭니다. */
  function buildToc(container) {
    const headings = container.querySelectorAll('h2, h3');
    if (headings.length < 2) return null;

    const ul = document.createElement('ul');
    const used = new Set();

    headings.forEach((h, i) => {
      // 한글 제목도 쓸 수 있게, 공백만 하이픈으로 바꾸고 나머지는 유지합니다.
      let id = h.textContent.trim().toLowerCase().replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '');
      if (!id || used.has(id)) id = (id || 'section') + '-' + i;
      used.add(id);
      h.id = id;

      const anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = '#' + id;
      anchor.textContent = '#';
      anchor.setAttribute('aria-label', h.textContent + ' 위치로 가는 링크');
      h.append(anchor);

      const link = document.createElement('a');
      link.href = '#' + id;
      link.textContent = h.textContent.replace(/#$/, '');

      const li = document.createElement('li');
      if (h.tagName === 'H3') li.className = 'toc--h3';
      li.append(link);
      ul.append(li);
    });

    const nav = document.createElement('nav');
    nav.className = 'toc';
    nav.setAttribute('aria-label', '목차');

    const title = document.createElement('p');
    title.className = 'toc__title';
    title.textContent = '목차';

    nav.append(title, ul);
    return nav;
  }

  async function render() {
    const list = await Content.loadJSON(cfg.manifest);
    const entry = list.find((item) => item.slug === slug);
    if (!entry) throw new Error('not-found');

    const markdown = await Content.loadText(cfg.dir + slug + '.md');

    document.title = entry.title;

    // --- 머리말 ---
    const header = document.createElement('header');
    header.className = 'article-header';

    const h1 = document.createElement('h1');
    h1.textContent = entry.title;

    const meta = document.createElement('div');
    meta.className = 'article-meta';
    if (entry.date) {
      const time = document.createElement('time');
      time.dateTime = entry.date;
      time.textContent = Content.formatDate(entry.date);
      meta.append(time);
    }
    for (const tag of entry.tags || []) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      meta.append(span);
    }

    header.append(h1, meta);

    // --- 본문 ---
    // 내가 쓴 마크다운만 렌더링하므로 별도 새니타이즈는 하지 않습니다.
    // 남이 쓴 글을 받게 되면 DOMPurify를 끼워야 합니다.
    const body = document.createElement('article');
    body.className = 'prose';
    body.innerHTML = marked.parse(markdown);

    wrapTables(body);
    const toc = buildToc(body);

    const layout = document.createElement('div');
    layout.className = 'article-layout';
    layout.append(body);
    if (toc) layout.append(toc);

    root.replaceChildren(header, layout);

    // 주소에 #앵커가 있었다면 렌더링이 끝난 지금 그 위치로 옮깁니다.
    if (location.hash) {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView();
    }
  }

  // "목록으로" 링크는 본문 로딩과 상관없이 먼저 세워둡니다.
  const back = document.getElementById('back-link');
  if (back) {
    back.href = cfg.back;
    back.textContent = '← ' + cfg.backLabel;
  }

  render().catch((err) => {
    fail(err.message === 'not-found'
      ? '그런 글이 없습니다.'
      : '글을 불러오지 못했습니다.');
  });
})();
