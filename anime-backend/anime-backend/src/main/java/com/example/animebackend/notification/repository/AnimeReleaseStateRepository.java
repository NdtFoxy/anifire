package com.example.animebackend.notification.repository;

import com.example.animebackend.notification.entity.AnimeReleaseState;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnimeReleaseStateRepository extends JpaRepository<AnimeReleaseState, Long> {
}
