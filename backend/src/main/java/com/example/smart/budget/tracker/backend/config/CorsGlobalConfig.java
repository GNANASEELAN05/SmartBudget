package com.example.smart.budget.tracker.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;

@Configuration
public class CorsGlobalConfig {

    private final org.springframework.core.env.Environment env;

    public CorsGlobalConfig(org.springframework.core.env.Environment env) {
        this.env = env;
    }

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true); // allow Authorization header
        String rawOrigins = env.getProperty("app.cors.allowed-origins", "http://localhost:5173,https://smart-budgets-tracker.vercel.app");
java.util.List<String> origins = java.util.Arrays.asList(rawOrigins.split("\\s*,\\s*"));
config.setAllowedOrigins(origins);
        config.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"));
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // apply to all endpoints
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
