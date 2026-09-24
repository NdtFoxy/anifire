package com.example.animebackend.auth.web;

import com.example.animebackend.auth.dto.MyCommentDto;
import com.example.animebackend.auth.dto.ProfileDto;
import com.example.animebackend.auth.dto.ProfileUpdateRequest;
import com.example.animebackend.auth.dto.WatchActivityDto;
import com.example.animebackend.auth.service.ProfileImageService;
import com.example.animebackend.auth.service.ProfileService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Profile and personal feeds of the signed-in user. JWT subject carries the user id. */
@RestController
@RequestMapping("/api/v1/auth/me")
public class ProfileController {

    private final ProfileService profiles;
    private final ProfileImageService images;

    public ProfileController(ProfileService profiles, ProfileImageService images) {
        this.profiles = profiles;
        this.images = images;
    }

    @GetMapping("/profile")
    public ProfileDto get(@AuthenticationPrincipal Jwt jwt) {
        return profiles.get(Long.valueOf(jwt.getSubject()));
    }

    @PutMapping("/profile")
    public ProfileDto update(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileUpdateRequest body) {
        return profiles.update(Long.valueOf(jwt.getSubject()), body);
    }

    @PostMapping("/profile/randomize")
    public ProfileDto randomize(@AuthenticationPrincipal Jwt jwt) {
        return profiles.randomize(Long.valueOf(jwt.getSubject()));
    }

    @PostMapping("/profile/avatar")
    public ProfileDto uploadAvatar(
            @AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file) {
        return images.store(Long.valueOf(jwt.getSubject()), "avatar", file);
    }

    @PostMapping("/profile/banner")
    public ProfileDto uploadBanner(
            @AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file) {
        return images.store(Long.valueOf(jwt.getSubject()), "banner", file);
    }

    @DeleteMapping("/profile/avatar")
    public ProfileDto removeAvatar(@AuthenticationPrincipal Jwt jwt) {
        return images.clear(Long.valueOf(jwt.getSubject()), "avatar");
    }

    @DeleteMapping("/profile/banner")
    public ProfileDto removeBanner(@AuthenticationPrincipal Jwt jwt) {
        return images.clear(Long.valueOf(jwt.getSubject()), "banner");
    }

    @GetMapping("/activity")
    public List<WatchActivityDto> activity(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "20") int limit) {
        return profiles.activity(Long.valueOf(jwt.getSubject()), limit);
    }

    @GetMapping("/comments")
    public List<MyCommentDto> comments(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "20") int limit) {
        return profiles.comments(Long.valueOf(jwt.getSubject()), limit);
    }
}
