import { createPrivateKey, sign } from "node:crypto";
import { ApiError, exactKeys, id, reject, utc } from "./github.mjs";

const permissions = { contents: "write", metadata: "read" };
function checkPermissions(value) {
  exactKeys(value, Object.keys(permissions));
  if (value.contents !== "write" || value.metadata !== "read") reject("Release App permissions differ.");
}
async function request(method, path, token, body) {
  try {
    const response = await fetch(`https://api.github.com${path}`, { method, redirect: "error", signal: AbortSignal.timeout(30000), headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new ApiError(response.status);
    return response.status === 204 ? null : await response.json();
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(null); }
}

export async function installationToken(api, policy, privateKey) {
  id(policy.app_id); id(policy.installation_id);
  if (typeof privateKey !== "string" || !privateKey) reject("Production App key is unavailable.");
  let jwt;
  try {
    const now = Math.floor(Date.now() / 1000), key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "rsa") reject("Invalid App key type.");
    const data = [Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(policy.app_id) })).toString("base64url")].join(".");
    jwt = `${data}.${sign("RSA-SHA256", Buffer.from(data), key).toString("base64url")}`;
  } catch { reject("Production App key cannot sign the required JWT."); }
  const installation = await request("GET", `${api.path}/installation`, jwt);
  if (installation.id !== policy.installation_id || installation.app_id !== policy.app_id || installation.repository_selection !== "selected" || installation.suspended_at !== null || `${installation.app_slug}[bot]` !== policy.bot_login) reject("Release App installation identity differs.");
  checkPermissions(installation.permissions);
  const user = await request("GET", `/users/${encodeURIComponent(policy.bot_login)}`, api.readToken);
  if (user.id !== policy.bot_id || user.login !== policy.bot_login || user.type !== "Bot") reject("Release bot identity differs.");
  const issued = await request("POST", `/app/installations/${policy.installation_id}/access_tokens`, jwt, { repository_ids: [api.repositoryId], permissions });
  if (typeof issued.token !== "string" || !issued.token || /[\s\r\n]/.test(issued.token)) reject("Installation token response is invalid.");
  const revoke = () => request("DELETE", "/installation/token", issued.token);
  try {
    checkPermissions(issued.permissions); utc(issued.expires_at);
    if (Date.parse(issued.expires_at) <= Date.now() || !Array.isArray(issued.repositories) || issued.repositories.length !== 1 || issued.repositories[0].id !== api.repositoryId || issued.repositories[0].full_name?.toLowerCase() !== api.repository.toLowerCase()) reject("Installation token scope or expiry differs.");
    return { token: issued.token, expires_at: issued.expires_at, revoke };
  } catch (error) { try { await revoke(); } catch { /* An unconfirmed revocation is never used to clear control ownership. */ } throw error; }
}
