# Murdilimax invitations

This is a separate private worker; it is not bundled into GitHub Pages. The existing
site stays on Pages. No service has been deployed and no messages have been sent.

## Implemented

- Existing SS.com monitors conservatively filter small construction tasks and side-work helpers; NVA employer vacancies are excluded. Rules are heuristic, not a guarantee of perfect classification.
- The private worker polls explicitly configured HTTPS JSON feeds every 15 minutes.
- Russian/Latvian HTML and text invitations link directly to Murdilimax.
- SQLite unique normalized email prevents duplicates across all feeds and both roles.
- Attempt reservation is committed before SMTP; ambiguous delivery is never retried.
  This favors at-most-one attempt over guaranteed delivery. A crash may mean a person
  receives no invitation. SMTP acceptance is not proof of inbox delivery.
- Rolling 24-hour attempt cap (20 default, maximum 100), signed unsubscribe endpoint.
- Contact data and credentials must never enter the public repository or Pages artifacts.

## Deployment requirements (not yet connected)

Initialize a NEW ledger once, on the persistent disk, with
`python -c "from outreach.worker import open_db; open_db('/var/data/outreach.sqlite3').close()"`
under a restrictive umask (077). Never reinitialize a lost production ledger.
Run `python outreach/worker.py` on a single instance with a persistent disk. Required:
`OUTREACH_DB=/var/data/outreach.sqlite3`, `OUTREACH_SIGNING_KEY` (random, >=32 chars),
`OUTREACH_PUBLIC_URL` (HTTPS service URL). Do not rotate/delete the database: it is the
lifetime deduplication record. Back it up privately. Disk loss means sending must stop.
Use restrictive disk permissions and provider disk encryption. Never use an ephemeral
free-service filesystem for this database. A production deploy may have a hosting cost.

Sending also requires `SMTP_HOST`, `SMTP_PORT` (465 default, implicit TLS), `SMTP_USER`,
`SMTP_PASSWORD`, `SMTP_FROM` (verified sender), `OUTREACH_ENABLED=true`, and
`OUTREACH_FEEDS_JSON` (array of approved private feed URLs). Verify sender DNS, test
unsubscribe over the public HTTPS endpoint and send to an owned test address first.
Keep the signing key stable so old unsubscribe links continue working.

Each feed returns an array with records like this (example only):

```json
[{"email":"person@example.com","country":"LV","role":"helper","profession":"plumber",
"private_person":true,"small_job":true,"lang":"lv","source_url":"https://example.com/listing/1",
"permission":{"channel":"email","purpose":"murdilimax-invitation","verified":true,
"reference":"private record proving permission for this invitation"}}]
```

Feed configuration is an administrator trust boundary. Only vetted feeds may assert
these fields. A scraped public address is not sufficient permission. The public SS.com
scanner redacts contacts and is intentionally NOT treated as a verified invitation feed.
No feed granting invitation permission has yet been connected. Coverage is not the
entire internet. Additional platforms need their own permitted connectors.

Complaints and bounce notices arriving outside SMTP must be ingested by the chosen
provider integration or suppressed administratively; there is no bounce webhook yet.
Duplicates remain blocked regardless of delivery status. Plus tags/dots are not stripped
because doing so can conflate distinct mailboxes on some providers.

## Tests

`node --test scripts/construction-filter.test.mjs`
`python -m unittest discover -s outreach -p 'test_*.py'`
