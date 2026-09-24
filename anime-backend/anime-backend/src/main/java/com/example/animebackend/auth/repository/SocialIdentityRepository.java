package com.example.animebackend.auth.repository;

import com.example.animebackend.auth.entity.SocialIdentity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SocialIdentityRepository extends JpaRepository<SocialIdentity, Long> {

    Optional<SocialIdentity> findByProviderAndSubject(String provider, String subject);

    java.util.List<SocialIdentity> findByUserId(Long userId);
}
