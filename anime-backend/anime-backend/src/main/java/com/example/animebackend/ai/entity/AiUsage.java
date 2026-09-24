package com.example.animebackend.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import lombok.*;

/** One account's consumption of one AI feature on one UTC day. */
@Entity
@Table(name = "ai_usage")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiUsage {

    public enum Kind {
        /** A generated review of a title. */
        REVIEW,
        /** Subtitle translation; one unit per source line. */
        TRANSLATE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    /** Column is `usage_day`: `day` is a reserved word in both engines we run on. */
    @Column(name = "usage_day", nullable = false)
    private LocalDate day;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Kind kind;

    @Column(nullable = false)
    @Builder.Default
    private int units = 0;

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
