# Authentication flow — fictional lab

Sign-in accepts a simulated Daenem account scenario and opens an assigned fictional workspace. Provisional and no-permission sessions receive an assignment-pending page with no operational navigation.

Recovery proceeds from neutral account lookup to a local email-code simulation, then short-lived reset authorization, password validation and completion. The fixed preview code is displayed only within the lab. No recovery email is sent.

Activation captures a fictional employee claim, verification and a new password before provisional access. Microsoft/Google show provider-configuration requirements and cannot create permissions.

Password policy: minimum 10 characters, uppercase, lowercase, number, symbol, matching confirmation and no immediate reuse. Email-code window: 2 minutes, 3 attempts, 30-second resend cooldown. Reset authorization: 5 minutes. These are simulator values, not verified Daenem production policy.

Remember/trust preferences, geofence failures, network errors, locked/rate-limited accounts and temporary-password expiry are represented. Actual authentication, MFA, device trust enforcement, reset revocation, provider federation and server rate limits remain PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION.
