# Security

This extension reads medical records. A bug in it is a privacy bug, so please report one privately rather than in a
public issue.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/RoniRachmani/health-records-export-for-maccabi/security/advisories/new).
It opens a report only you and the maintainer can see. If you'd rather use email, write to `maccabi.a5s6c@addy.io`,
the address on the Chrome Web Store listing.

Please include what an attacker could reach and how you got there. Never include health information, an ID number or
files from a real export — describe the shape of the data instead, or use synthetic values.

Expect an answer within a week. There is no bounty: this is an unpaid personal project.

## What counts

The things worth reporting, roughly in order:

- Anything that sends record data, a session token or a member id anywhere other than `online.maccabi4u.co.il`.
- A way for a page other than Maccabi Online to reach the extension's messages, its IndexedDB staging or the token in
  `chrome.storage.session`.
- A request the extension makes that isn't in [docs/endpoints.json](docs/endpoints.json), or one that writes to the
  account. Only the medical-file order may write, and it's documented.
- Collected files surviving after a ZIP is saved or an export is stopped.
- A member id written into a file path or a stored `endpoint` string.

Out of scope: Maccabi Online's own security (report that to Maccabi), the ZIP being unencrypted (it's by design and
documented), and anything that needs an attacker who is already on your machine or in your Chrome profile.

## Supported versions

The latest release only. It's a small project — fixes go forward, not into old versions.
