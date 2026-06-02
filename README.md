# Cloudflare DDNS Worker

A lightweight, serverless Dynamic DNS (DDNS) solution built on Cloudflare Workers. It updates Cloudflare DNS records (A/AAAA) in response to requests from routers like TP-Link Omada, using secure authentication and optional KV caching for performance.

## Features

- Supports both IPv4 (A records) and IPv6 (AAAA records)
- Basic Auth + URL password authentication
- Strict IP validation with regex
- Optional Cloudflare KV caching to avoid API rate limits and speed up responses
- Returns standard DynDNS responses (`good`, `nochg`, `badauth`)
- Compatible with TP-Link Omada and similar DDNS clients
- Free-tier friendly (Workers + KV)

## Architecture Overview

The Worker listens on `/nic/update` and:
1. Authenticates the request
2. Validates hostname and IP parameters
3. Checks KV cache (if enabled) for unchanged IPs
4. Fetches/updates the DNS record via Cloudflare API
5. Updates KV cache and returns the appropriate status

## Prerequisites

- Cloudflare account (Free tier works)
- A domain managed by Cloudflare
- API Token with DNS:Edit permissions
- (Optional) KV namespace for caching

## Environment Variables

| Variable          | Required | Description                              |
|-------------------|----------|------------------------------------------|
| `API_TOKEN_DDNS`  | Yes      | Cloudflare API token (DNS:Edit)          |
| `PASSWORD_DDNS`   | Yes      | Password for Basic Auth / URL auth       |
| `ZONE_ID`         | Yes      | Cloudflare Zone ID of your domain        |
| `TTL`             | No       | DNS TTL (default: 120)                   |
| `PROXIED`         | No       | `true` or `false` (default: false)       |
| `KV`              | No       | Bound KV namespace (recommended)         |
| `WEBHOOK_URL`     | No       | Discord/Telegram webhook for notifications |

## Deployment

1. Create a new Worker in the Cloudflare dashboard.
2. Paste the Worker code.
3. Add the required environment variables/secrets.
4. (Optional) Bind a KV namespace named `KV`.
5. Deploy and route a custom domain (e.g., `ddns.yourdomain.com`).

## Usage with Omada / DDNS Client

Configure your router with:
- **Service Provider**: Custom
- **Server**: `https://ddns.yourdomain.com/nic/update`
- **Username**: (any value)
- **Password**: Your `PASSWORD_DDNS`
- **Hostname**: The subdomain to update

The status column in Omada will show `good`, `nochg`, or `badauth` based on the Worker response [1].

## Security

- All credentials stored as encrypted secrets
- HTTPS enforced by Cloudflare
- Strict input validation prevents injection
- Least-privilege API token recommended
- WAF rules can be added on custom domains

## Monitoring (Free Tier)

- Real-time logs in the Workers dashboard

## License

This project is provided as-is for personal/educational use.
