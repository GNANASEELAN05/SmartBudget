package com.example.smart.budget.tracker.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class ContactService {

    private static final Logger logger = LoggerFactory.getLogger(ContactService.class);

    private final JavaMailSender mailSender;

    // configure this in application.properties (app.mail.from) and set to your verified sender
    @Value("${app.mail.from:no-reply@smartbudgettracker.com}")
    private String appFrom;

    @Value("${app.mail.to:smartbudgettracker5@gmail.com}")
    private String appTo;

    public ContactService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /**
     * Sends support email to app owner. Uses `appFrom` as the From (must be verified with Brevo).
     * Sets Reply-To to the user's email so owner can reply directly.
     */
    public void sendMessage(String name, String userEmail, String message, String subject) {
        SimpleMailMessage mail = new SimpleMailMessage();

        mail.setTo(appTo);
        mail.setFrom(appFrom); // MUST be a verified sender in Brevo
        if (userEmail != null && !userEmail.isBlank()) {
            mail.setReplyTo(userEmail);
        }

        String finalSubject = (subject != null && !subject.isBlank()) ? subject : "Support Request from " + (name != null ? name : "Guest");
        mail.setSubject(finalSubject);

        StringBuilder body = new StringBuilder();
        body.append("New support request\n\n");
        body.append("Name: ").append(name == null ? "Guest" : name).append("\n");
        body.append("Email: ").append(userEmail == null ? "(not provided)" : userEmail).append("\n\n");
        body.append("Message:\n").append(message == null ? "(no message)" : message).append("\n");

        mail.setText(body.toString());

        logger.info("Sending support email to {} with From={} Reply-To={}", appTo, appFrom, userEmail);

        try {
            mailSender.send(mail);
            logger.info("Support email sent successfully");
        } catch (MailException me) {
            logger.error("Mail sending failed", me);
            throw me; // controller will catch and return 500
        }
    }
}
