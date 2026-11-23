# Maccabi Online: members and hosts

What the site does beyond [endpoints/](endpoints/); read before changing how a run finds the member or which hosts it
uses. Checked 2026-11-22 on a live account.

## Who the site thinks you are

- Extension's member ID: the signed-in member's. From `cookie_sessionId_0_{id}`
  ([tab.ts](../src/extension/background/tab.ts)), else token `mem_id` (`sessionFrom`, [util.ts](../src/core/util.ts)).
- `sessionStorage.customerData`:
  - `logged_customer_info`: signed in.
  - `current_customer_info`: on screen.
- `cookie_currentCustomer`: who is on screen; always set.

## Support host

- `tm-online.maccabi4u.co.il`: the account-menu and doctor-messages links use it when `isSupport()` is on. Call-centre,
  internal. Never contact.
- On the site members use, `isSupport` is `'0'`.

## Viewing a family member ("Impersonation")

- Menu lists `family_data.family_members` and `authorization_to_account.accounts` (caregiver access). Hidden if you're
  the only member.
- The site compares the signed-in member's ID with the on-screen one to know you're viewing someone else.
- Screens: `ImpersonationAdultPage`, `ImpersonationMinorPage`, `ImpersonationToTakenCareAccount`.
