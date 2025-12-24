package com.example.smart.budget.tracker.backend.controller;

import com.example.smart.budget.tracker.backend.service.ContactService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/contact")
@CrossOrigin(origins = "http://localhost:5173") // change in production
public class ContactController {

    private static final Logger logger = LoggerFactory.getLogger(ContactController.class);
    private final ContactService contactService;

    public ContactController(ContactService contactService) {
        this.contactService = contactService;
    }

    @PostMapping("/send")
    public ResponseEntity<String> sendMessage(@RequestBody ContactRequest request) {
        logger.info("Received contact/send request: name={}, email={}, subject={}",
                request.getName(), request.getEmail(), request.getSubject());

        // Basic validation
        if (request.getMessage() == null || request.getMessage().isBlank()) {
            return ResponseEntity.badRequest().body("Message is required");
        }

        try {
            contactService.sendMessage(
                    request.getName(),
                    request.getEmail(),
                    request.getMessage(),
                    request.getSubject()
            );
            logger.info("Email send succeeded for contact request from {}", request.getEmail());
            return ResponseEntity.ok("Message sent successfully");
        } catch (Exception ex) {
            logger.error("Failed to send contact email", ex);
            // return 502 Bad Gateway or 500 depending on your preference
            return ResponseEntity.status(500).body("Failed to send message: " + ex.getMessage());
        }
    }
}
