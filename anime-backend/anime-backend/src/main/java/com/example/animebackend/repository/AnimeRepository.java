package com.example.animebackend.repository;

import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Category;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface AnimeRepository extends JpaRepository<Anime, Long>, JpaSpecificationExecutor<Anime> {

    List<Anime> findAllByIsDeletedFalse();

    Optional<Anime> findByIdAndIsDeletedFalse(Long id);

    Optional<Anime> findFirstByTitleContainingIgnoreCaseAndIsDeletedFalse(String title);

    boolean existsByMalIdAndIsDeletedFalse(Long malId);

    List<Anime> findByCategoriesContains(Category category);

    /** Titles the enrichment backfill still has to visit. */
    @Query("select a.id from Anime a where a.isDeleted = false and a.malId is not null and a.enrichedAt is null order by a.id")
    List<Long> findIdsNeedingEnrichment();
}
