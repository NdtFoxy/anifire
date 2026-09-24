package com.example.animebackend.study.repository;

import com.example.animebackend.study.entity.StudyPack;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudyPackRepository extends JpaRepository<StudyPack, Long> {

    Optional<StudyPack> findByAnimeKeyAndEpisodeAndLang(String animeKey, int episode, String lang);
}
