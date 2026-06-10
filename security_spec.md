# Security Specification for StudyZen

## Data Invariants
1. A user cannot read or write to another user's profile, settings, or tasks.
2. Every task must be owned by the authenticated user making the request.
3. Every profile update must retain the user's primary identity information.
4. Input strings must be bound in length to prevent "Denial of Wallet" and database poisoning.

## The "Dirty Dozen" Malicious Payloads
Here are the dirty payloads designed to try violating these rules:
1. **User Spoofing Profile**: Creating a profile under a different userId.
2. **Task Spoofing Owner**: Creating a task with a `userId` that does not match the authenticated user.
3. **Infinite String Injection**: Injecting a 1MB string into the task name to blow up storage.
4. **Invalid DataType task**: Setting `completed` state to a string like `"yes"`.
5. **Junk taskId attack**: Injecting malformed and long taskId paths.
6. **Task cross-read**: Attempting to read another user's task documentation.
7. **Task cross-delete**: Attempting to delete another user's tasks.
8. **Shadow field in Profile**: Setting a hidden admin field like `"role": "admin"`.
9. **Status bypass**: Modifying a task to contain random un-allowed severity values.
10. **Unauthenticated profile creation**: Trying to register a new user doc without being signed in.
11. **Null ID Poisoning**: Specifying an ID filled with invalid characters.
12. **Tampering with static timestamps**: Modifying immutable fields.

## Rule Definitions
We will enforce these through strict match declarations in `firestore.rules`.
