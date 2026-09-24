package com.example.animebackend.study.repository;

import com.example.animebackend.study.entity.UserWord;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserWordRepository extends JpaRepository<UserWord, Long> {

    Optional<UserWord> findByUserIdAndLangAndLemma(Long userId, String lang, String lemma);

    List<UserWord> findByUserIdAndLangOrderByUpdatedAtDesc(Long userId, String lang);

    List<UserWord> findByUserIdAndLangAndLemmaIn(Long userId, String lang, Collection<String> lemmas);

    long countByUserIdAndLangAndStatus(Long userId, String lang, UserWord.Status status);

    /** Cards whose time has come, oldest first — the natural review order. */
    List<UserWord> findByUserIdAndLangAndDueAtLessThanEqualOrderByDueAtAsc(
            Long userId, String lang, java.time.Instant now);

    long countByUserIdAndLangAndDueAtLessThanEqual(Long userId, String lang, java.time.Instant now);
}
