#!/usr/bin/env python3
"""Monta o index.html (arquivo único) a partir de src/.

Uso: python3 src/build.py

Junta o template, o núcleo em JavaScript, o termo da Celesc, a logo e as
fontes padrão da pré-visualização em um único index.html na raiz do projeto.
"""
import base64
import json
from pathlib import Path

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
ASSETS = SRC / "assets"

FONTS = [
    "FoxitSerif.pfb",
    "FoxitSerifBold.pfb",
    "FoxitFixed.pfb",
    "LiberationSans-Regular.ttf",
    "LiberationSans-Bold.ttf",
]


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    template = (SRC / "template.html").read_text(encoding="utf-8")
    core = (SRC / "core.js").read_text(encoding="utf-8")
    fonts = {name: b64(ASSETS / "fonts" / name) for name in FONTS}

    for marker in ("/*__CORE__*/", "__TERMO_B64__", "__STD_FONTS__"):
        if template.count(marker) != 1:
            raise SystemExit(f"Marcador {marker!r} deve aparecer uma vez em template.html")

    page = (
        template.replace("/*__CORE__*/", core)
        .replace("__TERMO_B64__", b64(ASSETS / "termo-de-aceite-celesc.pdf"))
        .replace("__LOGO_B64__", b64(ASSETS / "logo-solturi.jpg"))
        .replace("__STD_FONTS__", json.dumps(fonts))
    )

    # Arquivo publicável: documento HTML completo. Título, fontes e estilos vão
    # no <head>; o restante (a partir do <header>) vai no <body>.
    cut = page.index("<header")
    head, body = page[:cut].strip(), page[cut:].strip()
    html = (
        "<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n"
        "<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
        "<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n"
        + head + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n"
    )
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"index.html gerado ({len(html) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
