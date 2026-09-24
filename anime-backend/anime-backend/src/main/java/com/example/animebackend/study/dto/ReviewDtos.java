package com.example.animebackend.study.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;

/** Wire shapes for review sessions. */
public final class ReviewDtos {

    private ReviewDtos() {}

    /**
     * One card. The prompt is a real line from the episode with the word blanked
     * out — a sentence the learner has already heard in a voice they remember,
     * which is worth more than any generated example.
     */
    public record Card(
            String lemma,
            String surface,
            int level,
            String prompt,
            String answer,
            /** Kana reading of the answer, so the learner can say it out loud. */
            String reading,
            /** Dictionary meaning, revealed together with the answer. */
            String gloss,
            List<String> options,
            String animeKey,
            Integer episode,
            Integer timeSec,
            Instant dueAt,
            int reps) {}

    public record ReviewRequest(
            @NotBlank String lang,
            @NotBlank String lemma,
            /** 0 again · 1 hard · 2 good · 3 easy. */
            @Min(0) @Max(3) int grade,
            Integer elapsedMs) {}

    public record ReviewResult(String lemma, String status, Instant dueAt, float intervalDays) {}

    public record Stats(
            String lang,
            long total,
            long learning,
            long known,
            long dueNow,
            long reviewedToday,
            long reviewed7d,
            double accuracy7d,
            List<DayCount> activity) {}

    public record DayCount(String date, long count) {}
}
