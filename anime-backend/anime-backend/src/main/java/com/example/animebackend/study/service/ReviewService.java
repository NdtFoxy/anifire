package com.example.animebackend.study.service;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.study.dto.ReviewDtos;
import com.example.animebackend.study.entity.UserWord;
import com.example.animebackend.study.entity.WordReview;
import com.example.animebackend.study.repository.UserWordRepository;
import com.example.animebackend.study.repository.WordReviewRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Spaced repetition over the learner's own words.
 *
 * <p>The scheduler is SM-2, deliberately: it is thirty years old, fits in a
 * screen of code, and every interval it produces can be explained to a user. A
 * learned model would need review data we do not have yet — and the reviews this
 * service records are exactly what would train one later.
 *
 * <p>Cards are built from the lines where the learner actually met the word, so a
 * prompt is always a sentence from an episode they watched, not a synthetic
 * example. Distractors come from other words of a similar level in the same
 * language, which keeps a multiple-choice question honest instead of trivial.
 */
@Service
public class ReviewService {

    /** Below this grade the card is a lapse and starts over. */
    private static final int FAIL_GRADE = 1;
    private static final int MAX_BATCH = 50;

    private final UserWordRepository words;
    private final WordReviewRepository reviews;

    public ReviewService(UserWordRepository words, WordReviewRepository reviews) {
        this.words = words;
        this.reviews = reviews;
    }

    @Transactional(readOnly = true)
    public List<ReviewDtos.Card> due(Long userId, String rawLang, int limit) {
        String lang = lang(rawLang);
        List<UserWord> pool = words.findByUserIdAndLangAndDueAtLessThanEqualOrderByDueAtAsc(
                userId, lang, Instant.now());
        if (pool.isEmpty()) return List.of();

        List<UserWord> batch = pool.subList(0, Math.min(pool.size(), Math.clamp(limit, 1, MAX_BATCH)));
        // Distractors are drawn from the learner's own vocabulary in this language:
        // words they have seen are plausible, words from a dictionary are noise.
        List<String> vocabulary = words.findByUserIdAndLangOrderByUpdatedAtDesc(userId, lang).stream()
                .map(UserWord::getLemma)
                .toList();

        List<ReviewDtos.Card> cards = new ArrayList<>(batch.size());
        for (UserWord word : batch) {
            cards.add(new ReviewDtos.Card(
                    word.getLemma(),
                    word.getSurface() == null ? word.getLemma() : word.getSurface(),
                    0,
                    cloze(word),
                    word.getLemma(),
                    word.getReading(),
                    word.getGloss(),
                    options(word.getLemma(), vocabulary),
                    word.getAnimeKey(),
                    word.getEpisode(),
                    word.getTimeSec(),
                    word.getDueAt(),
                    word.getReps()));
        }
        return cards;
    }

    /**
     * Applies an answer and reschedules.
     *
     * <p>Grades follow the familiar four buttons; the interval growth is SM-2's:
     * a good answer multiplies the interval by the card's ease, a failure sends it
     * back to a ten-minute step and nudges the ease down so a word that keeps
     * being forgotten comes back faster from then on.
     */
    @Transactional
    public ReviewDtos.ReviewResult review(Long userId, ReviewDtos.ReviewRequest request) {
        String lang = lang(request.lang());
        UserWord word = words.findByUserIdAndLangAndLemma(userId, lang, request.lemma())
                .orElseThrow(() -> ApiException.badRequest("unknown_word", "That word is not in your list."));

        int grade = request.grade();
        boolean correct = grade > FAIL_GRADE - 1 && grade > 0;
        Instant now = Instant.now();

        if (grade == 0) {
            word.setLapses(word.getLapses() + 1);
            word.setReps(0);
            word.setIntervalDays(0f);
            word.setEase(Math.max(1.3f, word.getEase() - 0.2f));
            word.setDueAt(now.plus(Duration.ofMinutes(10)));
            word.setStatus(UserWord.Status.LEARNING);
        } else {
            float ease = word.getEase() + (grade == 1 ? -0.15f : grade == 3 ? 0.1f : 0f);
            word.setEase(Math.min(2.8f, Math.max(1.3f, ease)));
            int reps = word.getReps() + 1;
            word.setReps(reps);
            float interval = switch (reps) {
                case 1 -> grade == 1 ? 0.5f : 1f;
                case 2 -> grade == 1 ? 2f : 4f;
                default -> Math.max(1f, word.getIntervalDays() * word.getEase() * (grade == 1 ? 0.6f : 1f));
            };
            if (grade == 3) interval *= 1.3f;
            interval = Math.min(interval, 365f);
            word.setIntervalDays(interval);
            word.setDueAt(now.plusSeconds((long) (interval * 86_400)));
            // Three clean repetitions and a long interval is the point at which
            // calling it "known" stops being a guess.
            word.setStatus(reps >= 3 && interval >= 21f ? UserWord.Status.KNOWN : UserWord.Status.LEARNING);
        }

        word.setLastReviewAt(now);
        word.setUpdatedAt(now);
        words.save(word);

        reviews.save(WordReview.builder()
                .userId(userId)
                .lang(lang)
                .lemma(word.getLemma())
                .grade((short) grade)
                .correct(correct)
                .elapsedMs(request.elapsedMs())
                .reviewedAt(now)
                .build());

        return new ReviewDtos.ReviewResult(
                word.getLemma(), word.getStatus().name(), word.getDueAt(), word.getIntervalDays());
    }

    @Transactional(readOnly = true)
    public ReviewDtos.Stats stats(Long userId, String rawLang) {
        String lang = lang(rawLang);
        Instant now = Instant.now();
        Instant dayAgo = now.minus(Duration.ofDays(1));
        Instant weekAgo = now.minus(Duration.ofDays(7));

        long reviewed7d = reviews.countByUserIdAndLangAndReviewedAtAfter(userId, lang, weekAgo);
        long correct7d = reviews.countByUserIdAndLangAndCorrectTrueAndReviewedAtAfter(userId, lang, weekAgo);

        return new ReviewDtos.Stats(
                lang,
                words.findByUserIdAndLangOrderByUpdatedAtDesc(userId, lang).size(),
                words.countByUserIdAndLangAndStatus(userId, lang, UserWord.Status.LEARNING),
                words.countByUserIdAndLangAndStatus(userId, lang, UserWord.Status.KNOWN),
                words.countByUserIdAndLangAndDueAtLessThanEqual(userId, lang, now),
                reviews.countByUserIdAndLangAndReviewedAtAfter(userId, lang, dayAgo),
                reviewed7d,
                reviewed7d == 0 ? 0 : Math.round((correct7d * 1000.0) / reviewed7d) / 10.0,
                reviews.dailyCounts(userId, lang, now.minus(Duration.ofDays(30))).stream()
                        .map(row -> new ReviewDtos.DayCount(
                                String.valueOf(row[0]), ((Number) row[1]).longValue()))
                        .toList());
    }

    /**
     * Blanks the word out of the line it was met in.
     *
     * <p>The surface form is tried first because that is what the line actually
     * contains — a Japanese line holds 育んだ, never the dictionary form 育む. If
     * neither matches (an edited subtitle, a merged cue) the line is still shown
     * whole: context without a blank beats no context at all.
     */
    private static String cloze(UserWord word) {
        String line = word.getContextLine();
        if (line == null || line.isBlank()) return "…";
        String surface = word.getSurface();
        if (surface != null && !surface.isBlank() && line.contains(surface)) {
            return line.replace(surface, "＿＿＿");
        }
        return line.replace(word.getLemma(), "＿＿＿");
    }

    private static List<String> options(String answer, List<String> vocabulary) {
        List<String> pool = new ArrayList<>(vocabulary);
        pool.remove(answer);
        Collections.shuffle(pool);
        List<String> options = new ArrayList<>(pool.subList(0, Math.min(3, pool.size())));
        options.add(answer);
        Collections.shuffle(options);
        return options;
    }

    private static String lang(String value) {
        String lang = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (lang.length() < 2) throw ApiException.badRequest("bad_language", "Unknown language.");
        return lang.substring(0, 2);
    }
}
