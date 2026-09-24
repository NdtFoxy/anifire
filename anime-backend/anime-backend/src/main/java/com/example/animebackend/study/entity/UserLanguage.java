package com.example.animebackend.study.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** A language the viewer is learning, or the one they already speak. */
@Entity
@Table(name = "user_language",
        indexes = @Index(name = "ux_user_language", columnList = "userId,lang", unique = true))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserLanguage {

    public enum Role {
        LEARNING,
        NATIVE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 8)
    private String lang;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Role role;

    /** Words at or below this level are treated as already familiar. */
    @Builder.Default
    @Column(nullable = false)
    private short level = 1;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
