package com.example.animebackend.storage;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * Uploads in an S3-compatible bucket (MinIO in compose.prod, or Yandex Object
 * Storage / AWS). The bucket is readable anonymously and the reverse proxy maps
 * {@code /uploads/*} onto it, so images never pass through the API and survive
 * redeploys and extra API instances.
 */
@Component
@ConditionalOnProperty(name = "anifire.uploads.storage", havingValue = "s3")
public class S3MediaStorage implements MediaStorage {

    private static final Logger log = LoggerFactory.getLogger(S3MediaStorage.class);

    private final S3Client s3;
    private final String bucket;

    public S3MediaStorage(S3Properties props) {
        this.bucket = props.bucket();
        this.s3 = S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))
                .region(Region.of(props.region() == null || props.region().isBlank() ? "us-east-1" : props.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.accessKey(), props.secretKey())))
                // MinIO and most S3-compatible stores address buckets by path.
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    @Override
    public void put(String key, Path file, String contentType) throws IOException {
        s3.putObject(PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType(contentType)
                        // Keys are immutable (a new upload gets a new name).
                        .cacheControl("public, max-age=604800, immutable")
                        .build(),
                RequestBody.fromFile(file));
        Files.deleteIfExists(file);
    }

    @Override
    public void delete(String key) {
        try {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (RuntimeException e) {
            log.warn("Could not delete upload {}: {}", key, e.toString());
        }
    }
}
