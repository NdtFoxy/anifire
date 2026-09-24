package com.example.animebackend.notification.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** Episode count last seen at the video source for a bookmarked title. */
@Entity
@Table(name = "anime_release_state")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AnimeReleaseState {

    @Id
    private Long animeId;

    @Column(nullable = false)
    private int publishedEpisodes;

    @Column(nullable = false)
    private Instant checkedAt;
}
