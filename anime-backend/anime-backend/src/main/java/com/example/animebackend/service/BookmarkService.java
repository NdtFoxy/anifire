package com.example.animebackend.service;

import com.example.animebackend.dto.BookmarkDto;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Bookmark;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.BookmarkRepository;
import com.example.animebackend.auth.web.ApiException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Server-side "My List", so a saved title follows the account, not the browser. */
@Service
public class BookmarkService {

    /** A list is a shortlist; an unbounded one is a scraping target. */
    private static final long MAX_BOOKMARKS = 500;

    private final BookmarkRepository bookmarks;
    private final AnimeRepository animes;

    public BookmarkService(BookmarkRepository bookmarks, AnimeRepository animes) {
        this.bookmarks = bookmarks;
        this.animes = animes;
    }

    @Transactional(readOnly = true)
    public List<BookmarkDto> list(Long userId) {
        List<Bookmark> rows = bookmarks.findByUserIdOrderByCreatedAtDesc(userId);
        if (rows.isEmpty()) return List.of();
        Map<Long, Anime> byId =
                animes.findAllById(rows.stream().map(Bookmark::getAnimeId).toList()).stream()
                        .filter(a -> !a.isDeleted())
                        .collect(Collectors.toMap(Anime::getId, Function.identity()));
        List<BookmarkDto> out = new ArrayList<>(rows.size());
        for (Bookmark row : rows) {
            Anime anime = byId.get(row.getAnimeId());
            if (anime == null) continue; // title withdrawn from the catalogue
            out.add(new BookmarkDto(
                    anime.getId(),
                    anime.getTitle(),
                    anime.getImageUrl(),
                    anime.getRating(),
                    row.getCreatedAt()));
        }
        return out;
    }

    @Transactional
    public boolean add(Long userId, Long animeId) {
        if (bookmarks.existsByUserIdAndAnimeId(userId, animeId)) return false;
        if (bookmarks.countByUserId(userId) >= MAX_BOOKMARKS) {
            throw ApiException.badRequest("list_full", "Your list is full — remove something first.");
        }
        // Existence is checked here rather than trusted from the client, so the list
        // can never accumulate ids that were never in the catalogue.
        if (animes.findByIdAndIsDeletedFalse(animeId).isEmpty()) {
            throw ApiException.badRequest("unknown_title", "That title does not exist.");
        }
        bookmarks.save(Bookmark.builder().userId(userId).animeId(animeId).build());
        return true;
    }

    @Transactional
    public boolean remove(Long userId, Long animeId) {
        return bookmarks.findByUserIdAndAnimeId(userId, animeId)
                .map(row -> {
                    bookmarks.delete(row);
                    return true;
                })
                .orElse(false);
    }

    /** One-shot import of a device-local list; already-saved ids are skipped. */
    @Transactional
    public List<BookmarkDto> merge(Long userId, Collection<Long> animeIds) {
        for (Long id : animeIds.stream().distinct().limit(MAX_BOOKMARKS).toList()) {
            if (id == null) continue;
            try {
                add(userId, id);
            } catch (ApiException ignored) {
                // A stale local id must not fail the whole import.
            }
        }
        return list(userId);
    }
}
