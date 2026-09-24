package com.example.animebackend.study.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * One lemma in a pack, with its difficulty.
 *
 * <p>Only the first occurrence is stored. The player already holds every cue, so
 * the remaining timestamps can be found client-side by matching the lemma's
 * surface forms — persisting them would multiply the table for no new information.
 */
@Entity
@Table(name = "study_word",
        indexes = {
            @Index(name = "ux_study_word_slot", columnList = "packId,lemma", unique = true),
            @Index(name = "ix_study_word_level", columnList = "packId,level")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudyWord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long packId;

    @Column(nullable = false, length = 120)
    private String lemma;

    @Column(length = 120)
    private String surface;

    @Column(length = 24)
    private String pos;

    /** Zipf frequency: 7 is "the", 1 is a word seen a few times a year. */
    @Column(nullable = false)
    private float zipf;

    /** 1 (everyday) … 6 (rare), derived from zipf so it means the same in any language. */
    @Column(nullable = false)
    private short level;

    /** Kana reading, so a learner can pronounce a word written in kanji. */
    @Column(length = 120)
    private String reading;

    /** Dictionary meaning, one column per interface language. */
    @Column(length = 400)
    private String glossEn;

    @Column(length = 400)
    private String glossRu;

    @Column(nullable = false)
    private int occurrences;

    @Column(nullable = false)
    private int firstLine;

    @Column(length = 500)
    private String sampleLine;
}
