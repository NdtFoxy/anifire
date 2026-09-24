package com.example.animebackend.billing.repository;

import com.example.animebackend.billing.entity.PaymentEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentEventRepository extends JpaRepository<PaymentEvent, Long> {

    boolean existsByProviderAndProviderEventId(String provider, String providerEventId);

    List<PaymentEvent> findTop50ByOrderByReceivedAtDesc();
}
