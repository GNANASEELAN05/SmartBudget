package com.example.smart.budget.tracker.backend.controller;

import com.example.smart.budget.tracker.backend.service.GeminiService;
import com.google.firebase.auth.FirebaseAuth;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/gemini")
public class GeminiController {

    private final GeminiService geminiService;

    public GeminiController(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    /**
     * POST /api/gemini/analyze
     * Body: { "prompt": "...", "data": { ... } }
     * Header: Authorization: Bearer <Firebase ID token>
     */
    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(
            @RequestBody Map<String, Object> body,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        // Verify Firebase token
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        try {
            String idToken = authHeader.substring(7);
            FirebaseAuth.getInstance().verifyIdToken(idToken);
            // Token verified — proceed

            String prompt = (String) body.getOrDefault("prompt", "");
            Object data   = body.get("data");

            String result = geminiService.callGemini(prompt, data);
            return ResponseEntity.ok(Map.of("result", result));

        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
}