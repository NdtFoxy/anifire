package com.example.animebackend.study.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import lombok.*;

/**
 * Vocabulary extracted from one subtitle track.
 *
 * <p>Shared by every viewer of that episode in that language: the words in a
 * scene do not depend on who is watching. Personalisation happens later, by
 * subtracting what the individual already knows.
 */
@Entity
@Table(name = "study_pack",
        indexes = @Index(name = "ux_study_pack_slot", columnList = "animeKey,episode,lang", unique = true))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudyPack {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String animeKey;

    @Column(nullable = false)
    private int episode;

    @Column(nullable = false, length = 8)
    private String lang;

    @Column(nullable = false)
    private int lineCount;

    @Column(nullable = false)
    private int wordCount;

    /**
     * `[{"l":lineIndex,"s":"surface","m":"lemma"}]` — everything the client needs
     * to highlight without re-running morphology in the browser.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String tokens;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
