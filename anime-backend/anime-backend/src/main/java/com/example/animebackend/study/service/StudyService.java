package com.example.animebackend.study.service;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.study.dto.StudyDtos;
import com.example.animebackend.study.entity.StudyPack;
import com.example.animebackend.study.entity.StudyWord;
import com.example.animebackend.study.entity.UserLanguage;
import com.example.animebackend.study.entity.UserWord;
import com.example.animebackend.study.repository.StudyPackRepository;
import com.example.animebackend.study.repository.StudyWordRepository;
import com.example.animebackend.study.repository.UserLanguageRepository;
import com.example.animebackend.study.repository.UserWordRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds and serves study packs, and keeps each learner's word list.
 *
 * <p>The split that makes this cheap: the pack (what words are in this episode)
 * is computed once and shared by everyone, while personalisation is a lookup of
 * the viewer's own lemmas — a set operation, not another analysis. Nothing here
 * calls a language model.
 */
@Service
public class StudyService {

    private static final Logger log = LoggerFactory.getLogger(StudyService.class);
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();
    private static final int MAX_WORDS = 400;

    private final StudyPackRepository packs;
    private final StudyWordRepository words;
    private final UserLanguageRepository languages;
    private final UserWordRepository userWords;
    private final LinguisticsClient linguistics;

    public StudyService(
            StudyPackRepository packs,
            StudyWordRepository words,
            UserLanguageRepository languages,
            UserWordRepository userWords,
            LinguisticsClient linguistics) {
        this.packs = packs;
        this.words = words;
        this.languages = languages;
        this.userWords = userWords;
        this.linguistics = linguistics;
    }

    /**
     * Returns the pack for this episode, analysing the supplied subtitle lines the
     * first time anyone asks. Concurrent viewers of the same episode race here; the
     * unique index decides the winner and the loser simply reads what was written.
     */
    @Transactional
    public StudyDtos.PackView buildOrGet(Long userId, StudyDtos.BuildRequest request) {
        String lang = normalizeLang(request.lang());
        StudyPack pack = packs
                .findByAnimeKeyAndEpisodeAndLang(request.animeKey(), request.episode(), lang)
                .orElse(null);

        if (pack == null) {
            List<String> lines = request.lines() == null ? List.of() : request.lines();
            if (lines.isEmpty()) {
                throw ApiException.badRequest("no_lines", "Send the subtitle lines to analyse.");
            }
            pack = analyse(request.animeKey(), request.episode(), lang, lines);
        }
        return view(userId, pack);
    }

    @Transactional(readOnly = true)
    public Optional<StudyDtos.PackView> find(Long userId, String animeKey, int episode, String lang) {
        return packs.findByAnimeKeyAndEpisodeAndLang(animeKey, episode, normalizeLang(lang))
                .map(pack -> view(userId, pack));
    }

    private StudyPack analyse(String animeKey, int episode, String lang, List<String> lines) {
        List<LinguisticsClient.Token> tokens = linguistics.analyze(lang, lines);
        if (tokens.isEmpty()) {
            throw ApiException.badRequest(
                    "analysis_unavailable", "Word analysis is not available for this language right now.");
        }

        // Collapse tokens to one row per lemma, keeping the first sighting as the
        // example sentence — that is what the word card shows.
        Map<String, StudyWord> byLemma = new HashMap<>();
        for (LinguisticsClient.Token token : tokens) {
            StudyWord existing = byLemma.get(token.lemma());
            if (existing == null) {
                byLemma.put(token.lemma(), StudyWord.builder()
                        .lemma(trim(token.lemma(), 120))
                        .surface(trim(token.surface(), 120))
                        .pos(trim(token.pos(), 24))
                        .zipf((float) token.zipf())
                        .level((short) token.level())
                        .occurrences(1)
                        .firstLine(token.line())
                        .sampleLine(trim(lines.get(Math.min(token.line(), lines.size() - 1)), 500))
                        .reading(trim(token.reading(), 120))
                        .glossEn(trim(token.glosses().get("en"), 400))
                        .glossRu(trim(token.glosses().get("ru"), 400))
                        .build());
            } else {
                existing.setOccurrences(existing.getOccurrences() + 1);
            }
        }

        String tokenJson;
        try {
            tokenJson = JSON.writeValueAsString(tokens.stream()
                    .map(t -> Map.of("l", t.line(), "s", t.surface(), "m", t.lemma()))
                    .toList());
        } catch (Exception e) {
            tokenJson = null; // highlighting degrades, the word list still works
        }

        StudyPack pack = StudyPack.builder()
                .animeKey(animeKey)
                .episode(episode)
                .lang(lang)
                .lineCount(lines.size())
                .wordCount(byLemma.size())
                .tokens(tokenJson)
                .build();

        try {
            pack = packs.saveAndFlush(pack);
        } catch (DataIntegrityViolationException race) {
            // Someone else finished first; their pack is just as good as ours.
            log.debug("Study pack race for {} ep{} {}", animeKey, episode, lang);
            return packs.findByAnimeKeyAndEpisodeAndLang(animeKey, episode, lang).orElseThrow();
        }

        List<StudyWord> rows = new ArrayList<>(byLemma.values());
        // Rarest first: those are the ones worth a learner's attention.
        rows.sort((a, b) -> Float.compare(a.getZipf(), b.getZipf()));
        if (rows.size() > MAX_WORDS) rows = rows.subList(0, MAX_WORDS);
        for (StudyWord row : rows) row.setPackId(pack.getId());
        words.saveAll(rows);
        pack.setWordCount(rows.size());
        log.info("Study pack built: {} ep{} {} → {} words", animeKey, episode, lang, rows.size());
        return pack;
    }

    private StudyDtos.PackView view(Long userId, StudyPack pack) {
        List<StudyWord> rows = words.findByPackIdOrderByLevelDescOccurrencesDesc(pack.getId());
        Map<String, UserWord.Status> mine = Map.of();
        int knownLevel = 1;
        if (userId != null) {
            List<String> lemmas = rows.stream().map(StudyWord::getLemma).toList();
            Map<String, UserWord.Status> states = new HashMap<>();
            for (UserWord word : userWords.findByUserIdAndLangAndLemmaIn(userId, pack.getLang(), lemmas)) {
                states.put(word.getLemma(), word.getStatus());
            }
            mine = states;
            knownLevel = languages.findByUserIdAndLang(userId, pack.getLang())
                    .map(UserLanguage::getLevel)
                    .orElse((short) 1);
        }

        // Meaning is shown in the language the viewer already speaks. That is the
        // one they registered as native; English is the fallback because JMdict's
        // English coverage is three times its Russian coverage.
        boolean russianGloss = userId != null && languages.findByUserIdAndRole(userId, UserLanguage.Role.NATIVE)
                .stream()
                .anyMatch(l -> "ru".equals(l.getLang()) || "uk".equals(l.getLang()));

        Map<String, UserWord.Status> finalMine = mine;
        List<StudyDtos.WordView> viewWords = rows.stream()
                .map(row -> new StudyDtos.WordView(
                        row.getLemma(),
                        row.getSurface(),
                        row.getPos(),
                        row.getZipf(),
                        row.getLevel(),
                        row.getOccurrences(),
                        row.getFirstLine(),
                        row.getSampleLine(),
                        row.getReading(),
                        russianGloss && row.getGlossRu() != null ? row.getGlossRu() : row.getGlossEn(),
                        Optional.ofNullable(finalMine.get(row.getLemma())).map(Enum::name).orElse(null)))
                .toList();

        return new StudyDtos.PackView(
                pack.getAnimeKey(),
                pack.getEpisode(),
                pack.getLang(),
                pack.getLineCount(),
                viewWords.size(),
                knownLevel,
                viewWords,
                pack.getTokens());
    }

    /* ───────────────────────── personal state ───────────────────────── */

    @Transactional(readOnly = true)
    public List<StudyDtos.LanguageView> languages(Long userId) {
        return languages.findByUserId(userId).stream()
                .map(row -> new StudyDtos.LanguageView(
                        row.getLang(),
                        row.getRole().name(),
                        row.getLevel(),
                        userWords.countByUserIdAndLangAndStatus(userId, row.getLang(), UserWord.Status.KNOWN),
                        userWords.countByUserIdAndLangAndStatus(userId, row.getLang(), UserWord.Status.LEARNING)))
                .toList();
    }

    @Transactional
    public StudyDtos.LanguageView setLanguage(Long userId, StudyDtos.LanguageRequest request) {
        String lang = normalizeLang(request.lang());
        UserLanguage.Role role;
        try {
            role = UserLanguage.Role.valueOf(request.role().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("bad_role", "Role must be LEARNING or NATIVE.");
        }
        UserLanguage row = languages.findByUserIdAndLang(userId, lang)
                .orElseGet(() -> UserLanguage.builder().userId(userId).lang(lang).role(role).build());
        row.setRole(role);
        row.setLevel((short) request.level());
        languages.save(row);
        return new StudyDtos.LanguageView(
                lang,
                role.name(),
                request.level(),
                userWords.countByUserIdAndLangAndStatus(userId, lang, UserWord.Status.KNOWN),
                userWords.countByUserIdAndLangAndStatus(userId, lang, UserWord.Status.LEARNING));
    }

    @Transactional
    public StudyDtos.UserWordView setWord(
            Long userId, String rawLang, String lemma, StudyDtos.WordRequest request) {
        String lang = normalizeLang(rawLang);
        UserWord.Status status;
        try {
            status = UserWord.Status.valueOf(request.status().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("bad_status", "Unknown word status.");
        }
        UserWord row = userWords.findByUserIdAndLangAndLemma(userId, lang, lemma)
                .orElseGet(() -> UserWord.builder()
                        .userId(userId)
                        .lang(lang)
                        .lemma(trim(lemma, 120))
                        .status(status)
                        .timesSeen(0)
                        .build());
        row.setStatus(status);
        row.setTimesSeen(row.getTimesSeen() + 1);
        if (row.getSurface() == null && request.surface() != null) {
            row.setSurface(trim(request.surface(), 120));
        }
        // The meaning travels with the word: the personal list must stay readable
        // even if the pack it came from is rebuilt or dropped.
        if (request.reading() != null) row.setReading(trim(request.reading(), 120));
        if (request.gloss() != null) row.setGloss(trim(request.gloss(), 400));
        if (request.note() != null) row.setNote(trim(request.note(), 500));
        // The context is only captured the first time, so re-marking a word later
        // does not overwrite the scene where the learner actually met it.
        if (row.getContextLine() == null && request.contextLine() != null) {
            row.setContextLine(trim(request.contextLine(), 500));
            row.setAnimeKey(trim(request.animeKey(), 120));
            row.setEpisode(request.episode());
            row.setTimeSec(request.timeSec());
        }
        // A word marked "learning" is due immediately — otherwise it would sit in
        // the dictionary forever without ever reaching a review session. Marking it
        // known or ignored takes it out of the queue.
        if (status == UserWord.Status.LEARNING) {
            if (row.getDueAt() == null) row.setDueAt(Instant.now());
        } else if (status == UserWord.Status.KNOWN || status == UserWord.Status.IGNORED) {
            row.setDueAt(null);
        }
        row.setUpdatedAt(Instant.now());
        return toView(userWords.save(row));
    }

    @Transactional(readOnly = true)
    public List<StudyDtos.UserWordView> myWords(Long userId, String lang) {
        return userWords.findByUserIdAndLangOrderByUpdatedAtDesc(userId, normalizeLang(lang)).stream()
                .map(StudyService::toView)
                .toList();
    }

    private static StudyDtos.UserWordView toView(UserWord row) {
        return new StudyDtos.UserWordView(
                row.getLang(),
                row.getLemma(),
                row.getSurface(),
                row.getReading(),
                row.getGloss(),
                row.getStatus().name(),
                row.getTimesSeen(),
                row.getNote(),
                row.getContextLine(),
                row.getAnimeKey(),
                row.getEpisode(),
                row.getTimeSec(),
                row.getUpdatedAt());
    }

    private static String normalizeLang(String lang) {
        String value = lang == null ? "" : lang.trim().toLowerCase(Locale.ROOT);
        if (value.length() < 2) throw ApiException.badRequest("bad_language", "Unknown language.");
        return value.substring(0, 2);
    }

    private static String trim(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
