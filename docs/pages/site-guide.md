이 사이트는 빌드 과정이 없다. 파일을 고쳐서 푸시하면 그게 끝이다. 어디를
고치면 무엇이 바뀌는지 정리해 둔다.

## 폴더 구조

```
/
├── index.html          프로필 · 첫 페이지
├── start.html          즐겨찾기 탭 페이지
├── calendar.html       캘린더
├── blog/
│   ├── index.html      글 목록
│   ├── post.html       글 한 편을 그리는 틀
│   └── posts/          ← 글은 여기에
│       ├── posts.json  글 목록 원본
│       └── *.md
├── docs/
│   ├── index.html
│   ├── doc.html
│   └── pages/          ← 문서는 여기에
│       ├── docs.json
│       └── *.md
└── assets/
    ├── css/            base.css가 전역 디자인
    ├── js/
    └── data/           links.json · events.json
```

## 글 추가하기

블로그와 문서는 방식이 같다. 다른 건 폴더와 목록 파일 이름뿐이다.

| | 블로그 | 문서 |
| --- | --- | --- |
| 마크다운 위치 | `blog/posts/` | `docs/pages/` |
| 목록 파일 | `blog/posts/posts.json` | `docs/pages/docs.json` |

`.md` 파일을 하나 만들고, 목록 JSON에 항목을 하나 추가한다. `slug`는 확장자를
뺀 파일 이름과 **정확히** 같아야 한다.

문서에는 `group` 필드를 쓸 수 있다. 목록 페이지에서 같은 `group`끼리 묶인다.
`group`을 안 쓰면 "기타"로 들어간다.

## 즐겨찾기 링크 고치기

`assets/data/links.json` 하나만 고치면 된다. HTML은 건드릴 필요 없다.

```json
[
  {
    "name": "개발",
    "links": [
      { "title": "GitHub", "url": "https://github.com" }
    ]
  }
]
```

## 일정 추가하기

`assets/data/events.json`에 추가한다. 날짜는 `YYYY-MM-DD`.

```json
[
  { "date": "2026-08-15", "title": "광복절", "type": "holiday" }
]
```

`type`은 색깔을 정한다. `default`, `holiday`, `work`, `personal` 중 하나를 쓴다.

## 디자인 바꾸기

색·간격·글꼴은 전부 `assets/css/base.css` 맨 위의 `:root` 블록에 모여 있다.
거기만 고치면 사이트 전체가 따라 바뀐다. 다크 테마 색은 그 아래
`[data-theme="dark"]` 블록에 같은 이름으로 한 벌 더 있으니 짝을 맞춰 고친다.

## 반영 시간

GitHub Pages가 `main` 브랜치를 그대로 서빙한다. 푸시하면 보통 1분 안에
반영된다. 바뀐 게 안 보이면 대개 브라우저 캐시이므로 강력
새로고침(`Ctrl+Shift+R`)을 해 본다.
