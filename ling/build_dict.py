"""
Builds data/jmdict-ja.sqlite from the JMdict release.

The dictionary is data, not code: it is ~60 MB, it changes when JMdict does, and
it must not live in git. Run this once per environment:

    ./.venv/bin/python build_dict.py

Source: https://github.com/scriptin/jmdict-simplified (JMdict is CC BY-SA 4.0,
Electronic Dictionary Research and Development Group). English and Russian
glosses are both published; other languages exist and can be added to LANGS.
"""

from __future__ import annotations

import collections
import json
import pathlib
import re
import sqlite3
import tarfile
import urllib.request

RELEASE_API = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
LANGS = ("eng", "rus")
COLUMN = {"eng": "en", "rus": "ru"}
MAX_GLOSSES = 3

HERE = pathlib.Path(__file__).parent
DATA = HERE / "data"


def download(url: str, dest: pathlib.Path) -> pathlib.Path:
    if dest.exists():
        return dest
    print(f"downloading {url.rsplit('/', 1)[-1]} …")
    urllib.request.urlretrieve(url, dest)
    return dest


def clean(glosses: list[str], limit: int = MAX_GLOSSES) -> list[str]:
    """JMdict glosses carry sense numbering and grammar marks that read as noise
    on a subtitle card: '1) сразу [же]' -> 'сразу [же]'. A fragment that is only
    a mark (': {～な} (кн.)') carries no meaning at all and is dropped."""
    out: list[str] = []
    for gloss in glosses:
        gloss = re.sub(r"^\s*\d+\)\s*", "", gloss).strip()
        if not gloss or gloss.startswith(":"):
            continue
        gloss = gloss.split(";")[0].strip()
        if gloss and gloss not in out:
            out.append(gloss)
        if len(out) >= limit:
            break
    return out


def main() -> None:
    DATA.mkdir(exist_ok=True)
    with urllib.request.urlopen(RELEASE_API) as response:
        release = json.load(response)
    assets = {asset["name"]: asset["browser_download_url"] for asset in release["assets"]}

    entries: dict[str, dict] = collections.defaultdict(
        lambda: {"reading": None, "en": [], "ru": [], "common": False}
    )

    for lang in LANGS:
        name = next(n for n in assets if n.startswith(f"jmdict-{lang}-") and n.endswith(".json.tgz"))
        archive = download(assets[name], DATA / f"jmdict-{lang}.tgz")
        with tarfile.open(archive) as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith(".json"))
            words = json.load(tar.extractfile(member))["words"]
        column = COLUMN[lang]
        for word in words:
            kanji = [k["text"] for k in word.get("kanji", [])]
            kana = [k["text"] for k in word.get("kana", [])]
            common = any(k.get("common") for k in word.get("kanji", []) + word.get("kana", []))
            glosses: list[str] = []
            for sense in word.get("sense", []):
                for gloss in sense.get("gloss", []):
                    text = gloss.get("text", "").strip()
                    if text and text not in glosses:
                        glosses.append(text)
                if len(glosses) >= MAX_GLOSSES:
                    break
            if not glosses:
                continue
            # Every written form of an entry means the same thing, so the lemma
            # the analyser produces finds it whether it is kanji or kana.
            for form in set(kanji) | set(kana):
                entry = entries[form]
                if not entry[column]:
                    entry[column] = glosses[:MAX_GLOSSES]
                    entry["reading"] = entry["reading"] or (kana[0] if kana else None)
                    entry["common"] = entry["common"] or common
        print(f"  {lang}: {len(words)} entries")

    target = DATA / "jmdict-ja.sqlite"
    target.unlink(missing_ok=True)
    con = sqlite3.connect(target)
    con.execute("create table entry (form text primary key, reading text, en text, ru text, common int)")
    rows = []
    for form, entry in entries.items():
        en, ru = clean(entry["en"]), clean(entry["ru"])
        if not en and not ru:
            continue
        rows.append((form, entry["reading"], "; ".join(en) or None, "; ".join(ru) or None, int(entry["common"])))
    con.executemany("insert or ignore into entry values (?,?,?,?,?)", rows)
    con.commit()
    con.execute("vacuum")
    con.close()
    for lang in LANGS:
        (DATA / f"jmdict-{lang}.tgz").unlink(missing_ok=True)
    print(f"{len(rows)} forms → {target} ({round(target.stat().st_size / 1e6, 1)} MB)")


if __name__ == "__main__":
    main()
