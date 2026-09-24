package com.example.animebackend.controller;

import com.example.animebackend.dto.BookmarkDto;
import com.example.animebackend.service.BookmarkService;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** The viewer's saved titles. Scoped to the JWT subject, like all of /me. */
@RestController
@RequestMapping("/api/v1/me/bookmarks")
public class BookmarkController {

    public record MergeRequest(@NotNull @Size(max = 500) List<Long> animeIds) {}

    private final BookmarkService bookmarks;

    public BookmarkController(BookmarkService bookmarks) {
        this.bookmarks = bookmarks;
    }

    @GetMapping
    public List<BookmarkDto> list(@AuthenticationPrincipal Jwt jwt) {
        return bookmarks.list(userId(jwt));
    }

    @PutMapping("/{animeId}")
    public ResponseEntity<Void> add(@AuthenticationPrincipal Jwt jwt, @PathVariable Long animeId) {
        boolean created = bookmarks.add(userId(jwt), animeId);
        return ResponseEntity.status(created ? HttpStatus.CREATED : HttpStatus.OK).build();
    }

    @DeleteMapping("/{animeId}")
    public ResponseEntity<Void> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable Long animeId) {
        bookmarks.remove(userId(jwt), animeId);
        return ResponseEntity.noContent().build();
    }

    /** Adopts a device-local list once, after the first sign-in on that device. */
    @PostMapping("/merge")
    public List<BookmarkDto> merge(
            @AuthenticationPrincipal Jwt jwt, @RequestBody MergeRequest body) {
        return bookmarks.merge(userId(jwt), body.animeIds());
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
