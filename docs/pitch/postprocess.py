#!/usr/bin/env python3
"""Repair the two 'inherit from theme' holes pptxgenjs leaves in shape XML.

pptxgenjs writes `line: {type:"none"}` as an EMPTY `<a:ln></a:ln>` and
`fill: {type:"none"}` as no fill element at all. In OOXML both mean "inherit from
the theme", not "none" — so PowerPoint and macOS Quick Look draw a theme outline
and a solid theme fill where the deck intends neither. LibreOffice happens to
guess differently, which is why this only shows up in some viewers.

This rewrites each slide so every shape states its fill and line explicitly, then
reports any shape still left inheriting.
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

SLIDE = re.compile(r"ppt/slides/slide\d+\.xml$")


def fix_xml(xml: str) -> tuple[str, int]:
    # Empty <a:ln/> or <a:ln></a:ln> => an explicit "no line".
    xml, n1 = re.subn(r"<a:ln\s*/>", "<a:ln><a:noFill/></a:ln>", xml)
    xml, n2 = re.subn(r"<a:ln>\s*</a:ln>", "<a:ln><a:noFill/></a:ln>", xml)
    return xml, n1 + n2


def audit(xml: str) -> int:
    """Count shapes whose spPr declares no fill at all (theme-inheriting)."""
    bad = 0
    for sp in xml.split("<p:sp>")[1:]:
        spPr = sp.split("</p:spPr>")[0]
        tail = spPr.split("</a:prstGeom>")[-1] if "</a:prstGeom>" in spPr else spPr
        if "<a:noFill/>" not in tail and "<a:solidFill>" not in tail:
            bad += 1
    return bad


def process(path: Path) -> None:
    tmp = path.with_suffix(".tmp.pptx")
    fixed = inheriting = 0
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(
        tmp, "w", zipfile.ZIP_DEFLATED
    ) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if SLIDE.search(item.filename):
                xml = data.decode("utf-8")
                xml, n = fix_xml(xml)
                fixed += n
                inheriting += audit(xml)
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    shutil.move(tmp, path)
    status = "OK" if inheriting == 0 else f"STILL INHERITING: {inheriting}"
    print(f"{path.name}: {fixed} empty <a:ln> -> noFill · {status}")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        process(Path(arg))
