"""
Linguistics sidecar: turns a subtitle line into lemmas with a difficulty rank.

Why a separate service instead of a JVM library: the four target languages need
genuinely different machinery — Japanese has no spaces and needs morphological
analysis, Russian and Ukrainian are heavily inflected and need a real lemmatiser
(a stemmer would turn "сделала" into "сдела" and no dictionary lookup would ever
match). The Python ecosystem has all of it, offline and free; wiring four
different Java libraries would be worse code for a worse result.

It is deliberately stateless and knows nothing about users, episodes or the
database: the backend calls it once per (episode, language) while building a
study pack, never on a user request path.
"""

from __future__ import annotations

import pathlib
import re
import sqlite3
from functools import lru_cache
from typing import Iterable

from fastapi import FastAPI
from pydantic import BaseModel, Field
from wordfreq import zipf_frequency

app = FastAPI(title="Anifire linguistics", version="1.0")

SUPPORTED = ("ja", "ru", "uk", "en")

# Parts of speech that carry meaning worth learning. Particles, punctuation and
# auxiliaries are filtered out — nobody needs "は" or "и" in their flashcards.
JA_CONTENT = {"名詞", "動詞", "形容詞", "副詞", "形状詞"}
RU_CONTENT = {"NOUN", "VERB", "INFN", "ADJF", "ADJS", "ADVB", "PRTF", "PRTS", "GRND", "NUMR"}
EN_STOP = {
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "for",
    "with", "is", "am", "are", "was", "were", "be", "been", "being", "do", "does",
    "did", "have", "has", "had", "i", "you", "he", "she", "it", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "this",
    "that", "these", "those", "not", "no", "yes", "so", "as", "by", "from", "up",
    "out", "down", "just", "now", "then", "there", "here", "what", "who", "how",
    "why", "when", "where", "will", "would", "can", "could", "should", "s", "t",
}

# Subtitles carry markup and speaker labels that are not language.
CLEAN = re.compile(r"<[^>]+>|\{[^}]*\}|\[[^\]]*\]|♪|→|＜|＞")
WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)


class AnalyzeRequest(BaseModel):
    lang: str = Field(..., description="ja | ru | uk | en")
    lines: list[str] = Field(default_factory=list, max_length=5000)


class Token(BaseModel):
    surface: str
    lemma: str
    pos: str
    """Zipf frequency, 7 = as common as "the", 1 = vanishingly rare."""
    zipf: float
    """1 (easiest) … 6 (hardest); derived from zipf so it is stable across languages."""
    level: int
    line: int
    """Dictionary glosses, keyed by target language ("en", "ru"). Japanese only
    for now: JMdict is the one open dictionary with the coverage this needs."""
    gloss: dict[str, str] = Field(default_factory=dict)
    """Kana reading, so a learner can pronounce a word written in kanji."""
    reading: str | None = None


class AnalyzeResponse(BaseModel):
    lang: str
    tokens: list[Token]


@lru_cache(maxsize=1)
def japanese():
    import fugashi

    return fugashi.Tagger()


@lru_cache(maxsize=1)
def slavic():
    import pymorphy3

    return pymorphy3.MorphAnalyzer()


@lru_cache(maxsize=200_000)
def difficulty(lemma: str, lang: str) -> tuple[float, int]:
    """
    Zipf frequency and a 1–6 band.

    Bands are cut on the Zipf scale rather than on a per-language list, so "hard"
    means the same thing in Japanese and in Russian: level 1 is everyday speech,
    level 6 is a word a native speaker meets a few times a year.
    """
    zipf = zipf_frequency(lemma, lang)
    if zipf >= 5.0:
        level = 1
    elif zipf >= 4.3:
        level = 2
    elif zipf >= 3.6:
        level = 3
    elif zipf >= 3.0:
        level = 4
    elif zipf >= 2.0:
        level = 5
    else:
        level = 6
    return zipf, level


def clean(text: str) -> str:
    return CLEAN.sub(" ", text).replace("\u3000", " ").strip()


def analyze_japanese(lines: Iterable[str]) -> list[Token]:
    tagger = japanese()
    out: list[Token] = []
    for index, raw in enumerate(lines):
        for word in tagger(clean(raw)):
            pos = word.feature.pos1 or ""
            if pos not in JA_CONTENT:
                continue
            lemma = word.feature.lemma or word.surface
            # UniDic writes lemmas as 見付ける-見つける for spelling variants.
            lemma = lemma.split("-")[0]
            if len(lemma) < 1 or lemma.isdigit():
                continue
            zipf, level = difficulty(lemma, "ja")
            out.append(Token(surface=word.surface, lemma=lemma, pos=pos, zipf=zipf, level=level, line=index))
    return out


def analyze_slavic(lines: Iterable[str], lang: str) -> list[Token]:
    morph = slavic()
    out: list[Token] = []
    for index, raw in enumerate(lines):
        for match in WORD_RE.finditer(clean(raw)):
            surface = match.group()
            if len(surface) < 2:
                continue
            parsed = morph.parse(surface)[0]
            pos = str(parsed.tag.POS or "")
            if pos not in RU_CONTENT:
                continue
            lemma = parsed.normal_form
            zipf, level = difficulty(lemma, lang)
            out.append(Token(surface=surface, lemma=lemma, pos=pos, zipf=zipf, level=level, line=index))
    return out


def analyze_english(lines: Iterable[str]) -> list[Token]:
    out: list[Token] = []
    for index, raw in enumerate(lines):
        for match in WORD_RE.finditer(clean(raw).lower()):
            surface = match.group()
            if len(surface) < 3 or surface in EN_STOP:
                continue
            # English inflection is shallow enough that these rules beat shipping
            # a 50 MB model; anything they miss still ranks correctly by frequency.
            lemma = surface
            for suffix, replacement in (("ies", "y"), ("sses", "ss"), ("ing", ""), ("ed", ""), ("s", "")):
                if surface.endswith(suffix) and len(surface) - len(suffix) >= 3:
                    candidate = surface[: len(surface) - len(suffix)] + replacement
                    if zipf_frequency(candidate, "en") >= zipf_frequency(surface, "en"):
                        lemma = candidate
                    break
            zipf, level = difficulty(lemma, "en")
            out.append(Token(surface=surface, lemma=lemma, pos="WORD", zipf=zipf, level=level, line=index))
    return out


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "languages": list(SUPPORTED), "dictionary": dictionary() is not None}


@lru_cache(maxsize=1)
def dictionary() -> "sqlite3.Connection | None":
    """JMdict as a read-only database rather than a dict in memory: 460k forms
    are 60 MB on disk and a few kilobytes of page cache per lookup."""
    path = pathlib.Path(__file__).parent / "data" / "jmdict-ja.sqlite"
    if not path.exists():
        return None
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    con.execute("pragma query_only = true")
    return con


def attach_glosses(tokens: list[Token]) -> None:
    """One lookup per distinct lemma, not per occurrence: a common word shows up
    dozens of times in an episode and the answer never changes."""
    con = dictionary()
    if con is None:
        return
    forms = {t.lemma for t in tokens} | {t.surface for t in tokens}
    if not forms:
        return
    found = {}
    rows = con.execute(
        f"select form, reading, en, ru from entry where form in ({','.join('?' * len(forms))})",
        tuple(forms),
    )
    for form, reading, en, ru in rows:
        found[form] = (reading, en, ru)
    for token in tokens:
        hit = found.get(token.lemma) or found.get(token.surface)
        if not hit:
            continue
        reading, en, ru = hit
        token.reading = reading
        token.gloss = {k: v for k, v in (("en", en), ("ru", ru)) if v}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    lang = request.lang.lower()[:2]
    if lang == "ja":
        tokens = analyze_japanese(request.lines)
        attach_glosses(tokens)
    elif lang in ("ru", "uk"):
        tokens = analyze_slavic(request.lines, lang)
    elif lang == "en":
        tokens = analyze_english(request.lines)
    else:
        tokens = []
    return AnalyzeResponse(lang=lang, tokens=tokens)
