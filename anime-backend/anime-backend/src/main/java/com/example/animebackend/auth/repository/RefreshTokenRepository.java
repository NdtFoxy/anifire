package com.example.animebackend.auth.repository;

import com.example.animebackend.auth.entity.RefreshToken;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Modifying
    @Query("update RefreshToken t set t.revoked = true where t.familyId = :familyId and t.revoked = false")
    void revokeFamily(@Param("familyId") String familyId);

    @Modifying
    @Query("update RefreshToken t set t.revoked = true where t.userId = :userId and t.revoked = false")
    void revokeAllForUser(@Param("userId") Long userId);

    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);

    /* ── admin directory ── */

    long countByUserIdAndRevokedFalseAndExpiresAtAfter(Long userId, Instant now);

    List<RefreshToken> findTop5ByUserIdAndRevokedFalseOrderByCreatedAtDesc(Long userId);

    /** [userId, liveSessions] for accounts with an unusual number of sessions. */
    @Query("select t.userId, count(t) from RefreshToken t "
            + "where t.revoked = false and t.expiresAt > :now "
            + "group by t.userId having count(t) >= :threshold")
    List<Object[]> manySessions(@Param("now") Instant now, @Param("threshold") long threshold);
}
