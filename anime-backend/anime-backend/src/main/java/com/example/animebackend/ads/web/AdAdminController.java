package com.example.animebackend.ads.web;

import com.example.animebackend.ads.dto.AdDtos;
import com.example.animebackend.ads.service.AdAdminService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * Campaign administration. Secured by the {@code /api/v1/admin/**} rule in
 * SecurityConfig, so authorisation is not restated here.
 */
@RestController
@RequestMapping("/api/v1/admin/ads")
public class AdAdminController {

    private final AdAdminService admin;

    public AdAdminController(AdAdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/campaigns")
    public List<AdDtos.CampaignView> campaigns() {
        return admin.listCampaigns();
    }

    @PostMapping("/campaigns")
    public AdDtos.CampaignView create(@Valid @RequestBody AdDtos.CampaignRequest body) {
        return admin.createCampaign(body);
    }

    @PutMapping("/campaigns/{id}")
    public AdDtos.CampaignView update(@PathVariable Long id, @Valid @RequestBody AdDtos.CampaignRequest body) {
        return admin.updateCampaign(id, body);
    }

    @DeleteMapping("/campaigns/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@PathVariable Long id) {
        admin.archiveCampaign(id);
    }

    @GetMapping("/campaigns/{id}/creatives")
    public List<AdDtos.CreativeView> creatives(@PathVariable Long id) {
        return admin.listCreatives(id);
    }

    @PostMapping("/campaigns/{id}/creatives")
    public AdDtos.CreativeView createCreative(
            @PathVariable Long id, @Valid @RequestBody AdDtos.CreativeRequest body) {
        return admin.createCreative(id, body);
    }

    @PutMapping("/creatives/{id}")
    public AdDtos.CreativeView updateCreative(
            @PathVariable Long id, @Valid @RequestBody AdDtos.CreativeRequest body) {
        return admin.updateCreative(id, body);
    }

    @DeleteMapping("/creatives/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCreative(@PathVariable Long id) {
        admin.deleteCreative(id);
    }

    @GetMapping("/stats")
    public AdDtos.StatsView stats(@RequestParam(defaultValue = "7d") String period) {
        return admin.stats(period);
    }
}
