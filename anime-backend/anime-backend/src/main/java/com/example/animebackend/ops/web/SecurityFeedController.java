package com.example.animebackend.ops.web;

import com.example.animebackend.ops.ErrorLog;
import com.example.animebackend.ops.dto.SecuritySignal;
import com.example.animebackend.ops.service.SecurityFeedService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Health of the platform's human side: abuse signals and recent server errors. */
@RestController
@RequestMapping("/api/v1/admin/security")
public class SecurityFeedController {

    private final SecurityFeedService feed;
    private final ErrorLog errors;

    public SecurityFeedController(SecurityFeedService feed, ErrorLog errors) {
        this.feed = feed;
        this.errors = errors;
    }

    @GetMapping
    public Map<String, Object> overview(@RequestParam(defaultValue = "30") int errorLimit) {
        List<SecuritySignal> signals = feed.signals();
        return Map.of(
                "signals", signals,
                "signalCount", signals.size(),
                "errors", errors.recent(errorLimit),
                "errorCount", errors.size());
    }
}
