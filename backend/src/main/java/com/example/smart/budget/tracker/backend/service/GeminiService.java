package com.example.smart.budget.tracker.backend.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@Service
public class GeminiService {

    private static final Logger log = LoggerFactory.getLogger(GeminiService.class);

    @Value("${gemini.api.key:}")
    private String geminiApiKey;

    private static final String GEMINI_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=";

    @PostConstruct
    public void init() {
        if (geminiApiKey == null || geminiApiKey.isBlank()) {
            log.warn("⚠️ GEMINI_API_KEY is not set. Gemini features will not work.");
        } else {
            log.info("✅ Gemini API key loaded successfully");
        }
    }

    public String callGemini(String prompt, Object data) throws Exception {
        if (geminiApiKey == null || geminiApiKey.isBlank()) {
            throw new RuntimeException("Gemini API key is not configured. Set GEMINI_API_KEY environment variable on Render.");
        }

        String dataStr = data != null ? data.toString() : "{}";
        String fullPrompt = prompt + "\n\nUser financial data:\n" + dataStr;

        String escapedPrompt = fullPrompt
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");

        String bodyJson = "{"
            + "\"contents\":[{\"parts\":[{\"text\":\"" + escapedPrompt + "\"}]}],"
            + "\"generationConfig\":{\"temperature\":0.3,\"maxOutputTokens\":2048}"
            + "}";

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(GEMINI_URL + geminiApiKey))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(bodyJson))
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Gemini API error: " + response.statusCode() + " " + response.body());
        }

        String body = response.body();
        int textIdx = body.indexOf("\"text\":");
        if (textIdx == -1) throw new RuntimeException("No text in Gemini response: " + body);

        int start = body.indexOf("\"", textIdx + 7) + 1;
        int end = body.lastIndexOf("\"");
        if (start <= 0 || end <= start) throw new RuntimeException("Could not parse Gemini response: " + body);

        return body.substring(start, end)
            .replace("\\n", "\n")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\t", "\t")
            .replace("\\r", "\r");
    }
}