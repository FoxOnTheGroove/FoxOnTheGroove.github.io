#!/usr/bin/env python3
"""사이트 목록에 있는 주소들의 파비콘을 내려받아 assets/icons/에 저장한다.

Private Isles는 아이콘을 외부에서 실시간으로 불러오지 않는다. 그러면 페이지를
열 때마다 내 링크 목록의 도메인이 외부로 새기 때문이다. 그래서 미리 받아둔다.

    python tools/fetch_icons.py

isles.json의 각 항목에 icon 경로를 채워 넣는다. 이미 icon이 적혀 있는 항목은
직접 지정한 것으로 보고 건드리지 않는다.

표준 라이브러리만 쓴다. 설치할 것 없다.
"""

from __future__ import annotations

import json
import pathlib
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

# Windows 콘솔은 기본이 cp949라 한글이 깨진다. 출력만 UTF-8로 돌려놓는다.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "assets" / "data" / "isles.json"
ICON_DIR = ROOT / "assets" / "icons"

UA = "Mozilla/5.0 (compatible; private-isles-icon-fetcher)"
TIMEOUT = 10

# 확장자를 정하는 데만 쓴다. 없으면 .ico로 떨어뜨린다.
EXT_BY_TYPE = {
    "image/png": ".png",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/svg+xml": ".svg",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def get(url: str) -> tuple[bytes, str] | None:
    """URL을 받아 (본문, Content-Type)을 돌려준다. 실패하면 None."""
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.read(), response.headers.get("Content-Type", "")
    except (urllib.error.URLError, urllib.error.HTTPError, ssl.SSLError, OSError):
        return None


def icon_links_in(page_html: str, base: str) -> list[str]:
    """HTML의 <link rel="...icon..."> 들을 절대 주소로 바꿔 돌려준다."""
    found = []
    for tag in re.findall(r"<link\b[^>]*>", page_html, flags=re.I):
        if not re.search(r'rel\s*=\s*["\'][^"\']*icon', tag, flags=re.I):
            continue
        href = re.search(r'href\s*=\s*["\']([^"\']+)', tag, flags=re.I)
        if href:
            found.append(urllib.parse.urljoin(base, href.group(1)))
    return found


def candidates_for(url: str) -> list[str]:
    """시도해 볼 파비콘 주소들을 순서대로 만든다.

    사이트에 직접 물어본다. 외부 아이콘 서비스를 거치지 않으므로 내 링크
    목록이 제3자에게 새지 않는다.
    """
    parts = urllib.parse.urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"

    urls: list[str] = []

    # 1순위: 홈페이지 HTML이 직접 가리키는 아이콘 (보통 가장 예쁘다)
    page = get(origin)
    if page and "html" in page[1].lower():
        try:
            urls += icon_links_in(page[0].decode("utf-8", "ignore"), origin)
        except Exception:
            pass

    # 2순위: 관례적인 위치
    urls += [
        f"{origin}/apple-touch-icon.png",
        f"{origin}/favicon.ico",
    ]

    # 순서를 지키면서 중복만 제거
    return list(dict.fromkeys(urls))


def sniff_ext(body: bytes) -> str | None:
    """파일 앞부분을 보고 진짜 형식을 알아낸다. 모르겠으면 None."""
    if body[:4] == b"\x89PNG":
        return ".png"
    if body[:4] == b"\x00\x00\x01\x00":
        return ".ico"
    if body[:2] == b"\xff\xd8":
        return ".jpg"
    if body[:3] == b"GIF":
        return ".gif"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return ".webp"
    head = body[:200].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
        return ".svg"
    return None


def slugify(name: str, url: str) -> str:
    """파일 이름으로 쓸 안전한 문자열. 이름이 한글이면 도메인을 쓴다."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        host = urllib.parse.urlsplit(url).netloc
        slug = re.sub(r"[^a-z0-9]+", "-", host.lower()).strip("-")
    return slug or "site"


def fetch_one(name: str, url: str) -> str | None:
    """아이콘을 받아 저장하고, 사이트 기준 경로를 돌려준다."""
    for candidate in candidates_for(url):
        result = get(candidate)
        if not result:
            continue
        body, content_type = result

        # 너무 작으면 깨진 응답이거나 1x1 자리표시자다.
        if len(body) < 100:
            continue
        if body[:15].lstrip()[:14].lower().startswith(b"<!doctype html"):
            continue

        # 확장자는 내용을 보고 정한다. 서버가 붙여 준 Content-Type이나 주소의
        # 확장자는 자주 틀린다. (PNG를 favicon.ico로 주는 사이트가 흔하다.)
        ext = sniff_ext(body)
        if ext is None:
            media = content_type.split(";")[0].strip().lower()
            ext = EXT_BY_TYPE.get(media, ".ico")

        ICON_DIR.mkdir(parents=True, exist_ok=True)
        filename = slugify(name, url) + ext
        (ICON_DIR / filename).write_bytes(body)
        return f"assets/icons/{filename}"

    return None


def main() -> int:
    if not DATA.exists():
        print(f"사이트 목록이 없습니다: {DATA}", file=sys.stderr)
        return 1

    data = json.loads(DATA.read_text(encoding="utf-8"))
    sites = data.get("sites", [])

    fetched, kept, failed = 0, 0, []

    for site in sites:
        name, url = site.get("name", ""), site.get("url", "")
        if not url:
            continue

        if site.get("icon"):
            kept += 1
            print(f"  건너뜀  {name} — 아이콘이 이미 지정됨")
            continue

        print(f"  받는 중  {name} …", end="", flush=True)
        path = fetch_one(name, url)
        if path:
            site["icon"] = path
            fetched += 1
            print(f" {path}")
        else:
            failed.append(name)
            print(" 실패")

    DATA.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"\n받음 {fetched} · 유지 {kept} · 실패 {len(failed)}")
    if failed:
        print("\n아래 사이트는 아이콘을 못 찾았습니다.")
        print("직접 만든 파일을 assets/icons/에 넣고 isles.json의 icon에 적어 주세요.")
        for name in failed:
            print(f"  - {name}")
        print("\n비워 두면 이름 첫 글자 배지가 대신 표시됩니다.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
