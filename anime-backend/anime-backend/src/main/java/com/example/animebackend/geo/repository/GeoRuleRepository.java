package com.example.animebackend.geo.repository;

import com.example.animebackend.geo.entity.GeoRule;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GeoRuleRepository extends JpaRepository<GeoRule, String> {

    List<GeoRule> findByBlockedTrue();
}
