package com.example.animebackend.repository;

import com.example.animebackend.entity.Comment;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    List<Comment> findAllByAnimeIdAndIsDeletedFalseOrderByCreationDateDesc(Long animeId);

    Optional<Comment> findByIdAndIsDeletedFalse(Long id);

    long countByIsDeletedFalse();

    /**
     * Newest-first comments authored by one user. The anime is fetch-joined so the
     * title is available without relying on the session staying open.
     */
    @Query(
            "select c from Comment c join fetch c.anime "
                    + "where c.creatorUserId = :userId and c.isDeleted = false "
                    + "order by c.creationDate desc")
    List<Comment> findByCreatorUserIdAndIsDeletedFalseOrderByCreationDateDesc(
            @Param("userId") Long userId, Pageable pageable);

    /* ── admin directory ── */

    long countByCreatorUserIdAndIsDeletedFalse(Long creatorUserId);

    /** [userId, count] for a page of users — one query instead of N. */
    @Query("select c.creatorUserId, count(c) from Comment c "
            + "where c.creatorUserId in :userIds and c.isDeleted = false group by c.creatorUserId")
    List<Object[]> countByCreators(@Param("userIds") Collection<Long> userIds);

    /* ── abuse signals ── */

    /** [userId, count] for accounts posting faster than a person reads. */
    @Query("select c.creatorUserId, count(c) from Comment c "
            + "where c.isDeleted = false and c.creationDate > :since and c.creatorUserId is not null "
            + "group by c.creatorUserId having count(c) >= :threshold")
    List<Object[]> floodAuthors(
            @Param("since") java.time.LocalDateTime since, @Param("threshold") long threshold);

    /** [text, occurrences, distinctAuthors] for text repeated across the site. */
    @Query("select c.description, count(c), count(distinct c.creatorUserId) from Comment c "
            + "where c.isDeleted = false group by c.description having count(c) >= :minimum")
    List<Object[]> duplicateTexts(@Param("minimum") long minimum);
}
