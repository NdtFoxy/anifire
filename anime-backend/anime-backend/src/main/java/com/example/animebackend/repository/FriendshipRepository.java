package com.example.animebackend.repository;

import com.example.animebackend.entity.Friendship;
import com.example.animebackend.entity.Friendship.Status;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    /** The single edge between two users, whoever asked first. */
    @Query("""
            select f from Friendship f
            where (f.requesterId = :a and f.addresseeId = :b)
               or (f.requesterId = :b and f.addresseeId = :a)
            """)
    Optional<Friendship> findEdge(@Param("a") Long a, @Param("b") Long b);

    @Query("""
            select f from Friendship f
            where f.status = :status
              and (f.requesterId = :userId or f.addresseeId = :userId)
            order by f.respondedAt desc nulls last, f.createdAt desc
            """)
    List<Friendship> findAllForUser(@Param("userId") Long userId, @Param("status") Status status);

    List<Friendship> findByAddresseeIdAndStatusOrderByCreatedAtDesc(Long addresseeId, Status status);

    List<Friendship> findByRequesterIdAndStatusOrderByCreatedAtDesc(Long requesterId, Status status);

    long countByRequesterIdAndStatus(Long requesterId, Status status);

    @Query("select count(f) from Friendship f where f.status = com.example.animebackend.entity.Friendship$Status.ACCEPTED "
            + "and (f.requesterId = :userId or f.addresseeId = :userId)")
    long countAcceptedFor(@Param("userId") Long userId);
}
