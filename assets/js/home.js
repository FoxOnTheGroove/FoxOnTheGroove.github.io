/* home.js — 첫 페이지의 "최근 글" 목록과 푸터 연도를 채웁니다. */
(function () {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();

  const box = document.getElementById('recent-posts');

  Content.loadJSON('/blog/posts/posts.json')
    .then((posts) => {
      // 첫 페이지에는 최신 5개만 보여줍니다.
      Content.renderList(box, Content.byNewest(posts).slice(0, 5), '/blog/post.html?slug=');
    })
    .catch(() => {
      Content.showError(box, '글 목록을 불러오지 못했습니다.');
    });
})();
