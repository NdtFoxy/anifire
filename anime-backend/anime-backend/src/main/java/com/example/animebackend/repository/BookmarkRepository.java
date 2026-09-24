package com.example.animebackend.repository;

import com.example.animebackend.entity.Bookmark;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BookmarkRepository extends JpaRepository<Bookmark, Long> {

    List<Bookmark> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<Bookmark> findByUserIdAndAnimeId(Long userId, Long animeId);

    boolean existsByUserIdAndAnimeId(Long userId, Long animeId);

    long countByUserId(Long userId);

    /** Titles someone is waiting on: the only ones worth polling for new episodes. */
    @Query("select distinct b.animeId from Bookmark b")
    List<Long> findBookmarkedAnimeIds();

    List<Bookmark> findByAnimeId(Long animeId);
}
