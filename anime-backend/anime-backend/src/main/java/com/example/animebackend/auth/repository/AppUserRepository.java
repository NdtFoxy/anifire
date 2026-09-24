package com.example.animebackend.auth.repository;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByEmailAndIsDeletedFalse(String email);

    boolean existsByEmailAndIsDeletedFalse(String email);

    long countByIsDeletedFalse();

    List<AppUser> findAllByIsDeletedFalseOrderByCreatedAtDesc();

    /* ── country attribution, used by the admin regions panel ── */

    long countBySignupCountry(String signupCountry);

    long countBySignupCountryAndCreatedAtAfter(String signupCountry, java.time.Instant since);

    long countBySignupCountryIsNotNull();

    long countBySignupCountryIsNull();

    java.util.Optional<AppUser> findTopBySignupCountryOrderByCreatedAtDesc(String signupCountry);

    /* ── admin directory search ──
       One query drives the list: free text matches the email, the display name or
       the id, and `commentText` narrows to people who wrote something containing
       it. Both are optional and null-safe, so the same statement serves an empty
       search as well as a fully-filtered one — no string concatenation, therefore
       no room for injection. */
    @Query("""
            select u from AppUser u
            where (:includeDeleted = true or u.isDeleted = false)
              and (:role is null or u.role = :role)
              and (:verified is null or u.emailVerified = :verified)
              and (cast(:query as string) is null
                   or lower(u.email) like lower(concat('%', cast(:query as string), '%'))
                   or lower(coalesce(u.displayName, '')) like lower(concat('%', cast(:query as string), '%'))
                   or cast(u.id as string) = cast(:query as string))
              and (cast(:commentText as string) is null
                   or exists (select 1 from Comment c
                              where c.creatorUserId = u.id
                                and c.isDeleted = false
                                and lower(c.description)
                                    like lower(concat('%', cast(:commentText as string), '%'))))
            """)
    Page<AppUser> search(
            @Param("query") String query,
            @Param("commentText") String commentText,
            @Param("role") Role role,
            @Param("verified") Boolean verified,
            @Param("includeDeleted") boolean includeDeleted,
            Pageable pageable);

    List<AppUser> findByLockedUntilAfter(java.time.Instant moment);

    List<AppUser> findByFailedAttemptsGreaterThanEqual(int attempts);
}
