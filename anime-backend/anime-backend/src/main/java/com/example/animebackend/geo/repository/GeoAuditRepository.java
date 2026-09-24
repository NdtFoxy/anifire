package com.example.animebackend.geo.repository;

import com.example.animebackend.geo.entity.GeoAudit;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GeoAuditRepository extends JpaRepository<GeoAudit, Long> {

    List<GeoAudit> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
