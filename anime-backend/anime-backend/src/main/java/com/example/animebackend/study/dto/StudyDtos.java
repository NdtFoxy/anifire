package com.example.animebackend.study.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Wire shapes for the learning layer. */
public final class StudyDtos {

    private StudyDtos() {}

    /** Subtitle lines the client already parsed, sent once so the server can analyse them. */
    public record BuildRequest(
            @NotBlank @Size(max = 120) String animeKey,
            @Min(0) @Max(10_000) int episode,
            @NotBlank @Size(max = 8) String lang,
            @Size(max = 5000) List<@Size(max = 500) String> lines) {}

    public record WordView(
            String lemma,
            String surface,
            String pos,
            double zipf,
            int level,
            int occurrences,
            int firstLine,
            String sampleLine,
            /** Kana reading; null outside Japanese. */
            String reading,
            /** Dictionary meaning in the viewer's interface language, when known. */
            String gloss,
            /** The viewer's own status, or null when they have never touched it. */
            String status) {}

    public record PackView(
            String animeKey,
            int episode,
            String lang,
            int lineCount,
            int wordCount,
            /** Level at or below which the viewer is assumed to know the word. */
            int knownLevel,
            List<WordView> words,
            /** Raw `[{l,s,m}]` token JSON for highlighting; null if analysis was partial. */
            String tokens) {}

    public record LanguageView(String lang, String role, int level, long known, long learning) {}

    public record LanguageRequest(
            @NotBlank @Size(max = 8) String lang,
            @NotBlank String role,
            @Min(1) @Max(6) int level) {}

    public record WordRequest(
            @NotBlank String status,
            @Size(max = 120) String surface,
            @Size(max = 120) String reading,
            @Size(max = 400) String gloss,
            @Size(max = 500) String note,
            @Size(max = 500) String contextLine,
            @Size(max = 120) String animeKey,
            Integer episode,
            Integer timeSec) {}

    public record UserWordView(
            String lang,
            String lemma,
            String surface,
            String reading,
            String gloss,
            String status,
            int timesSeen,
            String note,
            String contextLine,
            String animeKey,
            Integer episode,
            Integer timeSec,
            Instant updatedAt) {}
}
