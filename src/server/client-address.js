import { isIP, SocketAddress } from 'node:net';
import { getProxyConfig } from './config.js';

function normalizeAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return null;
  const version = isIP(address);
  if (!version) return null;
  const normalized = new SocketAddress({
    address,
    family: version === 6 ? 'ipv6' : 'ipv4',
  }).address;
  const mappedAddress = normalized.startsWith('::ffff:') ? normalized.slice(7) : '';
  return isIP(mappedAddress) === 4 ? mappedAddress : normalized;
}

export function getClientAddress(req) {
  const peer = normalizeAddress(req.socket.remoteAddress) || 'unknown';
  const isTrusted = getProxyConfig().TRUSTED_PROXY_IPS.some(
    (address) => normalizeAddress(address) === peer,
  );
  if (!isTrusted) return peer;

  // A trusted single-hop proxy must overwrite this header with one client IP.
  const forwarded = req.headers['x-forwarded-for'];
  return typeof forwarded === 'string' ? normalizeAddress(forwarded.trim()) || peer : peer;
}
