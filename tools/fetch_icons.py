#!/usr/bin/env python3
"""사이트 아이콘을 받아 isles.json 안에 직접 박아 넣는다.

    python tools/fetch_icons.py

아이콘을 assets/icons/ 같은 폴더에 따로 두지 않는 이유가 있다. 그렇게 하면
데이터를 암호화해도 소용이 없다. 파일 이름(github.png)이 목록을 그대로
알려주고, 이름을 해시로 바꿔도 이미지를 열어 보면 어느 사이트인지 드러난다.
그래서 아이콘을 data URI로 만들어 isles.json 안에 넣는다. 이 파일이 통째로
암호화되므로 아이콘도 같이 잠긴다.

용량이 곧 페이지 무게이므로 64px PNG로 줄여서 넣는다.

각 항목의 icon 필드는 이렇게 다룬다.
    data:... 로 시작   이미 처리된 것. 건드리지 않는다.
    파일 경로          그 파일을 읽어 넣는다. 직접 만든 아이콘을 쓸 때.
    비어 있음          사이트에서 받아온다.

필요한 것: Pillow (pip install Pillow)
"""

from __future__ import annotations

import base64
import io
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

try:
    from PIL import Image
except ImportError:
    print("Pillow가 필요합니다.  pip install Pillow", file=sys.stderr)
    raise SystemExit(1)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "assets" / "data" / "isles.json"

UA = "Mozilla/5.0 (compatible; private-isles-icon-fetcher)"
TIMEOUT = 10
SIZE = 64          # 격자에서 실제로 쓰이는 크기
SVG_MAX = 20000    # 이보다 큰 SVG는 굳이 안 쓴다


def get(url: str) -> tuple[bytes, str] | None:
    """URL을 받아 (본문, Content-Type). 실패하면 None."""
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.read(), response.headers.get("Content-Type", "")
    except (urllib.error.URLError, urllib.error.HTTPError, ssl.SSLError, OSError):
        return None


def icon_links_in(page_html: str, base: str) -> list[str]:
    """HTML의 <link rel="...icon">들을 절대 주소로 바꿔 돌려준다."""
    found = []
    for tag in re.findall(r"<link\b[^>]*>", page_html, flags=re.I):
        if not re.search(r'rel\s*=\s*["\'][^"\']*icon', tag, flags=re.I):
            continue
        href = re.search(r'href\s*=\s*["\']([^"\']+)', tag, flags=re.I)
        if href:
            found.append(urllib.parse.urljoin(base, href.group(1)))
    return found


def candidates_for(url: str) -> list[str]:
    """시도해 볼 아이콘 주소들.

    사이트에 직접 물어본다. 외부 아이콘 서비스를 거치지 않으므로 어떤 사이트를
    모아 뒀는지가 제3자에게 새지 않는다.
    """
    parts = urllib.parse.urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"

    urls: list[str] = []

    page = get(origin)
    if page and "html" in page[1].lower():
        urls += icon_links_in(page[0].decode("utf-8", "ignore"), origin)

    urls += [f"{origin}/apple-touch-icon.png", f"{origin}/favicon.ico"]

    return list(dict.fromkeys(urls))  # 순서 유지하며 중복 제거


def to_data_uri(body: bytes) -> str | None:
    """이미지 바이트를 64px PNG data URI로 만든다. 못 읽으면 None."""
    head = body[:200].lstrip().lower()

    # SVG는 벡터라 줄일 필요가 없다. 그대로 쓴다.
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
        if len(body) > SVG_MAX:
            return None
        return "data:image/svg+xml;base64," + base64.b64encode(body).decode()

    try:
        image = Image.open(io.BytesIO(body))
        # .ico 안에는 여러 크기가 들어 있다. 가장 큰 것을 골라 줄이는 편이
        # 작은 것을 늘리는 것보다 깨끗하다.
        if getattr(image, "n_frames", 1) > 1 and image.format == "ICO":
            image = Image.open(io.BytesIO(body))
        image = image.convert("RGBA")
        image.thumbnail((SIZE, SIZE), Image.LANCZOS)

        # 정사각 캔버스 가운데에 놓아 격자에서 크기가 들쭉날쭉하지 않게 한다.
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(
            image,
            ((SIZE - image.width) // 2, (SIZE - image.height) // 2),
            image,
        )

        buffer = io.BytesIO()
        canvas.save(buffer, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
    except Exception:
        return None


def fetch_for(url: str) -> str | None:
    for candidate in candidates_for(url):
        result = get(candidate)
        if not result:
            continue
        body = result[0]
        if len(body) < 100:
            continue
        uri = to_data_uri(body)
        if uri:
            return uri
    return None


def main() -> int:
    if not DATA.exists():
        print(f"사이트 목록이 없습니다: {DATA}", file=sys.stderr)
        return 1

    data = json.loads(DATA.read_text(encoding="utf-8"))
    sites = data.get("sites", [])

    embedded, kept, failed = 0, 0, []

    for site in sites:
        name = site.get("name", "")
        url = site.get("url", "")
        icon = site.get("icon", "")

        if icon.startswith("data:"):
            kept += 1
            print(f"  건너뜀  {name}")
            continue

        # 파일 경로가 적혀 있으면 그 파일을 쓴다. 직접 만든 아이콘용.
        if icon:
            path = (ROOT / icon).resolve()
            uri = to_data_uri(path.read_bytes()) if path.exists() else None
            if uri:
                site["icon"] = uri
                embedded += 1
                print(f"  넣음    {name} ← {icon}")
            else:
                failed.append(name)
                print(f"  실패    {name} ← {icon} (파일을 읽을 수 없음)")
            continue

        if not url:
            continue

        print(f"  받는 중  {name} …", end="", flush=True)
        uri = fetch_for(url)
        if uri:
            site["icon"] = uri
            embedded += 1
            print(f" {len(uri) // 1024}KB")
        else:
            failed.append(name)
            print(" 실패")

    DATA.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    size = DATA.stat().st_size
    print(f"\n넣음 {embedded} · 유지 {kept} · 실패 {len(failed)}")
    print(f"isles.json 크기 {size / 1024:.0f}KB")

    if failed:
        print("\n아이콘을 못 구한 항목:")
        for name in failed:
            print(f"  - {name}")
        print("\n비워 두면 이름 첫 글자 배지가 나옵니다.")
        print("직접 만든 파일을 쓰려면 icon에 그 파일 경로를 적고 다시 돌리세요.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
