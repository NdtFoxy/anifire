package com.example.animebackend.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * One friendship edge per pair of users, in whichever direction it was asked.
 * The requester/addressee split is what lets a request be pending, accepted,
 * declined or turned into a block without a second row appearing for the reverse
 * direction (enforced by the LEAST/GREATEST unique index).
 */
@Entity
@Table(
        name = "friendships",
        indexes = {
            @Index(name = "ix_friendships_addressee", columnList = "addresseeId,status"),
            @Index(name = "ix_friendships_requester", columnList = "requesterId,status")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Friendship {

    public enum Status {
        PENDING,
        ACCEPTED,
        DECLINED,
        BLOCKED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long requesterId;

    @Column(nullable = false)
    private Long addresseeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant respondedAt;
}
