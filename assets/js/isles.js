/* isles.js — Private Isles. 링크를 런치패드 격자로 그립니다.
 *
 * 데이터는 assets/data/isles.json 하나입니다.
 *   columns  격자 열 수
 *   sites    [{ name, url, icon? }]
 *
 * icon을 비워 두면 이름 첫 글자 배지가 대신 나옵니다.
 * 아이콘 파일은 tools/fetch_icons.py가 받아 둡니다. 외부 아이콘 서비스를
 * 쓰지 않으므로, 이 페이지를 열어도 내 링크 목록이 밖으로 새지 않습니다.
 */
(function () {
  'use strict';

  const pad = document.getElementById('pad');

  function iconFor(site) {
    const box = document.createElement('span');
    box.className = 'pad__icon';

    if (site.icon) {
      const img = document.createElement('img');
      img.src = '/' + site.icon.replace(/^\/+/, '');
      img.alt = '';
      img.loading = 'lazy';
      // 파일이 사라졌거나 깨졌으면 글자 배지로 되돌립니다.
      img.addEventListener('error', () => box.replaceChildren(letterFor(site)));
      box.append(img);
    } else {
      box.append(letterFor(site));
    }

    return box;
  }

  function letterFor(site) {
    const span = document.createElement('span');
    span.className = 'pad__letter';
    span.textContent = (site.name || '?').trim().charAt(0);
    return span;
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
    const columns = Number(data.columns) || 4;
    pad.style.setProperty('--cols', columns);

    const sites = data.sites || [];
    if (!sites.length) {
      pad.replaceChildren();
      return;
    }

    pad.replaceChildren(...sites.map(tileFor));
  }

  Content.loadJSON('/assets/data/isles.json')
    .then(render)
    .catch(() => {
      const p = document.createElement('p');
      p.className = 'state';
      p.textContent = '목록을 불러오지 못했습니다.';
      pad.replaceWith(p);
    });
})();
