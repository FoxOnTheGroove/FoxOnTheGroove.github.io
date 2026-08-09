/* content.js — 블로그·문서가 함께 쓰는 작은 도우미 모음.
 *
 * 글 목록은 JSON 파일 하나(posts.json / docs.json)가 원본입니다.
 * 글 하나를 추가하려면 .md 파일을 넣고 그 JSON에 항목 하나를 더합니다.
 */
window.Content = (function () {
  'use strict';

  /** JSON을 불러옵니다. 실패하면 호출한 쪽에서 잡을 수 있게 던집니다. */
  async function loadJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' — HTTP ' + res.status);
    return res.json();
  }

  /** 마크다운 원문을 불러옵니다. */
  async function loadText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' — HTTP ' + res.status);
    return res.text();
  }

  /** "2026-08-09" → "2026년 8월 9일" */
  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  /** 최신순 정렬. 원본 배열은 건드리지 않습니다. */
  function byNewest(items) {
    return items.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /**
   * 글 목록을 <ul class="post-list">로 그립니다.
   * @param {Element} el      비우고 채울 컨테이너
   * @param {Array}   items   posts.json 항목들
   * @param {string}  base    링크 앞에 붙일 경로 (예: "/blog/post.html?slug=")
   */
  function renderList(el, items, base) {
    if (!items.length) {
      el.className = 'state';
      el.textContent = '아직 글이 없습니다.';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'post-list';

    for (const item of items) {
      const a = document.createElement('a');
      a.href = base + encodeURIComponent(item.slug);

      const title = document.createElement('span');
      title.className = 'post-list__title';
      title.textContent = item.title;

      const date = document.createElement('span');
      date.className = 'post-list__date meta';
      date.textContent = item.date;

      a.append(title, date);

      const li = document.createElement('li');
      li.append(a);
      ul.append(li);
    }

    el.className = '';
    el.replaceChildren(ul);
  }

  /** 컨테이너에 오류 상태를 표시합니다. */
  function showError(el, message) {
    el.className = 'state';
    el.textContent = message;
  }

  return { loadJSON, loadText, formatDate, byNewest, renderList, showError };
})();
