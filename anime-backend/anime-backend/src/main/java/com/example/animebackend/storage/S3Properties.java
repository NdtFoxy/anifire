package com.example.animebackend.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** S3-compatible bucket for uploads (prefix {@code anifire.uploads.s3}); used when storage=s3. */
@ConfigurationProperties(prefix = "anifire.uploads.s3")
public record S3Properties(String endpoint, String region, String bucket, String accessKey, String secretKey) {}
