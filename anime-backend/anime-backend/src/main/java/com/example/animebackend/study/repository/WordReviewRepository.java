package com.example.animebackend.study.repository;

import com.example.animebackend.study.entity.WordReview;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WordReviewRepository extends JpaRepository<WordReview, Long> {

    long countByUserIdAndLangAndReviewedAtAfter(Long userId, String lang, Instant since);

    long countByUserIdAndLangAndCorrectTrueAndReviewedAtAfter(Long userId, String lang, Instant since);

    /** [day, count] for the activity strip in the profile. */
    @Query("select function('to_char', r.reviewedAt, 'YYYY-MM-DD'), count(r) from WordReview r "
            + "where r.userId = :userId and r.lang = :lang and r.reviewedAt > :since "
            + "group by function('to_char', r.reviewedAt, 'YYYY-MM-DD') order by 1")
    List<Object[]> dailyCounts(
            @Param("userId") Long userId, @Param("lang") String lang, @Param("since") Instant since);
}
