// fb_graph_all_ids.js
const CONFIG = {
  APP_ID: "4448906745342681",
  APP_SECRET: "ead67a5820db61ae9256221b4c6bd308",
  SHORT_LIVED_TOKEN: "EAAZCOQdIx6tkBRvzYqU9iHdiZCBpLOQppSKICwl7FGptXbzIkgvUqtaVTSlaXcZCzxkEAaQCetaMjQz0VZBUCflBnx6rRuY3t5JWRl1TrcHE41ZAnG2rjHxLiyr3tnrqCC1FgLS45bNP8wSBj5fR0r8HB9htPPiOi6NcJRtogfkWtbyw7X7V2IqINvFLowHTJtZCnlwFjXD33yP05Puxa9sFGwG2IIR4iFaAZDZD",
  BASE_URL: "https://graph.facebook.com/v25.0",
};

async function graphGet(path, token, params = {}) {
  const url = new URL(`${CONFIG.BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`Graph API Error: ${JSON.stringify(data.error)}`);
  return data;
}

async function main() {
  // Step 1: Exchange for 60-day long-lived user token
  console.log("Exchanging for 60-day token...");
  const tokenData = await graphGet("/oauth/access_token", CONFIG.SHORT_LIVED_TOKEN, {
    grant_type: "fb_exchange_token",
    client_id: CONFIG.APP_ID,
    client_secret: CONFIG.APP_SECRET,
    fb_exchange_token: CONFIG.SHORT_LIVED_TOKEN,
  });
  const token = tokenData.access_token;
  console.log("✅ Long-lived token obtained (expires in ~60 days)");
  console.log(`🔑 60-Day User Token : ${token}\n`);

  // Step 2: FB User ID
  const me = await graphGet("/me", token, { fields: "id,name,email" });
  console.log(`👤 FB User ID : ${me.id}`);
  console.log(`   Name       : ${me.name}\n`);

  // Step 3: Ad Accounts
  const adAccounts = await graphGet("/me/adaccounts", token, {
    fields: "id,name,account_id,currency,account_status",
  });
  console.log("💰 Ad Accounts:");
  adAccounts.data.forEach(a =>
    console.log(`   act_${a.account_id} | ${a.name} | ${a.currency}`)
  );

  // Step 4: Pages + IG + Never-Expiring Page Token per client
  const pages = await graphGet("/me/accounts", token, {
    fields: "id,name,access_token,instagram_business_account{id,username}",
  });

  console.log("\n📄 Client Pages, IG Accounts & Never-Expiring Tokens:");

  for (const p of pages.data) {
    // Exchange page token → never-expiring long-lived page token
    const ltPage = await graphGet("/oauth/access_token", p.access_token, {
      grant_type: "fb_exchange_token",
      client_id: CONFIG.APP_ID,
      client_secret: CONFIG.APP_SECRET,
      fb_exchange_token: p.access_token,
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Client       : ${p.name}`);
    console.log(`   FB Page ID   : ${p.id}`);
    console.log(`   Page Token   : ${ltPage.access_token}`);
    console.log(`   Expires      : ${ltPage.expires_in ? ltPage.expires_in + ' sec' : 'Never ♾️'}`);

    if (p.instagram_business_account) {
      const ig = p.instagram_business_account;
      console.log(`   IG User ID   : ${ig.id}`);
      console.log(`   IG Username  : @${ig.username}`);
    } else {
      console.log(`   IG           : Not linked`);
    }
  }

  return {
    user_token_60day: token,
    fb_user_id: me.id,
    adAccounts: adAccounts.data,
    pages: pages.data,
  };
}

main().catch(console.error);