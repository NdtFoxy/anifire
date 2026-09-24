package com.example.animebackend.study.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * One answer in a review session.
 *
 * <p>Append-only: the schedule on {@link UserWord} is the current state, this is
 * the history behind it. Keeping both means a learner can be shown "you reviewed
 * 40 words this week" without recomputing anything, and a future scheduler can
 * be trained on real answers instead of guesses.
 */
@Entity
@Table(name = "word_review",
        indexes = @Index(name = "ix_word_review_recent", columnList = "userId,lang,reviewedAt"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 8)
    private String lang;

    @Column(nullable = false, length = 120)
    private String lemma;

    /** 0 again · 1 hard · 2 good · 3 easy. */
    @Column(nullable = false)
    private short grade;

    @Column(nullable = false)
    private boolean correct;

    private Integer elapsedMs;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant reviewedAt = Instant.now();
}
