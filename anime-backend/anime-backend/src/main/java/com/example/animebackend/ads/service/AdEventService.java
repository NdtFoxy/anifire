package com.example.animebackend.ads.service;

import com.example.animebackend.ads.dto.AdDtos;
import com.example.animebackend.ads.entity.AdEvent;
import com.example.animebackend.ads.repository.AdDecisionRepository;
import com.example.animebackend.ads.repository.AdEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ingest for playback beacons.
 *
 * Anonymous by necessity — the viewers ads are served to are usually not signed in
 * — so nothing here trusts the caller beyond the decision id, which the server
 * itself minted moments earlier. An unknown id is dropped silently: a 4xx would
 * only teach a scanner which ids exist.
 *
 * Beacons are sent with {@code navigator.sendBeacon}, which fires on tab close and
 * can therefore arrive twice. One row per (decision, kind) is enforced by a unique
 * index, so a retry cannot inflate a billable number.
 */
@Service
public class AdEventService {

    private static final Logger log = LoggerFactory.getLogger(AdEventService.class);

    private final AdEventRepository events;
    private final AdDecisionRepository decisions;

    public AdEventService(AdEventRepository events, AdDecisionRepository decisions) {
        this.events = events;
        this.decisions = decisions;
    }

    /** @return true when the beacon was stored, false when it was a duplicate or unknown */
    @Transactional
    public boolean record(AdDtos.EventRequest request) {
        var decision = decisions.findById(request.decisionId()).orElse(null);
        if (decision == null) {
            log.debug("Beacon for unknown decision {}", request.decisionId());
            return false;
        }
        if (events.existsByDecisionIdAndKind(request.decisionId(), request.event())) {
            return false;
        }
        try {
            events.save(AdEvent.builder()
                    .decisionId(decision.getId())
                    .campaignId(decision.getCampaignId())
                    .creativeId(decision.getCreativeId())
                    .kind(request.event())
                    .positionSec(request.positionSec())
                    .build());
            return true;
        } catch (DataIntegrityViolationException duplicate) {
            // Two beacons raced; the index decided which one counted.
            return false;
        }
    }
}
