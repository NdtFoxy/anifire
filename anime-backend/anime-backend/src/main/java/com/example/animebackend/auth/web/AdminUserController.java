package com.example.animebackend.auth.web;

import com.example.animebackend.auth.dto.AdminUserDetail;
import com.example.animebackend.auth.dto.AdminUserRow;
import com.example.animebackend.auth.dto.AdminUserUpdateRequest;
import com.example.animebackend.auth.dto.UserDto;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.service.UserAdminService;
import com.example.animebackend.dto.PagedResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Locale;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

/**
 * User directory for the admin console.
 *
 * <p>The list is paged and filtered server-side. Sorting is restricted to a known
 * set of columns: passing a raw sort string through to the persistence layer is a
 * classic way to turn a convenience parameter into a data-exposure bug.
 */
@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {

    private static final int MAX_SIZE = 100;
    private static final List<String> SORTABLE =
            List.of("createdAt", "lastLoginAt", "email", "displayName", "level", "points");

    private final UserAdminService service;

    public AdminUserController(UserAdminService service) {
        this.service = service;
    }

    @GetMapping
    public PagedResponse<AdminUserRow> list(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String comment,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) Boolean verified,
            @RequestParam(defaultValue = "false") boolean includeDeleted,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "desc") String direction,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        String sortBy = SORTABLE.contains(sort) ? sort : "createdAt";
        Sort.Direction dir =
                "asc".equalsIgnoreCase(direction) ? Sort.Direction.ASC : Sort.Direction.DESC;
        Role parsedRole = parseRole(role);

        Page<AdminUserRow> result = service.search(
                query,
                comment,
                parsedRole,
                verified,
                includeDeleted,
                PageRequest.of(Math.max(0, page), Math.clamp(size, 1, MAX_SIZE), Sort.by(dir, sortBy)));

        return PagedResponse.from(result);
    }

    @GetMapping("/{id}")
    public AdminUserDetail detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @PutMapping("/{id}")
    public UserDto update(@PathVariable Long id, @Valid @RequestBody AdminUserUpdateRequest request) {
        return service.update(id, request);
    }

    private static Role parseRole(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Role.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            // An unknown role filters nothing rather than 500s on a typo in the URL.
            return null;
        }
    }
}
