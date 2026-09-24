package com.example.animebackend.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Admin → Каталог: fill the catalogue and localize it. Guarded by /api/v1/admin/** (ADMIN). */
@RestController
@RequestMapping("/api/v1/admin/catalog")
public class CatalogAdminController {

    public record ImportRequest(@Min(1) @Max(CatalogImportService.MAX_PAGES) int pages) {}

    private final CatalogImportService catalog;

    public CatalogAdminController(CatalogImportService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/status")
    public CatalogImportService.Status status() {
        return catalog.status();
    }

    @PostMapping("/import")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CatalogImportService.Status importTop(@Valid @RequestBody ImportRequest body) {
        return catalog.startImport(body.pages());
    }

    @PostMapping("/enrich")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CatalogImportService.Status enrich() {
        return catalog.startEnrichment();
    }

    @PostMapping("/localize-categories")
    public Map<String, Integer> localizeCategories() {
        return Map.of("renamed", catalog.localizeCategories());
    }
}
