package com.example.animebackend.study.repository;

import com.example.animebackend.study.entity.UserLanguage;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserLanguageRepository extends JpaRepository<UserLanguage, Long> {

    List<UserLanguage> findByUserId(Long userId);

    Optional<UserLanguage> findByUserIdAndLang(Long userId, String lang);

    /** The languages the viewer already speaks — used to pick a gloss language. */
    List<UserLanguage> findByUserIdAndRole(Long userId, UserLanguage.Role role);
}
