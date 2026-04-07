package com.example.smart.budget.tracker.backend.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Configuration
public class FirebaseConfig {

    private static final Logger log = LoggerFactory.getLogger(FirebaseConfig.class);

    @PostConstruct
    public void init() {
        try {
            InputStream serviceAccount;

            String firebaseJson = System.getenv("FIREBASE_SERVICE_ACCOUNT_JSON");

            if (firebaseJson != null && !firebaseJson.isBlank()) {
                log.info("🔑 Loading Firebase credentials from environment variable");
                serviceAccount = new ByteArrayInputStream(
                        firebaseJson.getBytes(StandardCharsets.UTF_8)
                );
            } else {
                log.info("🔑 Loading Firebase credentials from classpath (local dev)");
                serviceAccount = getClass().getClassLoader()
                        .getResourceAsStream("firebase-service-account.json");
            }

            if (serviceAccount == null) {
                throw new RuntimeException(
                        "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_JSON " +
                        "env var on Render, or place firebase-service-account.json in resources/ for local dev."
                );
            }

            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();

            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(options);
                log.info("✅ Firebase initialized successfully");
            } else {
                log.info("✅ Firebase already initialized");
            }

        } catch (Exception e) {
            log.error("❌ Firebase initialization failed", e);
            throw new RuntimeException(e);
        }
    }
}