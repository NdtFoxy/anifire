package com.example.animebackend.service;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.dto.AnimeRequest;
import com.example.animebackend.dto.AnimeResponse;
import com.example.animebackend.dto.PagedResponse;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Category;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.CategoryRepository;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnimeService {

    private static final Logger log = LoggerFactory.getLogger(AnimeService.class);
    private static final int MAX_PAGE_SIZE = 50;

    private final AnimeRepository repository;
    private final CategoryRepository categoryRepository;

    public AnimeService(AnimeRepository repository, CategoryRepository categoryRepository) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
    }

    @Transactional(readOnly = true)
    public List<AnimeResponse> listAll() {
        return repository.findAllByIsDeletedFalse().stream()
                .map(AnimeResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public AnimeResponse getById(Long id) {
        return AnimeResponse.from(findActive(id));
    }

    @Transactional(readOnly = true)
    public PagedResponse<AnimeResponse> search(String query, Long categoryId, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), MAX_PAGE_SIZE);
        PageRequest pageable = PageRequest.of(
                safePage,
                safeSize,
                Sort.by(Sort.Direction.DESC, "creationDate"));

        Specification<Anime> spec = notDeleted()
                .and(titleContains(query))
                .and(inCategory(categoryId));

        return PagedResponse.from(repository.findAll(spec, pageable).map(AnimeResponse::from));
    }

    @Transactional
    public AnimeResponse create(AnimeRequest request, Long creatorUserId) {
        Anime anime = Anime.builder()
                .title(request.title().trim())
                .synopsis(trimToNull(request.description()))
                .imageUrl(trimToNull(request.imageUrl()))
                .rating(request.rating())
                .creatorUserId(creatorUserId)
                .creationDate(LocalDateTime.now())
                .isDeleted(false)
                .build();
        anime.setCategories(resolveCategories(request.categoryIds()));
        return AnimeResponse.from(repository.save(anime));
    }

    @Transactional
    public AnimeResponse update(Long id, AnimeRequest request) {
        Anime anime = findActive(id);
        anime.setTitle(request.title().trim());
        anime.setSynopsis(trimToNull(request.description()));
        anime.setImageUrl(trimToNull(request.imageUrl()));
        anime.setRating(request.rating());
        anime.setCategories(resolveCategories(request.categoryIds()));
        return AnimeResponse.from(repository.save(anime));
    }

    @Transactional
    public void softDelete(Long id) {
        Anime anime = findActive(id);
        anime.setDeleted(true);
        repository.save(anime);
        log.info("Anime soft-deleted: id={}", id);
    }

    private Anime findActive(Long id) {
        return repository.findByIdAndIsDeletedFalse(id)
                .orElseThrow(() -> ApiException.badRequest("anime_not_found", "Тайтл не найден."));
    }

    private LinkedHashSet<Category> resolveCategories(Set<Long> categoryIds) {
        LinkedHashSet<Category> categories = new LinkedHashSet<>();
        if (categoryIds == null) {
            return categories;
        }
        for (Long categoryId : categoryIds) {
            Category category = categoryRepository.findByIdAndIsDeletedFalse(categoryId)
                    .orElseThrow(() -> ApiException.badRequest("category_not_found", "Категория не найдена."));
            categories.add(category);
        }
        return categories;
    }

    private static Specification<Anime> notDeleted() {
        return (root, query, cb) -> cb.isFalse(root.get("isDeleted"));
    }

    /** Always-true predicate — Spring Data 4's {@code .and()} rejects nulls. */
    private static Specification<Anime> always() {
        return (root, query, cb) -> cb.conjunction();
    }

    private static Specification<Anime> titleContains(String value) {
        if (value == null || value.isBlank()) {
            return always();
        }
        String pattern = "%" + value.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.like(cb.lower(root.get("title")), pattern);
    }

    private static Specification<Anime> inCategory(Long categoryId) {
        if (categoryId == null) {
            return always();
        }
        return (root, query, cb) -> {
            Join<Anime, Category> category = root.join("categories", JoinType.INNER);
            return cb.and(
                    cb.equal(category.get("id"), categoryId),
                    cb.isFalse(category.get("isDeleted")));
        };
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
