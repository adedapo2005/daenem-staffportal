# Daenem Workforce Hub — Authentication Requirements

## Approved authentication model

Daenem Workforce Hub uses a familiar username/email + password login for normal employee access. One-time verification codes are not the normal sign-in method.

### Employee signup

1. Employee enters legal name, phone, email, Daenem company, requested work details, a unique username and a new password.
2. The system validates username uniqueness and password security before proceeding.
3. The system sends a six-digit one-time verification code to the email supplied during signup.
4. The employee must verify that one-time code before the permanent login credentials are created.
5. After verification, the username/email + password becomes the employee's normal login method.
6. A new employee may remain `provisional` until an authorized Daenem administrator approves the requested company role and operational permissions.
7. A pre-created Daenem employee record without login credentials may claim that existing employee identity after verifying the email address; a duplicate employee record must not be created.

### Normal sign-in

- Employee signs in with either the unique username or the employee email address plus password.
- Normal sign-in does not require an OTP.
- Login location/geofence rules remain independent security controls and can still be recorded or enforced by Owner/Admin policy.
- Device identity, IP address, login result, geofence result and security events remain auditable.
- Repeated failed password attempts trigger temporary account lockout.

### Forgot password / password reset

1. Employee selects **Forgot password**.
2. Employee enters username or email.
3. The interface returns a privacy-safe generic response so account existence is not exposed unnecessarily.
4. If the account exists, the system sends a six-digit one-time verification code to the email on file.
5. The password reset form must **not** be shown/unlocked until the employee successfully verifies the one-time code.
6. Successful OTP verification creates a short-lived, single-use password reset authorization token.
7. Employee creates and confirms a new password.
8. The reset authorization is consumed immediately after use.
9. All other active sessions for the employee are revoked after a successful password change.
10. The employee signs in again with the new password.

## Credential security requirements

- Never store plaintext passwords.
- Password hashes are stored separately from employee profile data.
- Current implementation uses PBKDF2-HMAC-SHA-256 with a random per-account salt, configurable work factor and server-side secret pepper.
- Passwords must satisfy the configured length and strength policy.
- Password reset codes and reset authorization tokens are stored only as hashes.
- OTPs expire quickly and have an attempt limit.
- Reset tokens expire quickly and are single-use.
- Existing passwords cannot be reused as the immediate reset password.
- Authentication responses use secure, HTTP-only, same-site cookies for sessions.
- Password reset completion revokes existing sessions.
- Authentication, lockout, recovery and verification events are recorded in the security log.

## OTP usage policy

OTP is permitted only for:

- New account email verification during signup.
- Forgot-password identity verification before password reset.
- Future explicitly approved high-risk step-up verification, if Owner/Admin later enables such a policy.

OTP is not the standard everyday employee login method.
