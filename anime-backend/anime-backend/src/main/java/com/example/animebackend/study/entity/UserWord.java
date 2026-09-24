package com.example.animebackend.study.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * A word in someone's personal dictionary, with the line where they met it.
 *
 * <p>The context is the point: a lemma on its own is a flashcard, a lemma plus
 * "episode 3, 14:32, said by Frieren" is a memory. The timestamp lets the UI
 * jump straight back into the scene.
 */
@Entity
@Table(name = "user_word",
        indexes = {
            @Index(name = "ux_user_word_slot", columnList = "userId,lang,lemma", unique = true),
            @Index(name = "ix_user_word_status", columnList = "userId,lang,status")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserWord {

    public enum Status {
        NEW,
        LEARNING,
        KNOWN,
        IGNORED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 8)
    private String lang;

    @Column(nullable = false, length = 120)
    private String lemma;

    /** The inflected form the learner actually saw, for blanking it in a prompt. */
    @Column(length = 120)
    private String surface;

    /** Kana reading, kept next to the word so the list needs no dictionary. */
    @Column(length = 120)
    private String reading;

    /** The meaning as it was shown when the viewer saved the word. */
    @Column(length = 400)
    private String gloss;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Status status;

    @Builder.Default
    @Column(nullable = false)
    private int timesSeen = 1;

    @Column(length = 500)
    private String note;

    @Column(length = 500)
    private String contextLine;

    @Column(length = 120)
    private String animeKey;

    private Integer episode;

    private Integer timeSec;

    /* ── spaced repetition ── */

    /** When this word should be shown again; null means it is not scheduled. */
    private Instant dueAt;

    @Builder.Default
    @Column(nullable = false)
    private float intervalDays = 0f;

    /** SM-2 ease factor: how quickly the interval grows for this particular word. */
    @Builder.Default
    @Column(nullable = false)
    private float ease = 2.5f;

    @Builder.Default
    @Column(nullable = false)
    private int reps = 0;

    @Builder.Default
    @Column(nullable = false)
    private int lapses = 0;

    private Instant lastReviewAt;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
