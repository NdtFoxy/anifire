package com.example.animebackend.study.repository;

import com.example.animebackend.study.entity.StudyWord;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudyWordRepository extends JpaRepository<StudyWord, Long> {

    List<StudyWord> findByPackIdOrderByLevelDescOccurrencesDesc(Long packId);
}
