/* theme.js — 라이트/다크 토글.
 *
 * <head>에서 defer 없이 불러야 합니다. 저장된 테마를 첫 페인트 전에 적용해서
 * 새로고침할 때 화면이 번쩍이는 것을 막습니다.
 */
(function () {
  'use strict';

  var KEY = 'theme';

  // 1) 저장된 선택을 즉시 반영. 저장된 게 없으면 시스템 설정을 따릅니다.
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    // 시크릿 모드 등에서 localStorage가 막혀 있어도 사이트는 동작해야 합니다.
  }

  // 2) 토글 버튼 연결.
  function wire() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var root = document.documentElement;
      var current = root.getAttribute('data-theme');

      // 명시적 선택이 없으면 현재 렌더링된 테마를 기준으로 뒤집습니다.
      if (!current) {
        current = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }

      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
