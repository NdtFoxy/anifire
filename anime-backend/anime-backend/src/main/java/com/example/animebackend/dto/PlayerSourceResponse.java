package com.example.animebackend.dto;

import com.example.animebackend.ads.dto.AdDtos;
import java.util.List;

public record PlayerSourceResponse(
        String key,
        String selfHref,
        String title,
        String subtitle,
        String episodeLabel,
        String episodeTitle,
        String src,
        List<QualityResponse> qualities,
        String poster,
        List<SubtitleTrackResponse> tracks,
        List<ChapterResponse> chapters,
        String prevHref,
        String nextHref,
        String backHref,
        String provider,
        /**
         * Pre-roll plan, decided server-side. {@code null} for an entitled viewer —
         * the client never decides whether an ad airs, it only obeys this field.
         */
        AdDtos.AdPlan adPlan) {

    /** Same payload with a plan attached; keeps the source builder ad-unaware. */
    public PlayerSourceResponse withAdPlan(AdDtos.AdPlan plan) {
        return new PlayerSourceResponse(
                key, selfHref, title, subtitle, episodeLabel, episodeTitle, src, qualities, poster,
                tracks, chapters, prevHref, nextHref, backHref, provider, plan);
    }

    public record SubtitleTrackResponse(
            String id,
            String label,
            String lang,
            List<CueResponse> cues) {
    }

    public record QualityResponse(
            String label,
            int height,
            String src) {
    }

    public record CueResponse(
            double start,
            double end,
            String text) {
    }

    public record ChapterResponse(
            double start,
            double end,
            String kind,
            String label) {
    }
}
