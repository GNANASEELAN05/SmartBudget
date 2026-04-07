package com.example.smart.budget.tracker.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@Service
public class GeminiService {

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    private static final String GEMINI_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=";

    /**
     * Sends a prompt + data context to Gemini and returns the text response.
     * Uses only java.net.http — no Jackson, no extra dependencies.
     */
    public String callGemini(String prompt, Object data) throws Exception {
        // Build data string safely
        String dataStr = data != null ? data.toString() : "{}";
        String fullPrompt = prompt + "\n\nUser financial data:\n" + dataStr;

        // Manually escape the prompt for JSON (handles quotes, newlines, backslashes)
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

        // Simple text extraction without Jackson:
        // Response format: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
        String body = response.body();
        int textIdx = body.indexOf("\"text\":");
        if (textIdx == -1) throw new RuntimeException("No text in Gemini response: " + body);

        int start = body.indexOf("\"", textIdx + 7) + 1;
        int end = body.lastIndexOf("\"");
        if (start <= 0 || end <= start) throw new RuntimeException("Could not parse Gemini response: " + body);

        // Unescape JSON string
        return body.substring(start, end)
            .replace("\\n", "\n")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\t", "\t")
            .replace("\\r", "\r");
    }
}