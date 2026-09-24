package com.example.animebackend.auth.dto;

import com.example.animebackend.entity.Comment;
import java.time.LocalDateTime;

/** One of the signed-in user's own comments, with the anime it belongs to. */
public record MyCommentDto(
        Long id,
        Long animeId,
        String animeTitle,
        String description,
        LocalDateTime creationDate) {

    public static MyCommentDto from(Comment c) {
        return new MyCommentDto(
                c.getId(),
                c.getAnime().getId(),
                c.getAnime().getTitle(),
                c.getDescription(),
                c.getCreationDate());
    }
}
