# Linguistics sidecar

Turns subtitle lines into lemmas with a difficulty level, for the learning layer.

```
./.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8090
```

- `POST /analyze  {"lang":"ja|ru|uk|en","lines":["…"]}` → tokens with `lemma`, `pos`,
  `zipf` and a 1–6 `level` (comparable across languages).
- `GET  /health`

Japanese uses fugashi/UniDic (no spaces, real morphology), Russian and Ukrainian
use pymorphy3 (heavy inflection needs a lemmatiser, not a stemmer), English uses
frequency-checked suffix rules. Difficulty comes from `wordfreq`, whose corpora
include subtitles — the same register as the content.

Setup:

```
python3 -m venv .venv
./.venv/bin/pip install fastapi "uvicorn[standard]" fugashi unidic-lite \
    pymorphy3 pymorphy3-dicts-ru "wordfreq[mecab]"
```

The backend calls this only while building a study pack (once per episode and
language), never on a viewer request. If it is down, packs cannot be built and
the player simply shows no highlighting.

## Dictionary

`data/jmdict-ja.sqlite` (~59 MB, 464k written forms) maps a Japanese lemma to its
kana reading and up to three glosses in English and Russian. It is built, not
committed:

```
./.venv/bin/python build_dict.py
```

Source: JMdict via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified),
CC BY-SA 4.0, Electronic Dictionary Research and Development Group. Attribution
is required wherever the glosses are shown to users.

`/analyze` returns `reading` and `gloss: {en, ru}` per token when the dictionary
file is present; without it the service still returns lemmas and levels, and the
player simply shows a word card with no meaning. `GET /health` reports
`"dictionary": true|false`.
