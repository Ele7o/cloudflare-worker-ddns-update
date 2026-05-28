export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== '/nic/update') {
      return new Response('Not Found', { status: 200 });
    }

    // === Authentication ===
    let password = url.password;

    if (!password) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader) {
        const match = authHeader.match(/^Basic\s+(.+)$/i);
        if (match) {
          try {
            const decoded = atob(match[1]);
            password = decoded.split(':')[1] || '';
          } catch (e) {
            return new Response('badauth', { status: 200 });
          }
        }
      }
    }

    if (!password || password !== env.PASSWORD_DDNS) {
      return new Response('badauth', { status: 200 });
    }

    // === Parameters ===
    const hostname = url.searchParams.get('hostname')?.trim();
    const myip = url.searchParams.get('myip')?.trim();

    if (!hostname || !myip) {
      return new Response('badauth', { status: 200 });
    }

    // === IP Validation ===
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    const isIPv6 = ipv6Regex.test(myip);

    if (!ipv4Regex.test(myip) && !isIPv6) {
      return new Response('badauth', { status: 200 });
    }

    const recordType = isIPv6 ? 'AAAA' : 'A';

    // ==========================================
    // === 1st Step: Cloudflare KV Cache Layer ==
    // ==========================================
    const cacheKey = `ddns:${hostname}:${recordType}`;
    if (env.KV) {
      const cachedIP = await env.KV.get(cacheKey);
      if (cachedIP === myip) {
        console.log(`[DDNS] [KV Cache Hit] IP unchanged for ${hostname} (${myip}). Skipping API calls.`);
        return new Response(`nochg ${hostname}`, { status: 200 });
      }
    }

    // === Cloudflare API ===
    const zoneId = env.ZONE_ID;
    const headers = {
      'Authorization': `Bearer ${env.API_TOKEN_DDNS}`,
      'Content-Type': 'application/json'
    };

    // === Get current DNS record ===
    const recordsResp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}&type=${recordType}`,
      { headers }
    );
    const records = await recordsResp.json();

    if (!records.success || records.result.length === 0) {
      console.log(`[DDNS] Record not found for ${hostname}`);
      return new Response(`nochg ${hostname}`, { status: 200 });
    }

    const record = records.result[0];
    const currentIP = record.content;

    // Save to KV if it was missing to prevent future API calls
    if (currentIP === myip) {
      if (env.KV) {
        ctx.waitUntil(env.KV.put(cacheKey, myip, { expirationTtl: 86400 })); // Cache for 24 hours
      }
      console.log(`[DDNS] IP unchanged for ${hostname} (${myip}). Populated KV cache and skipping update.`);
      return new Response(`nochg ${hostname}`, { status: 200 });
    }

    console.log(`[DDNS] IP changed for ${hostname}: ${currentIP} → ${myip}. Updating...`);

    // === Update DNS record ===
    const updateData = {
      type: recordType,
      name: hostname,
      content: myip,
      ttl: parseInt(env.TTL) || 120,
      proxied: env.PROXIED === 'true'
    };

    const updateResp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData)
      }
    );

    const updateJson = await updateResp.json();

    if (updateResp.ok && updateJson.success) {
      console.log(`[DDNS] Successfully updated ${hostname} to ${myip}`);
      
      // Update KV Cache asynchronously so it doesn't block the response
      if (env.KV) {
        ctx.waitUntil(env.KV.put(cacheKey, myip, { expirationTtl: 86400 })); // Cache for 24 hours
      }

      return new Response(`good ${hostname}`, { status: 200 });
    } else {
      console.log(`[DDNS] Update failed for ${hostname}`);
      return new Response(`badauth ${hostname}`, { status: 200 });
    }
  }
};
