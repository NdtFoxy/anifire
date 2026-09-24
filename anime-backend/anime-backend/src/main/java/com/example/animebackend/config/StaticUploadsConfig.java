package com.example.animebackend.config;

import com.example.animebackend.auth.config.UploadProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves uploaded profile images from the configured upload directory at {@code /uploads/**}.
 *
 * <p>Filenames are server-generated and immutable, so a long cache is safe: replacing an avatar
 * produces a new name rather than new bytes behind the old one. With S3 storage the reverse
 * proxy serves {@code /uploads/**} from the bucket and this handler is not registered.
 */
@Configuration
@ConditionalOnProperty(name = "anifire.uploads.storage", havingValue = "local", matchIfMissing = true)
public class StaticUploadsConfig implements WebMvcConfigurer {

    private final UploadProperties props;

    public StaticUploadsConfig(UploadProperties props) {
        this.props = props;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path root = props.root();
        try {
            // Created up front: Path.toUri() only appends the trailing slash a resource
            // location needs once the directory actually exists.
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create upload directory " + root, e);
        }
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(root.toUri().toString())
                .setCacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic());
    }
}
