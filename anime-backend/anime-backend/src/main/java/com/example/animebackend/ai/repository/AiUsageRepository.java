package com.example.animebackend.ai.repository;

import com.example.animebackend.ai.entity.AiUsage;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AiUsageRepository extends JpaRepository<AiUsage, Long> {

    /**
     * Locks the slot for the duration of the transaction, so two requests from the
     * same account cannot both read "19 used" and both decide there is room.
     */
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from AiUsage u where u.userId = :userId and u.day = :day and u.kind = :kind")
    Optional<AiUsage> lockSlot(
            @Param("userId") Long userId, @Param("day") LocalDate day, @Param("kind") AiUsage.Kind kind);

    List<AiUsage> findByUserIdAndDay(Long userId, LocalDate day);

    /** Housekeeping: yesterday's rows answer no question anyone asks. */
    @Modifying
    @Query("delete from AiUsage u where u.day < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDate cutoff);
}
