package com.example.smart.budget.tracker.backend.controller;

import com.example.smart.budget.tracker.backend.dto.PinInstructionRequest;
import com.example.smart.budget.tracker.backend.service.PinInstructionService;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/pin")
public class PinController {

    private final PinInstructionService pinInstructionService;

    public PinController(PinInstructionService pinInstructionService) {
        this.pinInstructionService = pinInstructionService;
    }

    /**
     * Send PIN/instructions to the registered user's email.
     *
     * Behavior:
     *  - If Authorization: Bearer <idToken> header is present, verify it with Firebase Admin,
     *    extract the uid and use that to send instructions.
     *  - If no Authorization header is present, fallback to using the UID provided in the request body
     *    (keeps backwards compatibility with older callers).
     */
    @PostMapping("/instructions")
    public ResponseEntity<?> sendInstructions(
            @RequestBody(required = false) PinInstructionRequest request,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        try {
            String uid = null;

            // If there's an Authorization header, prefer verifying it and extracting the uid
            if (authHeader != null && !authHeader.isBlank()) {
                String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
                FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
                uid = decoded.getUid();
            }

            // Fallback to request body uid if no header provided
            if (uid == null || uid.isBlank()) {
                if (request != null && request.getUid() != null && !request.getUid().isBlank()) {
                    uid = request.getUid();
                } else {
                    return ResponseEntity.status(401).body(Map.of("success", false, "error", "Missing id token or uid"));
                }
            }

            // Call your existing service which handles looking up the user's email and sending instructions
            pinInstructionService.sendInstructions(uid);

            return ResponseEntity.ok(Map.of("success", true));
        } catch (FirebaseAuthException fae) {
            // Token invalid or verification failed
            return ResponseEntity.status(401).body(Map.of("success", false, "error", "Invalid or expired token"));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
        }
    }
}
