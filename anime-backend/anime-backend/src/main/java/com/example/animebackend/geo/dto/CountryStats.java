package com.example.animebackend.geo.dto;

import java.time.Instant;
import java.util.List;

/**
 * What an operator needs before deciding a country's fate: how many people are
 * there, how fast it is growing, and what they are doing right now.
 *
 * @param signups        registrations in the last day / 7 days / 30 days / ever
 * @param watchingNow    distinct viewers whose last playback event is very recent
 * @param views          views in the last day / 7 days / 30 days / ever
 * @param topTitles      most watched titles from this country
 * @param refusedRequests requests already turned away by the fence since restart
 * @param lastSignupAt   newest registration, or null when nobody signed up yet
 */
public record CountryStats(
        String country,
        boolean blocked,
        Buckets signups,
        long watchingNow,
        Buckets views,
        List<TitleCount> topTitles,
        List<RatedTitle> topRated,
        Double averageScore,
        String period,
        long refusedRequests,
        Instant lastSignupAt,
        long attributedUsers,
        long unattributedUsers) {

    public record Buckets(long day, long week, long month, long total) {}

    public record TitleCount(String title, long views) {}

    /** Best-scored titles in this country, with how many people voted. */
    public record RatedTitle(Long animeId, String title, double average, long votes) {}
}
