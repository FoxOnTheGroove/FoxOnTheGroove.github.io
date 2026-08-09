/* calendar.js — 월 단위 캘린더.
 *
 * 일정은 assets/data/events.json 하나에서 옵니다.
 *   { "date": "2026-08-15", "title": "광복절", "type": "holiday" }
 */
(function () {
  'use strict';

  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  const grid    = document.getElementById('cal-grid');
  const label   = document.getElementById('cal-label');
  const upcoming = document.getElementById('cal-upcoming');

  // 화면에 그려진 달. 날짜는 1일로 고정해 두고 달만 움직입니다.
  let cursor = new Date();
  cursor.setDate(1);

  let byDate = new Map();   // "YYYY-MM-DD" → 일정 배열

  /** Date를 현지 기준 "YYYY-MM-DD"로. toISOString은 UTC라 하루 밀릴 수 있습니다. */
  function key(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function draw() {
    const year  = cursor.getFullYear();
    const month = cursor.getMonth();

    label.textContent = year + '년 ' + (month + 1) + '월';

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const todayKey     = key(new Date());

    const frag = document.createDocumentFragment();

    // 요일 머리글
    for (const day of DAYS) {
      const cell = document.createElement('div');
      cell.className = 'cal__weekday';
      cell.textContent = day;
      frag.append(cell);
    }

    // 1일이 시작하는 요일까지 빈 칸을 채웁니다.
    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal__cell cal__cell--blank';
      frag.append(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const k = key(date);

      const cell = document.createElement('div');
      cell.className = 'cal__cell';
      if (k === todayKey) cell.classList.add('is-today');
      if (date.getDay() === 0) cell.classList.add('is-sunday');

      const num = document.createElement('span');
      num.className = 'cal__num';
      num.textContent = day;
      cell.append(num);

      for (const event of byDate.get(k) || []) {
        const chip = document.createElement('span');
        chip.className = 'cal__event cal__event--' + (event.type || 'default');
        chip.textContent = event.title;
        chip.title = event.title;
        cell.append(chip);
      }

      frag.append(cell);
    }

    grid.replaceChildren(frag);
  }

  /** 오늘 이후 일정 다섯 개. */
  function drawUpcoming(events) {
    const todayKey = key(new Date());
    const next = events
      .filter((e) => e.date >= todayKey)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 5);

    if (!next.length) {
      upcoming.className = 'state';
      upcoming.textContent = '예정된 일정이 없습니다.';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'post-list';

    for (const event of next) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'upcoming__row';

      const title = document.createElement('span');
      title.className = 'post-list__title';
      title.textContent = event.title;

      const when = document.createElement('span');
      when.className = 'post-list__date meta';
      when.textContent = event.date;

      row.append(title, when);
      li.append(row);
      ul.append(li);
    }

    upcoming.className = '';
    upcoming.replaceChildren(ul);
  }

  function move(delta) {
    cursor.setMonth(cursor.getMonth() + delta);
    draw();
  }

  document.getElementById('cal-prev').addEventListener('click', () => move(-1));
  document.getElementById('cal-next').addEventListener('click', () => move(1));
  document.getElementById('cal-today').addEventListener('click', () => {
    cursor = new Date();
    cursor.setDate(1);
    draw();
  });

  // 일정이 없어도 달력 자체는 보여야 하므로, 먼저 그리고 나중에 채웁니다.
  draw();

  Content.loadJSON('/assets/data/events.json')
    .then((events) => {
      for (const event of events) {
        if (!byDate.has(event.date)) byDate.set(event.date, []);
        byDate.get(event.date).push(event);
      }
      draw();
      drawUpcoming(events);
    })
    .catch(() => Content.showError(upcoming, '일정을 불러오지 못했습니다.'));
})();
