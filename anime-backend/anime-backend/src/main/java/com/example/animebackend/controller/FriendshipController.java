package com.example.animebackend.controller;

import com.example.animebackend.dto.FriendDto;
import com.example.animebackend.service.FriendshipService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * Friends and friend requests. A request is addressed by email — there is no
 * user-search endpoint, because an open directory of accounts is the easiest way
 * to hand an attacker the whole user table.
 */
@RestController
@RequestMapping("/api/v1/me/friends")
public class FriendshipController {

    public record FriendRequestBody(@NotBlank @Email @Size(max = 255) String email) {}

    private final FriendshipService friends;

    public FriendshipController(FriendshipService friends) {
        this.friends = friends;
    }

    @GetMapping
    public Map<String, List<FriendDto>> overview(@AuthenticationPrincipal Jwt jwt) {
        Long userId = userId(jwt);
        return Map.of(
                "friends", friends.friends(userId),
                "incoming", friends.incoming(userId),
                "outgoing", friends.outgoing(userId));
    }

    @PostMapping("/requests")
    public FriendDto request(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FriendRequestBody body) {
        return friends.request(userId(jwt), body.email());
    }

    @PostMapping("/requests/{friendshipId}/accept")
    public FriendDto accept(@AuthenticationPrincipal Jwt jwt, @PathVariable Long friendshipId) {
        return friends.respond(userId(jwt), friendshipId, true);
    }

    @PostMapping("/requests/{friendshipId}/decline")
    public FriendDto decline(@AuthenticationPrincipal Jwt jwt, @PathVariable Long friendshipId) {
        return friends.respond(userId(jwt), friendshipId, false);
    }

    @DeleteMapping("/{otherUserId}")
    public ResponseEntity<Void> remove(
            @AuthenticationPrincipal Jwt jwt, @PathVariable Long otherUserId) {
        friends.remove(userId(jwt), otherUserId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{otherUserId}/block")
    public ResponseEntity<Void> block(
            @AuthenticationPrincipal Jwt jwt, @PathVariable Long otherUserId) {
        friends.block(userId(jwt), otherUserId);
        return ResponseEntity.noContent().build();
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
