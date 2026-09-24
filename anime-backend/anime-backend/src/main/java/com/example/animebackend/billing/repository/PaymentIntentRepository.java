package com.example.animebackend.billing.repository;

import com.example.animebackend.billing.entity.PaymentIntent;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentIntentRepository extends JpaRepository<PaymentIntent, Long> {

    /** How a callback finds the intent it belongs to. */
    Optional<PaymentIntent> findByProviderAndProviderPaymentId(String provider, String providerPaymentId);
}
