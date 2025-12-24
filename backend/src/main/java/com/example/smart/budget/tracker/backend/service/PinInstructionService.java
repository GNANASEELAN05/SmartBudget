package com.example.smart.budget.tracker.backend.service;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class PinInstructionService {

    private static final Logger log = LoggerFactory.getLogger(PinInstructionService.class);

    private final JavaMailSender mailSender;

    /**
     * The "from" address configured in application.properties (spring.mail.username).
     * If not set, fallback to the Gmail account used for sending.
     */
    @Value("${spring.mail.username:smartbudgettracker5@gmail.com}")
    private String fromEmail;

    public PinInstructionService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /**
     * Send instruction email to the registered user's email (looked up from Firebase Auth by UID).
     *
     * @param uid Firebase Auth UID of the user
     */
    public void sendInstructions(String uid) {
        log.info("PIN instruction requested for uid={}", uid);
        try {
            // 1) Lookup user email from Firebase Auth
            UserRecord user = FirebaseAuth.getInstance().getUser(uid);
            String email = user.getEmail();

            if (email == null || email.isBlank()) {
                log.warn("User {} has no registered email", uid);
                throw new RuntimeException("User has no registered email");
            }

            log.info("Preparing PIN instructions email to email={} (uid={})", email, uid);

            // 2) Build HTML and plain-text content
            String plainText = """
                    You requested instructions to access your App PIN.

                    • This email is from Smart Budget Tracker
                    • This does NOT reset your login password

                    To continue:
                    1. Open the Smart Budget Tracker app
                    2. Tap "Forgot PIN?"
                    3. Follow the on-screen steps to set a new App PIN (4–8 characters)

                    If you did not request this, you can safely ignore this email.
                    """;

            String html = """
                    <html>
                      <body style="font-family: Arial, Helvetica, sans-serif; color:#222;">
                        <div style="max-width:600px; padding:20px; border-radius:8px;">
                          <h2 style="margin-top:0;color:#111;">Smart Budget Tracker — PIN Instructions</h2>
                          <p>You requested instructions to access your App PIN.</p>
                          <ul>
                            <li>This email is sent by <strong>Smart Budget Tracker</strong></li>
                            <li>This <strong>does not</strong> reset your login password</li>
                          </ul>
                          <p><strong>How to continue</strong></p>
                          <ol>
                            <li>Open the Smart Budget Tracker app</li>
                            <li>Tap <em>"Forgot PIN?"</em></li>
                            <li>Follow the on-screen steps to set a new App PIN (4–8 characters)</li>
                          </ol>
                          <p style="color:#6b7280; font-size:13px;">If you did not request this, you can safely ignore this email.</p>
                          <hr/>
                          <small style="color:#94a3b8;">Sent at: %s</small>
                        </div>
                      </body>
                    </html>
                    """.formatted(Instant.now().toString());

            // 3) Create MimeMessage and send (Jakarta Mail)
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(email);
            helper.setSubject("Smart Budget Tracker — App PIN Instructions");
            helper.setText(plainText, html); // plain text fallback + HTML
            helper.setReplyTo(fromEmail);

            // Send - this will use application mail properties
            mailSender.send(message);
            log.info("✅ PIN instructions email sent successfully to {}", email);

        } catch (MessagingException me) {
            log.error("❌ MessagingException while building/sending email for uid={}", uid, me);
            throw new RuntimeException("Failed to build/send email", me);
        } catch (MailException me) {
            // Spring's MailException for send-time failures (auth/connectivity, etc.)
            log.error("❌ MailException while sending email for uid={}", uid, me);
            throw new RuntimeException("Failed to send email (mail exception)", me);
        } catch (Exception e) {
            log.error("❌ Failed to send PIN instructions for uid={}", uid, e);
            throw new RuntimeException("Failed to send PIN instructions", e);
        }
    }
}
